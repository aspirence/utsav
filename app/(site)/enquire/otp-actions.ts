'use server'

import { revalidatePath } from 'next/cache'

import { z } from 'zod'

import { createAdminClient, indianPhoneInputSchema, otpVerifySchema } from '@/lib/db'

import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/supabase'

/**
 * The OTP step of the enquiry flow. Plan §1: OTP verification is what makes a lead
 * billable, so it is core MVP scope rather than a polish item.
 *
 * Three round trips, and the split between them is the whole security design:
 *
 *   1. `supabase.auth.verifyOtp()` exchanges the 6-digit code for a session whose JWT
 *      carries the confirmed phone number.
 *   2. `public.verify_enquiry_otp()` — the 001600 wrapper over app.verify_enquiry_otp()
 *      — reads that number off the JWT, not off anything the browser sent, compares it
 *      with `enquiries.contact_phone`, and only then moves the row to `verified`.
 *   3. `app.route_enquiry()` runs on the **service-role** client, never the customer's
 *      session. See routeEnquiry() below for why that is not a convenience.
 *
 * Step 2 is why there is no client path to a verified enquiry (plan §6). The
 * `enquiries_update_own` policy cannot move `status` or stamp `phone_verified_at`, and
 * app.verify_enquiry_otp() is the only writer of either column.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A vendor this enquiry was routed to, in the order app.route_enquiry() ranked them. */
export type RoutedVendor = { slug: string; name: string; seq: number }

export type OtpState =
  | { status: 'idle' }
  | {
      status: 'verified'
      message: string
      /** False when verification landed but routing could not run — see routeEnquiry(). */
      routed: boolean
      vendorCount: number
      vendors: RoutedVendor[]
    }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'unconfigured'; message: string }

export type ResendState =
  | { status: 'idle' }
  | { status: 'resent'; message: string; retryAfterSeconds: number }
  | { status: 'error'; message: string; retryAfterSeconds?: number }
  | { status: 'unconfigured'; message: string }

// ---------------------------------------------------------------------------
// Narrowed client shapes
//
// packages/db/src/generated/database.types.ts is hand-authored and declares only the
// read surface apps/web uses today — `search_vendors` is its one Functions entry, and
// `app` is not a schema in it at all. These interfaces keep the RPC calls honest about
// their arguments without editing a file that `pnpm db:types` will regenerate wholesale.
// ---------------------------------------------------------------------------

type RpcResult = { data: unknown; error: { message: string; code?: string } | null }

interface PublicRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>
}

interface AppSchemaRpcClient {
  schema: (name: string) => {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>
  }
}

/** app.route_enquiry() returns `setof public.leads`. These are the columns we use. */
type RoutedLead = { vendor_id: string; routed_seq: number }

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export async function verifyEnquiryOtp(_prev: OtpState, formData: FormData): Promise<OtpState> {
  const parsed = otpVerifySchema.safeParse({
    enquiryId: String(formData.get('enquiryId') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    // People paste the code straight out of the SMS, spaces and all.
    token: String(formData.get('token') ?? '').replace(/\s+/g, ''),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Enter the 6-digit code exactly as you received it.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'No Supabase instance is connected, so no code was ever sent. Run `pnpm db:start` ' +
        'and set NEXT_PUBLIC_SUPABASE_URL to complete verification for real.',
    }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const { enquiryId, phone, token } = parsed.data

  // ---- 1. Code → phone-verified session ------------------------------------
  const { data: auth, error: otpError } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  })

  if (otpError || !auth.user) {
    return {
      status: 'error',
      message:
        'That code did not match. Codes expire after a few minutes — ask for a new one if ' +
        'this one is old.',
    }
  }

  // Supabase stores the number without a leading '+'; enquiries store E.164.
  const verifiedPhone = toE164(auth.user.phone)
  if (!verifiedPhone || verifiedPhone !== phone) {
    return {
      status: 'error',
      message:
        'The verified number does not match the one on this enquiry. Please start again ' +
        'with the number you want vendors to call.',
    }
  }

  // ---- 2. Claim the row, then let the database decide ----------------------
  // The enquiry was written before this customer had an account (see ./actions.ts), so
  // `customer_id` is null and app.verify_enquiry_otp()'s ownership check would reject
  // it. Attaching the row is a service-role write because `enquiries_update_own` needs
  // ownership to already be true.
  //
  // The match conditions are the security-relevant part: only a row that is still
  // `pending_otp`, still un-owned, and whose contact number equals the number Supabase
  // just confirmed can be claimed. Nothing here grants verification — status and
  // phone_verified_at are untouched, and step 3 re-derives the phone from the JWT
  // anyway, so a wrong claim simply fails there.
  const admin = adminOrNull()
  if (admin) {
    await admin
      .from('enquiries')
      .update({ customer_id: auth.user.id })
      .eq('id', enquiryId)
      .eq('status', 'pending_otp')
      .eq('contact_phone', verifiedPhone)
      .is('customer_id', null)
  }

  // ---- 3. The RPC that actually verifies -----------------------------------
  // public.verify_enquiry_otp (migration 001600) is a SECURITY INVOKER wrapper, so
  // auth.uid() and auth.jwt() inside it still resolve to this customer. It re-reads the
  // phone off the JWT rather than trusting the `phone` field the browser posted.
  const { error: rpcError } = await (supabase as unknown as PublicRpcClient).rpc(
    'verify_enquiry_otp',
    { p_enquiry_id: enquiryId },
  )

  if (rpcError) {
    return {
      status: 'error',
      message: `Your number is verified, but the enquiry could not be updated: ${rpcError.message}`,
    }
  }

  // ---- 4. Routing, server-side only ----------------------------------------
  const routing = await routeEnquiry(enquiryId)

  // Routing writes leads, which are what the partner dashboard lists.
  revalidatePath('/enquire')
  revalidatePath('/partner/dashboard/leads')

  if (!routing.ok) {
    // Verification is done and durable; only the matching run failed. Say so plainly
    // rather than implying the code was wrong — the enquiry is `verified` and the
    // scheduled sweep will pick it up.
    return {
      status: 'verified',
      routed: false,
      vendorCount: 0,
      vendors: [],
      message:
        'Your number is verified and your enquiry is saved. Matching is taking a moment ' +
        'longer than usual — we will text you as soon as vendors have it.',
    }
  }

  if (routing.leads.length === 0) {
    // Routing ran and matched nobody: too narrow a budget, a blocked date, or a category
    // with no live vendors in that city yet. Say that, rather than promising calls.
    return {
      status: 'verified',
      routed: true,
      vendorCount: 0,
      vendors: [],
      message:
        'Verified. No vendor in this city currently matches your date and budget, so our ' +
        'team will look for one by hand and come back to you on this number.',
    }
  }

  const vendors = await describeRoutedVendors(supabase, routing.leads)

  return {
    status: 'verified',
    routed: true,
    vendorCount: routing.leads.length,
    vendors,
    message:
      routing.leads.length === 1
        ? 'Verified. Your enquiry has gone to one matching vendor.'
        : `Verified. Your enquiry has gone to ${routing.leads.length} matching vendors.`,
  }
}

// ---------------------------------------------------------------------------
// Resend. Plan §13 measures this flow on mid-range Android over 4G, where an SMS can
// simply be lost, so a resend has to exist — but it also has to cost money to abuse.
// ---------------------------------------------------------------------------

const RESEND_COOLDOWN_MS = 30_000
const COOLDOWN_ENTRY_TTL_MS = 15 * 60_000

/**
 * Server-side, per-number cooldown. Process-local, so it holds per instance rather than
 * globally — good enough as the first gate in front of Supabase's own OTP rate limit,
 * and the reason the send is additionally tied to a real `pending_otp` enquiry below.
 * Move this to a Postgres counter if the web app ever runs more than a couple of
 * instances.
 */
const lastSentAt = new Map<string, number>()

/**
 * Local, because a resend is not a shape that crosses a package boundary: it is the
 * enquiry the code belongs to plus the number it was addressed to.
 */
const resendInputSchema = z.object({
  enquiryId: z.string().uuid(),
  phone: indianPhoneInputSchema,
})

export async function resendEnquiryOtp(
  _prev: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const parsed = resendInputSchema.safeParse({
    enquiryId: String(formData.get('enquiryId') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'We could not match that to an open enquiry. Please start again.',
    }
  }

  const { enquiryId } = parsed.data

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message: 'No Supabase instance is connected, so no code can be sent yet.',
    }
  }

  const phone = parsed.data.phone
  const now = Date.now()
  pruneCooldowns(now)

  const previous = lastSentAt.get(phone)
  if (previous !== undefined && now - previous < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - previous)) / 1000)
    return {
      status: 'error',
      retryAfterSeconds: wait,
      message: `Please wait ${wait} second${wait === 1 ? '' : 's'} before asking for another code.`,
    }
  }

  // A resend must be attached to an enquiry that is genuinely waiting on a code,
  // addressed to that enquiry's own number. Without this, the action is an open
  // send-an-SMS-to-any-number endpoint that costs us per hit.
  const admin = adminOrNull()
  if (!admin) {
    return {
      status: 'unconfigured',
      message: 'SUPABASE_SERVICE_ROLE_KEY is not set, so a new code cannot be sent.',
    }
  }

  const { data: pending } = await admin
    .from('enquiries')
    .select('id')
    .eq('id', enquiryId)
    .eq('status', 'pending_otp')
    .eq('contact_phone', phone)
    .maybeSingle()

  if (!pending) {
    return {
      status: 'error',
      message: 'This enquiry is already verified, or the number does not match it.',
    }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true },
  })

  if (error) {
    return { status: 'error', message: `Could not send a new code: ${error.message}` }
  }

  // Stamped only on success, so a failed send does not lock the customer out for 30s.
  lastSentAt.set(phone, Date.now())

  return {
    status: 'resent',
    retryAfterSeconds: RESEND_COOLDOWN_MS / 1000,
    message: `A fresh code is on its way to ${phone}.`,
  }
}

// ---------------------------------------------------------------------------
// Helpers (module-private — a 'use server' file may export only async functions)
// ---------------------------------------------------------------------------

type RoutingOutcome = { ok: true; leads: RoutedLead[] } | { ok: false; reason: string }

/**
 * Run the 5-vendor routing engine.
 *
 * This deliberately does NOT use the customer's session. Migration 001500 ends with:
 *
 *     revoke execute on function app.route_enquiry(uuid) from public, anon, authenticated;
 *
 * and migration 001600 pointedly ships no `public.` wrapper for it, unlike the four
 * client-callable RPCs. So there is no grant a browser session could exercise even if
 * someone posted the enquiry id straight at PostgREST: vendor selection is not a thing
 * a customer can trigger, retry, or steer.
 *
 * That matters beyond tidiness. app.route_enquiry() picks the five vendors by
 * app.vendor_rank(), consumes a subscription lead credit from each, and enqueues their
 * WhatsApp notifications. If it were callable from a session, re-running it would be a
 * way to burn competitors' credits and to spam vendors — and plan §11's "no ranking
 * favour" promise would stop being auditable from the SQL alone. The service-role
 * client is the only caller, and createAdminClient() throws if it is ever reached from
 * a browser bundle.
 */
async function routeEnquiry(enquiryId: string): Promise<RoutingOutcome> {
  const admin = adminOrNull()
  if (!admin) return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY is not set.' }

  const { data, error } = await (admin as unknown as AppSchemaRpcClient)
    .schema('app')
    .rpc('route_enquiry', { p_enquiry_id: enquiryId })

  if (error) {
    // PGRST106 = the `app` schema is not in config.toml's api.schemas; PGRST202 = the
    // function is not exposed. Both are deployment problems, not customer problems.
    return { ok: false, reason: error.message }
  }

  if (!Array.isArray(data)) return { ok: true, leads: [] }

  const leads: RoutedLead[] = []
  for (const row of data) {
    if (row && typeof row === 'object' && 'vendor_id' in row) {
      const lead = row as Partial<RoutedLead>
      if (typeof lead.vendor_id === 'string') {
        leads.push({ vendor_id: lead.vendor_id, routed_seq: Number(lead.routed_seq ?? 0) })
      }
    }
  }

  return { ok: true, leads }
}

/**
 * Names for the routed vendors, read through the customer's own session so RLS decides
 * what comes back (plan §4). `vendors_select_live` already publishes live vendors to
 * anon, so nothing here is more visible than the discovery pages.
 */
async function describeRoutedVendors(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerClientOrNull>>>,
  leads: RoutedLead[],
): Promise<RoutedVendor[]> {
  if (leads.length === 0) return []

  const { data } = await supabase
    .from('vendors')
    .select('id, slug, display_name')
    .in(
      'id',
      leads.map((l) => l.vendor_id),
    )

  if (!data) return []

  const seqByVendor = new Map(leads.map((l) => [l.vendor_id, l.routed_seq]))

  return data
    .map((v) => ({ slug: v.slug, name: v.display_name, seq: seqByVendor.get(v.id) ?? 0 }))
    .sort((a, b) => a.seq - b.seq)
}

/**
 * Service-role client, or null when the key is absent. createAdminClient() throws in a
 * browser and throws on a missing key; neither should surface as a 500 to a customer
 * who has just typed a valid code.
 */
function adminOrNull() {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

function toE164(phone: string | undefined): string | null {
  if (!phone) return null
  const trimmed = phone.trim()
  if (trimmed === '') return null
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`
}

function pruneCooldowns(now: number): void {
  for (const [key, at] of lastSentAt) {
    if (now - at > COOLDOWN_ENTRY_TTL_MS) lastSentAt.delete(key)
  }
}

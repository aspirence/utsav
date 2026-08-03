'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

import {
  createFremmoServerClient,
  hasSupabaseEnv,
  slugSchema,
  type VendorStatus,
} from '@/lib/db'

/**
 * Staff vendor management. Plan §3: "Admin console — separate deploy, SSO + IP
 * allowlist, append-only audit log."
 *
 * Three rules shape this file.
 *
 * 1. Everything runs on the moderator's own session, never on the service-role key.
 *    `vendors_update_staff` (migration 001300) is the authorization boundary:
 *    moderator/super may move any listing, a field agent may only touch a draft in
 *    their own city. Doing this with createAdminClient() would bypass RLS and quietly
 *    hand every staff member super powers, which is exactly what plan §6 forbids.
 *    So this file validates, sequences and writes copy — it does not authorize.
 *
 * 2. Every transition writes public.audit_log. That table is append-only by trigger and
 *    its insert policy is `app.is_staff() and actor_id = auth.uid()`, so the row cannot
 *    be written under somebody else's name and cannot be edited afterwards.
 *
 * 3. `published_at`, `profile_score` and the rest of the derived columns are normally
 *    blocked by app.guard_vendor_columns(). Staff with moderator/super short-circuit
 *    that trigger, which is why publishVendor() may stamp published_at directly — the
 *    `vendors_live_requires_publish` CHECK demands a timestamp before a row may be live.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type VendorActionState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

// ---------------------------------------------------------------------------
// Input schemas. slugSchema is shared (@/lib/db); the reasons are local to this
// screen because their minimum lengths are an editorial decision about what makes a
// usable audit trail, not a database constraint.
// ---------------------------------------------------------------------------

const targetSchema = z.object({ slug: slugSchema })

const suspendSchema = z.object({
  slug: slugSchema,
  reason: z
    .string()
    .trim()
    .min(10, 'Write one line the vendor and the next moderator can both act on')
    .max(500),
})

const sendBackSchema = z.object({
  slug: slugSchema,
  reason: z
    .string()
    .trim()
    .min(10, 'Say what has to change before this listing can go live')
    .max(500),
})

/**
 * Editable listing copy.
 *
 * NOT in here, on purpose: `status`, `published_at`, `profile_score`, `media_count`,
 * `rating_avg`, `is_anchor_studio`. The first two move through the transition actions above
 * so every change lands in the audit log with a reason; the rest are derived columns that
 * app.guard_vendor_columns() rejects a write to, and the anchor-studio flag is a
 * channel-conflict disclosure (plan §11) rather than a field.
 *
 * Price bands are typed in rupees because that is what a person types, and stored as integer
 * paise (plan §5). The conversion rounds rather than truncating - a float that lands on
 * 149.99999 loses a paisa to Math.trunc, and money that quietly loses anything surfaces in a
 * reconciliation months later.
 */
const detailsSchema = z
  .object({
    slug: slugSchema,
    displayName: z.string().trim().min(2, 'A listing needs a name').max(120),
    about: z.string().trim().max(4000).optional(),
    priceBandMin: z.number().int().nonnegative().optional(),
    priceBandMax: z.number().int().nonnegative().optional(),
    establishedYear: z.coerce
      .number()
      .int()
      .min(1900)
      .max(new Date().getFullYear())
      .optional(),
    teamSize: z.coerce.number().int().positive().max(500).optional(),
    travelsOutstation: z.boolean(),
  })
  // Mirrors the vendors_price_band_ordered check. Catching it here means the operator reads a
  // sentence instead of a Postgres constraint name.
  .refine(
    (d) =>
      d.priceBandMin == null || d.priceBandMax == null || d.priceBandMin <= d.priceBandMax,
    { message: 'The lower price band has to be the smaller number' },
  )

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * pending_review → live (draft → live for a super admin who is fixing a mis-filed
 * listing). Stamps published_at, which is what makes the row publicly readable through
 * `vendors_select_live` and eligible for the §12 SEO surfaces.
 *
 * The photo and profile-score gates are checked here rather than in SQL because they
 * are launch-readiness policy (plan §13: "≥5 photos and price bands"), not an
 * invariant — a future campaign may well want a different floor.
 */
/**
 * Edit a listing's own copy. The only action here that is not a status transition.
 *
 * Goes through the same commit() path as the transitions, so the edit lands in the
 * append-only audit log with the patch that was applied. Plan §3 makes that log the point of
 * the console - a moderator quietly rewriting a vendor's price band with no record is
 * exactly what it exists to prevent.
 *
 * `rupeesToPaise` is the only place rupees and paise meet. Nothing downstream sees rupees.
 */
export async function updateVendorDetails(
  _prev: VendorActionState,
  form: FormData,
): Promise<VendorActionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = detailsSchema.safeParse({
    slug: text(form.get('slug')),
    displayName: text(form.get('displayName')),
    about: text(form.get('about')),
    priceBandMin: rupeesToPaise(text(form.get('priceBandMin'))),
    priceBandMax: rupeesToPaise(text(form.get('priceBandMax'))),
    establishedYear: text(form.get('establishedYear')),
    teamSize: text(form.get('teamSize')),
    travelsOutstation: form.get('travelsOutstation') === 'on',
  })
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error) ?? 'Check those details.' }
  }

  const loaded = await loadVendor(parsed.data.slug)
  if (loaded.status === 'failed') return loaded.state
  const { supabase, vendor, actorId } = loaded

  const d = parsed.data
  return commit({
    supabase,
    actorId,
    vendor,
    slug: d.slug,
    action: 'vendor.details_edited',
    reason: null,
    patch: {
      display_name: d.displayName,
      about: d.about ?? null,
      price_band_min: d.priceBandMin ?? null,
      price_band_max: d.priceBandMax ?? null,
      established_year: d.establishedYear ?? null,
      team_size: d.teamSize ?? null,
      travels_outstation: d.travelsOutstation,
    },
    successMessage: `${d.displayName} updated. The change is in the audit log.`,
  })
}

/** FormData.get() returns null for an absent field; zod's .optional() rejects null. */
function text(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Rupees in, integer paise out (plan §5). Rounds, never truncates. */
function rupeesToPaise(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.round(n * 100)
}

export async function publishVendor(slug: string): Promise<VendorActionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = targetSchema.safeParse({ slug })
  if (!parsed.success) return { status: 'error', message: 'That listing reference is not valid.' }

  const loaded = await loadVendor(parsed.data.slug)
  if (loaded.status === 'failed') return loaded.state
  const { supabase, vendor, actorId } = loaded

  if (vendor.status === 'live') {
    return { status: 'error', message: 'This listing is already live.' }
  }
  if (vendor.status === 'suspended') {
    return {
      status: 'error',
      message: 'Suspended listings come back through Reinstate, so the suspension stays on record.',
    }
  }
  if (vendor.status === 'paused') {
    return {
      status: 'error',
      message:
        'This listing is paused by the vendor themselves. Ask them to unpause it from their ' +
        'dashboard — staff should not override a vendor’s own decision to go quiet.',
    }
  }

  const blockers = goLiveBlockers(vendor)
  if (blockers.length > 0) {
    return {
      status: 'error',
      message: `Not ready to publish: ${blockers.join('; ')}.`,
    }
  }

  return commit({
    supabase,
    actorId,
    vendor,
    slug: parsed.data.slug,
    action: 'vendor.published',
    reason: null,
    patch: {
      status: 'live',
      // First publish sets the date; a re-publish keeps the original, because the
      // listing's age is a real signal and not something a moderator should reset.
      published_at: vendor.published_at ?? new Date().toISOString(),
      suspended_reason: null,
    },
    successMessage:
      `${vendor.display_name} is live. It is now publicly discoverable, indexable, and in ` +
      'the routing pool for new enquiries.',
  })
}

/**
 * live / pending_review → suspended. This takes the listing off the market: it stops
 * being publicly readable, stops receiving routed leads, and the vendor is blocked from
 * responding to the ones they already hold.
 *
 * The reason is written to `vendors.suspended_reason`, which the vendor's own team can
 * read through `vendors_select_member`. Write it for them, not for us.
 */
export async function suspendVendor(slug: string, reason: string): Promise<VendorActionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = suspendSchema.safeParse({ slug, reason })
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error) ?? 'Please check what you entered.' }
  }

  const loaded = await loadVendor(parsed.data.slug)
  if (loaded.status === 'failed') return loaded.state
  const { supabase, vendor, actorId } = loaded

  if (vendor.status === 'suspended') {
    return { status: 'error', message: 'This listing is already suspended.' }
  }
  if (vendor.status === 'draft') {
    return {
      status: 'error',
      message: 'A draft was never on the market, so there is nothing to suspend.',
    }
  }

  return commit({
    supabase,
    actorId,
    vendor,
    slug: parsed.data.slug,
    action: 'vendor.suspended',
    reason: parsed.data.reason,
    patch: { status: 'suspended', suspended_reason: parsed.data.reason },
    successMessage:
      `${vendor.display_name} is suspended and off the market. It will not appear in search, ` +
      'will not be routed new enquiries, and the team can read your reason on their dashboard.',
  })
}

/**
 * suspended → live, or → pending_review when the listing was never published in the
 * first place. `vendors_live_requires_publish` will not accept a live row without a
 * published_at, and inventing one would date the listing to the day we lifted a
 * suspension — so an unpublished listing goes back into the review queue instead.
 */
export async function reinstateVendor(slug: string): Promise<VendorActionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = targetSchema.safeParse({ slug })
  if (!parsed.success) return { status: 'error', message: 'That listing reference is not valid.' }

  const loaded = await loadVendor(parsed.data.slug)
  if (loaded.status === 'failed') return loaded.state
  const { supabase, vendor, actorId } = loaded

  if (vendor.status !== 'suspended') {
    return { status: 'error', message: 'Only a suspended listing can be reinstated.' }
  }

  const backTo: VendorStatus = vendor.published_at ? 'live' : 'pending_review'

  return commit({
    supabase,
    actorId,
    vendor,
    slug: parsed.data.slug,
    action: 'vendor.reinstated',
    reason: null,
    patch: { status: backTo, suspended_reason: null },
    successMessage:
      backTo === 'live'
        ? `${vendor.display_name} is live again and back in the routing pool. The suspension ` +
          'stays in the audit log.'
        : `${vendor.display_name} has gone back to the review queue — it had never been ` +
          'published, so there is no live state to return it to.',
  })
}

/**
 * pending_review → draft. The listing returns to the field team with a note. Deliberately
 * not available for a live listing: taking something off the market is a suspension, and
 * it should carry a suspension's record rather than look like a routine edit.
 */
export async function sendBackToDraft(slug: string, reason: string): Promise<VendorActionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = sendBackSchema.safeParse({ slug, reason })
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error) ?? 'Please check what you entered.' }
  }

  const loaded = await loadVendor(parsed.data.slug)
  if (loaded.status === 'failed') return loaded.state
  const { supabase, vendor, actorId } = loaded

  if (vendor.status !== 'pending_review') {
    return {
      status: 'error',
      message:
        vendor.status === 'draft'
          ? 'This listing is already a draft.'
          : 'Only a listing awaiting review can be sent back. To take a live listing off the ' +
            'market, suspend it instead.',
    }
  }

  return commit({
    supabase,
    actorId,
    vendor,
    slug: parsed.data.slug,
    action: 'vendor.sent_back_to_draft',
    reason: parsed.data.reason,
    patch: { status: 'draft' },
    successMessage:
      `${vendor.display_name} is back with the field team as a draft. Your note is on the ` +
      'audit record, so whoever picks it up knows what to fix.',
  })
}

// ---------------------------------------------------------------------------
// Internals. Nothing below is exported: a 'use server' module may export async
// functions and types only.
// ---------------------------------------------------------------------------

/**
 * Typed escape hatches.
 *
 * packages/db/src/generated/database.types.ts is hand-authored and models the read
 * surface apps/web needs, so `audit_log`, `staff_roles` and `vendors.suspended_reason`
 * are absent from it. Narrowing the client at the call site keeps these writes typed
 * without editing a file `pnpm db:types` will regenerate wholesale — the same approach
 * apps/web/app/partner/dashboard/leads/actions.ts takes.
 */
type WriteError = { code?: string; message: string } | null

interface StaffWriter {
  from: (table: 'vendors' | 'audit_log' | 'staff_roles') => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: WriteError }>
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        select: (
          columns: string,
        ) => PromiseLike<{ data: { id: string }[] | null; error: WriteError }>
      }
    }
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        is: (
          column: string,
          value: null,
        ) => PromiseLike<{ data: { role: string }[] | null; error: WriteError }>
      }
    }
  }
}

interface StaffVendor {
  id: string
  display_name: string
  status: VendorStatus
  published_at: string | null
  media_count: number
  profile_score: number
  kyc_status: string
  is_anchor_studio: boolean
}

interface LoadedVendor {
  status: 'ok'
  supabase: StaffWriter
  vendor: StaffVendor
  actorId: string | null
}

type LoadFailure = { status: 'failed'; state: VendorActionState }

function envGuard(): VendorActionState | null {
  if (hasSupabaseEnv()) return null
  // Ahead of validation on purpose: with no instance connected, lib/admin-data.ts serves
  // a fixture roster, and a validation error there would describe the demo data rather
  // than the situation the operator is actually in.
  return {
    status: 'unconfigured',
    message:
      'This is the demo console — no Supabase instance is connected, so nothing was written. ' +
      'Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to manage real listings.',
  }
}

/** Structural, not `z.ZodError<T>` — the generic parameter would fight the call sites. */
function firstIssue(error: { issues: { message: string }[] }): string | undefined {
  return error.issues[0]?.message
}

/**
 * Request-scoped client carrying the moderator's session.
 *
 * apps/admin has no lib/supabase.ts of its own, so the cookie adapter is wired here.
 * The shape is identical to apps/web/lib/supabase.ts: session in, RLS out.
 */
async function staffClient(): Promise<StaffWriter | null> {
  try {
    const store = await cookies()
    return createFremmoServerClient({
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          store.set(name, value, options)
        }
      },
    }) as unknown as StaffWriter
  } catch {
    return null
  }
}

/**
 * Read the listing on the caller's own session first.
 *
 * `vendors_select_live` means a non-staff session can also see a live row, so a row
 * coming back is not proof of authority — the UPDATE below is what actually tests it,
 * by returning zero rows when no policy admits the caller.
 */
async function loadVendor(slug: string): Promise<LoadedVendor | LoadFailure> {
  const supabase = await staffClient()
  if (!supabase) {
    return {
      status: 'failed',
      state: { status: 'error', message: 'Could not reach the database. Please try again.' },
    }
  }

  const client = supabase as unknown as {
    auth: { getUser: () => PromiseLike<{ data: { user: { id: string } | null } }> }
    from: (table: 'vendors') => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => { maybeSingle: () => PromiseLike<{ data: StaffVendor | null; error: WriteError }> }
      }
    }
  }

  const [{ data: auth }, { data: vendor }] = await Promise.all([
    client.auth.getUser(),
    client
      .from('vendors')
      .select(
        'id, display_name, status, published_at, media_count, profile_score, kyc_status, is_anchor_studio',
      )
      .eq('slug', slug)
      .maybeSingle(),
  ])

  if (!vendor) {
    return {
      status: 'failed',
      state: {
        status: 'error',
        message:
          'That listing is not visible to your account. Field agents are scoped to their own ' +
          'city — ask a moderator if you think this is wrong.',
      },
    }
  }

  return { status: 'ok', supabase, vendor, actorId: auth.user?.id ?? null }
}

/** Plan §13's go-live gates, stated as sentences a moderator can hand to a field agent. */
function goLiveBlockers(vendor: StaffVendor): string[] {
  const blockers: string[] = []
  if (vendor.media_count < 5) {
    blockers.push(`only ${vendor.media_count} photos, five is the floor`)
  }
  if (vendor.profile_score < 60) {
    blockers.push(`profile score is ${vendor.profile_score}, sixty is the floor`)
  }
  // KYC is deliberately not a blocker. Plan §6 gates *payouts* on PAN/GST, not
  // discovery — a listing that cannot yet be paid out can still take enquiries.
  return blockers
}

/**
 * The write itself: one UPDATE on the caller's session, then the audit row.
 *
 * Zero rows back from the UPDATE means RLS refused, not that the listing vanished —
 * `vendors_update_staff` admits moderator/super for anything and a field agent only for
 * a draft in their own city.
 */
async function commit(args: {
  supabase: StaffWriter
  actorId: string | null
  vendor: StaffVendor
  slug: string
  action: string
  reason: string | null
  patch: Record<string, unknown>
  successMessage: string
}): Promise<VendorActionState> {
  const { supabase, actorId, vendor, slug, action, reason, patch, successMessage } = args

  const { data, error } = await supabase
    .from('vendors')
    .update(patch)
    .eq('id', vendor.id)
    .select('id')

  if (error) return { status: 'error', message: explain(error) }

  if (!data || data.length === 0) {
    return {
      status: 'error',
      message:
        'Your staff role does not allow this change. Moderators can move any listing; field ' +
        'agents can only edit drafts in their own city.',
    }
  }

  const auditError = await writeAudit({
    supabase,
    actorId,
    action,
    vendor,
    reason,
    patch,
  })

  revalidatePath('/admin/vendors')
  revalidatePath(`/admin/vendors/${slug}`)

  if (auditError) {
    // The listing moved; the record of who moved it did not. Say so plainly rather than
    // reporting a failure that did not happen — plan §3 makes the audit log the point of
    // this console, so a silent gap in it is worse than an awkward message.
    return {
      status: 'error',
      message:
        `${successMessage} However the audit entry could not be written (${auditError}). ` +
        'Please tell whoever runs the console before taking further action on this listing.',
    }
  }

  return { status: 'done', message: successMessage }
}

/** Returns null on success, or a short reason the row could not be appended. */
async function writeAudit(args: {
  supabase: StaffWriter
  actorId: string | null
  action: string
  vendor: StaffVendor
  reason: string | null
  patch: Record<string, unknown>
}): Promise<string | null> {
  const { supabase, actorId, action, vendor, reason, patch } = args

  if (!actorId) {
    // audit_log_insert_staff requires actor_id = auth.uid(); an anonymous caller could
    // never have got past the UPDATE, so this only happens if the session expired
    // mid-request.
    return 'your session has no signed-in identity'
  }

  const { error } = await supabase.from('audit_log').insert({
    actor_id: actorId,
    actor_role: await actorRole(supabase, actorId),
    action,
    subject_type: 'vendor',
    subject_id: vendor.id,
    before_state: {
      status: vendor.status,
      published_at: vendor.published_at,
    },
    after_state: {
      ...patch,
      // Plan §11: any decision touching the founder's studio is meant to be escalated.
      // Flagging it in the record is what makes that checkable after the fact.
      ...(vendor.is_anchor_studio ? { anchor_studio: true, escalation_expected: true } : {}),
    },
    reason,
  })

  return error ? error.message : null
}

/**
 * The caller's own staff role, for the audit row. `staff_roles_select_own` allows
 * reading your own rows, and 'super' outranks the rest.
 */
async function actorRole(supabase: StaffWriter, actorId: string): Promise<string | null> {
  const { data } = await supabase
    .from('staff_roles')
    .select('role')
    .eq('profile_id', actorId)
    .is('revoked_at', null)

  if (!data || data.length === 0) return null
  if (data.some((r) => r.role === 'super')) return 'super'
  return data[0]?.role ?? null
}

function explain(error: { code?: string; message: string }): string {
  if (error.code === '42501' || error.message.includes('insufficient_privilege')) {
    return 'Your staff role does not allow this change.'
  }
  if (error.message.includes('vendors_live_requires_publish')) {
    return 'This listing has no publish date, so it cannot be set live. Publish it instead.'
  }
  if (error.message.includes('Derived vendor metrics')) {
    return 'That column is maintained by the database and cannot be set from here.'
  }
  return `Could not update the listing: ${error.message}`
}

'use server'

import { revalidatePath } from 'next/cache'

import {
  CONSENT_TEXT,
  CONSENT_VERSION,
  createAdminClient,
  enquiryDraftSchema,
} from '@/lib/db'

import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/supabase'

/**
 * Enquiry submission. Plan §4: "each feature owns one zod-validated actions.ts".
 *
 * Plan §1 is the whole design here: an enquiry is created in `pending_otp` and cannot
 * leave that state from the client. Verification happens in app.verify_enquiry_otp(),
 * which checks the caller's JWT actually carries the verified phone, and routing
 * happens in app.route_enquiry(), which is revoked from anon and authenticated
 * entirely. There is no browser path to a routed lead.
 *
 * The second half of the round trip lives in ./otp-actions.ts.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Discriminated union rather than one wide object: `enquiryId` and `phone` only exist
 * once the SMS is out, and the OTP step must not have to guess either of them.
 */
export type EnquiryState =
  | { status: 'idle' }
  | { status: 'awaiting_otp'; enquiryId: string; phone: string; message: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'unconfigured'; message: string }

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function submitEnquiry(
  _prev: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const raw = {
    categorySlug: String(formData.get('categorySlug') ?? ''),
    citySlug: String(formData.get('citySlug') ?? ''),
    localitySlug: str(formData.get('localitySlug')),
    eventType: String(formData.get('eventType') ?? 'wedding'),
    eventDate: str(formData.get('eventDate')),
    dateFlexible: formData.get('dateFlexible') === 'on',
    guestCount: num(formData.get('guestCount')),
    // The form collects rupees; the database stores paise (plan §5).
    budgetMax: rupeesToPaise(formData.get('budgetMax')),
    budgetMin: rupeesToPaise(formData.get('budgetMin')),
    stylePreferences: formData.getAll('stylePreferences').map(String),
    message: str(formData.get('message')),
    contactName: String(formData.get('contactName') ?? ''),
    contactPhone: String(formData.get('contactPhone') ?? ''),
    contactEmail: str(formData.get('contactEmail')) ?? '',
    consentGiven: formData.get('consentGiven') === 'on',
  }

  const parsed = enquiryDraftSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'Your details validated correctly, but no Supabase instance is connected yet. ' +
        'Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to submit for real.',
    }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const draft = parsed.data

  // Resolve the slugs before sending anything. Both tables are anon-readable
  // (`cities_select_all`, `categories_select_active`), and a stale slug should cost the
  // customer an error message rather than an SMS they then have to ignore.
  const [{ data: category }, { data: city }] = await Promise.all([
    supabase.from('categories').select('id').eq('slug', draft.categorySlug).maybeSingle(),
    supabase.from('cities').select('id').eq('slug', draft.citySlug).maybeSingle(),
  ])

  if (!category || !city) {
    return { status: 'error', message: 'That category or city is no longer available.' }
  }

  // Plan §2: OTP is the gate. Supabase sends it; the session it produces is what
  // app.verify_enquiry_otp() checks the enquiry against. `shouldCreateUser` means the
  // auth.users row (and, via app.handle_new_user(), the profile) exists from this
  // moment — but there is no session yet, because the code has not been entered.
  const { error: otpError } = await supabase.auth.signInWithOtp({
    phone: draft.contactPhone,
    options: { shouldCreateUser: true },
  })

  if (otpError) {
    return { status: 'error', message: `Could not send the verification code: ${otpError.message}` }
  }

  // Who is writing this row? Almost always nobody: the customer has no session until
  // they enter the code, and `enquiries_insert_own` requires `customer_id = auth.uid()`.
  // So the row is written service-side, un-owned, and claimed in verifyEnquiryOtp()
  // once a JWT with the confirmed phone exists. `enquiries.customer_id` is nullable and
  // `status` defaults to 'pending_otp' precisely to allow that gap.
  //
  // This is not a way around RLS: nothing here can produce a verified or routed
  // enquiry. `status` is pinned to 'pending_otp' and `phone_verified_at` is left null,
  // which is exactly what the `enquiries_verified_before_routing` CHECK and
  // app.route_enquiry()'s own status guard rely on.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = adminOrNull()
  if (!admin) {
    return {
      status: 'unconfigured',
      message:
        'Your details validated correctly, but SUPABASE_SERVICE_ROLE_KEY is not set, so ' +
        'the enquiry cannot be recorded. Set it in .env.local and try again.',
    }
  }

  const { data: enquiry, error } = await admin
    .from('enquiries')
    .insert({
      customer_id: user?.id ?? null,
      category_id: category.id,
      city_id: city.id,
      event_type: draft.eventType,
      event_date: draft.eventDate ?? null,
      date_flexible: draft.dateFlexible,
      guest_count: draft.guestCount ?? null,
      budget_min: draft.budgetMin ?? null,
      budget_max: draft.budgetMax,
      style_preferences: draft.stylePreferences,
      message: draft.message ?? null,
      contact_name: draft.contactName,
      contact_phone: draft.contactPhone,
      contact_email: draft.contactEmail || null,
      status: 'pending_otp',
      // Plan §6 DPDP: store the verbatim consent copy and its version, so an audit can
      // reproduce exactly what this customer agreed to.
      consent_text: CONSENT_TEXT,
      consent_version: CONSENT_VERSION,
    })
    .select('id')
    .single()

  if (error || !enquiry) {
    return { status: 'error', message: error?.message ?? 'Could not save your enquiry.' }
  }

  revalidatePath('/enquire')

  return {
    status: 'awaiting_otp',
    enquiryId: enquiry.id,
    // The E.164 form, not what was typed. verifyOtp() and app.verify_enquiry_otp() both
    // compare against this exact string, so the OTP step must carry it forward verbatim.
    phone: draft.contactPhone,
    message: `We sent a 6-digit code to ${draft.contactPhone}.`,
  }
}

// ---------------------------------------------------------------------------
// Helpers (module-private — a 'use server' file may export only async functions)
// ---------------------------------------------------------------------------

/**
 * Service-role client, or null when the key is absent. createAdminClient() throws in a
 * browser and throws on a missing key; neither should surface as a 500 to a customer
 * halfway through an enquiry.
 */
function adminOrNull() {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value == null ? '' : String(value).trim()
  return s === '' ? undefined : s
}

function num(value: FormDataEntryValue | null): number | undefined {
  const s = str(value)
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function rupeesToPaise(value: FormDataEntryValue | null): number | undefined {
  const n = num(value)
  return n == null ? undefined : Math.round(n * 100)
}

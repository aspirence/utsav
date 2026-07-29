import 'server-only'

import { z } from 'zod'

import {
  ANALYTICS_EVENTS,
  analyticsEventSchema,
  type AnalyticsEventName,
  type AnalyticsStage,
  type UtsavaClient,
} from '@utsava/db'

import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/supabase'

/**
 * Funnel instrumentation — the server-side emitter.
 *
 * Plan §10: "Events flow to PostHog + a nightly warehouse export; vendor dashboards and
 * board dashboards read the same semantic definitions, so the numbers always match."
 * That promise only holds if there is exactly one place where an event name is decided.
 * `ANALYTICS_EVENTS` in @utsava/db is that place; nothing here restates a name, and the
 * emit function is typed against it, so a typo is a compile error rather than a quietly
 * invented funnel stage that no dashboard is counting.
 *
 * ---------------------------------------------------------------------------
 * THE SIX STAGES AND THE KPI EACH ONE FEEDS (plan §10, verbatim mapping)
 * ---------------------------------------------------------------------------
 *
 *   discover   search_performed, listing_viewed, shortlist_added
 *              → the 10k monthly enquiries gate, SEO yield, and the
 *                "photography ≥ 40% of enquiries" mix check.
 *
 *   enquire    enquiry_submitted, otp_verified, lead_qualified
 *              → VERIFICATION RATE (otp_verified / enquiry_submitted) and cost per
 *                verified lead. Plan §1 calls lead quality "an engineering feature";
 *                this ratio is how that claim is audited.
 *
 *   match      lead_routed, vendor_viewed_lead, vendor_responded
 *              → CAP COMPLIANCE (vendors per lead_routed must never exceed 5) and
 *                MEDIAN VENDOR RESPONSE < 2 h, measured from lead_routed to
 *                vendor_responded rather than estimated.
 *
 *   transact   quote_sent, booking_initiated, escrow_paid, booking_completed
 *              → LEAD→BOOKING ≥ 5% (photography ≥ 6%) and managed GMV.
 *
 *   trust      review_requested, review_published, story_published, dispute_opened
 *              → REVIEW COVERAGE (review_published / booking_completed), stories per
 *                month for the content flywheel, and disputes < 1%.
 *
 *   monetise   subscription_started, subscription_renewed, invoice_paid
 *              → RENEWAL ≥ 55–60% and the 180-paying-vendors target by Mar 2028.
 *                Plan §1: renewal is "the model's most sensitive assumption", so this
 *                stage is the canary the other five feed.
 *
 * North star, cutting across all six: verified leads delivered per week.
 *
 * ---------------------------------------------------------------------------
 * Where events actually come from
 * ---------------------------------------------------------------------------
 * Some stages are emitted by the database, inside the SECURITY DEFINER RPC that performs
 * the transition (see 20260727001500_views_and_rpcs.sql). Those are the trustworthy ones:
 * they cannot be emitted unless the state change really happened, and they carry a
 * verified auth.uid(). Application code must not emit them a second time — see
 * EMITTED_BY_DATABASE below, which turns an accidental double-count into a no-op.
 *
 * Everything else is emitted from here (server actions, Server Components) or, for the
 * three discover-stage events a browser is the only witness to, through
 * app/actions/analytics.ts.
 *
 * Writes go to public.analytics_events, which has an INSERT policy for anon and
 * authenticated and a SELECT policy for super staff only (`analytics_events_insert_any`,
 * `analytics_events_select_staff`). Nothing reads these back over PostgREST — analysis
 * happens in the warehouse export — so a failed emit costs a data point, never a user
 * journey. Every path below therefore returns a state instead of throwing.
 */

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

/**
 * Every event name, flattened out of the stage map. Derived rather than restated: adding
 * a stage or an event in packages/db lights it up here without a second edit.
 */
export const ANALYTICS_EVENT_NAMES: readonly AnalyticsEventName[] = Object.values(
  ANALYTICS_EVENTS as Record<AnalyticsStage, readonly AnalyticsEventName[]>,
).flat()

/** The zod form of the same contract. Rejects anything not in ANALYTICS_EVENTS. */
export const analyticsEventNameSchema = z.enum(
  ANALYTICS_EVENT_NAMES as [AnalyticsEventName, ...AnalyticsEventName[]],
)

/**
 * Which stage an event belongs to. The one definition both the vendor dashboard and the
 * board dashboard should bucket by, so "match-stage volume" means the same thing in both.
 * Returns null only for a name outside the contract, which the schema already rejects.
 */
export function analyticsStageOf(name: string): AnalyticsStage | null {
  for (const [stage, names] of Object.entries(ANALYTICS_EVENTS) as [
    AnalyticsStage,
    readonly string[],
  ][]) {
    if (names.includes(name)) return stage
  }
  return null
}

/**
 * Emitted by the database, inside the RPC that performs the transition. Re-emitting any
 * of these from application code would double-count the stage and quietly break the very
 * ratios above — a lead counted twice in `match` deflates lead→booking.
 *
 * One naming note worth carrying into the warehouse mapping: app.transition_lead() builds
 * its event name as 'vendor_' || new_status, so the row it writes for a first view is
 * `vendor_viewed`, while the contract name here is `vendor_viewed_lead`. The two refer to
 * the same moment. Fixing that belongs in a migration, not here, so the guard below covers
 * the contract name and this comment records the discrepancy.
 */
const EMITTED_BY_DATABASE: ReadonlySet<string> = new Set<AnalyticsEventName>([
  'otp_verified', // app.verify_enquiry_otp()
  'lead_routed', // app.route_enquiry()
  'vendor_viewed_lead', // app.transition_lead() — writes 'vendor_viewed'
  'vendor_responded', // app.transition_lead()
  'booking_initiated', // app.transition_booking()
  'booking_completed', // app.transition_booking()
])

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const MAX_PROPERTY_KEYS = 20

/**
 * Property values are scalars only. A jsonb column will happily swallow a whole nested
 * object, which is how analytics tables end up holding a customer's phone number by
 * accident — plan §6's DPDP position does not survive that. Scalars keep an emit call
 * something a reviewer can read at a glance.
 *
 * Keys are snake_case to match what the SQL emitters already write ('vendor_count',
 * 'amount_paise'), so the warehouse sees one naming convention.
 *
 * Money, if it appears here at all, is integer paise and the key says so.
 */
const propertyKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'Property keys are snake_case, up to 40 characters')

const propertyValueSchema = z.union([
  z.string().trim().max(200),
  z.number().finite(),
  z.boolean(),
  z.null(),
])

export const analyticsPropertiesSchema = z
  .record(propertyKeySchema, propertyValueSchema)
  .refine((p) => Object.keys(p).length <= MAX_PROPERTY_KEYS, {
    message: `Keep event properties to ${MAX_PROPERTY_KEYS} keys or fewer`,
  })
  .default({})

export type AnalyticsProperties = z.infer<typeof analyticsPropertiesSchema>

/** First-party pseudonymous identifiers minted in the browser. Opaque to us. */
const opaqueIdSchema = z.string().trim().min(8).max(64)

/**
 * Built on the shared shape in @utsava/db rather than beside it, so the columns that
 * cross the package boundary stay one definition. Two deliberate tightenings: `name` is
 * the enum, not any string up to 64 characters, and `properties` is the scalar record
 * above rather than `z.record(z.unknown())`.
 */
const serverEventSchema = analyticsEventSchema.extend({
  name: analyticsEventNameSchema,

  profileId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),

  anonymousId: opaqueIdSchema.optional(),
  sessionId: opaqueIdSchema.optional(),

  // Slug alternatives, for callers holding a route param rather than a UUID.
  vendorSlug: z.string().trim().max(200).optional(),
  citySlug: z.string().trim().max(200).optional(),
  categorySlug: z.string().trim().max(200).optional(),

  properties: analyticsPropertiesSchema,
})

/**
 * What a caller may attach to an event.
 *
 * `profileId` is for trusted server callers that already hold a verified user id — a
 * server action that has just called `supabase.auth.getUser()`, for instance. It is never
 * taken from client input; see app/actions/analytics.ts.
 */
export interface AnalyticsProps {
  profileId?: string
  anonymousId?: string
  sessionId?: string

  vendorId?: string
  vendorSlug?: string
  cityId?: string
  citySlug?: string
  categoryId?: string
  categorySlug?: string

  enquiryId?: string
  leadId?: string
  bookingId?: string

  properties?: Record<string, string | number | boolean | null>
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type TrackState =
  | { status: 'recorded'; name: AnalyticsEventName; stage: AnalyticsStage | null }
  /** Nothing was written, and that was the correct outcome. */
  | { status: 'skipped'; name: string; reason: 'emitted_by_database'; message: string }
  | { status: 'invalid'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

/**
 * Record one funnel event from a Server Component or a server action.
 *
 * Never throws, so `await trackServer(...)` is safe to drop into a success path without
 * an extra try/catch — a dead analytics pipeline must not fail an enquiry.
 *
 * Deliberately does NOT call revalidatePath(). Analytics rows change nothing anyone can
 * read (there is no client SELECT policy on the table at all), and busting a cached,
 * heavily-crawled page on every view is exactly the media and compute cost creep plan §12
 * warns about. components/shortlist-button.tsx skips revalidation for the same reason.
 */
export async function trackServer(
  name: AnalyticsEventName,
  props: AnalyticsProps = {},
): Promise<TrackState> {
  const parsed = serverEventSchema.safeParse({ name, ...props })

  if (!parsed.success) {
    return {
      status: 'invalid',
      message: 'That event does not match the funnel contract, so it was not recorded.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const event = parsed.data

  if (EMITTED_BY_DATABASE.has(event.name)) {
    return {
      status: 'skipped',
      name: event.name,
      reason: 'emitted_by_database',
      message:
        `${event.name} is emitted by the RPC that performs the transition. Emitting it ` +
        'here as well would count the stage twice.',
    }
  }

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'No Supabase instance is connected, so the funnel event was not recorded. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL to start collecting.',
    }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database to record the event.' }
  }

  const [profileId, refs] = await Promise.all([
    event.profileId ? Promise.resolve(event.profileId) : sessionProfileId(supabase),
    resolveRefs(supabase, event),
  ])

  const { error } = await sink(supabase)
    .from('analytics_events')
    .insert({
      name: event.name,
      profile_id: profileId,
      anonymous_id: event.anonymousId ?? null,
      session_id: event.sessionId ?? null,
      vendor_id: refs.vendorId,
      enquiry_id: event.enquiryId ?? null,
      lead_id: event.leadId ?? null,
      booking_id: event.bookingId ?? null,
      city_id: refs.cityId,
      category_id: refs.categoryId,
      properties: event.properties,
      // occurred_at is left to the column default. Server clock, not a caller's clock.
    })

  if (error) {
    return { status: 'error', message: error.message }
  }

  return { status: 'recorded', name: event.name, stage: analyticsStageOf(event.name) }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** The columns of public.analytics_events we write. Mirrors 20260727001000_engagement_ops.sql. */
interface AnalyticsEventInsert {
  name: AnalyticsEventName
  profile_id: string | null
  anonymous_id: string | null
  session_id: string | null
  vendor_id: string | null
  enquiry_id: string | null
  lead_id: string | null
  booking_id: string | null
  city_id: string | null
  category_id: string | null
  properties: AnalyticsProperties
}

/**
 * `analytics_events` is not in packages/db's database.types.ts yet — that file is
 * hand-authored and, as its header says, covers only the read surface apps/web uses. This
 * table is write-only from the app's point of view, so it never appeared in a read.
 *
 * Rather than reach into another agent's package, the insert is typed through this narrow
 * structural view of the client. It is strictly tighter than what postgrest-js would
 * accept: the table name is a literal and the row must be AnalyticsEventInsert. When the
 * generated types are regenerated against a live stack, this and the cast in sink() come
 * out and the call type-checks unchanged.
 */
interface AnalyticsSink {
  from(table: 'analytics_events'): {
    insert(row: AnalyticsEventInsert): PromiseLike<{ error: { message: string } | null }>
  }
}

function sink(supabase: UtsavaClient): AnalyticsSink {
  return supabase as unknown as AnalyticsSink
}

/**
 * Attribution for a caller that did not supply a profile id.
 *
 * getSession() reads the cookie locally, with no round trip; getUser() validates the JWT
 * against the auth server and costs one. At SEO scale most `listing_viewed` traffic is
 * signed-out (plan §2 puts the account behind the enquiry, not in front of the
 * catalogue), so the cheap check short-circuits the common case and the verified call
 * only runs when a session actually exists. A guest is identified by anonymous_id
 * instead, which is what lets the warehouse stitch a discover session to the profile it
 * later becomes.
 */
async function sessionProfileId(supabase: UtsavaClient): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return null

    const { data: auth } = await supabase.auth.getUser()
    return auth.user?.id ?? null
  } catch {
    return null
  }
}

interface ResolvedRefs {
  vendorId: string | null
  cityId: string | null
  categoryId: string | null
}

/**
 * Turn whatever the caller had to hand into foreign keys.
 *
 * A page usually holds slugs, not UUIDs, but the vendor dashboard counts profile views by
 * vendor_id — so resolving matters. All three lookups hit anon-readable, slug-indexed
 * tables and run in parallel.
 *
 * A slug that does not resolve leaves the column null rather than dropping the event: a
 * row with a missing dimension still counts towards the stage, whereas a missing row is
 * silently lost from the funnel.
 */
async function resolveRefs(
  supabase: UtsavaClient,
  event: {
    vendorId?: string
    vendorSlug?: string
    cityId?: string
    citySlug?: string
    categoryId?: string
    categorySlug?: string
  },
): Promise<ResolvedRefs> {
  // An id already in hand always wins; only an unresolved slug costs a query.
  const vendorSlug = event.vendorId ? undefined : event.vendorSlug
  const citySlug = event.cityId ? undefined : event.citySlug
  const categorySlug = event.categoryId ? undefined : event.categorySlug

  const [vendor, city, category] = await Promise.all([
    vendorSlug ? lookupVendorId(supabase, vendorSlug) : Promise.resolve(null),
    citySlug ? lookupCityId(supabase, citySlug) : Promise.resolve(null),
    categorySlug ? lookupCategoryId(supabase, categorySlug) : Promise.resolve(null),
  ])

  return {
    vendorId: event.vendorId ?? vendor,
    cityId: event.cityId ?? city,
    categoryId: event.categoryId ?? category,
  }
}

/**
 * Three near-identical lookups rather than one parameterised by table name: postgrest-js
 * resolves the row type from the literal passed to .from(), and a union of table names
 * collapses that inference. Repetition here buys a checked query there.
 *
 * Note `vendors_select_live` scopes the first one to live listings, which is correct —
 * a view of a paused profile is not a view of a listing.
 */
async function lookupVendorId(supabase: UtsavaClient, slug: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('vendors')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    return error || !data ? null : data.id
  } catch {
    return null
  }
}

async function lookupCityId(supabase: UtsavaClient, slug: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('cities')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    return error || !data ? null : data.id
  } catch {
    return null
  }
}

async function lookupCategoryId(supabase: UtsavaClient, slug: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    return error || !data ? null : data.id
  } catch {
    return null
  }
}

'use server'

import { z } from 'zod'

import { ANALYTICS_EVENTS } from '@/lib/db'

import { analyticsPropertiesSchema, trackServer } from '@/lib/analytics'

/**
 * The browser's end of the funnel. Plan §10, discover stage.
 *
 * Only three events are callable from a client: `search_performed`, `listing_viewed` and
 * `shortlist_added`. They share one property — the browser is the only witness. Nobody
 * else knows a result set was rendered, or that a profile page was actually read rather
 * than crawled. Every stage after discover is emitted where the state change happens:
 * inside the RPC for otp_verified / lead_routed / vendor_* / booking_*, and from a server
 * action for the rest (see lib/analytics.ts).
 *
 * The allowlist is a definitional guard, not a security boundary, and it is worth being
 * precise about the difference. `analytics_events_insert_any` lets anon INSERT any row it
 * likes over PostgREST, so a determined caller can already write `booking_completed`
 * straight to the table; nothing here prevents that, and the warehouse should treat
 * client-emitted rows as self-reported. What the allowlist does prevent is our own code
 * drifting — a component emitting a match- or transact-stage event from a place that
 * cannot know it happened, which is precisely how vendor dashboards and board dashboards
 * stop agreeing.
 *
 * Nothing on this path accepts a profile id. Attribution comes from the caller's session
 * cookie, resolved server-side, so a forged payload cannot file a page view under
 * somebody else's account.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * The discover triple, derived from the contract in @/lib/db rather than restated, so
 * this stays a compile error away from drift.
 */
export type DiscoverEventName = (typeof ANALYTICS_EVENTS)['discover'][number]

/**
 * `vendor`, `city` and `category` each take a slug or a UUID — a page holds route params,
 * a card sometimes holds an id. Same tolerance as toggleShortlist(), for the same reason.
 */
export type DiscoverEventInput = {
  name: DiscoverEventName
  vendor?: string
  city?: string
  category?: string
  /** First-party pseudonymous ids minted by components/track-view.tsx. */
  anonymousId?: string
  sessionId?: string
  properties?: Record<string, string | number | boolean | null>
}

/** What the three named helpers take: everything except the name they already know. */
export type DiscoverEventContext = Omit<DiscoverEventInput, 'name'>

/** Mirrors lib/analytics.ts's TrackState so callers can narrow without a server-only import. */
export type ClientTrackState =
  | { status: 'recorded'; name: string; stage: string | null }
  | { status: 'skipped'; name: string; reason: 'emitted_by_database'; message: string }
  | { status: 'invalid'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Emit one discover-stage event. Used by components/track-view.tsx.
 *
 * Fire-and-forget by design: the result is returned for callers who want it, but nothing
 * in the UI should wait on it or change because of it.
 */
export async function trackDiscoverEvent(input: DiscoverEventInput): Promise<ClientTrackState> {
  const parsed = discoverEventSchema.safeParse(input)

  if (!parsed.success) {
    return {
      status: 'invalid',
      message: 'That event does not match the funnel contract, so it was not recorded.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const event = parsed.data

  // A UUID goes straight through as a foreign key; a slug is resolved server-side.
  const vendor = splitRef(event.vendor)
  const city = splitRef(event.city)
  const category = splitRef(event.category)

  return trackServer(event.name, {
    vendorId: vendor.id,
    vendorSlug: vendor.slug,
    cityId: city.id,
    citySlug: city.slug,
    categoryId: category.id,
    categorySlug: category.slug,
    anonymousId: event.anonymousId,
    sessionId: event.sessionId,
    properties: event.properties,
    // profileId is deliberately absent — trackServer() reads it from the session.
  })
}

/**
 * A search results page was rendered. Feeds SEO yield and the 10k monthly enquiries gate.
 *
 * Useful properties: `result_count`, `sort`, `page`, `has_date_filter`. Keep the raw query
 * out unless it is genuinely needed for analysis — plan §6's DPDP position is easier to
 * hold when free text never enters the events table in the first place.
 */
export async function trackSearchPerformed(
  context: DiscoverEventContext = {},
): Promise<ClientTrackState> {
  return trackDiscoverEvent({ ...context, name: 'search_performed' })
}

/**
 * A vendor profile or card was viewed. Feeds SEO yield, the photography ≥ 40% mix check,
 * and the honest per-vendor view counts plan §1 puts in the vendor dashboard.
 *
 * Useful properties: `surface` ('profile' | 'card' | 'story'), `position` in a result set.
 */
export async function trackListingViewed(
  context: DiscoverEventContext = {},
): Promise<ClientTrackState> {
  return trackDiscoverEvent({ ...context, name: 'listing_viewed' })
}

/**
 * A vendor was saved for later. The last discover-stage signal before an enquiry, so it
 * is the strongest predictor available for the discover → enquire conversion.
 */
export async function trackShortlistAdded(
  context: DiscoverEventContext = {},
): Promise<ClientTrackState> {
  return trackDiscoverEvent({ ...context, name: 'shortlist_added' })
}

// ---------------------------------------------------------------------------
// Helpers (module-private — a 'use server' file may export only async functions)
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const refSchema = z.string().trim().min(1).max(200)

const discoverEventSchema = z.object({
  // z.enum over the contract's own tuple: a fourth discover event added in packages/db
  // becomes callable here automatically, and a typo never does.
  name: z.enum(ANALYTICS_EVENTS.discover),
  vendor: refSchema.optional(),
  city: refSchema.optional(),
  category: refSchema.optional(),
  anonymousId: z.string().trim().min(8).max(64).optional(),
  sessionId: z.string().trim().min(8).max(64).optional(),
  properties: analyticsPropertiesSchema,
})

/** A reference is either a UUID usable as a foreign key, or a slug still to be resolved. */
function splitRef(value: string | undefined): { id?: string; slug?: string } {
  if (!value) return {}
  return UUID.test(value) ? { id: value } : { slug: value }
}

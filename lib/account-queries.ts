import 'server-only'

import { formatPaise, formatPriceBand } from '@/lib/db'

import { getSessionUser } from '@/lib/auth'
import { getServerClientOrNull } from '@/lib/supabase'

/**
 * Reads for the customer account area.
 *
 * Every query here is RLS-scoped and none of them filter by owner in application code. That
 * is not laziness - plan §6 puts authorization in the database, and a `.eq('owner_id', me)`
 * alongside it would be a second, weaker copy of the same rule that quietly becomes the
 * real one the day someone edits a policy. If a policy is wrong these return nothing, which
 * is the failure mode to want.
 *
 * NOT wrapped in unstable_cache, unlike lib/queries.ts. That cache is keyed on its arguments
 * and shared across callers; these rows belong to one person, and a per-user cache keyed on
 * a session is a cache that eventually serves the wrong person's enquiries.
 *
 * Returns empty arrays rather than throwing when there is no Supabase configured. The site
 * runs off fixtures until it is pointed at an instance, and an account page that 500s is
 * worse than one that says it has nothing yet.
 */

const EMPTY = { events: [], enquiries: [], shortlist: [] } as const

export interface AccountEvent {
  id: string
  name: string
  eventType: string
  eventDate: string | null
  dateFlexible: boolean
  guestCount: number | null
  cityName: string | null
  budgetLabel: string | null
  isArchived: boolean
}

export interface EnquiryVendor {
  vendorSlug: string
  vendorName: string
  /** routed → viewed → responded → quoted → converted / expired */
  status: string
  routedSeq: number
  respondedAt: string | null
  quotedAt: string | null
}

export interface AccountEnquiry {
  id: string
  categoryName: string | null
  cityName: string | null
  eventType: string
  eventDate: string | null
  budgetLabel: string | null
  status: string
  createdAt: string
  message: string | null
  /** At most five, by the `leads_cap_five` constraint. */
  vendors: EnquiryVendor[]
}

export interface ShortlistEntry {
  id: string
  vendorSlug: string
  vendorName: string
  cityName: string | null
  localityName: string | null
  priceBandLabel: string
  ratingAvg: number | null
  ratingCount: number
  coverPath: string | null
  note: string | null
  eventId: string | null
}

export async function getMyEvents(): Promise<AccountEvent[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return []

  const { data } = await supabase
    .from('events')
    .select('id, name, event_type, event_date, date_flexible, guest_count, budget_min, budget_max, is_archived, cities(name)')
    .order('event_date', { ascending: true, nullsFirst: false })

  if (!data) return []

  return data.map((e) => ({
    id: e.id,
    // A nameless event is normal - most people never fill it in - so it gets called what
    // it is rather than rendering a blank row.
    name: e.name ?? titleCase(e.event_type),
    eventType: e.event_type,
    eventDate: e.event_date,
    dateFlexible: e.date_flexible,
    guestCount: e.guest_count,
    cityName: pluck(e.cities, 'name'),
    budgetLabel: band(e.budget_min, e.budget_max),
    isArchived: e.is_archived,
  }))
}

/**
 * The customer's enquiries, each with the vendors it was routed to.
 *
 * The vendor list is the point of this screen. Plan §1 promises "we tell you exactly who
 * received your enquiry", and until now that promise was made at the point of sending and
 * then never kept - the enquiry vanished the moment the confirmation screen closed.
 */
export async function getMyEnquiries(): Promise<AccountEnquiry[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return []

  const { data } = await supabase
    .from('enquiries')
    .select(
      `id, event_type, event_date, budget_min, budget_max, status, created_at, message,
       categories(name), cities(name),
       leads(status, routed_seq, responded_at, quoted_at, vendors(slug, display_name))`,
    )
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((e) => ({
    id: e.id,
    categoryName: pluck(e.categories, 'name'),
    cityName: pluck(e.cities, 'name'),
    eventType: e.event_type,
    eventDate: e.event_date,
    budgetLabel: band(e.budget_min, e.budget_max),
    status: e.status,
    createdAt: e.created_at,
    message: e.message,
    vendors: (asArray(e.leads) as RawLead[])
      // By routing order, not by status. The sequence is what the five-vendor cap counts,
      // and keeping it stable means the list does not reshuffle as vendors reply.
      .sort((a, b) => a.routed_seq - b.routed_seq)
      .map((l) => ({
        vendorSlug: pluck(l.vendors, 'slug') ?? '',
        vendorName: pluck(l.vendors, 'display_name') ?? 'A vendor',
        status: l.status,
        routedSeq: l.routed_seq,
        respondedAt: l.responded_at,
        quotedAt: l.quoted_at,
      })),
  }))
}

export async function getMyShortlist(): Promise<ShortlistEntry[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return []

  const { data } = await supabase
    .from('shortlists')
    .select(
      `id, note, event_id, created_at,
       vendors(slug, display_name, price_band_min, price_band_max, rating_avg, rating_count,
               cities(name), localities(name))`,
    )
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.flatMap((s) => {
    const v = first(s.vendors) as RawVendor | null
    // A shortlist row whose vendor has since been unpublished reads as null through RLS.
    // Dropping it is right - the alternative is a card with no name and a dead link.
    if (!v) return []
    return [
      {
        id: s.id,
        vendorSlug: v.slug,
        vendorName: v.display_name,
        cityName: pluck(v.cities, 'name'),
        localityName: pluck(v.localities, 'name'),
        priceBandLabel: formatPriceBand(v.price_band_min, v.price_band_max),
        ratingAvg: v.rating_avg,
        ratingCount: v.rating_count,
        coverPath: null,
        note: s.note,
        eventId: s.event_id,
      },
    ]
  })
}

/** Which vendor ids the caller has shortlisted, for rendering the save button's state. */
export async function getShortlistedVendorIds(): Promise<Set<string>> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return new Set()

  const user = await getSessionUser()
  if (!user) return new Set()

  const { data } = await supabase.from('shortlists').select('vendor_id')
  return new Set((data ?? []).map((r) => r.vendor_id))
}

// ---------------------------------------------------------------------------
// Helpers
//
// postgrest types an embedded relation as an object or an array depending on how it infers
// the cardinality, and the inference is not always what the schema says. These normalise
// both shapes rather than casting at every call site.
// ---------------------------------------------------------------------------

type RawLead = {
  status: string
  routed_seq: number
  responded_at: string | null
  quoted_at: string | null
  vendors: unknown
}

type RawVendor = {
  slug: string
  display_name: string
  price_band_min: number | null
  price_band_max: number | null
  rating_avg: number | null
  rating_count: number
  cities: unknown
  localities: unknown
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function pluck(value: unknown, key: string): string | null {
  const row = first(value) as Record<string, unknown> | null
  const v = row?.[key]
  return typeof v === 'string' ? v : null
}

/** Integer paise, always (plan §5). Never a float, never rupees. */
function band(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null) return formatPriceBand(min, max)
  return formatPaise((min ?? max)!, { compact: true })
}

function titleCase(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

export { EMPTY }

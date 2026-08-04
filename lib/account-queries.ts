import 'server-only'

import { formatPaise, formatPriceBand } from '@/lib/db'

import { ORDER_STATUS_LABEL } from '@/lib/invitation-orders'

import { getSessionUser } from '@/lib/auth'
import { getServerClientOrNull } from '@/lib/supabase'

import type { InvitationOrderStatus } from '@/lib/db'

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
    .select(
      'id, name, event_type, event_date, date_flexible, guest_count, budget_min, budget_max, is_archived, cities(name)',
    )
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

export interface AccountInvitationOrder {
  reference: string
  templateSlug: string
  templateName: string
  status: InvitationOrderStatus
  statusLabel: string
  /** Formatted for display. Integer paise in the database, always (plan §5). */
  bookingLabel: string
  balanceLabel: string
  totalLabel: string
  paidAt: string | null
  createdAt: string
  /** The unlisted public link, once the card has been published. Null while there is no card. */
  publicSlug: string | null
}

/** Part of the pre-migration shim above. Delete with it. */
function cardLink(row: Record<string, unknown>): string | null {
  return row.published_at && typeof row.public_slug === 'string' ? row.public_slug : null
}

/**
 * The cards this person has ordered.
 *
 * RLS DOES THE OWNERSHIP, NOT THIS FUNCTION. `invitation_orders_select_own` is
 * `customer_id = auth.uid()`, so there is no `.eq('customer_id', me)` here — see the note at
 * the top of this file for why a second copy of that rule is worse than none.
 *
 * WHICH MEANS GUEST ORDERS DO NOT APPEAR, and that is a real gap rather than an oversight.
 * The checkout in app/(site)/invitations/[slug]/book/actions.ts writes `customer_id` from the
 * session if there is one and null if there is not, so a card bought before signing in belongs
 * to nobody and stays invisible here forever. Claiming those by matching contact_email would
 * mean trusting an address nobody verified — which is exactly what the sign-up path stopped
 * proving. The honest fix is to claim them at checkout, not to guess at them here.
 */
export async function getMyInvitationOrders(): Promise<AccountInvitationOrder[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return []

  const user = await getSessionUser()
  if (!user) return []

  const BASE =
    'reference, template_slug, template_name, status, booking_amount, balance_amount, template_price, paid_at, created_at'

  /*
   * TEMPORARY, AND DELETABLE THE DAY THE MIGRATION LANDS.
   *
   * `public_slug` and `published_at` arrive in 20260801000200, which cannot be applied from this
   * environment — there is no Docker and the CLI is not linked. Selecting a column PostgREST does
   * not know about fails the whole query with 42703, which would empty this list for everybody who
   * already has orders: a page that worked before the change would show "nothing ordered yet".
   *
   * So the card columns are asked for, and their absence is treated as "no card" rather than as
   * "no orders". Once `supabase db push` has run, delete the fallback and inline the full select —
   * it is a compatibility shim for one unapplied migration, not a pattern.
   */
  const withCard = await supabase
    .from('invitation_orders')
    .select(`${BASE}, public_slug, published_at`)
    .order('created_at', { ascending: false })

  const { data, error } = withCard.error
    ? await supabase
        .from('invitation_orders')
        .select(BASE)
        .order('created_at', { ascending: false })
    : withCard

  if (error || !data) return []

  return data.map((o) => ({
    reference: o.reference,
    templateSlug: o.template_slug,
    templateName: o.template_name,
    status: o.status,
    statusLabel: ORDER_STATUS_LABEL[o.status] ?? o.status,
    bookingLabel: formatPaise(o.booking_amount),
    balanceLabel: formatPaise(o.balance_amount),
    totalLabel: formatPaise(o.template_price),
    paidAt: o.paid_at,
    createdAt: o.created_at,
    // Only a published card has a reachable link. An order carrying a slug but no published_at
    // cannot exist — invitation_orders_published_is_complete refuses it — but reading both is
    // what makes that guarantee visible here rather than assumed.
    // The narrow select has neither column; the wide one has both. One cast at the boundary
    // rather than two shapes threaded through the mapper, and it goes when the shim does.
    publicSlug: cardLink(o),
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

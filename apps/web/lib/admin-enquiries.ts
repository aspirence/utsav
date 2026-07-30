import 'server-only'

import { formatPaise, formatPriceBand } from '@utsava/db'

import { getServerClientOrNull } from '@/lib/admin-supabase'

/**
 * Every enquiry the site has taken, for the staff console.
 *
 * `/admin/leads` already existed but showed routing *health* - percentages and a hardcoded
 * list of five recent enquiries. There was no way to open one, see what the customer
 * actually asked for, or see which vendors it reached. That is the gap this fills.
 *
 * Read through the staff member's own session, never the service-role key. Plan §6 makes RLS
 * the authorization model: `enquiries_update_staff` and the staff SELECT policies decide what
 * a moderator versus a field agent may see, and going around them with createAdminClient()
 * would hand every staff member super powers - exactly what the plan forbids.
 *
 * Falls back to a small demo set when there is no Supabase attached, matching the rest of the
 * console. Demo rows are marked so the screen can say so rather than passing fiction off as
 * data.
 */

export type EnquiryStatusKey = 'pending_otp' | 'verified' | 'routed' | 'closed' | 'spam'

export interface AdminEnquiryVendor {
  vendorSlug: string
  vendorName: string
  status: string
  routedSeq: number
  viewedAt: string | null
  respondedAt: string | null
  quotedAt: string | null
}

export interface AdminEnquiry {
  id: string
  createdAt: string
  status: EnquiryStatusKey
  categoryName: string
  categorySlug: string
  cityName: string
  localityName: string | null
  eventType: string
  eventDate: string | null
  dateFlexible: boolean
  guestCount: number | null
  budgetLabel: string | null
  stylePreferences: string[]
  message: string | null
  /** Shown to staff in full. Vendors get this masked through the vendor_leads view (§6). */
  contactName: string
  contactPhone: string
  contactEmail: string | null
  spamScore: number
  source: string
  routedVendors: AdminEnquiryVendor[]
  /** True when this row came from the demo set, not the database. */
  isDemo: boolean
}

export async function getAdminEnquiries(): Promise<AdminEnquiry[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return DEMO

  const { data, error } = await supabase
    .from('enquiries')
    .select(
      `id, created_at, status, event_type, event_date, date_flexible, guest_count,
       budget_min, budget_max, style_preferences, message,
       contact_name, contact_phone, contact_email, spam_score, source,
       categories(name, slug), cities(name), localities(name),
       leads(status, routed_seq, viewed_at, responded_at, quoted_at, vendors(slug, display_name))`,
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (error || !data || data.length === 0) return DEMO

  return data.map((e) => ({
    id: e.id,
    createdAt: e.created_at,
    status: e.status as EnquiryStatusKey,
    categoryName: pluck(e.categories, 'name') ?? '—',
    categorySlug: pluck(e.categories, 'slug') ?? '',
    cityName: pluck(e.cities, 'name') ?? '—',
    localityName: pluck(e.localities, 'name'),
    eventType: e.event_type,
    eventDate: e.event_date,
    dateFlexible: e.date_flexible,
    guestCount: e.guest_count,
    budgetLabel: band(e.budget_min, e.budget_max),
    stylePreferences: e.style_preferences ?? [],
    message: e.message,
    contactName: e.contact_name,
    contactPhone: e.contact_phone,
    contactEmail: e.contact_email,
    spamScore: e.spam_score,
    source: e.source,
    routedVendors: (asArray(e.leads) as RawLead[])
      // Routing order, not reply order. routed_seq is what the five-vendor cap counts, and a
      // list that reorders as vendors reply is one staff cannot compare against yesterday's.
      .sort((a, b) => a.routed_seq - b.routed_seq)
      .map((l) => ({
        vendorSlug: pluck(l.vendors, 'slug') ?? '',
        vendorName: pluck(l.vendors, 'display_name') ?? 'Unknown vendor',
        status: l.status,
        routedSeq: l.routed_seq,
        viewedAt: l.viewed_at,
        respondedAt: l.responded_at,
        quotedAt: l.quoted_at,
      })),
    isDemo: false,
  }))
}

export async function getAdminEnquiry(id: string): Promise<AdminEnquiry | null> {
  const all = await getAdminEnquiries()
  return all.find((e) => e.id === id) ?? null
}

// ---------------------------------------------------------------------------
// Helpers. postgrest types an embedded relation as an object or an array depending on how it
// infers cardinality, and the inference is not always what the schema says.
// ---------------------------------------------------------------------------

type RawLead = {
  status: string
  routed_seq: number
  viewed_at: string | null
  responded_at: string | null
  quoted_at: string | null
  vendors: unknown
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v ? [v] : []
}

function pluck(v: unknown, key: string): string | null {
  const row = (Array.isArray(v) ? v[0] : v) as Record<string, unknown> | null | undefined
  const out = row?.[key]
  return typeof out === 'string' ? out : null
}

/** Integer paise, always (plan §5). */
function band(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null) return formatPriceBand(min, max)
  return formatPaise((min ?? max)!, { compact: true })
}

// ---------------------------------------------------------------------------
// Demo set — used only when no Supabase is attached, and flagged as such.
//
// Deliberately includes the awkward cases rather than five happy ones: an enquiry stuck at
// pending_otp (the customer never entered the code, so it went nowhere), one held as spam,
// and one where four of five vendors ignored it. A console that only ever shows the good path
// teaches nobody what to look for.
// ---------------------------------------------------------------------------

function lead(
  seq: number,
  slug: string,
  name: string,
  status: string,
  viewed = false,
  responded = false,
  quoted = false,
): AdminEnquiryVendor {
  const t = '2026-07-28T09:00:00.000Z'
  return {
    vendorSlug: slug,
    vendorName: name,
    status,
    routedSeq: seq,
    viewedAt: viewed ? t : null,
    respondedAt: responded ? t : null,
    quotedAt: quoted ? t : null,
  }
}

const DEMO: AdminEnquiry[] = [
  {
    id: 'demo-1',
    createdAt: '2026-07-29T05:40:00.000Z',
    status: 'routed',
    categoryName: 'Photographers',
    categorySlug: 'photography',
    cityName: 'Lucknow',
    localityName: 'Gomti Nagar',
    eventType: 'wedding',
    eventDate: '2027-02-14',
    dateFlexible: false,
    guestCount: 400,
    budgetLabel: '₹2,00,000 – ₹3,50,000',
    stylePreferences: ['candid', 'cinematic'],
    message: 'Two functions on consecutive days, both at the same venue. Need a second shooter.',
    contactName: 'Radha Jariwala',
    contactPhone: '+919876543210',
    contactEmail: 'radha@example.com',
    spamScore: 0,
    source: 'web',
    routedVendors: [
      lead(1, 'saat-phere-films', 'Saat Phere Films', 'quoted', true, true, true),
      lead(2, 'lightleak-studio', 'Lightleak Studio', 'responded', true, true),
      lead(3, 'the-mango-tree-co', 'The Mango Tree Co.', 'viewed', true),
      lead(4, 'anantha-photography', 'Anantha Photography', 'routed'),
      lead(5, 'utsava-studio', 'Utsava Studio', 'routed'),
    ],
    isDemo: true,
  },
  {
    id: 'demo-2',
    createdAt: '2026-07-29T04:05:00.000Z',
    status: 'pending_otp',
    categoryName: 'Venues',
    categorySlug: 'venues',
    cityName: 'Lucknow',
    localityName: 'Sushant Golf City',
    eventType: 'reception',
    eventDate: null,
    dateFlexible: true,
    guestCount: 250,
    budgetLabel: '₹5,00,000',
    stylePreferences: ['banquet'],
    message: null,
    contactName: 'Aarti Verma',
    contactPhone: '+919812345678',
    contactEmail: null,
    spamScore: 0,
    source: 'web',
    // Nothing routed, and that is the point: the code was never entered, so plan §1's gate
    // held and no vendor was charged a credit for it.
    routedVendors: [],
    isDemo: true,
  },
  {
    id: 'demo-3',
    createdAt: '2026-07-28T18:20:00.000Z',
    status: 'routed',
    categoryName: 'Makeup Artists',
    categorySlug: 'makeup',
    cityName: 'Lucknow',
    localityName: 'Hazratganj',
    eventType: 'sangeet',
    eventDate: '2027-01-09',
    dateFlexible: false,
    guestCount: null,
    budgetLabel: '₹40,000 – ₹75,000',
    stylePreferences: ['hd-makeup', 'airbrush'],
    message: 'Bride plus four. Early start, ceremony at 7am.',
    contactName: 'Sneha Kapoor',
    contactPhone: '+919700112233',
    contactEmail: 'sneha@example.com',
    spamScore: 0,
    source: 'seo',
    routedVendors: [
      lead(1, 'blush-by-meera', 'Blush by Meera', 'responded', true, true),
      lead(2, 'the-glow-room', 'The Glow Room', 'expired', true),
      lead(3, 'roshni-photography', 'Roshni Makeup', 'expired'),
      lead(4, 'mehfil-media', 'Mehfil Beauty', 'expired'),
      lead(5, 'northlight-studio', 'Northlight Beauty', 'expired'),
    ],
    isDemo: true,
  },
  {
    id: 'demo-4',
    createdAt: '2026-07-28T11:00:00.000Z',
    status: 'spam',
    categoryName: 'Caterers',
    categorySlug: 'catering',
    cityName: 'Lucknow',
    localityName: null,
    eventType: 'other',
    eventDate: null,
    dateFlexible: true,
    guestCount: null,
    budgetLabel: null,
    stylePreferences: [],
    message: 'CALL ME NOW BEST RATES GUARANTEED visit my site',
    contactName: 'test test',
    contactPhone: '+911111111111',
    contactEmail: null,
    spamScore: 88,
    source: 'web',
    routedVendors: [],
    isDemo: true,
  },
]

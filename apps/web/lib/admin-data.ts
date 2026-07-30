import 'server-only'

/**
 * Admin console data layer.
 *
 * Same fixture-fallback contract as apps/web: read Supabase when configured, otherwise
 * serve a plausible dataset so the console is reviewable without infrastructure. All
 * numbers below are deliberately *short of* the plan §13 launch gates — the console's
 * job in Sep 2026 is to show how far the field team still has to go, not to look green.
 */

export interface ReadinessGate {
  label: string
  value: number
  target: number
  unit?: string
  hint?: string
}

/** Plan §13: "Launch readiness — go/no-go, late March 2027". */
export function getLaunchReadiness(): { supply: ReadinessGate[]; funnel: ReadinessGate[] } {
  return {
    supply: [
      { label: 'Live listings', value: 1_148, target: 3_000, hint: 'All categories, both cities' },
      { label: 'Photographers live', value: 412, target: 800, hint: 'The wedge category' },
      {
        label: 'Listings with 5+ photos and a price band',
        value: 1_006,
        target: 3_000,
        hint: 'is_seo_eligible',
      },
      { label: 'Beta-verified reviews', value: 137, target: 500, hint: 'Booking-gated only' },
      { label: 'Real-wedding stories', value: 18, target: 50, hint: 'Seeded from the anchor studio' },
    ],
    funnel: [
      { label: 'Search → verified lead success', value: 97, target: 99, unit: '%' },
      { label: 'Median vendor response', value: 84, target: 120, unit: 'min', hint: 'Lower is better; target is a ceiling' },
      { label: 'Monthly enquiries', value: 2_240, target: 10_000, hint: 'Ads beta gate' },
      { label: 'Lead → booking', value: 4, target: 5, unit: '%', hint: 'Photography target is 6%' },
    ],
  }
}

/** Per-city, per-category coverage. Plan §13: "every category ≥50 listings per city". */
export function getCategoryCoverage(): { city: string; category: string; live: number }[] {
  return [
    { city: 'Lucknow', category: 'Photography', live: 268 },
    { city: 'Lucknow', category: 'Venues', live: 91 },
    { city: 'Lucknow', category: 'Catering', live: 64 },
    { city: 'Lucknow', category: 'Decor', live: 57 },
    { city: 'Lucknow', category: 'Makeup', live: 78 },
    { city: 'Lucknow', category: 'Mehendi', live: 31 },
    { city: 'Lucknow', category: 'Music & DJ', live: 22 },
    { city: 'Delhi NCR', category: 'Photography', live: 144 },
    { city: 'Delhi NCR', category: 'Venues', live: 112 },
    { city: 'Delhi NCR', category: 'Catering', live: 73 },
    { city: 'Delhi NCR', category: 'Decor', live: 48 },
    { city: 'Delhi NCR', category: 'Makeup', live: 39 },
    { city: 'Delhi NCR', category: 'Mehendi', live: 17 },
    { city: 'Delhi NCR', category: 'Music & DJ', live: 14 },
  ]
}

export type ModerationSubject = 'vendor' | 'package' | 'media' | 'review' | 'story'

export interface ModerationItem {
  id: string
  subjectType: ModerationSubject
  subjectLabel: string
  vendorName: string
  city: string
  priority: number
  reason: string
  autoFlags: string[]
  slaDueAt: string
  status: 'pending' | 'escalated'
}

export function getModerationQueue(): ModerationItem[] {
  return [
    m('mq-1', 'vendor', 'Aperture & Co. — new listing', 'Aperture & Co.', 'Lucknow', 2, 'New listing submitted by field agent', ['first_listing'], -4, 'pending'),
    m('mq-2', 'review', '1★ review on Rangoli Banquets', 'Rangoli Banquets', 'Lucknow', 1, 'Reported by vendor as defamatory', ['vendor_reported', 'low_rating'], -2, 'escalated'),
    m('mq-3', 'media', '14 photos uploaded', 'Shaadi Stories', 'Delhi NCR', 5, 'Bulk upload awaiting review', [], 3, 'pending'),
    m('mq-4', 'vendor', 'Moonlight Weddings — price band change', 'Moonlight Weddings', 'Delhi NCR', 4, 'Price band dropped 60% in one edit', ['price_anomaly'], 6, 'pending'),
    m('mq-5', 'review', '5★ review with no booking history', 'Kalyana Clicks', 'Lucknow', 1, 'Booking gate passed but account is 2 days old', ['new_account'], -1, 'escalated'),
    m('mq-6', 'story', 'Meera & Arjun, Tamarind Estate', 'Lightleak Studio', 'Lucknow', 6, 'Real-wedding story submitted', [], 11, 'pending'),
    m('mq-7', 'media', 'Cover photo replaced', 'Blush by Meera', 'Lucknow', 7, 'Routine', [], 14, 'pending'),
    m('mq-8', 'vendor', 'Grand Palace Banquets — claim request', 'Grand Palace Banquets', 'Delhi NCR', 3, 'Owner claiming a field-created profile', ['ownership_claim'], 2, 'pending'),
    m('mq-9', 'package', 'Package priced at ₹500/day', 'Budget Clicks', 'Lucknow', 3, 'Implausible per-day price', ['price_anomaly'], 5, 'pending'),
    m('mq-10', 'media', 'Watermarked images from another studio', 'Royal Frames', 'Delhi NCR', 1, 'Auto-flagged: foreign watermark detected', ['watermark', 'possible_theft'], -6, 'escalated'),
    m('mq-11', 'review', 'Review mentions a phone number', 'The Glow Room', 'Lucknow', 4, 'Contact details in review body', ['contact_in_text'], 8, 'pending'),
    m('mq-12', 'vendor', 'Spice Route Catering — GSTIN updated', 'Spice Route Catering', 'Lucknow', 6, 'KYC re-verification needed', ['kyc'], 16, 'pending'),
  ]
}

function m(
  id: string,
  subjectType: ModerationSubject,
  subjectLabel: string,
  vendorName: string,
  city: string,
  priority: number,
  reason: string,
  autoFlags: string[],
  slaHours: number,
  status: 'pending' | 'escalated',
): ModerationItem {
  return {
    id,
    subjectType,
    subjectLabel,
    vendorName,
    city,
    priority,
    reason,
    autoFlags,
    slaDueAt: new Date(Date.now() + slaHours * 3_600_000).toISOString(),
    status,
  }
}

export interface AdminVendor {
  slug: string
  name: string
  city: string
  locality: string
  category: string
  status: 'draft' | 'pending_review' | 'live' | 'paused' | 'suspended'
  profileScore: number
  mediaCount: number
  seoEligible: boolean
  kyc: 'not_started' | 'submitted' | 'verified' | 'rejected'
  isAnchor: boolean
  ratingAvg: number | null
  ratingCount: number

  /**
   * The editable copy, for the details form on the vendor page.
   *
   * Everything above this line is either identity or a derived signal a moderator reads;
   * these are the fields a moderator may change. Optional because the fixture roster is
   * hand-written and only the rows worth demonstrating an edit on carry them - a real read
   * fills all of them.
   *
   * Money is integer paise (plan §5). The form types rupees and converts on the way in.
   */
  about?: string | null
  priceBandMinPaise?: number | null
  priceBandMaxPaise?: number | null
  establishedYear?: number | null
  teamSize?: number | null
  travelsOutstation?: boolean
}

export function getAdminVendors(): AdminVendor[] {
  return [
    v('lightleak-studio', 'Lightleak Studio', 'Lucknow', 'Gomti Nagar', 'Photography', 'live', 92, 8, true, 'verified', false, 5, 1, {
      about:
        'A four-person candid team that has shot over 300 weddings since 2016. We work quietly, stay out of the rituals, and hand over a full gallery in three weeks.',
      priceBandMinPaise: 12_000_000,
      priceBandMaxPaise: 35_000_000,
      establishedYear: 2016,
      teamSize: 4,
      travelsOutstation: true,
    }),
    v('utsava-studio', 'Utsava Studio', 'Lucknow', 'Gomti Nagar', 'Photography', 'live', 88, 8, true, 'verified', true, 4.9, 11),
    v('saat-phere-films', 'Saat Phere Films', 'Lucknow', 'Hazratganj', 'Photography', 'live', 90, 8, true, 'verified', false, 4.8, 42),
    v('anantha-photography', 'Anantha Photography', 'Lucknow', 'Aliganj', 'Photography', 'live', 85, 8, true, 'verified', false, 4.6, 128),
    v('the-mango-tree-co', 'The Mango Tree Co.', 'Lucknow', 'Indira Nagar', 'Photography', 'live', 87, 8, true, 'submitted', false, 4.9, 31),
    v('aperture-and-co', 'Aperture & Co.', 'Lucknow', 'Sushant Golf City', 'Photography', 'pending_review', 62, 6, false, 'not_started', false, null, 0),
    v('budget-clicks', 'Budget Clicks', 'Lucknow', 'Alambagh', 'Photography', 'draft', 34, 2, false, 'not_started', false, null, 0),
    v('royal-frames', 'Royal Frames', 'Delhi NCR', 'Rohini', 'Photography', 'suspended', 71, 9, false, 'rejected', false, 3.9, 12),
    v('shaadi-stories-delhi', 'Shaadi Stories', 'Delhi NCR', 'Gurugram', 'Photography', 'live', 94, 8, true, 'verified', false, 4.7, 96),
    v('moonlight-weddings', 'Moonlight Weddings', 'Delhi NCR', 'Noida', 'Photography', 'live', 76, 7, true, 'verified', false, 4.2, 18),
    v('the-tamarind-estate', 'The Tamarind Estate', 'Lucknow', 'Faizabad Road', 'Venues', 'live', 89, 8, true, 'verified', false, 4.6, 58),
    v('rangoli-banquets', 'Rangoli Banquets', 'Lucknow', 'Alambagh', 'Venues', 'live', 81, 8, true, 'verified', false, 4.2, 141),
    v('grand-palace-banquets', 'Grand Palace Banquets', 'Delhi NCR', 'Chattarpur', 'Venues', 'pending_review', 58, 5, false, 'submitted', false, null, 0),
    v('blush-by-meera', 'Blush by Meera', 'Lucknow', 'Gomti Nagar', 'Makeup', 'live', 86, 8, true, 'verified', false, 4.9, 203),
    v('the-glow-room', 'The Glow Room', 'Lucknow', 'Hazratganj', 'Makeup', 'live', 83, 8, true, 'verified', false, 4.8, 47),
    v('marigold-decor', 'Marigold Decor', 'Lucknow', 'Aliganj', 'Decor', 'live', 80, 8, true, 'verified', false, 4.5, 74),
    v('spice-route-catering', 'Spice Route Catering', 'Lucknow', 'Sushant Golf City', 'Catering', 'live', 79, 8, true, 'submitted', false, 4.4, 118),
    v('paused-studio', 'Sunrise Studio', 'Lucknow', 'Kanpur Road', 'Photography', 'paused', 84, 8, true, 'verified', false, 4.4, 29),
  ]
}

function v(
  slug: string,
  name: string,
  city: string,
  locality: string,
  category: string,
  status: AdminVendor['status'],
  profileScore: number,
  mediaCount: number,
  seoEligible: boolean,
  kyc: AdminVendor['kyc'],
  isAnchor: boolean,
  ratingAvg: number | null,
  ratingCount: number,
  /**
   * Editable copy. Positional like the rest of this helper, and last, so the existing rows
   * did not all have to be rewritten to add it - the fixture roster is a wall of calls and
   * a named-object refactor here would be a large diff for no behavioural change.
   */
  editable?: Pick<
    AdminVendor,
    | 'about'
    | 'priceBandMinPaise'
    | 'priceBandMaxPaise'
    | 'establishedYear'
    | 'teamSize'
    | 'travelsOutstation'
  >,
): AdminVendor {
  return {
    slug,
    name,
    city,
    locality,
    category,
    status,
    profileScore,
    mediaCount,
    seoEligible,
    kyc,
    isAnchor,
    ratingAvg,
    ratingCount,
    about: editable?.about ?? null,
    priceBandMinPaise: editable?.priceBandMinPaise ?? null,
    priceBandMaxPaise: editable?.priceBandMaxPaise ?? null,
    establishedYear: editable?.establishedYear ?? null,
    teamSize: editable?.teamSize ?? null,
    travelsOutstation: editable?.travelsOutstation ?? false,
  }
}

export type PipelineStage =
  | 'prospect'
  | 'contacted'
  | 'shooting_scheduled'
  | 'media_captured'
  | 'profile_drafted'
  | 'submitted'
  | 'live'
  | 'dropped'

export interface PipelineCard {
  id: string
  business: string
  phone: string
  city: string
  locality: string
  category: string
  agent: string
  stage: PipelineStage
  photos: number
  priceBandCaptured: boolean
  nextActionInDays: number | null
}

/** Plan §1: the 3,000-listing launch asset is built here, by the field team. */
export function getPipeline(): PipelineCard[] {
  const raw: [string, string, string, string, PipelineStage, string, number, boolean, number | null][] = [
    ['Candid Tales', 'Lucknow', 'Gomti Nagar', 'Photography', 'prospect', 'Ravi K.', 0, false, 2],
    ['Studio Saanjh', 'Lucknow', 'Hazratganj', 'Photography', 'prospect', 'Ravi K.', 0, false, 5],
    ['Naina Weddings', 'Delhi NCR', 'Gurugram', 'Photography', 'prospect', 'Neha B.', 0, false, 1],
    ['Wedlock Films', 'Lucknow', 'Indira Nagar', 'Photography', 'contacted', 'Ravi K.', 0, false, -1],
    ['Ritu Makeovers', 'Delhi NCR', 'Noida', 'Makeup', 'contacted', 'Neha B.', 0, false, 3],
    ['Green Lawns', 'Lucknow', 'Faizabad Road', 'Venues', 'contacted', 'Ravi K.', 0, true, 4],
    ['Pixel Bride', 'Lucknow', 'Aliganj', 'Photography', 'shooting_scheduled', 'Ravi K.', 0, true, 0],
    ['Dulhan Decor', 'Delhi NCR', 'Rohini', 'Decor', 'shooting_scheduled', 'Neha B.', 0, true, 1],
    ['Kesar Caterers', 'Lucknow', 'Chowk', 'Catering', 'shooting_scheduled', 'Ravi K.', 0, false, 2],
    ['Frame Theory', 'Lucknow', 'Sushant Golf City', 'Photography', 'media_captured', 'Ravi K.', 11, true, 1],
    ['Sitara Events', 'Delhi NCR', 'Dwarka', 'Decor', 'media_captured', 'Neha B.', 8, true, 2],
    ['Bandhan Studio', 'Delhi NCR', 'Ghaziabad', 'Photography', 'media_captured', 'Neha B.', 6, false, -2],
    ['Ochre Weddings', 'Lucknow', 'Mahanagar', 'Photography', 'profile_drafted', 'Ravi K.', 14, true, 1],
    ['Saffron Table', 'Lucknow', 'Kanpur Road', 'Catering', 'profile_drafted', 'Ravi K.', 9, true, 3],
    ['Mehfil Decor', 'Delhi NCR', 'South Delhi', 'Decor', 'profile_drafted', 'Neha B.', 12, true, 2],
    ['Aperture & Co.', 'Lucknow', 'Sushant Golf City', 'Photography', 'submitted', 'Ravi K.', 6, true, 0],
    ['Grand Palace Banquets', 'Delhi NCR', 'Chattarpur', 'Venues', 'submitted', 'Neha B.', 5, true, 0],
    ['Moonlight Weddings', 'Delhi NCR', 'Noida', 'Photography', 'live', 'Neha B.', 7, true, null],
    ['The Glow Room', 'Lucknow', 'Hazratganj', 'Makeup', 'live', 'Ravi K.', 8, true, null],
    ['Marigold Decor', 'Lucknow', 'Aliganj', 'Decor', 'live', 'Ravi K.', 8, true, null],
    ['Cheap Shots', 'Lucknow', 'Electronic City', 'Photography', 'dropped', 'Ravi K.', 0, false, null],
    ['Quick Clicks', 'Delhi NCR', 'Faridabad', 'Photography', 'dropped', 'Neha B.', 2, false, null],
  ]

  return raw.map((r, i) => ({
    id: `pl-${i + 1}`,
    business: r[0],
    phone: `+9198${String(45000000 + i * 137).padStart(8, '0')}`,
    city: r[1],
    locality: r[2],
    category: r[3],
    stage: r[4],
    agent: r[5],
    photos: r[6],
    priceBandCaptured: r[7],
    nextActionInDays: r[8],
  }))
}

export interface RoutingHealth {
  routedToday: number
  capBreaches: number
  medianResponseMins: number
  unworkedExpiringSoon: number
  verificationRatePct: number
}

/** Plan §10 Match-stage KPIs. capBreaches must always be zero — it is a DB invariant. */
export function getRoutingHealth(): RoutingHealth {
  return {
    routedToday: 178,
    capBreaches: 0,
    medianResponseMins: 84,
    unworkedExpiringSoon: 23,
    verificationRatePct: 71,
  }
}

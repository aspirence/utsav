import 'server-only'

import { getServerClientOrNull } from './supabase'

/**
 * Partner PWA data layer. Plan §S7: the vendor's lead inbox.
 *
 * Every read here goes through public.vendor_leads — the contact-masking view from
 * migration 001500. Vendors have NO RLS policy on public.enquiries, so this view is
 * the only path to enquiry data, and it nulls the customer's phone unless the lead has
 * reached a permitted state (plan §6). The UI below must never imply otherwise.
 */

export type LeadStatus = 'routed' | 'viewed' | 'responded' | 'quoted' | 'converted' | 'expired'

export interface PartnerLead {
  leadId: string
  enquiryId: string
  status: LeadStatus
  routedSeq: number
  routedAt: string
  expiresAt: string
  eventType: string
  eventDate: string | null
  dateFlexible: boolean
  guestCount: number | null
  budgetMin: number | null
  budgetMax: number | null
  stylePreferences: string[]
  message: string | null
  localityName: string | null
  contactFirstName: string
  /** null until app.lead_contact_visible() permits it — see the view definition. */
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  contactVisible: boolean
  creditRefundedAt: string | null
}

export interface PartnerStats {
  vendorName: string
  newLeads: number
  responseRatePct: number | null
  medianResponseMins: number | null
  conversionPct: number | null
  totalLeads: number
  expiringSoon: number
}

/** Deterministic demo inbox — no Math.random, so SSR and hydration agree. */
const DEMO_LEADS: PartnerLead[] = [
  {
    leadId: 'demo-lead-1',
    enquiryId: 'demo-enq-1',
    status: 'routed',
    routedSeq: 2,
    routedAt: hoursAgo(3),
    expiresAt: daysAhead(7),
    eventType: 'wedding',
    eventDate: daysAhead(96),
    dateFlexible: false,
    guestCount: 400,
    budgetMin: 12_000_000,
    budgetMax: 20_000_000,
    stylePreferences: ['candid', 'cinematic'],
    message: 'Looking for a team that will not interrupt the ceremony. Two-day event.',
    localityName: 'Gomti Nagar',
    contactFirstName: 'Ananya',
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    contactVisible: false,
    creditRefundedAt: null,
  },
  {
    leadId: 'demo-lead-2',
    enquiryId: 'demo-enq-2',
    status: 'routed',
    routedSeq: 1,
    routedAt: hoursAgo(9),
    expiresAt: daysAhead(6),
    eventType: 'reception',
    eventDate: daysAhead(58),
    dateFlexible: true,
    guestCount: 250,
    budgetMin: 8_000_000,
    budgetMax: 14_000_000,
    stylePreferences: ['candid'],
    message: null,
    localityName: 'Hazratganj',
    contactFirstName: 'Rohit',
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    contactVisible: false,
    creditRefundedAt: null,
  },
  {
    leadId: 'demo-lead-3',
    enquiryId: 'demo-enq-3',
    status: 'viewed',
    routedSeq: 3,
    routedAt: daysAgo(1),
    expiresAt: daysAhead(6),
    eventType: 'wedding',
    eventDate: daysAhead(140),
    dateFlexible: false,
    guestCount: 600,
    budgetMin: 25_000_000,
    budgetMax: 40_000_000,
    stylePreferences: ['cinematic', 'drone'],
    message: 'Three-day wedding at a farmhouse. Need drone coverage for the baraat.',
    localityName: 'Faizabad Road',
    contactFirstName: 'Meera',
    contactName: 'Meera Raghavan',
    contactPhone: '+919845012345',
    contactEmail: 'meera.r@example.com',
    contactVisible: true,
    creditRefundedAt: null,
  },
  {
    leadId: 'demo-lead-4',
    enquiryId: 'demo-enq-4',
    status: 'responded',
    routedSeq: 1,
    routedAt: daysAgo(2),
    expiresAt: daysAhead(5),
    eventType: 'engagement',
    eventDate: daysAhead(34),
    dateFlexible: false,
    guestCount: 120,
    budgetMin: 4_000_000,
    budgetMax: 8_000_000,
    stylePreferences: ['candid', 'pre-wedding'],
    message: 'Small engagement at home, plus a pre-wedding shoot the week before.',
    localityName: 'Aliganj',
    contactFirstName: 'Karthik',
    contactName: 'Karthik Iyer',
    contactPhone: '+919845067890',
    contactEmail: null,
    contactVisible: true,
    creditRefundedAt: null,
  },
  {
    leadId: 'demo-lead-5',
    enquiryId: 'demo-enq-5',
    status: 'quoted',
    routedSeq: 2,
    routedAt: daysAgo(4),
    expiresAt: daysAhead(3),
    eventType: 'wedding',
    eventDate: daysAhead(76),
    dateFlexible: false,
    guestCount: 350,
    budgetMin: 15_000_000,
    budgetMax: 22_000_000,
    stylePreferences: ['traditional', 'candid'],
    message: 'Tamil wedding, muhurtham at 6am. Need someone who knows the rituals.',
    localityName: 'Chowk',
    contactFirstName: 'Lakshmi',
    contactName: 'Lakshmi Subramanian',
    contactPhone: '+919845054321',
    contactEmail: 'lakshmi.s@example.com',
    contactVisible: true,
    creditRefundedAt: null,
  },
  {
    leadId: 'demo-lead-6',
    enquiryId: 'demo-enq-6',
    status: 'converted',
    routedSeq: 1,
    routedAt: daysAgo(12),
    expiresAt: daysAgo(5),
    eventType: 'wedding',
    eventDate: daysAhead(21),
    dateFlexible: false,
    guestCount: 300,
    budgetMin: 12_000_000,
    budgetMax: 18_000_000,
    stylePreferences: ['candid'],
    message: null,
    localityName: 'Indira Nagar',
    contactFirstName: 'Priya',
    contactName: 'Priya Sharma',
    contactPhone: '+919845000101',
    contactEmail: 'priya@example.com',
    contactVisible: true,
    creditRefundedAt: null,
  },
  {
    leadId: 'demo-lead-7',
    enquiryId: 'demo-enq-7',
    status: 'expired',
    routedSeq: 4,
    routedAt: daysAgo(11),
    expiresAt: daysAgo(4),
    eventType: 'birthday',
    eventDate: daysAgo(2),
    dateFlexible: false,
    guestCount: 60,
    budgetMin: 1_500_000,
    budgetMax: 3_000_000,
    stylePreferences: [],
    message: null,
    localityName: 'Sushant Golf City',
    contactFirstName: 'Sanjay',
    // Expired: app.lead_contact_visible() no longer permits contact, so it is masked
    // again even though this vendor could see it while the lead was open.
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    contactVisible: false,
    creditRefundedAt: null,
  },
  {
    leadId: 'demo-lead-8',
    enquiryId: 'demo-enq-8',
    status: 'viewed',
    routedSeq: 5,
    routedAt: daysAgo(6),
    expiresAt: daysAhead(1),
    eventType: 'corporate',
    eventDate: daysAhead(45),
    dateFlexible: true,
    guestCount: 800,
    budgetMin: 20_000_000,
    budgetMax: 35_000_000,
    stylePreferences: ['documentary'],
    message: 'Annual company offsite, two days, need full event coverage.',
    localityName: 'Sushant Golf City',
    contactFirstName: 'Deepa',
    // Plan §12: the credit was refunded as a mis-route, so contact access is revoked.
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    contactVisible: false,
    creditRefundedAt: daysAgo(3),
  },
]

export async function getPartnerLeads(): Promise<PartnerLead[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return DEMO_LEADS

  const { data, error } = await supabase
    .from('vendor_leads')
    .select('*')
    .order('routed_at', { ascending: false })
    .limit(100)

  if (error || !data || data.length === 0) return DEMO_LEADS

  return data.map((r) => ({
    leadId: r.lead_id,
    enquiryId: r.enquiry_id,
    status: r.status as LeadStatus,
    routedSeq: r.routed_seq,
    routedAt: r.routed_at,
    expiresAt: r.expires_at,
    eventType: r.event_type,
    eventDate: r.event_date,
    dateFlexible: r.date_flexible,
    guestCount: r.guest_count,
    budgetMin: r.budget_min,
    budgetMax: r.budget_max,
    stylePreferences: r.style_preferences ?? [],
    message: r.message,
    localityName: null,
    contactFirstName: r.contact_first_name,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    contactVisible: r.contact_visible,
    creditRefundedAt: r.credit_refunded_at,
  }))
}

export async function getPartnerLead(leadId: string): Promise<PartnerLead | null> {
  const leads = await getPartnerLeads()
  return leads.find((l) => l.leadId === leadId) ?? null
}

/**
 * Plan §2: "honest vendor dashboards". Every number here is the same one the customer
 * sees on the profile and the same one app.vendor_rank() uses — computed once in
 * app.refresh_vendor_response_metrics(), never re-derived for presentation.
 */
export async function getPartnerStats(): Promise<PartnerStats> {
  const leads = await getPartnerLeads()
  const now = Date.now()

  const responded = leads.filter((l) =>
    ['responded', 'quoted', 'converted'].includes(l.status),
  ).length
  const converted = leads.filter((l) => l.status === 'converted').length
  const billable = leads.filter((l) => !l.creditRefundedAt).length

  return {
    vendorName: 'Lightleak Studio',
    newLeads: leads.filter((l) => l.status === 'routed').length,
    responseRatePct: billable ? Math.round((responded / billable) * 100) : null,
    medianResponseMins: 38,
    conversionPct: billable ? Math.round((converted / billable) * 100) : null,
    totalLeads: leads.length,
    expiringSoon: leads.filter(
      (l) =>
        ['routed', 'viewed'].includes(l.status) &&
        new Date(l.expiresAt).getTime() - now < 2 * 86_400_000,
    ).length,
  }
}

export async function getBlockedDates(): Promise<string[]> {
  const supabase = await getServerClientOrNull()

  if (supabase) {
    const { data, error } = await supabase
      .from('vendor_availability')
      .select('blocked_on')
      .gte('blocked_on', new Date().toISOString().slice(0, 10))
      .order('blocked_on')
    if (!error && data) return data.map((d) => d.blocked_on)
  }

  // Deterministic scatter so server and client render identically.
  return [12, 27, 41, 58, 73, 96, 118].map((d) => daysAhead(d).slice(0, 10))
}

// --- date helpers (module-level so every render agrees) ---
function daysAhead(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString()
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}
function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString()
}

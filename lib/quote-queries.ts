import 'server-only'

import { cache } from 'react'

import { formatPriceBand, gstOn, rupeesToPaise, type FremmoClient } from '@/lib/db'

import { getPartnerLeads, type LeadStatus } from './partner-queries'
import { getServerClientOrNull } from './supabase'

/**
 * Read layer for vendor quoting. Plan §2 Should-tier ("Escrow payments & booking flow …
 * quotes", by Jul 2027) and plan §14: quotes are the step that turns a worked lead into
 * a booking. A customer accepting one is the single client write that reaches the money
 * graph, and it goes through app.accept_quote() — never through this file.
 *
 * Same shape as lib/queries.ts: Supabase first, deterministic fixtures when no instance
 * is configured, so `pnpm dev` works before Docker exists.
 *
 * One deliberate difference from lib/partner-queries.ts: an empty result from a *reachable*
 * Supabase is returned as empty, not swapped for the demo set. A vendor who has never
 * quoted should see an empty pipeline, not four invented quotes with money on them.
 */

/**
 * One inbox read per request. getPartnerQuotes(), getQuotableLeads() and
 * getQuoteLeadContext() all need the same masked lead set, and the quotes page calls
 * two of them; without this the vendor_leads view would be queried three times to
 * render one screen.
 */
const leadsForRequest = cache(getPartnerLeads)

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'withdrawn'

export interface QuoteLineItem {
  label: string
  quantity: number
  /** Integer paise (plan §5). */
  unitAmount: number
  /** quantity × unitAmount, integer paise. */
  amount: number
}

export interface PartnerQuote {
  id: string
  leadId: string
  status: QuoteStatus
  title: string
  notes: string | null
  lineItems: QuoteLineItem[]
  subtotal: number
  discount: number
  taxAmount: number
  total: number
  /** Plan §S15: escrow holds an advance, not the full sum. */
  advanceAmount: number
  advancePct: number | null
  eventDate: string | null
  validUntil: string | null
  sentAt: string | null
  acceptedAt: string | null
  rejectedAt: string | null
  createdAt: string
  /** Decoration from public.vendor_leads — masked exactly as that view masks it. */
  customerLabel: string
  eventType: string | null
  leadStatus: LeadStatus | null
}

/** Just enough of a lead to attach a quote to it and label the option in a select. */
export interface QuotableLead {
  leadId: string
  label: string
  eventDate: string | null
  budgetLabel: string
  status: LeadStatus
  suggestedTitle: string
}

/**
 * Lead facts a quote insert needs. `vendorId` is read back out of public.vendor_leads
 * rather than taken from the caller: that view is RLS-scoped to the vendors the session
 * is a member of, so the id it returns is provably the caller's own.
 */
export interface QuoteLeadContext {
  leadId: string
  vendorId: string
  status: LeadStatus
  eventDate: string | null
  customerFirstName: string
  eventType: string
}

// ---------------------------------------------------------------------------
// Typed escape hatch for public.quotes
//
// packages/db/src/generated/database.types.ts is hand-authored and covers only the read
// surface apps/web had before quoting existed — `quotes` is not in it, and packages/**
// is not ours to edit. This is the same narrowing trick app/enquire/otp-actions.ts uses
// for the `app` schema: describe exactly the calls we make, cast once, and let
// `pnpm db:types` replace both the shim and the hand-written file when Docker is around.
//
// Nothing here grants any access. public.quotes is governed by quotes_all_vendor, whose
// USING and WITH CHECK both require the quote's lead_id to belong to the same vendor —
// so a vendor cannot attach a quote to a competitor's lead even by posting a valid uuid.
// ---------------------------------------------------------------------------

type PostgrestErrorLike = { message: string; code?: string } | null

interface QuoteQuery<Row> extends PromiseLike<{ data: Row[] | null; error: PostgrestErrorLike }> {
  select(columns: string): QuoteQuery<Row>
  eq(column: string, value: string): QuoteQuery<Row>
  order(column: string, options?: { ascending?: boolean }): QuoteQuery<Row>
  limit(count: number): QuoteQuery<Row>
  single(): PromiseLike<{ data: Row | null; error: PostgrestErrorLike }>
  maybeSingle(): PromiseLike<{ data: Row | null; error: PostgrestErrorLike }>
}

export interface QuoteRowRaw {
  id: string
  lead_id: string
  vendor_id: string
  status: QuoteStatus
  title: string
  notes: string | null
  line_items: unknown
  subtotal: number
  discount: number
  tax_amount: number
  total: number
  advance_amount: number
  advance_pct: number | null
  event_date: string | null
  valid_until: string | null
  sent_at: string | null
  accepted_at: string | null
  rejected_at: string | null
  created_at: string
}

export interface QuoteInsertRaw {
  lead_id: string
  vendor_id: string
  status: QuoteStatus
  title: string
  notes: string | null
  line_items: { label: string; quantity: number; unit_amount: number; amount: number }[]
  subtotal: number
  discount: number
  tax_amount: number
  total: number
  advance_amount: number
  advance_pct: number | null
  event_date: string | null
  valid_until: string | null
}

export interface QuoteUpdateRaw {
  status?: QuoteStatus
  sent_at?: string
}

export interface QuotesTable {
  from(table: 'quotes'): {
    select(columns: string): QuoteQuery<QuoteRowRaw>
    insert(values: QuoteInsertRaw): QuoteQuery<QuoteRowRaw>
    update(values: QuoteUpdateRaw): QuoteQuery<QuoteRowRaw>
  }
}

export function asQuotesTable(client: FremmoClient): QuotesTable {
  return client as unknown as QuotesTable
}

/**
 * public.transition_lead is one of the four wrappers migration 001600 exposes to a
 * browser session; it is absent from the hand-written Functions map for the same reason
 * `quotes` is. app.route_enquiry and app.transition_booking are deliberately unreachable
 * this way — they have no public wrapper at all.
 */
export interface PublicRpcCaller {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: PostgrestErrorLike }>
}

export function asRpcCaller(client: FremmoClient): PublicRpcCaller {
  return client as unknown as PublicRpcCaller
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const QUOTE_COLUMNS =
  'id, lead_id, vendor_id, status, title, notes, line_items, subtotal, discount, ' +
  'tax_amount, total, advance_amount, advance_pct, event_date, valid_until, ' +
  'sent_at, accepted_at, rejected_at, created_at'

export async function getPartnerQuotes(): Promise<PartnerQuote[]> {
  const supabase = await getServerClientOrNull()
  const leads = await leadsForRequest()

  if (!supabase) return DEMO_QUOTES.map((q) => decorate(q, leads))

  const { data, error } = await asQuotesTable(supabase)
    .from('quotes')
    .select(QUOTE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100)

  // An error is not a reason to invent data — the page shows an empty pipeline and the
  // vendor can retry, which is honest about what happened.
  if (error || !data) return []

  return data.map((row) => decorate(fromRow(row), leads))
}

export async function getPartnerQuote(quoteId: string): Promise<PartnerQuote | null> {
  const quotes = await getPartnerQuotes()
  return quotes.find((q) => q.id === quoteId) ?? null
}

/**
 * Leads a quote can still be attached to. `converted` and `expired` are terminal in
 * app.lead_transition_allowed(), so quoting them would fail at the RPC anyway — better
 * to leave them out of the picker than to explain the error afterwards.
 */
export async function getQuotableLeads(): Promise<QuotableLead[]> {
  const leads = await leadsForRequest()

  return leads
    .filter((l) => ['routed', 'viewed', 'responded', 'quoted'].includes(l.status))
    .map((l) => {
      const who = l.contactName ?? l.contactFirstName
      const occasion = l.eventType.replace(/_/g, ' ')
      const when = l.eventDate ? formatDay(l.eventDate) : 'date flexible'
      return {
        leadId: l.leadId,
        label: `${who} · ${occasion} · ${when}`,
        eventDate: l.eventDate ? l.eventDate.slice(0, 10) : null,
        budgetLabel: formatPriceBand(l.budgetMin, l.budgetMax),
        status: l.status,
        suggestedTitle: `${capitalise(occasion)} coverage for ${who}`,
      }
    })
}

export async function getQuoteLeadContext(leadId: string): Promise<QuoteLeadContext | null> {
  const supabase = await getServerClientOrNull()

  if (supabase) {
    const { data, error } = await supabase
      .from('vendor_leads')
      .select('lead_id, vendor_id, status, event_date, contact_first_name, event_type')
      .eq('lead_id', leadId)
      .maybeSingle()

    if (error || !data) return null
    return {
      leadId: data.lead_id,
      vendorId: data.vendor_id,
      status: data.status,
      eventDate: data.event_date,
      customerFirstName: data.contact_first_name,
      eventType: data.event_type,
    }
  }

  const lead = (await leadsForRequest()).find((l) => l.leadId === leadId)
  if (!lead) return null
  return {
    leadId: lead.leadId,
    vendorId: DEMO_VENDOR_ID,
    status: lead.status,
    eventDate: lead.eventDate ? lead.eventDate.slice(0, 10) : null,
    customerFirstName: lead.contactFirstName,
    eventType: lead.eventType,
  }
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function fromRow(row: QuoteRowRaw): PartnerQuote {
  return {
    id: row.id,
    leadId: row.lead_id,
    status: row.status,
    title: row.title,
    notes: row.notes,
    lineItems: parseLineItems(row.line_items),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    taxAmount: Number(row.tax_amount),
    total: Number(row.total),
    advanceAmount: Number(row.advance_amount),
    advancePct: row.advance_pct,
    eventDate: row.event_date,
    validUntil: row.valid_until,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    createdAt: row.created_at,
    customerLabel: 'This customer',
    eventType: null,
    leadStatus: null,
  }
}

/**
 * jsonb arrives as `unknown`, and a quote written by an older build could have any shape,
 * so every field is checked rather than asserted. A malformed line is dropped, not
 * guessed at — a wrong number on a quote is worse than a missing one.
 */
function parseLineItems(value: unknown): QuoteLineItem[] {
  if (!Array.isArray(value)) return []

  const items: QuoteLineItem[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const raw = entry as Record<string, unknown>

    const label = typeof raw.label === 'string' ? raw.label : ''
    if (!label) continue

    const quantity = typeof raw.quantity === 'number' ? raw.quantity : 1
    const unitAmount = typeof raw.unit_amount === 'number' ? raw.unit_amount : 0
    const amount = typeof raw.amount === 'number' ? raw.amount : quantity * unitAmount

    items.push({ label, quantity, unitAmount, amount })
  }
  return items
}

function decorate(
  quote: PartnerQuote,
  leads: Awaited<ReturnType<typeof getPartnerLeads>>,
): PartnerQuote {
  const lead = leads.find((l) => l.leadId === quote.leadId)
  if (!lead) return quote

  return {
    ...quote,
    // Masked exactly as public.vendor_leads masks it: contact_name is null until
    // app.lead_contact_visible() permits it, so we fall back to the first name.
    customerLabel: lead.contactName ?? lead.contactFirstName,
    eventType: lead.eventType,
    leadStatus: lead.status,
  }
}

// ---------------------------------------------------------------------------
// Fixtures. Deterministic, and arithmetically consistent with the two CHECK
// constraints on public.quotes — a demo that could not exist in the database would
// teach the wrong thing about the product.
// ---------------------------------------------------------------------------

const DEMO_VENDOR_ID = 'demo-vendor-lightleak'

interface DemoQuoteInput {
  id: string
  leadId: string
  status: QuoteStatus
  title: string
  notes: string | null
  lines: [string, number, number][]
  discountRupees: number
  gst: boolean
  advancePct: number
  eventDateDaysAhead: number | null
  validForDays: number | null
  createdDaysAgo: number
  sentDaysAgo: number | null
  acceptedDaysAgo: number | null
}

function demoQuote(input: DemoQuoteInput): PartnerQuote {
  const lineItems: QuoteLineItem[] = input.lines.map(([label, quantity, unitRupees]) => ({
    label,
    quantity,
    unitAmount: rupeesToPaise(unitRupees),
    amount: quantity * rupeesToPaise(unitRupees),
  }))

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0)
  const discount = rupeesToPaise(input.discountRupees)
  const taxAmount = input.gst ? gstOn(Math.max(0, subtotal - discount)) : 0
  const total = subtotal - discount + taxAmount
  const advanceAmount = Math.round((total * input.advancePct) / 100)

  return {
    id: input.id,
    leadId: input.leadId,
    status: input.status,
    title: input.title,
    notes: input.notes,
    lineItems,
    subtotal,
    discount,
    taxAmount,
    total,
    advanceAmount,
    advancePct: input.advancePct,
    eventDate: input.eventDateDaysAhead == null ? null : dayAhead(input.eventDateDaysAhead),
    validUntil: input.validForDays == null ? null : daysAhead(input.validForDays),
    sentAt: input.sentDaysAgo == null ? null : daysAgo(input.sentDaysAgo),
    acceptedAt: input.acceptedDaysAgo == null ? null : daysAgo(input.acceptedDaysAgo),
    rejectedAt: null,
    createdAt: daysAgo(input.createdDaysAgo),
    customerLabel: 'This customer',
    eventType: null,
    leadStatus: null,
  }
}

const DEMO_QUOTES: PartnerQuote[] = [
  demoQuote({
    id: 'demo-quote-1',
    leadId: 'demo-lead-4',
    status: 'draft',
    title: 'Engagement coverage for Karthik',
    notes: 'Pre-wedding shoot on a weekday keeps the location fee out of this.',
    lines: [
      ['Engagement day coverage, 6 hours, lead photographer', 1, 32_000],
      ['Pre-wedding shoot, half day, one location', 1, 18_000],
    ],
    discountRupees: 0,
    gst: true,
    advancePct: 50,
    eventDateDaysAhead: 34,
    validForDays: 10,
    createdDaysAgo: 1,
    sentDaysAgo: null,
    acceptedDaysAgo: null,
  }),
  demoQuote({
    id: 'demo-quote-2',
    leadId: 'demo-lead-5',
    status: 'sent',
    title: 'Two-day Tamil wedding coverage for Lakshmi',
    notes:
      'Muhurtham at 6am means the crew arrives the previous evening. Travel and stay are '
      + 'included for Lucknow; outstation is quoted separately.',
    lines: [
      ['Wedding day coverage, lead photographer', 2, 55_000],
      ['Second shooter, candid', 2, 18_000],
      ['Printed album, 30 spreads', 1, 22_000],
    ],
    discountRupees: 8_000,
    gst: true,
    advancePct: 30,
    eventDateDaysAhead: 76,
    validForDays: 12,
    createdDaysAgo: 3,
    sentDaysAgo: 3,
    acceptedDaysAgo: null,
  }),
  demoQuote({
    id: 'demo-quote-3',
    leadId: 'demo-lead-6',
    status: 'accepted',
    title: 'Wedding and reception coverage for Priya',
    notes: 'Balance is due on the delivery of the edited set, 30 days after the event.',
    lines: [
      ['Wedding and reception coverage, two days', 2, 48_000],
      ['Drone coverage, licensed pilot', 1, 15_000],
      ['Printed album, 25 spreads', 1, 18_000],
    ],
    discountRupees: 4_000,
    gst: true,
    advancePct: 30,
    eventDateDaysAhead: 21,
    validForDays: null,
    createdDaysAgo: 9,
    sentDaysAgo: 9,
    acceptedDaysAgo: 7,
  }),
  demoQuote({
    id: 'demo-quote-4',
    leadId: 'demo-lead-3',
    status: 'withdrawn',
    title: 'Three-day farmhouse wedding for Meera',
    notes: 'Withdrawn — the second crew is already committed on those dates.',
    lines: [
      ['Three-day coverage, lead plus two crew', 3, 85_000],
      ['Drone coverage for the baraat', 1, 25_000],
    ],
    discountRupees: 0,
    gst: true,
    advancePct: 40,
    eventDateDaysAhead: 140,
    validForDays: null,
    createdDaysAgo: 5,
    sentDaysAgo: 5,
    acceptedDaysAgo: null,
  }),
]

// --- helpers ---------------------------------------------------------------

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function daysAhead(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString()
}

function dayAhead(n: number): string {
  return daysAhead(n).slice(0, 10)
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

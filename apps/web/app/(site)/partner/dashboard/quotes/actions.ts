'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { formatPaise, gstOn, paiseSchema, type UtsavaClient } from '@utsava/db'

import { asQuotesTable, asRpcCaller, getQuoteLeadContext } from '@/lib/quote-queries'
import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/supabase'

/**
 * Quoting. Plan §2 Should-tier ("quotes", by Jul 2027); plan §14 puts it in the same
 * window as escrow, because a quote is what a booking is made of.
 *
 * Three writes live here and nothing else:
 *   createQuote()   → inserts into public.quotes as 'draft'
 *   sendQuote()     → 'draft' → 'sent', stamps sent_at, moves the lead to 'quoted'
 *   withdrawQuote() → 'draft' | 'sent' → 'withdrawn'
 *
 * Acceptance is deliberately absent. That is the customer's write, and it runs through
 * public.accept_quote() → app.accept_quote(), which creates the booking, flips the quote
 * to 'accepted' and converts the lead in one transaction. A vendor has no path to it.
 *
 * RLS note, because it is the thing that makes a quote trustworthy: quotes_all_vendor
 * (migration 001300) requires BOTH `app.is_vendor_member(vendor_id, 'responder')` AND
 * that `quotes.lead_id` belongs to a lead with the same `vendor_id`. So a vendor cannot
 * attach a quote to a competitor's lead — which matters because quotes_select_customer
 * resolves the recipient through the lead, so such a quote would otherwise be delivered
 * to a customer who never enquired with them. This file reads `vendor_id` back out of
 * public.vendor_leads rather than accepting it from the browser, so the value we insert
 * is one the policy will already agree with.
 */

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export interface QuoteLineItemInput {
  label: string
  quantity: number
  /** Integer paise (plan §5). The form parses rupees once, at the input. */
  unitAmount: number
}

export interface QuoteDraftInput {
  leadId: string
  title: string
  notes?: string
  lineItems: QuoteLineItemInput[]
  /** Integer paise, applied before GST. */
  discount: number
  /** 0 for an unregistered vendor, GST_RATE_BPS (1800) otherwise. */
  taxRateBps: number
  advanceMode: 'pct' | 'amount'
  advancePct: number
  /** Integer paise. Used only when advanceMode is 'amount'. */
  advanceAmount: number
  /** ISO YYYY-MM-DD. */
  eventDate?: string
  /** ISO YYYY-MM-DD. */
  validUntil?: string
}

export type QuoteState =
  | { status: 'idle' }
  | { status: 'draft_saved'; quoteId: string; message: string }
  | { status: 'sent'; quoteId: string; message: string }
  | { status: 'withdrawn'; quoteId: string; message: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'unconfigured'; message: string }

// ---------------------------------------------------------------------------
// Validation
//
// public.quotes carries two CHECK constraints:
//   quotes_total_consistent      check (total = subtotal - discount + tax_amount)
//   quotes_advance_within_total  check (advance_amount <= total)
// plus the app.paise domain, which is `bigint ... check (value >= 0)` on every amount.
//
// All three are mirrored below so the vendor gets a sentence they can act on instead of
// a Postgres constraint name. The database stays the authority; this is the courtesy.
// ---------------------------------------------------------------------------

const lineItemSchema = z.object({
  label: z.string().trim().min(2, 'Say what this line covers').max(120),
  quantity: z
    .number()
    .int('Quantities are whole numbers')
    .min(1, 'Each line needs a quantity of at least 1')
    .max(999),
  unitAmount: paiseSchema,
})

const quoteDraftSchema = z
  .object({
    // Not `.uuid()` on purpose. The real gate is the public.vendor_leads lookup below,
    // which is RLS-scoped and therefore strictly stronger than a format check — and the
    // fixture inbox uses readable ids like `demo-lead-4`, which a uuid rule would reject
    // with a confusing message before the "no database connected" one could be shown.
    leadId: z.string().trim().min(1, 'Pick the enquiry this quote answers'),
    title: z
      .string()
      .trim()
      .min(3, 'Give the quote a title the customer will recognise')
      .max(160),
    notes: z.string().trim().max(2000).optional(),
    lineItems: z
      .array(lineItemSchema)
      .min(1, 'A quote needs at least one line item')
      .max(25, 'Keep a quote to 25 lines — anything longer belongs in the notes'),
    discount: paiseSchema,
    taxRateBps: z.number().int().min(0).max(10_000),
    advanceMode: z.enum(['pct', 'amount']),
    advancePct: z
      .number()
      .int('Use a whole percentage')
      .min(0)
      .max(100, 'An advance cannot be more than 100% of the quote'),
    advanceAmount: paiseSchema,
    eventDate: z.string().date().optional(),
    validUntil: z.string().date().optional(),
  })
  // The server derives every total from the line items. The browser computes the same
  // figures to show them live, but nothing it computes is trusted or stored.
  .transform((input) => {
    const lineItems = input.lineItems.map((li) => ({
      ...li,
      amount: li.quantity * li.unitAmount,
    }))

    const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0)
    const taxBase = Math.max(0, subtotal - input.discount)
    const taxAmount = gstOn(taxBase, input.taxRateBps)
    const total = subtotal - input.discount + taxAmount

    const advanceAmount =
      input.advanceMode === 'pct'
        ? Math.round((Math.max(0, total) * input.advancePct) / 100)
        : input.advanceAmount

    return {
      ...input,
      lineItems,
      subtotal,
      taxAmount,
      total,
      advanceAmount,
      advancePct: input.advanceMode === 'pct' ? input.advancePct : null,
    }
  })
  .superRefine((quote, ctx) => {
    // app.paise is a non-negative domain, so a discount larger than the work quoted does
    // not produce a negative total — it produces a failed insert. Catch it here.
    if (quote.discount > quote.subtotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discount'],
        message: `A discount of ${formatPaise(quote.discount)} is more than the ${formatPaise(
          quote.subtotal,
        )} of work on this quote.`,
      })
    }

    // Mirrors quotes_total_consistent. Tautological against the transform above, and
    // meant to be: it is an assertion, so that any future edit to the derivation is
    // caught here rather than as a constraint violation on a vendor's screen.
    if (quote.total !== quote.subtotal - quote.discount + quote.taxAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['total'],
        message: 'The total does not add up from the line items. Please refresh and retry.',
      })
    }

    // Mirrors quotes_advance_within_total.
    if (quote.advanceAmount > quote.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['advanceAmount'],
        message: `The advance of ${formatPaise(quote.advanceAmount)} is more than the quote total of ${formatPaise(
          quote.total,
        )}. Escrow holds an advance, not the whole amount.`,
      })
    }
  })

const quoteIdSchema = z.string().uuid('That quote no longer exists.')

const UNCONFIGURED: QuoteState = {
  status: 'unconfigured',
  message:
    'Your quote validated correctly, but no Supabase instance is connected yet. Run ' +
    '`pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to save it for real.',
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Creates a quote in 'draft'. Drafts are invisible to the customer — quotes_select_customer
 * carries `status <> 'draft'` — so a vendor can build one over several sittings without
 * anyone seeing a half-priced version.
 */
export async function createQuote(draft: QuoteDraftInput): Promise<QuoteState> {
  const parsed = quoteDraftSchema.safeParse(draft)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  if (!hasSupabaseEnv()) return UNCONFIGURED

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const quote = parsed.data

  // The only source of vendor_id. public.vendor_leads is RLS-scoped to this session's
  // vendors, so a lead id belonging to someone else simply does not resolve.
  const lead = await getQuoteLeadContext(quote.leadId)
  if (!lead) {
    return {
      status: 'error',
      message: 'That enquiry is not in your inbox. Open it from Leads and try again.',
    }
  }

  if (lead.status === 'expired') {
    return {
      status: 'error',
      message: 'This lead has expired, so it can no longer be quoted.',
    }
  }
  if (lead.status === 'converted') {
    return {
      status: 'error',
      message: 'This lead is already booked. There is nothing left to quote on it.',
    }
  }

  const { data, error } = await asQuotesTable(supabase)
    .from('quotes')
    .insert({
      lead_id: quote.leadId,
      vendor_id: lead.vendorId,
      status: 'draft',
      title: quote.title,
      notes: quote.notes ?? null,
      line_items: quote.lineItems.map((li) => ({
        label: li.label,
        quantity: li.quantity,
        unit_amount: li.unitAmount,
        amount: li.amount,
      })),
      subtotal: quote.subtotal,
      discount: quote.discount,
      tax_amount: quote.taxAmount,
      total: quote.total,
      advance_amount: quote.advanceAmount,
      advance_pct: quote.advancePct,
      event_date: quote.eventDate ?? lead.eventDate ?? null,
      // valid_until is timestamptz; a vendor picking a date means the end of that day in
      // India, not midnight UTC, which would quietly expire the quote 5.5 hours early.
      valid_until: quote.validUntil ? `${quote.validUntil}T23:59:59+05:30` : null,
    })
    .select('id')
    .single()

  if (error || !data) {
    return {
      status: 'error',
      message: error?.message ?? 'Could not save that quote. Please try again.',
    }
  }

  revalidatePath('/partner/dashboard/quotes')
  revalidatePath(`/partner/dashboard/leads/${quote.leadId}`)

  return {
    status: 'draft_saved',
    quoteId: data.id,
    message: `Draft saved. ${formatPaise(quote.total)} total, ${formatPaise(
      quote.advanceAmount,
    )} advance. Send it when you are happy with it — nothing reaches ${lead.customerFirstName} until you do.`,
  }
}

/**
 * Draft → sent. Two writes, in this order, because they fail differently:
 *   1. the quote row, guarded on `status = 'draft'` so two tabs cannot both send it;
 *   2. public.transition_lead(), which is what actually records `quoted` on the lead and
 *      feeds the §10 response metrics.
 *
 * app.lead_transition_allowed() has no routed → quoted edge, so a lead that was never
 * opened is walked through 'responded' first. That is the truth of what happened anyway:
 * sending a quote is a response.
 */
export async function sendQuote(quoteId: string): Promise<QuoteState> {
  // Environment first here, unlike createQuote: a quote id is not something the vendor
  // typed, so there is no validation feedback worth delivering ahead of the real reason.
  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'No Supabase instance is connected, so this quote only exists in the sample data. ' +
        'Run `pnpm db:start` to send one for real.',
    }
  }

  const parsedId = quoteIdSchema.safeParse(quoteId)
  if (!parsedId.success) {
    return { status: 'error', message: 'That quote no longer exists.' }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const quotes = asQuotesTable(supabase)
  const id = parsedId.data

  const { data: existing, error: readError } = await quotes
    .from('quotes')
    .select('id, lead_id, status, total, advance_amount')
    .eq('id', id)
    .maybeSingle()

  if (readError || !existing) {
    return { status: 'error', message: 'That quote is not one of yours, or has been deleted.' }
  }

  if (existing.status === 'sent') {
    return { status: 'sent', quoteId: id, message: 'That quote is already with the customer.' }
  }
  if (existing.status !== 'draft') {
    return {
      status: 'error',
      message: `This quote is ${existing.status}, so it cannot be sent. Write a fresh one instead.`,
    }
  }

  const { data: updated, error } = await quotes
    .from('quotes')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()

  if (error) {
    return { status: 'error', message: `Could not send that quote: ${error.message}` }
  }
  if (!updated) {
    return {
      status: 'error',
      message: 'Someone else changed this quote a moment ago. Reload and check it.',
    }
  }

  const leadNote = await markLeadQuoted(supabase, existing.lead_id)

  revalidatePath('/partner/dashboard/quotes')
  revalidatePath('/partner/dashboard/leads')
  revalidatePath(`/partner/dashboard/leads/${existing.lead_id}`)

  return {
    status: 'sent',
    quoteId: id,
    message:
      `Sent. The customer sees ${formatPaise(Number(existing.total))} with ` +
      `${formatPaise(Number(existing.advance_amount))} payable as the advance.` +
      (leadNote ? ` ${leadNote}` : ''),
  }
}

/**
 * Withdraws a draft or a sent quote. There is no `withdrawn_at` column — `updated_at` is
 * maintained by the quotes_set_updated_at trigger, so the moment is already recorded and
 * a second timestamp would only be another thing to keep in step.
 *
 * An accepted quote is out of reach on purpose: a booking already points at it, and
 * unwinding that is app.transition_booking()'s job with a cancellation reason attached.
 */
export async function withdrawQuote(quoteId: string): Promise<QuoteState> {
  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'No Supabase instance is connected, so this quote only exists in the sample data.',
    }
  }

  const parsedId = quoteIdSchema.safeParse(quoteId)
  if (!parsedId.success) {
    return { status: 'error', message: 'That quote no longer exists.' }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const quotes = asQuotesTable(supabase)
  const id = parsedId.data

  const { data: existing, error: readError } = await quotes
    .from('quotes')
    .select('id, lead_id, status')
    .eq('id', id)
    .maybeSingle()

  if (readError || !existing) {
    return { status: 'error', message: 'That quote is not one of yours, or has been deleted.' }
  }

  if (existing.status === 'withdrawn') {
    return { status: 'withdrawn', quoteId: id, message: 'That quote is already withdrawn.' }
  }
  if (existing.status === 'accepted') {
    return {
      status: 'error',
      message:
        'This quote has been accepted and a booking now points at it. Cancelling that is a ' +
        'booking change, not a quote change — talk to support so the escrow side is handled.',
    }
  }
  if (existing.status !== 'draft' && existing.status !== 'sent') {
    return {
      status: 'error',
      message: `This quote is ${existing.status}, so there is nothing to withdraw.`,
    }
  }

  const { data: updated, error } = await quotes
    .from('quotes')
    .update({ status: 'withdrawn' })
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    return { status: 'error', message: `Could not withdraw that quote: ${error.message}` }
  }
  if (!updated) {
    return {
      status: 'error',
      message: 'Someone else changed this quote a moment ago. Reload and check it.',
    }
  }

  revalidatePath('/partner/dashboard/quotes')
  revalidatePath(`/partner/dashboard/leads/${existing.lead_id}`)

  return {
    status: 'withdrawn',
    quoteId: id,
    message:
      existing.status === 'sent'
        ? 'Withdrawn. The customer can no longer accept it.'
        : 'Draft discarded.',
  }
}

// ---------------------------------------------------------------------------
// Internals — not exported, because a `use server` module may export only async
// functions and types (a stray const breaks the route at build time).
// ---------------------------------------------------------------------------

/**
 * Walks the lead to 'quoted'. Returns a sentence to append to the success message when
 * the lead could not be moved, so a partial success never reads as a clean one.
 */
async function markLeadQuoted(supabase: UtsavaClient, leadId: string): Promise<string | null> {
  const lead = await getQuoteLeadContext(leadId)
  if (!lead) return 'The lead status could not be updated — check it on the Leads screen.'
  if (lead.status === 'quoted' || lead.status === 'converted') return null

  const rpc = asRpcCaller(supabase)

  // routed → quoted is not a legal edge, so pass through 'responded' first.
  if (lead.status === 'routed') {
    const { error } = await rpc.rpc('transition_lead', {
      p_lead_id: leadId,
      p_to: 'responded',
      p_note: 'Quote sent',
    })
    if (error) {
      return `The quote is with the customer, but the lead status did not move: ${error.message}`
    }
  }

  const { error } = await rpc.rpc('transition_lead', {
    p_lead_id: leadId,
    p_to: 'quoted',
    p_note: 'Quote sent',
  })
  if (error) {
    return `The quote is with the customer, but the lead status did not move: ${error.message}`
  }

  return null
}

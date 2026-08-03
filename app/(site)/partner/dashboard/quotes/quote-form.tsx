'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { GST_RATE_BPS, formatPaise, gstOn } from '@/lib/db'
import { Button, Card, CardBody } from '@/components/ui'

import {
  createQuote,
  sendQuote,
  withdrawQuote,
  type QuoteDraftInput,
  type QuoteState,
} from './actions'

/**
 * The quote builder. Plan §2 Should-tier.
 *
 * Client state exists for one reason: the vendor has to see the total move as they type.
 * Quoting is where a photographer decides whether the job is worth doing, and a total
 * that only appears after a round trip makes that decision worse.
 *
 * The arithmetic below is a *display* copy. actions.ts recomputes every figure from the
 * line items and stores only its own result, so a tampered payload cannot post a total
 * that disagrees with what was quoted. Both sides use the same integer-paise operations
 * in the same order, so they agree to the paisa.
 */

export interface QuoteFormLead {
  leadId: string
  label: string
  eventDate: string | null
  budgetLabel: string
  suggestedTitle: string
}

interface LineRow {
  key: number
  label: string
  quantity: string
  unitRupees: string
}

const BLANK_ROWS: LineRow[] = [
  { key: 1, label: '', quantity: '1', unitRupees: '' },
  { key: 2, label: '', quantity: '1', unitRupees: '' },
]

export function QuoteForm({
  leads,
  today,
  defaultLeadId,
}: {
  leads: QuoteFormLead[]
  /** ISO YYYY-MM-DD, passed from the server so SSR and hydration agree. */
  today: string
  defaultLeadId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<QuoteState>({ status: 'idle' })

  const firstLead = leads[0]
  const initialLead =
    (defaultLeadId && leads.some((l) => l.leadId === defaultLeadId) ? defaultLeadId : null) ??
    firstLead?.leadId ??
    ''

  const [leadId, setLeadId] = useState(initialLead)
  const [title, setTitle] = useState(
    leads.find((l) => l.leadId === initialLead)?.suggestedTitle ?? '',
  )
  const [rows, setRows] = useState<LineRow[]>(BLANK_ROWS)
  const [discountRupees, setDiscountRupees] = useState('')
  const [gstRegistered, setGstRegistered] = useState(true)
  const [advanceMode, setAdvanceMode] = useState<'pct' | 'amount'>('pct')
  const [advancePctInput, setAdvancePctInput] = useState('30')
  const [advanceRupees, setAdvanceRupees] = useState('')
  const [eventDate, setEventDate] = useState(
    leads.find((l) => l.leadId === initialLead)?.eventDate ?? '',
  )
  const [validUntil, setValidUntil] = useState(() => addDays(today, 10))
  const [notes, setNotes] = useState('')

  const selectedLead = leads.find((l) => l.leadId === leadId) ?? null

  const totals = useMemo(() => {
    const lineItems = rows.map((row) => {
      const quantity = Math.max(0, toWhole(row.quantity))
      const unitAmount = toPaise(row.unitRupees)
      return { label: row.label.trim(), quantity, unitAmount, amount: quantity * unitAmount }
    })

    const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0)
    const discount = toPaise(discountRupees)
    const taxRateBps = gstRegistered ? GST_RATE_BPS : 0
    const taxAmount = gstOn(Math.max(0, subtotal - discount), taxRateBps)
    const total = subtotal - discount + taxAmount

    const advancePct = clamp(toWhole(advancePctInput), 0, 100)
    const advanceAmount =
      advanceMode === 'pct'
        ? Math.round((Math.max(0, total) * advancePct) / 100)
        : toPaise(advanceRupees)

    return {
      lineItems,
      subtotal,
      discount,
      taxRateBps,
      taxAmount,
      total,
      advancePct,
      advanceAmount,
      balance: total - advanceAmount,
    }
  }, [rows, discountRupees, gstRegistered, advanceMode, advancePctInput, advanceRupees])

  const fieldErrors = state.status === 'error' ? state.fieldErrors : undefined
  const lineItemError = fieldErrors?.lineItems?.[0]
  const advanceError = fieldErrors?.advanceAmount?.[0] ?? fieldErrors?.advancePct?.[0]
  const overAdvance = totals.advanceAmount > totals.total
  const overDiscount = totals.discount > totals.subtotal

  function selectLead(id: string) {
    setLeadId(id)
    const lead = leads.find((l) => l.leadId === id)
    if (!lead) return
    if (!title.trim()) setTitle(lead.suggestedTitle)
    if (!eventDate && lead.eventDate) setEventDate(lead.eventDate)
  }

  function updateRow(key: number, patch: Partial<LineRow>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addRow() {
    // Key derived from the rows themselves, so two fast clicks in one batch cannot
    // collide the way a separate counter would.
    setRows((current) => {
      const key = current.reduce((max, row) => Math.max(max, row.key), 0) + 1
      return [...current, { key, label: '', quantity: '1', unitRupees: '' }]
    })
  }

  function removeRow(key: number) {
    setRows((current) => (current.length === 1 ? current : current.filter((r) => r.key !== key)))
  }

  function submit(sendNow: boolean) {
    const draft: QuoteDraftInput = {
      leadId,
      title: title.trim(),
      lineItems: totals.lineItems
        // Empty trailing rows are scaffolding, not omissions — drop them silently.
        .filter((li) => li.label !== '' || li.unitAmount !== 0)
        .map((li) => ({ label: li.label, quantity: li.quantity, unitAmount: li.unitAmount })),
      discount: totals.discount,
      taxRateBps: totals.taxRateBps,
      advanceMode,
      advancePct: totals.advancePct,
      advanceAmount: totals.advanceAmount,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(eventDate ? { eventDate } : {}),
      ...(validUntil ? { validUntil } : {}),
    }

    startTransition(async () => {
      const created = await createQuote(draft)
      if (created.status !== 'draft_saved' || !sendNow) {
        setState(created)
        if (created.status === 'draft_saved') router.refresh()
        return
      }
      // createQuote only ever writes a draft. Sending is the separate, guarded step —
      // this just saves the vendor a click.
      setState(await sendQuote(created.quoteId))
      router.refresh()
    })
  }

  if (leads.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="font-display text-lg text-ink-900">No open leads to quote</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-600">
            A quote hangs off a lead, so there is nothing to write until an enquiry is routed
            to you. Expired and already-booked leads cannot be quoted.
          </p>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-start">
      <div className="space-y-5">
        {state.status === 'error' && (
          <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {state.message}
          </p>
        )}
        {state.status === 'unconfigured' && (
          <p className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700">
            {state.message}
          </p>
        )}
        {(state.status === 'draft_saved' || state.status === 'sent') && (
          <p className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700">
            {state.message}
          </p>
        )}

        <Card>
          <CardBody className="space-y-4">
            <h3 className="font-display text-lg text-ink-900">Who is this for?</h3>

            <Field label="Enquiry" error={fieldErrors?.leadId}>
              <select
                value={leadId}
                onChange={(e) => selectLead(e.target.value)}
                className={inputClass}
              >
                {leads.map((lead) => (
                  <option key={lead.leadId} value={lead.leadId}>
                    {lead.label}
                  </option>
                ))}
              </select>
            </Field>

            {selectedLead && (
              <p className="text-sm text-ink-600">
                They told us their budget is{' '}
                <span className="font-medium text-ink-900">{selectedLead.budgetLabel}</span>. You
                can quote outside it — they will see the difference plainly.
              </p>
            )}

            <Field
              label="Quote title"
              hint="This is the line the customer sees first."
              error={fieldErrors?.title}
            >
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Two-day wedding coverage"
                className={inputClass}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Event date" error={fieldErrors?.eventDate}>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Hold this price until"
                hint="Leave blank for no expiry."
                error={fieldErrors?.validUntil}
              >
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-lg text-ink-900">What is included</h3>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                Add a line
              </Button>
            </div>

            {lineItemError && <p className="text-sm text-danger-700">{lineItemError}</p>}

            <div className="space-y-3">
              {rows.map((row) => {
                const quantity = Math.max(0, toWhole(row.quantity))
                const amount = quantity * toPaise(row.unitRupees)
                return (
                  <div
                    key={row.key}
                    className="grid gap-2 sm:grid-cols-[1fr_72px_128px_auto] sm:items-center"
                  >
                    <input
                      value={row.label}
                      onChange={(e) => updateRow(row.key, { label: e.target.value })}
                      placeholder="Wedding day coverage, lead photographer"
                      aria-label="What this line covers"
                      className={inputClass}
                    />
                    <input
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                      inputMode="numeric"
                      aria-label="Quantity"
                      className={`${inputClass} text-center`}
                    />
                    <input
                      value={row.unitRupees}
                      onChange={(e) => updateRow(row.key, { unitRupees: e.target.value })}
                      inputMode="numeric"
                      placeholder="₹ per unit"
                      aria-label="Price per unit in rupees"
                      className={`${inputClass} text-right`}
                    />
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <span className="text-sm tabular-nums text-ink-700 sm:w-24 sm:text-right">
                        {formatPaise(amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        aria-label="Remove this line"
                        className="rounded-md px-2 py-1 text-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-ink-500">
              Prices are in rupees. Fremmo stores them as whole paise, so nothing is lost to
              rounding between here and the customer&rsquo;s screen.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h3 className="font-display text-lg text-ink-900">Price and advance</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Discount (₹)" error={fieldErrors?.discount}>
                <input
                  value={discountRupees}
                  onChange={(e) => setDiscountRupees(e.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                  className={`${inputClass} text-right`}
                />
              </Field>
              <label className="flex items-start gap-2.5 self-end pb-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={gstRegistered}
                  onChange={(e) => setGstRegistered(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded"
                />
                <span>
                  Add GST at 18%
                  <span className="block text-xs text-ink-500">
                    Charged on the amount after discount.
                  </span>
                </span>
              </label>
            </div>

            {overDiscount && (
              <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">
                That discount is larger than the {formatPaise(totals.subtotal)} of work quoted.
              </p>
            )}

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-800">
                Advance payable on booking
              </legend>
              <p className="mb-3 text-sm text-ink-600">
                Escrow holds the advance, not the full amount. The balance stays with the
                customer until the work is delivered.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="radio"
                    name="advanceMode"
                    checked={advanceMode === 'pct'}
                    onChange={() => setAdvanceMode('pct')}
                    className="h-4 w-4"
                  />
                  A percentage
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="radio"
                    name="advanceMode"
                    checked={advanceMode === 'amount'}
                    onChange={() => setAdvanceMode('amount')}
                    className="h-4 w-4"
                  />
                  A fixed amount
                </label>
              </div>

              <div className="mt-3 max-w-xs">
                {advanceMode === 'pct' ? (
                  <div className="flex items-center gap-3">
                    <input
                      value={advancePctInput}
                      onChange={(e) => setAdvancePctInput(e.target.value)}
                      inputMode="numeric"
                      aria-label="Advance percentage"
                      className={`${inputClass} w-24 text-right`}
                    />
                    <span className="text-sm text-ink-600">
                      % — {formatPaise(totals.advanceAmount)}
                    </span>
                  </div>
                ) : (
                  <input
                    value={advanceRupees}
                    onChange={(e) => setAdvanceRupees(e.target.value)}
                    inputMode="numeric"
                    placeholder="₹ advance"
                    aria-label="Advance amount in rupees"
                    className={`${inputClass} text-right`}
                  />
                )}
              </div>

              {advanceError && <p className="mt-2 text-sm text-danger-700">{advanceError}</p>}
              {overAdvance && (
                <p className="mt-2 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">
                  The advance is more than the quote total. Escrow cannot hold more than the
                  job is worth.
                </p>
              )}
            </fieldset>

            <Field
              label="Notes for the customer"
              hint="Travel, stay, delivery timelines — anything the line items do not say."
              error={fieldErrors?.notes}
            >
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={inputClass}
              />
            </Field>
          </CardBody>
        </Card>
      </div>

      <div className="lg:sticky lg:top-24">
        <Card>
          <CardBody className="space-y-3">
            <h3 className="font-display text-lg text-ink-900">Summary</h3>

            <dl className="space-y-2 text-sm">
              <SummaryRow label="Subtotal" value={formatPaise(totals.subtotal)} />
              {totals.discount > 0 && (
                <SummaryRow label="Discount" value={`− ${formatPaise(totals.discount)}`} />
              )}
              {totals.taxAmount > 0 && (
                <SummaryRow label="GST 18%" value={formatPaise(totals.taxAmount)} />
              )}
            </dl>

            <div className="flex items-baseline justify-between border-t border-ink-100 pt-3">
              <span className="text-sm font-medium text-ink-800">Total</span>
              <span className="font-display text-2xl tabular-nums text-ink-900">
                {formatPaise(totals.total)}
              </span>
            </div>

            <div className="rounded-lg bg-surface-sunken p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink-800">Advance now</span>
                <span className="font-display text-lg tabular-nums text-ink-900">
                  {formatPaise(totals.advanceAmount)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-sm text-ink-600">
                <span>Balance later</span>
                <span className="tabular-nums">{formatPaise(Math.max(0, totals.balance))}</span>
              </div>
              <p className="mt-2 text-xs text-ink-500">
                Escrow releases the advance to you once the booking is confirmed, and the
                balance after the event.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                type="button"
                fullWidth
                onClick={() => submit(true)}
                disabled={pending || !leadId}
              >
                {pending ? 'Working…' : 'Save and send'}
              </Button>
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => submit(false)}
                disabled={pending || !leadId}
              >
                Save as draft
              </Button>
            </div>

            <p className="text-xs text-ink-500">
              A draft is yours alone — the customer cannot see it until you send it.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

/**
 * Send / withdraw for one row of the list. Lives here rather than in page.tsx because
 * Next validates the export surface of a page module, and these need client state.
 */
export function QuoteRowActions({
  quoteId,
  status,
}: {
  quoteId: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'withdrawn'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<QuoteState>({ status: 'idle' })

  function run(action: () => Promise<QuoteState>) {
    startTransition(async () => {
      setState(await action())
      router.refresh()
    })
  }

  const message = state.status === 'idle' ? null : state.message
  const tone =
    state.status === 'error'
      ? 'text-danger-700'
      : state.status === 'unconfigured'
        ? 'text-warning-700'
        : 'text-ink-600'

  if (status === 'accepted') {
    return (
      <p className="text-sm text-success-700">
        Accepted — a booking now exists against this quote.
      </p>
    )
  }

  if (status !== 'draft' && status !== 'sent') {
    return <p className="text-sm capitalize text-ink-500">{status}</p>
  }

  return (
    <div className="text-right">
      <div className="flex flex-wrap justify-end gap-2">
        {status === 'draft' && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(() => sendQuote(quoteId))}
          >
            {pending ? 'Sending…' : 'Send to customer'}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant={status === 'sent' ? 'outline' : 'ghost'}
          disabled={pending}
          onClick={() => run(() => withdrawQuote(quoteId))}
        >
          {status === 'sent' ? 'Withdraw' : 'Discard draft'}
        </Button>
      </div>
      {message && <p className={`mt-2 max-w-xs text-xs ${tone}`}>{message}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-600">{label}</dt>
      <dd className="tabular-nums text-ink-900">{value}</dd>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-ink-200 bg-surface-raised px-3.5 py-2.5 text-ink-900 ' +
  'placeholder:text-ink-400 focus:border-primary-500 focus:outline-none'

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string[]
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger-700">{error[0]}</span>}
    </label>
  )
}

/** Rupees typed by a human → whole paise. Plan §5: nothing downstream sees a float. */
function toPaise(input: string): number {
  const cleaned = input.replace(/[,\s₹]/g, '')
  if (cleaned === '') return 0
  const rupees = Number(cleaned)
  return Number.isFinite(rupees) ? Math.round(rupees * 100) : 0
}

function toWhole(input: string): number {
  const value = Number(input.trim())
  return Number.isFinite(value) ? Math.trunc(value) : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Pure date maths on an ISO day, so the server and the browser cannot disagree. */
function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

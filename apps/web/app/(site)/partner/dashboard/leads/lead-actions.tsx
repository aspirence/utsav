'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@utsava/ui'

import {
  markNotAFit,
  openLead,
  reportJunkLead,
  respondToLead,
  type LeadActionState,
} from './actions'

/**
 * The buttons on the lead detail screen. Client-side only because they hold form state
 * — plan §4 keeps everything else on this route a Server Component.
 *
 * Nothing here paints a phone number. openLead() returns a message, never contact
 * details; the reveal happens when the server action's revalidatePath() (plus the
 * router.refresh() below) re-renders the page from public.vendor_leads. If the view
 * still masks the number, the screen still masks it, which is the only way the §6 rule
 * stays honest in the UI.
 */

type Job = 'open' | 'respond' | 'decline' | 'report'

function useLeadAction() {
  const router = useRouter()
  const [state, setState] = useState<LeadActionState>({ status: 'idle' })
  const [job, setJob] = useState<Job | null>(null)
  const [, startTransition] = useTransition()

  function run(next: Job, action: () => Promise<LeadActionState>) {
    setJob(next)
    setState({ status: 'idle' })
    startTransition(async () => {
      const result = await action()
      setState(result)
      setJob(null)
      // Re-read the lead from the server rather than trusting anything local.
      if (result.status === 'done') router.refresh()
    })
  }

  return { state, job, run }
}

function ActionMessage({ state }: { state: LeadActionState }) {
  if (state.status === 'idle') return null

  const tone =
    state.status === 'done'
      ? 'bg-success-50 text-success-700'
      : state.status === 'unconfigured'
        ? 'bg-warning-50 text-warning-700'
        : 'bg-danger-50 text-danger-700'

  return (
    <p className={`mt-3 rounded-lg px-4 py-3 text-sm ${tone}`} role="status" aria-live="polite">
      {state.message}
    </p>
  )
}

/**
 * Open / respond / decline. `status` and `contactPhone` come from the server on every
 * render, so this component never has to guess whether the mask has lifted.
 */
export function LeadWorkActions({
  leadId,
  status,
  contactVisible,
  contactPhone,
  contactFirstName,
}: {
  leadId: string
  status: string
  contactVisible: boolean
  contactPhone: string | null
  contactFirstName: string
}) {
  const { state, job, run } = useLeadAction()
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')

  const canRespond = status === 'routed' || status === 'viewed'
  const whatsappHref =
    contactVisible && contactPhone
      ? `https://wa.me/${contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
          `Hello ${contactFirstName}, this is Lightleak Studio replying to your enquiry on Utsava.`,
        )}`
      : null

  return (
    <div className="mt-4">
      {!contactVisible && status === 'routed' && (
        <div>
          <Button
            type="button"
            size="lg"
            disabled={job !== null}
            onClick={() => run('open', () => openLead(leadId))}
          >
            {job === 'open' ? 'Opening…' : 'Open lead and reveal contact'}
          </Button>
          <p className="mt-2 text-xs text-ink-500">
            The customer’s number is masked until you open the lead. Opening it is recorded
            against your account with a timestamp, and it is what starts your response clock.
          </p>
        </div>
      )}

      {contactVisible && contactPhone && (
        <div className="flex flex-wrap gap-2">
          <a
            href={`tel:${contactPhone}`}
            className="inline-flex h-11 items-center rounded-lg bg-primary-600 px-5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Call {contactFirstName}
          </a>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-lg border border-ink-200 bg-surface-raised px-5 text-sm font-medium text-ink-800 transition-colors hover:border-ink-300 hover:bg-ink-50"
            >
              Message on WhatsApp
            </a>
          )}
        </div>
      )}

      {canRespond && (
        <details className="mt-3 rounded-lg border border-ink-100 bg-surface-sunken p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-800">
            Mark as responded
          </summary>
          <p className="mt-2 text-xs text-ink-500">
            Log this once you have actually called or messaged them. Your median response
            time is measured from this, and it shows on your public profile. The customer and
            our team can both read this note, so keep it factual.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Called and shared the two-day package. Sending a full quote tomorrow."
            className="mt-2 w-full rounded-lg border border-ink-200 bg-surface-raised px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
          />
          <Button
            type="button"
            className="mt-2"
            disabled={job !== null || note.trim().length < 5}
            onClick={() => run('respond', () => respondToLead(leadId, note))}
          >
            {job === 'respond' ? 'Saving…' : 'Mark as responded'}
          </Button>
        </details>
      )}

      <details className="mt-3 rounded-lg border border-ink-100 p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink-800">Not a fit</summary>
        <p className="mt-2 text-xs text-ink-500">
          This records why the match was wrong. It does not message the customer and it does
          not change the lead — the lead still expires on its own if nobody replies.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Already booked on that date."
          className="mt-2 w-full rounded-lg border border-ink-200 bg-surface-raised px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
        />
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          disabled={job !== null || reason.trim().length < 5}
          onClick={() => run('decline', () => markNotAFit(leadId, reason))}
        >
          {job === 'decline' ? 'Recording…' : 'Record as not a fit'}
        </Button>
      </details>

      <ActionMessage state={state} />
    </div>
  )
}

/**
 * Junk-lead report. Files a moderation case — it does not refund anything, because
 * app.refund_lead_credit() is staff-gated and a vendor cannot approve their own refund.
 * The copy says exactly that.
 */
export function ReportJunkForm({
  leadId,
  alreadyRefunded,
}: {
  leadId: string
  alreadyRefunded: boolean
}) {
  const { state, job, run } = useLeadAction()
  const [reason, setReason] = useState('')

  if (alreadyRefunded) {
    return (
      <p className="mt-3 text-sm text-ink-500">
        The credit for this lead has already been refunded.
      </p>
    )
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium text-ink-800">
        Report this lead
      </summary>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Number is switched off and the event date has already passed."
        className="mt-2 w-full rounded-lg border border-ink-200 bg-surface-raised px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
      />
      <Button
        type="button"
        variant="outline"
        className="mt-2"
        disabled={job !== null || reason.trim().length < 10}
        onClick={() => run('report', () => reportJunkLead(leadId, reason))}
      >
        {job === 'report' ? 'Sending…' : 'Send to moderation'}
      </Button>
      <ActionMessage state={state} />
    </details>
  )
}

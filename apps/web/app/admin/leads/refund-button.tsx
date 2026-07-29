'use client'

import { useState, useTransition } from 'react'

import { refundLeadCredit, type RefundState } from './actions'

/**
 * The refund control in the recent-enquiries table. Client-side only because it holds
 * the reason text — plan §4 keeps the rest of this route a Server Component.
 *
 * It decides nothing. app.refund_lead_credit() is staff-gated on
 * app.is_staff('moderator', 'super'), so a staff member without the role gets a clear
 * refusal from the database rather than a hidden button, which is the honest failure
 * mode: the capability lives in public.staff_roles, not in this UI.
 */
export function RefundCreditButton({
  leadId,
  reference,
}: {
  leadId: string
  reference: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [state, setState] = useState<RefundState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()

  function submit() {
    setState({ status: 'idle' })
    startTransition(async () => {
      const result = await refundLeadCredit(leadId, reason)
      setState(result)
      if (result.status === 'done') {
        setOpen(false)
        setReason('')
      }
    })
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setState({ status: 'idle' })
          }}
          className="h-8 rounded-md border border-ink-200 px-2.5 text-xs font-medium text-ink-800 transition-colors hover:bg-ink-50"
        >
          Refund a credit
        </button>
        <Message state={state} />
      </div>
    )
  }

  return (
    <div className="ml-auto w-64 rounded-lg border border-ink-200 bg-ink-50 p-2.5 text-left">
      <label
        htmlFor={`refund-reason-${leadId}`}
        className="text-xs font-semibold uppercase tracking-wide text-ink-500"
      >
        Why was {reference} junk?
      </label>
      <textarea
        id={`refund-reason-${leadId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Number is switched off and the event date has already passed."
        className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-2.5 py-2 text-xs text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
      />
      <p className="mt-1.5 text-xs text-ink-500">
        Returns the credit to the vendor&rsquo;s plan and revokes their access to the
        customer&rsquo;s contact details. Recorded against your identity.
      </p>

      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={pending || reason.trim().length < 10}
          onClick={submit}
          className="h-8 flex-1 rounded-md bg-ink-900 text-xs font-medium text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Refunding…' : 'Refund credit'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false)
            setReason('')
          }}
          className="h-8 rounded-md border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-800 transition-colors hover:bg-ink-100 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <Message state={state} />
    </div>
  )
}

function Message({ state }: { state: RefundState }) {
  if (state.status === 'idle') return null

  const tone =
    state.status === 'done'
      ? 'bg-success-50 text-success-700'
      : state.status === 'unconfigured'
        ? 'bg-warning-50 text-warning-700'
        : 'bg-danger-50 text-danger-700'

  return (
    <p
      className={`mt-2 w-64 rounded-md px-2.5 py-2 text-left text-xs ${tone}`}
      role="status"
      aria-live="polite"
    >
      {state.message}
    </p>
  )
}

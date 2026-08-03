'use client'

import { useActionState, useEffect, useState } from 'react'

import { AccountPicker, Note } from './account-picker'
import { BpsField } from './create-form'
import {
  assignCustomerAction,
  markSettledAction,
  releaseCustomerAction,
  updateRateAction,
  updateStatusAction,
  type ResellerActionState,
} from './actions'

import { formatBps, formatPaise, type ResellerStatus } from '@/lib/db'
import type { AssignableAccount } from '@/lib/resellers'

/**
 * Everything on the reseller detail page that writes.
 *
 * CLIENT COMPONENTS FOR FORM STATE AND NOTHING ELSE (plan §4). Each one holds a reason box, a
 * pending flag and the message that comes back; each one posts to a Server Action which lands in
 * lib/resellers.ts behind requireSuper(). The buttons rendered here are markup a caller can edit —
 * disabling one is a courtesy to the operator, never a control on what they can do.
 *
 * EVERY CONTROL CARRIES A REASON FIELD, and it is not decoration. All six writes land in the
 * append-only audit log, and the reason is the only column that can answer "why is this partner
 * on 4% when the rest are on 2.5%" a year later. It is optional because a forced reason produces
 * "asdf", not because it does not matter.
 */

// ---------------------------------------------------------------------------
// The rate
// ---------------------------------------------------------------------------

/**
 * Change what this reseller earns from here on.
 *
 * IT CHANGES NOTHING ALREADY PLACED. That is guaranteed by the database rather than by this
 * form — invitation_orders froze the rate at insert, app.guard_invitation_order_columns() refuses
 * to let it move, and reseller_commissions froze it again at accrual. The note under the button
 * says so because the question is asked every single time.
 */
export function RateForm({
  resellerId,
  commissionBps,
}: {
  resellerId: string
  commissionBps: number
}) {
  const [state, submit, pending] = useActionState<ResellerActionState, FormData>(
    updateRateAction,
    {},
  )
  const [bps, setBps] = useState(String(commissionBps))
  const [generation, setGeneration] = useState(0)

  // Clear the reason box once the change has landed. It is an uncontrolled input, so without this
  // the next rate change is filed in the audit log under the last one's justification.
  useEffect(() => {
    if (state.notice) setGeneration((g) => g + 1)
  }, [state.notice])

  const changed = bps.trim() !== String(commissionBps)

  return (
    <form key={generation} action={submit} className="space-y-3">
      <input type="hidden" name="resellerId" value={resellerId} />

      <BpsField id="rate-bps" value={bps} onChange={setBps} />

      <ReasonField id="rate-reason" placeholder="Renegotiated for the 2026 season" />

      <button
        type="submit"
        disabled={pending || !changed}
        className="bg-ink-900 hover:bg-ink-800 w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
      >
        {pending
          ? 'Saving…'
          : changed
            ? `Set rate to ${bps} bps`
            : `Currently ${formatBps(commissionBps)}`}
      </button>

      <p className="text-ink-500 text-xs leading-relaxed">
        Applies to orders placed from now on. Every order already placed keeps the rate it was
        placed at — the database refuses to rewrite it, so a raise cannot be backdated and a cut
        cannot claw anything back.
      </p>

      {state.error && <Note tone="error">{state.error}</Note>}
      {state.notice && <Note tone="ok">{state.notice}</Note>}
    </form>
  )
}

// ---------------------------------------------------------------------------
// The status
// ---------------------------------------------------------------------------

/**
 * `label` names the state and `verb` names the act, and the button needs the second one.
 * "Suspended Aarti Events" is not a thing anybody is asking to do.
 */
const STATUS_CHOICES: Array<{
  value: ResellerStatus
  label: string
  verb: string
  hint: string
}> = [
  {
    value: 'active',
    label: 'Active',
    verb: 'Reinstate',
    hint: 'Their dashboard is open and new orders from their customers are attributed.',
  },
  {
    value: 'suspended',
    label: 'Suspended',
    verb: 'Suspend',
    hint: 'Closes their dashboard and stops new attribution. Commission already earned stays payable.',
  },
  {
    value: 'closed',
    label: 'Closed',
    verb: 'Close',
    hint: 'Final. Working with them again means a new reseller record, which is also the honest history.',
  },
]

/** Suspension is the usual move on an active partner, reinstatement on a suspended one. */
function defaultNextStatus(status: ResellerStatus): ResellerStatus {
  return status === 'active' ? 'suspended' : 'active'
}

/**
 * Suspend, reinstate, or close.
 *
 * CLOSED IS TERMINAL AND THIS SCREEN SAYS SO BEFORE THE BUTTON IS PRESSED, not after. The enum's
 * own comment in 20260803000100 defines it that way and setResellerStatus() refuses to move a
 * reseller back out of it, so the only kind thing to do is put the warning where the decision is
 * made. A closed reseller gets a sentence in place of the form — a disabled dropdown reads as a
 * loading state.
 */
export function StatusControls({
  resellerId,
  displayName,
  status,
}: {
  resellerId: string
  displayName: string
  status: ResellerStatus
}) {
  const [state, submit, pending] = useActionState<ResellerActionState, FormData>(
    updateStatusAction,
    {},
  )
  const [next, setNext] = useState<ResellerStatus>(defaultNextStatus(status))
  const [lastStatus, setLastStatus] = useState<ResellerStatus>(status)
  const [generation, setGeneration] = useState(0)

  /*
   * Re-derive the dropdown when the row underneath it changes.
   *
   * The options deliberately exclude the current status — "set status to active" when they are
   * already active is not a choice — so the moment a suspension lands, the value this select is
   * holding is no longer one of its own options and the control renders empty. Adjusting state
   * during render rather than in an effect is React's own documented answer to a prop the state
   * derives from: an effect would paint the broken select for a frame first.
   */
  if (lastStatus !== status) {
    setLastStatus(status)
    setNext(defaultNextStatus(status))
  }

  useEffect(() => {
    if (state.notice) setGeneration((g) => g + 1)
  }, [state.notice])

  if (status === 'closed') {
    return (
      <div className="space-y-3">
        <p className="bg-ink-50 text-ink-600 rounded-md px-3 py-2.5 text-xs leading-relaxed">
          {displayName} is closed, and closing is final. Their ledger stays exactly as it is and any
          settled commission stands; to work with them again, create a new reseller rather than
          reopening this one.
        </p>
      </div>
    )
  }

  const choice = STATUS_CHOICES.find((c) => c.value === next)

  return (
    <form key={generation} action={submit} className="space-y-3">
      <input type="hidden" name="resellerId" value={resellerId} />

      <div>
        <label htmlFor="reseller-status" className="text-ink-700 block text-xs font-semibold">
          Set status to
        </label>
        <select
          id="reseller-status"
          name="status"
          value={next}
          onChange={(e) => setNext(e.target.value as ResellerStatus)}
          className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none"
        >
          {STATUS_CHOICES.filter((c) => c.value !== status).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-ink-500 mt-1.5 text-xs leading-relaxed">{choice?.hint}</p>
      </div>

      <ReasonField id="status-reason" placeholder="Stopped responding to customers" />

      {next === 'closed' && (
        <p className="bg-warning-50 text-warning-700 rounded-md px-3 py-2 text-xs leading-relaxed">
          Closing {displayName} cannot be undone from this console.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
          next === 'closed' ? 'bg-danger-700 hover:bg-danger-700/90' : 'bg-ink-900 hover:bg-ink-800'
        }`}
      >
        {pending ? 'Saving…' : `${choice?.verb ?? 'Update'} ${displayName}`}
      </button>

      {state.error && <Note tone="error">{state.error}</Note>}
      {state.notice && <Note tone="ok">{state.notice}</Note>}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/**
 * Give this reseller an account.
 *
 * A reseller owns *accounts*, not clicks — there is no referral cookie and no last-touch window,
 * because the link is a row somebody wrote and the attribution is resolved by a trigger rather
 * than by anything a browser sends. This form is where that row is written.
 *
 * The picker warns when the account already belongs to somebody. That warning is a courtesy;
 * the refusal is `reseller_customers_one_live_owner`, a partial unique index, which exists so
 * app.reseller_for_customer() is deterministic and one sale cannot pay two people.
 */
export function AssignCustomerForm({ resellerId }: { resellerId: string }) {
  const [state, submit, pending] = useActionState<ResellerActionState, FormData>(
    assignCustomerAction,
    {},
  )
  const [picked, setPicked] = useState<AssignableAccount | null>(null)
  const [generation, setGeneration] = useState(0)

  /*
   * Empty the form after a success, `key` and all — the reason box is an uncontrolled input that
   * `useActionState` does not reset, and the second assignment inheriting the first one's reason
   * writes a sentence into the audit log that is about somebody else.
   */
  useEffect(() => {
    if (!state.notice) return
    setPicked(null)
    setGeneration((g) => g + 1)
  }, [state.notice])

  return (
    <form key={generation} action={submit} className="border-ink-100 space-y-3 border-t p-4">
      <input type="hidden" name="resellerId" value={resellerId} />

      <AccountPicker
        id="assign-account"
        fieldName="customerId"
        picked={picked}
        onPick={setPicked}
        label="Assign an account"
        hint="Every invitation order this account places from now on pays this reseller. Three characters to search."
        warnOnOwned
      />

      <ReasonField id="assign-reason" placeholder="Introduced at the Hazratganj showcase" />

      <button
        type="submit"
        disabled={pending || !picked}
        className="bg-ink-900 hover:bg-ink-800 rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
      >
        {pending ? 'Assigning…' : 'Assign customer'}
      </button>

      {state.error && <Note tone="error">{state.error}</Note>}
      {state.notice && <Note tone="ok">{state.notice}</Note>}
    </form>
  )
}

/**
 * End an assignment.
 *
 * A RELEASE, NOT A DELETE. Orders already attributed keep their reseller and their frozen rate —
 * this only stops the next one counting — so the confirmation says that rather than asking "are
 * you sure", which invites the wrong mental model of what the button does.
 */
export function ReleaseCustomerButton({
  assignmentId,
  resellerId,
  who,
}: {
  assignmentId: string
  resellerId: string
  who: string
}) {
  const [state, submit, pending] = useActionState<ResellerActionState, FormData>(
    releaseCustomerAction,
    {},
  )
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-ink-600 hover:text-danger-700 text-xs font-medium underline underline-offset-2"
        >
          Release
        </button>
        {state.error && (
          <span className="text-danger-700 text-xs" role="alert">
            {state.error}
          </span>
        )}
      </div>
    )
  }

  return (
    <form
      action={submit}
      className="border-ink-200 bg-ink-50 ml-auto w-64 rounded-lg border p-2.5 text-left"
    >
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="resellerId" value={resellerId} />

      <label
        htmlFor={`release-${assignmentId}`}
        className="text-ink-500 text-xs font-semibold tracking-wide uppercase"
      >
        Why release {who}?
      </label>
      <textarea
        id={`release-${assignmentId}`}
        name="reason"
        rows={2}
        maxLength={300}
        placeholder="Moved to the direct account team"
        className="border-ink-200 text-ink-900 placeholder:text-ink-400 focus:border-primary-500 mt-1.5 w-full rounded-md border bg-white px-2.5 py-2 text-xs focus:outline-none"
      />
      <p className="text-ink-500 mt-1.5 text-xs leading-relaxed">
        Stops future orders being attributed. Commission already earned is not retracted.
      </p>

      <div className="mt-2 flex gap-1.5">
        <button
          type="submit"
          disabled={pending}
          className="bg-ink-900 hover:bg-ink-800 h-8 flex-1 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-50"
        >
          {pending ? 'Releasing…' : 'Release'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="border-ink-200 text-ink-800 hover:bg-ink-100 h-8 rounded-md border bg-white px-2.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {state.error && (
        <p
          className="bg-danger-50 text-danger-700 mt-2 rounded-md px-2.5 py-2 text-xs"
          role="alert"
        >
          {state.error}
        </p>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

/**
 * Record that a commission was settled.
 *
 * RECORDED, NEVER INFERRED. The money left through a bank transfer somebody made out of band and
 * this is the note that it happened, which is why the reference is required rather than
 * optional — a 'paid' row nobody can reconcile against a UTR is a claim, not a record.
 *
 * ONLY A 'payable' ROW GETS THIS CONTROL, and the page decides that from the row's status. The
 * real guard is `.eq('status', 'payable')` on the update in markCommissionPaid(): an order moving
 * from delivered to refunded between this page rendering and the button being pressed would
 * otherwise let a reversed commission be settled.
 */
export function MarkSettledButton({
  commissionId,
  resellerId,
  amountPaise,
}: {
  commissionId: string
  resellerId: string
  amountPaise: number
}) {
  const [state, submit, pending] = useActionState<ResellerActionState, FormData>(
    markSettledAction,
    {},
  )
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-ink-200 text-ink-800 hover:bg-ink-50 h-8 rounded-md border px-2.5 text-xs font-medium transition-colors"
        >
          Mark settled
        </button>
        {state.error && (
          <span className="text-danger-700 text-xs" role="alert">
            {state.error}
          </span>
        )}
      </div>
    )
  }

  return (
    <form
      action={submit}
      className="border-ink-200 bg-ink-50 ml-auto w-64 rounded-lg border p-2.5 text-left"
    >
      <input type="hidden" name="commissionId" value={commissionId} />
      <input type="hidden" name="resellerId" value={resellerId} />

      <label
        htmlFor={`settle-${commissionId}`}
        className="text-ink-500 text-xs font-semibold tracking-wide uppercase"
      >
        Settlement reference
      </label>
      <input
        id={`settle-${commissionId}`}
        name="settlementRef"
        maxLength={120}
        placeholder="UTR / bank ref / invoice no."
        className="border-ink-200 text-ink-900 placeholder:text-ink-400 focus:border-primary-500 mt-1.5 w-full rounded-md border bg-white px-2.5 py-2 font-mono text-xs placeholder:font-sans focus:outline-none"
      />
      <p className="text-ink-500 mt-1.5 text-xs leading-relaxed">
        Records {formatPaise(amountPaise)} as paid. This does not move money — make the transfer
        first, then put its reference here.
      </p>

      <textarea
        name="reason"
        rows={2}
        maxLength={300}
        placeholder="July settlement run (optional note)"
        className="border-ink-200 text-ink-900 placeholder:text-ink-400 focus:border-primary-500 mt-2 w-full rounded-md border bg-white px-2.5 py-2 text-xs focus:outline-none"
      />

      <div className="mt-2 flex gap-1.5">
        <button
          type="submit"
          disabled={pending}
          className="bg-ink-900 hover:bg-ink-800 h-8 flex-1 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-50"
        >
          {pending ? 'Recording…' : 'Record settlement'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="border-ink-200 text-ink-800 hover:bg-ink-100 h-8 rounded-md border bg-white px-2.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {state.error && (
        <p
          className="bg-danger-50 text-danger-700 mt-2 rounded-md px-2.5 py-2 text-xs"
          role="alert"
        >
          {state.error}
        </p>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------

/** The audit-log note every control on this page carries. */
function ReasonField({ id, placeholder }: { id: string; placeholder: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-ink-700 block text-xs font-semibold">
        Reason <span className="text-ink-500 font-normal">(goes in the audit log)</span>
      </label>
      <input
        id={id}
        name="reason"
        maxLength={300}
        placeholder={placeholder}
        className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none"
      />
    </div>
  )
}

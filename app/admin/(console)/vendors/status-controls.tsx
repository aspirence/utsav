'use client'

import { useState, useTransition } from 'react'

import {
  publishVendor,
  reinstateVendor,
  sendBackToDraft,
  suspendVendor,
  type VendorActionState,
} from './actions'

/**
 * The status controls on the vendor detail screen. Client-side only because they hold
 * form state — plan §4 keeps the rest of this route a Server Component.
 *
 * Nothing here decides anything. The buttons that appear are driven by the `status` the
 * server rendered, and every branch is re-checked in ./actions.ts against the row as it
 * stands at write time; two moderators working the same listing therefore cannot both
 * win. On success the action revalidates the path, so the panel re-renders from the
 * database rather than from anything held here.
 */

type Job = 'publish' | 'suspend' | 'reinstate' | 'send_back'

const PANEL_BUTTON =
  'h-10 w-full rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

function ActionMessage({ state }: { state: VendorActionState }) {
  if (state.status === 'idle') return null

  const tone =
    state.status === 'done'
      ? 'bg-success-50 text-success-700'
      : state.status === 'unconfigured'
        ? 'bg-warning-50 text-warning-700'
        : 'bg-danger-50 text-danger-700'

  return (
    <p className={`mt-3 rounded-lg px-3 py-2.5 text-sm ${tone}`} role="status" aria-live="polite">
      {state.message}
    </p>
  )
}

export function VendorStatusControls({
  slug,
  displayName,
  status,
  isAnchor,
}: {
  slug: string
  displayName: string
  status: 'draft' | 'pending_review' | 'live' | 'paused' | 'suspended'
  isAnchor: boolean
}) {
  const [state, setState] = useState<VendorActionState>({ status: 'idle' })
  const [job, setJob] = useState<Job | null>(null)
  const [, startTransition] = useTransition()

  // Which reason panel is open, if any. Suspension and send-back both need a written
  // reason before anything happens.
  const [open, setOpen] = useState<'suspend' | 'send_back' | null>(null)
  const [reason, setReason] = useState('')
  // The confirmation step for a suspension: the moderator types the listing name.
  const [confirmName, setConfirmName] = useState('')

  const busy = job !== null

  function run(next: Job, action: () => Promise<VendorActionState>) {
    setJob(next)
    setState({ status: 'idle' })
    startTransition(async () => {
      const result = await action()
      setState(result)
      setJob(null)
      if (result.status === 'done') {
        setOpen(null)
        setReason('')
        setConfirmName('')
      }
    })
  }

  function togglePanel(panel: 'suspend' | 'send_back') {
    setOpen((current) => (current === panel ? null : panel))
    setReason('')
    setConfirmName('')
    setState({ status: 'idle' })
  }

  const nameMatches = confirmName.trim().toLowerCase() === displayName.trim().toLowerCase()
  const reasonReady = reason.trim().length >= 10

  return (
    <div className="mt-4 space-y-2">
      {status === 'pending_review' && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('publish', () => publishVendor(slug))}
            className={`${PANEL_BUTTON} bg-success-600 text-white hover:bg-success-700`}
          >
            {job === 'publish' ? 'Publishing…' : 'Approve & publish'}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => togglePanel('send_back')}
            aria-expanded={open === 'send_back'}
            className={`${PANEL_BUTTON} border border-ink-200 bg-white text-ink-800 hover:bg-ink-50`}
          >
            Send back to draft
          </button>

          {open === 'send_back' && (
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
              <label
                htmlFor="send-back-reason"
                className="text-xs font-semibold uppercase tracking-wide text-ink-500"
              >
                What has to change?
              </label>
              <textarea
                id="send-back-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Only two usable photos and no price band. Reshoot the venue set and capture a band before resubmitting."
                className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-ink-500">
                This goes on the audit record, so whoever picks the listing up next reads it
                in your words.
              </p>
              <button
                type="button"
                disabled={busy || !reasonReady}
                onClick={() => run('send_back', () => sendBackToDraft(slug, reason))}
                className={`${PANEL_BUTTON} mt-2 bg-ink-900 text-white hover:bg-ink-800`}
              >
                {job === 'send_back' ? 'Sending back…' : 'Send back to draft'}
              </button>
            </div>
          )}
        </>
      )}

      {status === 'live' && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => togglePanel('suspend')}
            aria-expanded={open === 'suspend'}
            className={`${PANEL_BUTTON} border border-danger-500/40 bg-white text-danger-700 hover:bg-danger-50`}
          >
            Suspend listing
          </button>

          {open === 'suspend' && (
            <div className="rounded-lg border border-danger-500/40 bg-danger-50 p-3">
              <p className="text-sm font-semibold text-danger-700">
                This takes {displayName} off the market
              </p>
              <p className="mt-1 text-xs text-danger-700">
                It stops appearing in search, stops being routed new enquiries, and the team
                is blocked from responding to the leads they already hold. Reinstating it is
                a second, separately audited decision.
              </p>

              {isAnchor && (
                <p className="mt-2 rounded-md bg-white/70 px-2.5 py-2 text-xs font-medium text-danger-700">
                  This is the founder&rsquo;s studio. Escalate before you suspend it — the
                  action is recorded as one that should have been escalated.
                </p>
              )}

              <label
                htmlFor="suspend-reason"
                className="mt-3 block text-xs font-semibold uppercase tracking-wide text-danger-700"
              >
                Reason
              </label>
              <textarea
                id="suspend-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Portfolio contains watermarked images from another studio, reported twice and confirmed."
                className="mt-1.5 w-full rounded-lg border border-danger-500/40 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-danger-500 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-danger-700">
                The vendor&rsquo;s own team can read this on their dashboard. Write it for
                them.
              </p>

              <label
                htmlFor="suspend-confirm"
                className="mt-3 block text-xs font-semibold uppercase tracking-wide text-danger-700"
              >
                Type <span className="font-mono normal-case">{displayName}</span> to confirm
              </label>
              <input
                id="suspend-confirm"
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                autoComplete="off"
                className="mt-1.5 w-full rounded-lg border border-danger-500/40 bg-white px-3 py-2 text-sm text-ink-900 focus:border-danger-500 focus:outline-none"
              />

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy || !reasonReady || !nameMatches}
                  onClick={() => run('suspend', () => suspendVendor(slug, reason))}
                  className={`${PANEL_BUTTON} bg-danger-500 text-white hover:bg-danger-700`}
                >
                  {job === 'suspend' ? 'Suspending…' : 'Suspend listing'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => togglePanel('suspend')}
                  className={`${PANEL_BUTTON} border border-ink-200 bg-white text-ink-800 hover:bg-ink-100`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {status === 'suspended' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run('reinstate', () => reinstateVendor(slug))}
          className={`${PANEL_BUTTON} bg-ink-900 text-white hover:bg-ink-800`}
        >
          {job === 'reinstate' ? 'Reinstating…' : 'Reinstate'}
        </button>
      )}

      {status === 'draft' && (
        <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">
          Still with the field team. It cannot be published until the listing clears the
          quality gates above and the agent submits it for review.
        </p>
      )}

      {status === 'paused' && (
        <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">
          Paused by the vendor themselves — the listing is hidden but keeps its data and its
          leads. Only they can unpause it, from their own dashboard.
        </p>
      )}

      <ActionMessage state={state} />
    </div>
  )
}

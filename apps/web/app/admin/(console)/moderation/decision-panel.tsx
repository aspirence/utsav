'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { approveItem, escalateItem, rejectItem, type ModerationDecisionState } from './actions'

/**
 * The three buttons on the decision screen.
 *
 * A client component only because it holds form state — plan §4 keeps the rest of this
 * route a Server Component. It decides nothing itself: each button calls a server action,
 * and the screen then re-reads the item from the server rather than assuming the write
 * landed. If the action reports an error, the panel stays exactly as it was.
 *
 * The consequence of each button is spelled out above it. A moderator working a queue at
 * speed should never have to remember that "approve" means something different for a
 * review than for a listing.
 */

type Job = 'approve' | 'reject' | 'escalate'

/** Mirrors the SUBJECTS map in ./actions.ts. Kept short — this is a button label, not a policy. */
const CONSEQUENCE: Record<string, { approve: string; reject: string }> = {
  vendor: {
    approve: 'Sets the listing live and stamps its publication date. It becomes indexable.',
    reject: 'Sends the listing back to draft. Your reason is stored on the vendor record.',
  },
  package: {
    approve: 'Activates the package so it shows on the listing.',
    reject: 'Deactivates the package.',
  },
  media: {
    approve: 'Approves the photos. They appear on the profile immediately.',
    reject: 'Rejects the photos. They stay hidden and the vendor is told why.',
  },
  review: {
    approve: 'Publishes the review and counts it towards the vendor’s rating.',
    reject: 'Blocks the review from publishing. The author reads your reason.',
  },
  story: {
    approve: 'Publishes the real-wedding story.',
    reject: 'Returns the story to the photographer as a draft.',
  },
  enquiry: {
    approve: 'Confirms the enquiry is genuine. Nothing on it changes.',
    reject: 'Marks the enquiry as spam. Credit refunds are decided separately, on Leads.',
  },
}

const FALLBACK = {
  approve: 'Approves the item and closes the queue entry.',
  reject: 'Rejects the item and closes the queue entry.',
}

export function DecisionPanel({
  itemId,
  subjectType,
  status,
}: {
  itemId: string
  subjectType: string
  status: 'pending' | 'escalated'
}) {
  const router = useRouter()
  const [state, setState] = useState<ModerationDecisionState>({ status: 'idle' })
  const [job, setJob] = useState<Job | null>(null)
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const [, startTransition] = useTransition()

  const copy = CONSEQUENCE[subjectType] ?? FALLBACK
  const busy = job !== null
  const reasonReady = reason.trim().length >= 10

  function run(next: Job, action: () => Promise<ModerationDecisionState>) {
    setJob(next)
    setState({ status: 'idle' })
    startTransition(async () => {
      const result = await action()
      setState(result)
      setJob(null)
      if (result.status === 'done') {
        setShowReject(false)
        setReason('')
        // Re-read the item from the server. Never trust local state for a decision.
        router.refresh()
      }
    })
  }

  return (
    <div className="mt-4">
      <div className="space-y-3">
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('approve', () => approveItem(itemId))}
            className="h-10 w-full rounded-lg bg-success-600 text-sm font-medium text-white transition-colors hover:bg-success-700 disabled:pointer-events-none disabled:opacity-50"
          >
            {job === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <p className="mt-1.5 text-xs text-ink-500">{copy.approve}</p>
        </div>

        <div>
          <button
            type="button"
            disabled={busy}
            aria-expanded={showReject}
            onClick={() => setShowReject((open) => !open)}
            className="h-10 w-full rounded-lg border border-ink-200 bg-white text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-50"
          >
            {showReject ? 'Cancel rejection' : 'Reject with reason'}
          </button>

          {showReject ? (
            <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 p-3">
              <label htmlFor="rejection-reason" className="text-xs font-medium text-ink-700">
                Reason, in your own words
              </label>
              <textarea
                id="rejection-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Three of the eight photos carry another studio's watermark. Replace them and resubmit."
                className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-ink-500">
                The vendor reads this verbatim, so write it as if to them. One sentence is
                enough; at least ten characters are required.
              </p>
              <button
                type="button"
                disabled={busy || !reasonReady}
                onClick={() => run('reject', () => rejectItem(itemId, reason))}
                className="mt-2 h-9 rounded-lg bg-danger-500 px-4 text-sm font-medium text-white transition-colors hover:bg-danger-700 disabled:pointer-events-none disabled:opacity-50"
              >
                {job === 'reject' ? 'Rejecting…' : 'Confirm rejection'}
              </button>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-ink-500">{copy.reject}</p>
          )}
        </div>

        <div>
          <button
            type="button"
            disabled={busy || status === 'escalated'}
            onClick={() => run('escalate', () => escalateItem(itemId))}
            className="h-10 w-full rounded-lg border border-ink-200 bg-white text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-50"
          >
            {job === 'escalate' ? 'Escalating…' : 'Escalate to super admin'}
          </button>
          <p className="mt-1.5 text-xs text-ink-500">
            {status === 'escalated'
              ? 'Already with a super admin. It stays at the top of the queue until decided.'
              : 'Changes nothing about the item. It moves to priority 1 for a super admin to decide.'}
          </p>
        </div>
      </div>

      <DecisionMessage state={state} />
    </div>
  )
}

function DecisionMessage({ state }: { state: ModerationDecisionState }) {
  if (state.status === 'idle') return null

  const tone =
    state.status === 'done'
      ? 'bg-success-50 text-success-700'
      : state.status === 'unconfigured'
        ? 'bg-warning-50 text-warning-700'
        : 'bg-danger-50 text-danger-700'

  return (
    <p className={`mt-4 rounded-lg px-3 py-2.5 text-sm ${tone}`} role="status" aria-live="polite">
      {state.message}
    </p>
  )
}

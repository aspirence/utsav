import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader, Panel, Pill, SlaCell } from '@/components/admin-ui'
import { getModerationQueue } from '@/lib/admin-data'

import { DecisionPanel } from '../decision-panel'

export const metadata = { title: 'Review item' }

/**
 * Decision screen. Plan §3: staff actions land in an append-only audit_log with the
 * actor attached, so each button below maps to one server action that writes both the
 * decision and the audit row in a single transaction.
 */
export default async function ModerationItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = getModerationQueue().find((i) => i.id === id)
  if (!item) notFound()

  return (
    <>
      <Link
        href="/admin/moderation"
        className="text-ink-500 hover:text-ink-800 mb-4 inline-block text-sm"
      >
        ← Back to queue
      </Link>

      <PageHeader
        title={item.subjectLabel}
        description={item.reason}
        action={<SlaCell dueAt={item.slaDueAt} />}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Panel className="p-5">
          <h2 className="font-display text-ink-900 text-lg">What is being reviewed</h2>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ['Type', item.subjectType],
              ['Vendor', item.vendorName],
              ['City', item.city],
              ['Priority', String(item.priority)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-ink-500 text-xs tracking-wide uppercase">{k}</dt>
                <dd className="text-ink-900 mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>

          {item.autoFlags.length > 0 && (
            <div className="mt-5">
              <p className="text-ink-500 text-xs tracking-wide uppercase">Automatic flags</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.autoFlags.map((f) => (
                  <Pill key={f} tone="amber">
                    {f.replace(/_/g, ' ')}
                  </Pill>
                ))}
              </div>
              <p className="text-ink-500 mt-2 text-xs">
                Flags are advisory. They raise priority; they never decide the outcome.
              </p>
            </div>
          )}

          <div className="bg-ink-50 text-ink-500 mt-6 rounded-lg p-8 text-center text-sm">
            Item preview renders here — listing diff, photo grid, or review text depending on the
            subject type.
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel className="p-5">
            <h2 className="font-display text-ink-900 text-lg">Decision</h2>
            <p className="text-ink-600 mt-1 text-sm">
              Rejecting requires a reason. The vendor sees it verbatim.
            </p>

            {/* Each button is one server action that updates the subject, closes the
                queue item and appends to public.audit_log with your identity on it.
                Vendor status and publication are additionally guarded by
                app.guard_vendor_columns(), so the decision only lands if your account
                actually carries the moderator or super admin role. */}
            <DecisionPanel itemId={item.id} subjectType={item.subjectType} status={item.status} />

            {/* Plan §11/§12: the anchor studio is moderated by the same queue and the
                same people as everyone else. Saying so here is a guardrail against the
                obvious temptation. */}
            <p className="border-ink-100 text-ink-500 mt-4 border-t pt-3 text-xs">
              Fremmo-owned listings go through this queue on identical terms. If this item belongs
              to the anchor studio, escalate rather than deciding it yourself.
            </p>
          </Panel>

          <Panel className="p-5">
            <h2 className="font-display text-ink-900 text-base">Audit trail</h2>
            <ol className="mt-3 space-y-3 text-sm">
              <li>
                <p className="text-ink-900">Queued automatically</p>
                <p className="text-ink-500 text-xs">
                  {new Date(Date.now() - 26 * 3_600_000).toLocaleString('en-IN')}
                </p>
              </li>
              {item.status === 'escalated' && (
                <li>
                  <p className="text-ink-900">Escalated by moderator</p>
                  <p className="text-ink-500 text-xs">
                    {new Date(Date.now() - 4 * 3_600_000).toLocaleString('en-IN')}
                  </p>
                </li>
              )}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  )
}

import Link from 'next/link'

import { AdminTable, PageHeader, Panel, Pill, SlaCell } from '@/components/admin-ui'
import { getModerationQueue } from '@/lib/admin-data'

export const metadata = { title: 'Moderation' }

/**
 * Moderation queue. Plan §S8 ships it; plan §13 gates launch on "moderation staffed with
 * SLA". The queue is ordered by SLA breach first and priority second, because an overdue
 * low-priority item still means the SLA promise is broken.
 */
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filter = typeof params.status === 'string' ? params.status : 'all'

  const all = getModerationQueue()
  const rows = (filter === 'all' ? all : all.filter((i) => i.status === filter)).sort((a, b) => {
    const aOver = new Date(a.slaDueAt).getTime() - Date.now() < 0
    const bOver = new Date(b.slaDueAt).getTime() - Date.now() < 0
    if (aOver !== bOver) return aOver ? -1 : 1
    return a.priority - b.priority
  })

  const overdue = all.filter((i) => new Date(i.slaDueAt).getTime() < Date.now()).length

  const tabs = [
    { key: 'all', label: 'All', count: all.length },
    { key: 'pending', label: 'Pending', count: all.filter((i) => i.status === 'pending').length },
    {
      key: 'escalated',
      label: 'Escalated',
      count: all.filter((i) => i.status === 'escalated').length,
    },
  ]

  return (
    <>
      <PageHeader
        title="Moderation queue"
        description="Every item carries a 24-hour SLA. Overdue items sort to the top regardless of priority — a missed SLA is the failure, not a low-priority item."
        action={
          overdue > 0 ? (
            <Pill tone="red">{overdue} overdue</Pill>
          ) : (
            <Pill tone="green">SLA clear</Pill>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/moderation?status=${t.key}`}
            className={
              filter === t.key
                ? 'bg-ink-900 rounded-full px-3.5 py-1.5 text-sm font-medium text-white'
                : 'border-ink-200 text-ink-700 hover:border-ink-300 rounded-full border bg-white px-3.5 py-1.5 text-sm'
            }
          >
            {t.label} ({t.count})
          </Link>
        ))}
      </div>

      <Panel>
        <AdminTable
          rowKey={(r) => r.id}
          rows={rows}
          empty="Queue is clear."
          columns={[
            {
              key: 'subject',
              header: 'Item',
              render: (r) => (
                <div>
                  <p className="text-ink-900 font-medium">{r.subjectLabel}</p>
                  <p className="text-ink-500 text-xs">{r.reason}</p>
                </div>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              render: (r) => <Pill tone="blue">{r.subjectType}</Pill>,
            },
            { key: 'vendor', header: 'Vendor', render: (r) => r.vendorName },
            {
              key: 'city',
              header: 'City',
              render: (r) => <span className="text-ink-500">{r.city}</span>,
            },
            {
              key: 'flags',
              header: 'Auto flags',
              render: (r) =>
                r.autoFlags.length === 0 ? (
                  <span className="text-ink-400">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {r.autoFlags.map((f) => (
                      <Pill key={f} tone="amber">
                        {f.replace(/_/g, ' ')}
                      </Pill>
                    ))}
                  </span>
                ),
            },
            {
              key: 'p',
              header: 'P',
              align: 'right',
              render: (r) => <span className="tabular-nums">{r.priority}</span>,
            },
            {
              key: 'sla',
              header: 'SLA',
              align: 'right',
              render: (r) => <SlaCell dueAt={r.slaDueAt} />,
            },
            {
              key: 'act',
              header: '',
              align: 'right',
              render: (r) => (
                <Link
                  href={`/admin/moderation/${r.id}`}
                  className="bg-ink-900 hover:bg-ink-800 inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-white"
                >
                  Review
                </Link>
              ),
            },
          ]}
        />
      </Panel>
    </>
  )
}

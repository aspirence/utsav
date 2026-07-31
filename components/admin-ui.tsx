import type { ReactNode } from 'react'

/**
 * Dense staff-console primitives. Separate from @/components/ui because the customer design
 * system optimises for warmth and whitespace, and a moderator working a queue needs the
 * opposite: rows per screen.
 */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl text-ink-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-600">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-ink-200 bg-white ${className ?? ''}`}>
      {children}
    </div>
  )
}

/**
 * Progress against a stated target. Plan §13's go/no-go gates are all of the form
 * "3,000 live listings", "500 reviews" — a bar without its target is just decoration,
 * so the target is always rendered.
 */
export function StatBar({
  label,
  value,
  target,
  unit,
  hint,
}: {
  label: string
  value: number
  target: number
  unit?: string
  hint?: string
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  const tone = pct >= 100 ? 'bg-success-600' : pct >= 60 ? 'bg-accent-500' : 'bg-primary-600'

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink-800">{label}</span>
        <span className="tabular-nums text-sm text-ink-500">
          <strong className="font-semibold text-ink-900">{value.toLocaleString('en-IN')}</strong>
          {' / '}
          {target.toLocaleString('en-IN')}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-ink-500">{hint ?? ''}</span>
        <span className={pct >= 100 ? 'font-medium text-success-700' : 'text-ink-500'}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
}

export function AdminTable<T>({
  columns,
  rows,
  empty = 'Nothing to show.',
  rowKey,
}: {
  columns: Column<T>[]
  rows: T[]
  empty?: string
  rowKey: (row: T) => string
}) {
  if (rows.length === 0) {
    return <div className="p-8 text-center text-sm text-ink-500">{empty}</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 ${
                  c.align === 'right' ? 'text-right' : ''
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-2.5 align-middle ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue'
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    green: 'bg-success-50 text-success-700 ring-1 ring-success-100',
    amber: 'bg-warning-50 text-warning-700',
    red: 'bg-danger-50 text-danger-700',
    blue: 'bg-primary-50 text-primary-700',
  }
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

/** Overdue against an SLA — plan §13 gates launch on moderation being staffed to one. */
export function SlaCell({ dueAt }: { dueAt: string }) {
  const ms = new Date(dueAt).getTime() - Date.now()
  const hours = Math.round(ms / 3_600_000)

  if (ms < 0) return <Pill tone="red">{Math.abs(hours)}h overdue</Pill>
  if (hours < 6) return <Pill tone="amber">{hours}h left</Pill>
  return <span className="text-ink-500">{hours}h left</span>
}

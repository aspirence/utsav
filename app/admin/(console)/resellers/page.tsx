import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { StatTile } from '@/components/admin-charts'
import { AdminTable, PageHeader, Panel, Pill } from '@/components/admin-ui'

import { getStaffGate } from '@/lib/admin-auth'
import { formatPaise, type ResellerStatus } from '@/lib/db'
import {
  getResellerAnalytics,
  listResellers,
  type ResellerAnalytics,
  type ResellerSummary,
} from '@/lib/resellers'

import { CreateResellerForm } from './create-form'
import { RateLabel } from './rate'

export const metadata: Metadata = {
  title: 'Resellers',
  robots: { index: false, follow: false },
}

/**
 * The reseller programme: who is paid a share of invitation revenue, at what rate, and what has
 * been settled. Super admins only.
 *
 * `notFound()` RATHER THAN A REDIRECT for a non-super staff member, exactly as /admin/users does.
 * They are already inside the console, so there is no sign-in to send them to; the honest answer
 * is that this section is not theirs. It is also not the security boundary — every write goes
 * through `requireSuper()` in lib/resellers.ts, which runs on the server whether or not this page
 * ever rendered, and the reads are RLS-scoped to the caller's own session.
 *
 * WHY A RESELLER IS NOT A STAFF ROLE, since this screen sits next to the one that grants them.
 * app.is_staff() with no arguments passes for any staff row, and about a dozen policies rely on
 * that — including the one exposing raw Cashfree webhook payloads. Adding 'reseller' to
 * staff_role_kind would have handed every partner all of it in one statement with no policy
 * edited. Resellers have their own table, their own helpers and their own masked view; the full
 * argument is in the header of 20260803000100_resellers.sql.
 *
 * `force-dynamic`: the answer depends on the caller's roles and on rows this screen itself
 * changes. A cached copy would show a moderator the programme, or show a settled commission as
 * still payable.
 */
export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<ResellerStatus, 'green' | 'amber' | 'neutral'> = {
  active: 'green',
  suspended: 'amber',
  closed: 'neutral',
}

export default async function ResellersPage() {
  const gate = await getStaffGate()
  // The console layout already refused anyone who is not staff; this narrows further.
  if (gate.state !== 'staff' || !gate.identity.roles.includes('super')) notFound()

  const [resellers, analytics] = await Promise.all([listResellers(), getResellerAnalytics()])

  return (
    <>
      <PageHeader
        title="Resellers"
        description={
          'External partners who bring customers to the invitation storefront and earn a share of ' +
          'what those customers spend. Rates are frozen onto each order when it is placed, so ' +
          'nothing here rewrites a statement that has already gone out.'
        }
      />

      {/*
        The local-credential session has no auth.users row, so requireSuper() refuses it and every
        control below will come back with the same refusal. Saying so once beats discovering it
        six times.
      */}
      {gate.identity.isLocal && (
        <p className="border-warning-500/40 bg-warning-50 text-warning-700 mb-5 rounded-md border px-3 py-2.5 text-sm leading-relaxed">
          This is a local session with no database attached. The figures below are empty rather than
          zero, and creating or changing a reseller will be refused — a write that decides who gets
          paid needs a real identity to record against.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Resellers"
          value={analytics.resellerCount}
          hint={`${analytics.activeCount} active`}
          icon={<IconShare />}
        />
        <StatTile
          label="Attributed orders"
          value={analytics.attributedOrders}
          hint="Every order placed by an owned account, paid or not"
          icon={<IconReceipt />}
        />
        <StatTile
          label="Attributed revenue"
          value={formatPaise(analytics.attributedRevenuePaise)}
          hint="Full order price of the ones that paid and were not refunded"
          icon={<IconRupee />}
        />
        <StatTile
          label="Net retained"
          value={formatPaise(analytics.netRetainedPaise)}
          hint="Attributed revenue after every commission earned"
          tone="good"
          icon={<IconVault />}
        />
      </div>

      {/*
        The commission split as four plain numbers rather than four more tiles.

        They are one quantity cut three ways — pending plus payable plus paid is earned — and four
        equally-weighted tiles would read as four independent measures. A strip with the total
        first says what it is.
      */}
      <Panel className="mt-4 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-ink-900 text-lg">Commission</h2>
          <p className="text-ink-500 text-xs">
            Reversed commission counts nowhere, including in earned — the row is kept so a disputed
            statement can show that it existed.
          </p>
        </div>
        <dl className="mt-3 grid gap-4 sm:grid-cols-4">
          {commissionSplit(analytics).map((part) => (
            <div key={part.label}>
              <dt className="text-ink-500 text-xs font-semibold tracking-wide uppercase">
                {part.label}
              </dt>
              <dd className="font-display text-ink-900 mt-1 text-xl tabular-nums">
                {formatPaise(part.paise)}
              </dd>
              <dd className="text-ink-500 mt-0.5 text-xs">{part.hint}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
        <Panel>
          <MonthlyTrend monthly={analytics.monthly} />
        </Panel>

        <Panel className="h-fit">
          <h2 className="border-ink-200 font-display text-ink-900 border-b px-4 py-3 text-lg">
            Top resellers
          </h2>
          {analytics.topResellers.length === 0 ? (
            <p className="text-ink-500 p-4 text-sm">
              Nobody has been attributed an order yet. A reseller earns nothing until an account is
              assigned to them and that account buys something.
            </p>
          ) : (
            <ol className="divide-ink-100 divide-y">
              {analytics.topResellers.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-ink-400 w-4 shrink-0 text-xs tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/admin/resellers/${r.id}`}
                      className="text-ink-900 block truncate text-sm font-medium hover:underline"
                    >
                      {r.displayName}
                    </Link>
                    <span className="text-ink-500 block font-mono text-[11px]">{r.code}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="text-ink-900 block text-sm tabular-nums">
                      {formatPaise(r.earnedPaise)}
                    </span>
                    <span className="text-ink-500 block text-[11px]">
                      {r.orderCount} {r.orderCount === 1 ? 'order' : 'orders'}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <Panel>
          <h2 className="border-ink-200 font-display text-ink-900 border-b px-4 py-3 text-lg">
            All resellers
          </h2>
          <AdminTable<ResellerSummary>
            rows={resellers}
            rowKey={(r) => r.id}
            empty="No resellers yet. Create one on the right — nothing is attributed until an account is assigned to them."
            columns={[
              {
                key: 'who',
                header: 'Reseller',
                render: (r) => (
                  <div className="min-w-0">
                    <Link
                      href={`/admin/resellers/${r.id}`}
                      className="text-ink-900 block truncate font-medium hover:underline"
                    >
                      {r.displayName}
                    </Link>
                    <span className="text-ink-500 block truncate font-mono text-xs tracking-wide">
                      {r.code}
                    </span>
                  </div>
                ),
              },
              {
                key: 'rate',
                header: 'Rate',
                render: (r) => <RateLabel bps={r.commissionBps} />,
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill>,
              },
              {
                key: 'customers',
                header: 'Customers',
                align: 'right',
                render: (r) => <span className="text-ink-700 tabular-nums">{r.customerCount}</span>,
              },
              {
                key: 'orders',
                header: 'Orders',
                align: 'right',
                render: (r) => <span className="text-ink-700 tabular-nums">{r.orderCount}</span>,
              },
              {
                key: 'pending',
                header: 'Pending',
                align: 'right',
                render: (r) => <Money paise={r.pendingPaise} />,
              },
              {
                key: 'payable',
                header: 'Payable',
                align: 'right',
                render: (r) => <Money paise={r.payablePaise} strong={r.payablePaise > 0} />,
              },
              {
                key: 'paid',
                header: 'Paid',
                align: 'right',
                render: (r) => <Money paise={r.paidPaise} />,
              },
              {
                key: 'earned',
                header: 'Earned',
                align: 'right',
                render: (r) => (
                  <span className="text-ink-900 font-medium tabular-nums">
                    {formatPaise(r.earnedPaise)}
                  </span>
                ),
              },
            ]}
          />
        </Panel>

        <div className="space-y-4">
          <Panel>
            <h2 className="border-ink-200 text-ink-900 border-b px-4 py-3 text-sm font-semibold">
              Create a reseller
            </h2>
            <CreateResellerForm />
          </Panel>

          <p className="text-ink-500 text-xs leading-relaxed">
            A reseller owns accounts, not clicks. There is no referral cookie and no last-touch
            window — the link is a row a super admin wrote, resolved server-side by a trigger, so
            attribution is never something a browser can influence. Guest orders have no account to
            own and pay nobody unless the buyer signs in and claims them before paying.
          </p>
        </div>
      </div>
    </>
  )
}

/**
 * Earned, cut three ways.
 *
 * Earned first and the three states after it, because pending + payable + paid is earned and the
 * order is what says so. Reversed is not a fourth slice — it is money that stopped existing, and
 * putting it in this list would imply it belongs to the same total.
 */
function commissionSplit(
  analytics: ResellerAnalytics,
): Array<{ label: string; paise: number; hint: string }> {
  return [
    { label: 'Earned', paise: analytics.commissionEarnedPaise, hint: 'Everything not reversed' },
    {
      label: 'Pending',
      paise: analytics.commissionPendingPaise,
      hint: 'Paid for, not yet delivered',
    },
    {
      label: 'Payable',
      paise: analytics.commissionPayablePaise,
      hint: 'Delivered — ours to settle',
    },
    { label: 'Paid', paise: analytics.commissionPaidPaise, hint: 'Settled out of band' },
  ]
}

/** A money cell that greys a zero rather than shouting ₹0 in a column of real amounts. */
function Money({ paise, strong = false }: { paise: number; strong?: boolean }) {
  if (paise === 0) return <span className="text-ink-400 tabular-nums">—</span>
  return (
    <span className={`tabular-nums ${strong ? 'text-ink-900 font-medium' : 'text-ink-700'}`}>
      {formatPaise(paise)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// The 12-month trend
// ---------------------------------------------------------------------------

/**
 * The console's sequential hue, the same one components/admin-charts.tsx uses for magnitude over
 * time. Both rows below are magnitude, so both take it: one hue, one meaning.
 */
const TREND_HUE = '#b3402b'

/**
 * Pixels reserved above the tallest bar for its label.
 *
 * The tallest bar is `rowHeight - LABEL_ROOM` and every other bar is that times its share, so the
 * proportions between bars stay exact — this only decides how much of the box the peak fills.
 * Without it the label is pushed out by the bar it belongs to.
 *
 * ── WHY EVERY BAR HEIGHT IS COMPUTED IN PIXELS HERE ──────────────────────────
 * The obvious form is `height: ${pct}%` inside a column that is a flex item. It is also a trap: a
 * percentage height resolves against the containing block, and a flex item under `items-end` is
 * sized by its content, so the percentage has nothing definite to resolve against and collapses
 * to auto — a row of invisible bars, in some browsers and not others. Doing the arithmetic in JS
 * and emitting px sidesteps the question entirely, and the row height is a prop here anyway.
 */
const LABEL_ROOM = 18

/**
 * Attributed revenue and commission earned, by month, drawn in plain HTML.
 *
 * NO CHARTING LIBRARY, for the reason components/admin-charts.tsx gives: Recharts or Chart.js is
 * 50–150 KB to draw twelve bars, and this whole page is smaller than that. It is a Server
 * Component, so nothing hydrates either.
 *
 * NOT ColumnChart FROM THAT FILE, though it is the same shape. That component labels its peak
 * with the raw `value`, which for an amount in paise prints 12500000 where this screen has to
 * print ₹1,25,000 — every amount in the console goes through formatPaise (CLAUDE.md
 * non-negotiable 6), and passing it rupees instead would put a bare number where a currency
 * belongs.
 *
 * ── TWO ROWS, NOT ONE CHART WITH TWO SCALES ──────────────────────────────────
 * Commission is a couple of percent of revenue, so plotting both against a shared axis flattens
 * it into a line on the floor, and giving it its own axis is a dual-axis chart — where the
 * crossing point is an artefact of two arbitrary scales and readers reliably infer a relationship
 * that is not in the data. So: two small multiples, each scaled to its own maximum, each stating
 * that maximum in words above it. The shapes can be compared; the heights cannot, and nothing
 * invites anyone to.
 *
 * A month with nothing in it draws a hairline rather than a short bar. "Nothing happened" and "a
 * little happened" are different facts and a minimum bar height makes them look identical.
 */
function MonthlyTrend({ monthly }: { monthly: ResellerAnalytics['monthly'] }) {
  if (monthly.length === 0) {
    return <p className="text-ink-500 p-4 text-sm">No months to show yet.</p>
  }

  const first = monthly[0]!
  const last = monthly[monthly.length - 1]!

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-ink-900 text-lg">Last 12 months</h2>
        <span className="text-ink-500 text-xs tabular-nums">
          {monthLabelLong(first.month)} – {monthLabelLong(last.month)}
        </span>
      </div>

      <TrendRow
        title="Attributed revenue"
        months={monthly}
        valueOf={(m) => m.revenuePaise}
        height={120}
      />
      <TrendRow
        title="Commission earned"
        months={monthly}
        valueOf={(m) => m.commissionPaise}
        height={68}
      />

      {/* One tick row for both, because both are the same twelve buckets. */}
      <div className="mt-1.5 flex gap-1.5">
        {monthly.map((m) => (
          <span key={m.month} className="text-ink-500 flex-1 text-center text-[10px]">
            {monthLabelShort(m.month)}
          </span>
        ))}
      </div>

      <p className="text-ink-500 mt-3 text-xs leading-relaxed">
        Each row is scaled to its own maximum, so the two shapes can be compared but the two heights
        cannot. Orders bucket by when they were placed and commission by when it was earned — in
        practice the same month, but each is bucketed by its own timestamp rather than by a shared
        guess. Months are UTC.
      </p>
    </div>
  )
}

function TrendRow({
  title,
  months,
  valueOf,
  height,
}: {
  title: string
  months: ResellerAnalytics['monthly']
  valueOf: (m: ResellerAnalytics['monthly'][number]) => number
  height: number
}) {
  const max = Math.max(...months.map(valueOf), 0)
  // First maximum wins, so a tie labels one bar rather than three.
  const peakMonth = months.reduce((best, m) => (valueOf(m) > valueOf(best) ? m : best), months[0]!)
  const tallest = Math.max(8, height - LABEL_ROOM)

  /*
   * The full reading, for assistive technology.
   *
   * This is the table view — twelve values is short enough to say outright, and a chart whose
   * only reading is its shape is a chart half the audience cannot read at all. The bars
   * themselves are inside the role="img" and carry no text of their own except the peak's label.
   */
  const reading = months
    .map((m) => `${monthLabelLong(m.month)} ${formatPaise(valueOf(m))}`)
    .join(', ')

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-ink-500 text-xs font-semibold tracking-wide uppercase">{title}</h3>
        <span className="text-ink-500 text-xs tabular-nums">
          {max === 0 ? 'nothing yet' : `peak ${formatPaise(max, { compact: true })}`}
        </span>
      </div>

      <div
        className="mt-2 flex items-end gap-1.5"
        style={{ height }}
        role="img"
        aria-label={`${title} by month: ${reading}.`}
      >
        {months.map((m) => {
          const value = valueOf(m)

          if (value === 0) {
            return (
              <div key={m.month} className="flex-1">
                <div className="bg-ink-200 h-px w-full" />
              </div>
            )
          }

          const isPeak = m.month === peakMonth.month
          // A 2px floor, so a month that earned ₹40 against a peak of ₹4,00,000 is still visibly
          // a bar. Only reached by a non-zero value — zero took the hairline branch above.
          const barHeight = Math.max(2, Math.round((value / max) * tallest))

          return (
            <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1">
              {isPeak && (
                <span className="text-ink-800 text-[10px] font-semibold whitespace-nowrap tabular-nums">
                  {formatPaise(value, { compact: true })}
                </span>
              )}
              {/*
                Rounded at the data end only and square on the baseline, so the rounding never
                reads as part of the value. The lighter wash on the non-peak bars is the same hue
                at lower opacity — emphasis, not a second colour, which is the right form when one
                bar is the point.
              */}
              <div
                className="w-full rounded-t"
                style={{
                  height: `${barHeight}px`,
                  backgroundColor: TREND_HUE,
                  opacity: isPeak ? 1 : 0.55,
                }}
              />
            </div>
          )
        })}
      </div>

      {/* A hairline rather than a drawn axis — the bars sit on it, and that is all an axis does. */}
      <div className="border-ink-200 mt-1.5 border-t" />
    </div>
  )
}

/**
 * 'YYYY-MM' to a label.
 *
 * `timeZone: 'UTC'` is load-bearing. lib/resellers.ts buckets in UTC on purpose — a total that
 * changes with the renderer's timezone is not a total — and formatting the resulting key in local
 * time would undo that at the last step, printing "Jul" over a bucket labelled 2026-08 anywhere
 * west of Greenwich.
 */
function monthDate(key: string): Date {
  const [year, month] = key.split('-')
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1))
}

function monthLabelShort(key: string): string {
  return monthDate(key).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
}

function monthLabelLong(key: string): string {
  return monthDate(key).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ---------------------------------------------------------------------------

const S = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'h-[18px] w-[18px]',
  'aria-hidden': true,
}

/** A percent sign: a share of something, which is what a reseller is paid. */
function IconShare() {
  return (
    <svg {...S}>
      <circle cx="7.5" cy="7.5" r="2.2" />
      <circle cx="16.5" cy="16.5" r="2.2" />
      <path d="M18 6L6 18" />
    </svg>
  )
}

function IconReceipt() {
  return (
    <svg {...S}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  )
}

function IconRupee() {
  return (
    <svg {...S}>
      <path d="M7 5h10M7 9h10M15 5c0 4-3.5 4-8 4l7 10" />
    </svg>
  )
}

function IconVault() {
  return (
    <svg {...S}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 4v2M12 18v2" />
    </svg>
  )
}

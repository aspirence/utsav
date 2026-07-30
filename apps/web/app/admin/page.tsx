import Link from 'next/link'

import { ColumnChart, ShareBar, StatTile, type Slice } from '@/components/admin-charts'
import { AdminTable, PageHeader, Panel, Pill, StatBar } from '@/components/admin-ui'
import { getCategoryCoverage, getLaunchReadiness, getRoutingHealth } from '@/lib/admin-data'
import { getAdminEnquiries } from '@/lib/admin-enquiries'

/**
 * The console's front page.
 *
 * It was launch readiness and nothing else - a wall of progress bars against plan §13's
 * go/no-go numbers. Those are still here, further down, because a target that stops being
 * visible stops being a target. What was missing above them was the daily picture: how many
 * enquiries came in, how many stalled, and which ones need opening.
 *
 * WHAT IS NOT ON THIS PAGE, and why:
 *
 *  · No revenue chart. Nothing takes money yet - escrow ships July 2027 (plan §14) - so any
 *    figure would be invented.
 *  · No notification tray. There is no staff notification store, so it could only render an
 *    empty tray or a fake count.
 *  · No "total events" tile. Events are the customer's planning container; the number of them
 *    tells staff nothing they can act on.
 *
 * A dashboard that shows a metric nobody can act on trains people to stop reading it.
 */
export default async function AdminDashboardPage() {
  const enquiries = await getAdminEnquiries()
  const { supply, funnel } = getLaunchReadiness()
  const coverage = getCategoryCoverage()
  const routing = getRoutingHealth()

  const by = (s: string) => enquiries.filter((e) => e.status === s).length

  /**
   * Four buckets, not five statuses.
   *
   * `verified` and `closed` are both "nothing to do here" from a staff point of view - one is
   * mid-flight, the other is finished - so they fold together. Five segments where two mean
   * the same thing to the reader is four segments plus a colour nobody can name.
   *
   * The fourth fill is a NEUTRAL, not a fourth hue. Running all four through the palette
   * validator FAILS the chroma floor on #bcb2a8 - correctly, because it has almost no chroma.
   * That is the intent: the three hues carry the three states someone can act on, and the
   * residual "nothing to do" bucket is deliberately the one that does not read as a colour.
   * Adding a real fourth hue would give equal visual weight to the bucket with no work in it.
   */
  const slices: Slice[] = [
    { label: 'Routed to vendors', value: by('routed'), color: '#3a7c37' },
    { label: 'Awaiting OTP — never sent', value: by('pending_otp'), color: '#d99b1c' },
    { label: 'Held as spam', value: by('spam'), color: '#dc3545' },
    { label: 'Verified or closed', value: by('verified') + by('closed'), color: '#bcb2a8' },
  ]

  const weekly = weeklyCounts(enquiries.map((e) => e.createdAt))
  const stalled = by('pending_otp')

  /**
   * Routed, and not one of the five vendors has opened it.
   *
   * Keyed on `viewedAt`, not on the lead's `status` - status is a lifecycle string that moves
   * for several reasons, whereas viewedAt is the single fact "a vendor looked at this". The
   * `length > 0` guard is not redundant: [].every() is true, so a routed enquiry that somehow
   * carries no leads would otherwise be counted here, hiding a routing failure inside a tile
   * that claims vendors are being slow.
   */
  const unopened = enquiries.filter(
    (e) =>
      e.status === 'routed' &&
      e.routedVendors.length > 0 &&
      e.routedVendors.every((v) => v.viewedAt === null),
  ).length

  // Plan §13: "every category ≥50 listings per city".
  const shortfalls = coverage.filter((c) => c.live < 50)

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today's picture, then the launch gates. Nothing here is a vanity metric — every number has something a moderator can do about it."
        action={
          <Link
            href="/admin/enquiries"
            className="rounded-md bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-800"
          >
            Open enquiries
          </Link>
        }
      />

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Enquiries"
          value={enquiries.length}
          hint="All time"
          icon={<IconInbox />}
        />
        <StatTile
          label="Awaiting OTP"
          value={stalled}
          hint="Verified by nobody, so sent to nobody"
          tone={stalled > 0 ? 'warning' : 'neutral'}
          icon={<IconClock />}
        />
        <StatTile
          label="Routed, unopened"
          value={unopened}
          hint="No vendor has opened these yet"
          tone={unopened > 0 ? 'warning' : 'good'}
          icon={<IconEye />}
        />
        <StatTile
          label="Cap breaches"
          value={routing.capBreaches}
          // A unique index enforces the cap, so a non-zero number means the database invariant
          // itself was violated — not a policy slip. That is a critical, not a warning.
          hint="Enforced by a unique index — non-zero means the invariant broke"
          tone={routing.capBreaches === 0 ? 'good' : 'critical'}
          icon={<IconShield />}
        />
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="p-5">
          <h2 className="font-display text-lg text-ink-900">Where enquiries end up</h2>
          <p className="mt-1 text-sm text-ink-600">
            The gate that matters is the first one: an enquiry that never gets verified never
            reaches a vendor, and no credit is charged for it.
          </p>
          <div className="mt-5">
            <ShareBar
              slices={slices}
              total={enquiries.length}
              caption="Segments under 12% are labelled in the legend rather than in place — a percentage clipped to one digit is worse than none."
            />
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-lg text-ink-900">Enquiries per week</h2>
          <p className="mt-1 text-sm text-ink-600">
            Last six weeks. The tallest week is labelled; the rest carry the shape.
          </p>
          <div className="mt-6">
            <ColumnChart data={weekly} />
          </div>
        </Panel>
      </div>

      {/* ── Recent enquiries ─────────────────────────────────────────────── */}
      <Panel className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
          <h2 className="font-display text-lg text-ink-900">Latest enquiries</h2>
          <Link href="/admin/enquiries" className="text-sm text-primary-700 hover:underline">
            See all {enquiries.length} &rarr;
          </Link>
        </div>
        <AdminTable
          rows={enquiries.slice(0, 8)}
          rowKey={(r) => r.id}
          empty="Nothing has come in yet."
          columns={[
            {
              key: 'who',
              header: 'From',
              render: (r) => (
                <div>
                  <Link
                    href={`/admin/enquiries/${r.id}`}
                    className="font-medium text-ink-900 hover:text-primary-700"
                  >
                    {r.contactName}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {r.categoryName} · {[r.localityName, r.cityName].filter(Boolean).join(', ')}
                  </p>
                </div>
              ),
            },
            {
              key: 'budget',
              header: 'Budget',
              render: (r) => <span className="tabular-nums">{r.budgetLabel ?? '—'}</span>,
            },
            {
              key: 'sent',
              header: 'Sent to',
              align: 'right',
              render: (r) => (
                <span className="tabular-nums">
                  {r.routedVendors.length === 0 ? (
                    <span className="text-ink-400">—</span>
                  ) : (
                    `${r.routedVendors.length} of 5`
                  )}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => (
                <Pill
                  tone={
                    r.status === 'routed'
                      ? 'green'
                      : r.status === 'spam'
                        ? 'red'
                        : r.status === 'pending_otp'
                          ? 'amber'
                          : 'neutral'
                  }
                >
                  {r.status.replace(/_/g, ' ')}
                </Pill>
              ),
            },
            {
              key: 'open',
              header: '',
              align: 'right',
              render: (r) => (
                /* One action, and it opens the row. The references put an edit and a delete
                   button on every line; there is nothing on an enquiry a moderator should be
                   editing in a list, and deleting one would destroy the record of a lead five
                   vendors were charged for. */
                <Link
                  href={`/admin/enquiries/${r.id}`}
                  aria-label={`Open the enquiry from ${r.contactName}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink-200 text-ink-600 transition-colors hover:border-ink-300 hover:text-ink-900"
                >
                  <span aria-hidden="true">→</span>
                </Link>
              ),
            },
          ]}
        />
      </Panel>

      {/* ── Launch gates ─────────────────────────────────────────────────── */}
      <h2 className="mt-8 font-display text-lg text-ink-900">Launch readiness</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        Go/no-go gates for the April 2027 public launch. Targets come straight from the
        development plan §13 — nothing here is a stretch goal.
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <Panel>
          <h3 className="border-b border-ink-200 px-4 py-3 font-display text-base text-ink-900">
            Supply
          </h3>
          <div className="divide-y divide-ink-100">
            {supply.map((g) => (
              <StatBar key={g.label} {...g} />
            ))}
          </div>
        </Panel>

        <Panel>
          <h3 className="border-b border-ink-200 px-4 py-3 font-display text-base text-ink-900">
            Funnel &amp; performance
          </h3>
          <div className="divide-y divide-ink-100">
            {funnel.map((g) => (
              <StatBar key={g.label} {...g} />
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="mt-5">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <h3 className="font-display text-base text-ink-900">Category coverage</h3>
          {shortfalls.length > 0 ? (
            <Pill tone="red">{shortfalls.length} below the 50-listing floor</Pill>
          ) : (
            <Pill tone="green">All categories clear</Pill>
          )}
        </div>
        <AdminTable
          rowKey={(r) => `${r.city}-${r.category}`}
          rows={coverage}
          columns={[
            { key: 'city', header: 'City', render: (r) => r.city },
            {
              key: 'category',
              header: 'Category',
              render: (r) => <span className="font-medium text-ink-900">{r.category}</span>,
            },
            {
              key: 'live',
              header: 'Live listings',
              align: 'right',
              render: (r) => <span className="tabular-nums">{r.live}</span>,
            },
            {
              key: 'gate',
              header: 'Launch gate (50)',
              align: 'right',
              render: (r) =>
                r.live >= 50 ? (
                  <Pill tone="green">clear</Pill>
                ) : (
                  <Pill tone="red">short by {50 - r.live}</Pill>
                ),
            },
          ]}
        />
      </Panel>
    </>
  )
}

/**
 * Six week-buckets ending this week.
 *
 * Built from the actual timestamps rather than a stored aggregate, because there is no
 * aggregate to read yet - and with the demo set that means most weeks are legitimately zero.
 * A chart that shows zero when the answer is zero is doing its job.
 *
 * Bucketed on the number of whole weeks back from now, which is what "last six weeks" means to
 * a person. Calendar weeks would need a locale decision about which day starts one.
 */
function weeklyCounts(dates: string[]): { label: string; value: number }[] {
  const WEEK = 7 * 24 * 3600 * 1000
  const now = Date.now()
  const buckets = [0, 0, 0, 0, 0, 0]

  for (const d of dates) {
    const back = Math.floor((now - new Date(d).getTime()) / WEEK)
    if (back >= 0 && back < 6) buckets[5 - back] = (buckets[5 - back] ?? 0) + 1
  }

  const labels = ['5 wks', '4 wks', '3 wks', '2 wks', 'Last wk', 'This wk']
  return buckets.map((value, i) => ({ label: labels[i]!, value }))
}

/* Icons for the KPI row. Same spec as the rail: 18px, 1.6 stroke, currentColor. */
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

function IconInbox() {
  return (
    <svg {...S}>
      <path d="M3 12l2.5-7h13L21 12v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6z" />
      <path d="M3 12h5l1 2h6l1-2h5" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg {...S}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg {...S}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

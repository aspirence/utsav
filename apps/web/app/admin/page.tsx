import { AdminTable, PageHeader, Panel, Pill, StatBar } from '@/components/admin-ui'
import { getCategoryCoverage, getLaunchReadiness, getRoutingHealth } from '@/lib/admin-data'

/**
 * Launch readiness. Plan §13 defines the go/no-go for late March 2027 as a specific list
 * of numbers, so this page is that list and nothing else — no vanity charts. Every bar
 * shows its target, because a bar without one cannot fail.
 */
export default function AdminDashboardPage() {
  const { supply, funnel } = getLaunchReadiness()
  const coverage = getCategoryCoverage()
  const routing = getRoutingHealth()

  // Plan §13: "every category ≥50 listings per city".
  const shortfalls = coverage.filter((c) => c.live < 50)

  return (
    <>
      <PageHeader
        title="Launch readiness"
        description="Go/no-go gates for the April 2027 public launch. Targets come straight from the development plan §13 — nothing here is a stretch goal."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="border-b border-ink-200 px-4 py-3 font-display text-lg text-ink-900">
            Supply
          </h2>
          <div className="divide-y divide-ink-100">
            {supply.map((g) => (
              <StatBar key={g.label} {...g} />
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="border-b border-ink-200 px-4 py-3 font-display text-lg text-ink-900">
            Funnel &amp; performance
          </h2>
          <div className="divide-y divide-ink-100">
            {funnel.map((g) => (
              <StatBar key={g.label} {...g} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <Panel>
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <h2 className="font-display text-lg text-ink-900">Category coverage</h2>
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

        <Panel className="h-fit">
          <h2 className="border-b border-ink-200 px-4 py-3 font-display text-lg text-ink-900">
            Routing health
          </h2>
          <dl className="divide-y divide-ink-100">
            {[
              ['Leads routed today', String(routing.routedToday), null],
              [
                'Five-vendor cap breaches',
                String(routing.capBreaches),
                // This is enforced by a unique index, so a non-zero value would mean the
                // database invariant itself was violated — not a policy slip.
                routing.capBreaches === 0 ? 'ok' : 'bad',
              ],
              [
                'Median vendor response',
                `${routing.medianResponseMins} min`,
                routing.medianResponseMins <= 120 ? 'ok' : 'warn',
              ],
              ['Unworked, expiring in 48h', String(routing.unworkedExpiringSoon), 'warn'],
              [
                'OTP verification rate',
                `${routing.verificationRatePct}%`,
                routing.verificationRatePct >= 70 ? 'ok' : 'warn',
              ],
            ].map(([label, value, tone]) => (
              <div key={label as string} className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-sm text-ink-600">{label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-ink-900">
                  {tone === 'ok' ? (
                    <Pill tone="green">{value}</Pill>
                  ) : tone === 'bad' ? (
                    <Pill tone="red">{value}</Pill>
                  ) : tone === 'warn' ? (
                    <Pill tone="amber">{value}</Pill>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  )
}

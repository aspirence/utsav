import Link from 'next/link'

import { AdminTable, PageHeader, Panel, Pill } from '@/components/admin-ui'
import { getAdminEnquiries, type AdminEnquiry, type EnquiryStatusKey } from '@/lib/admin-enquiries'

/**
 * Every enquiry the site has taken.
 *
 * `/admin/leads` already showed routing *health* - cap compliance, median response, a
 * hardcoded list of five recent enquiries. What it could not do was open one. This is the
 * list: filterable by status and by category, and each row goes to the detail.
 *
 * The counts along the top are the ones worth watching daily, and `pending_otp` is first for
 * a reason - it is the only status that means nothing happened. Plan §1's whole promise
 * rests on the OTP gate, so enquiries piling up unverified is either a delivery problem or a
 * form problem, and both are urgent in a way "closed" never is.
 */
const TONE: Record<EnquiryStatusKey, 'green' | 'amber' | 'red' | 'neutral' | 'blue'> = {
  pending_otp: 'amber',
  verified: 'blue',
  routed: 'green',
  closed: 'neutral',
  spam: 'red',
}

const LABEL: Record<EnquiryStatusKey, string> = {
  pending_otp: 'Awaiting OTP',
  verified: 'Verified',
  routed: 'Routed',
  closed: 'Closed',
  spam: 'Spam',
}

const CATEGORIES = [
  { slug: 'all', label: 'All' },
  { slug: 'photography', label: 'Photographers' },
  { slug: 'venues', label: 'Venues' },
  { slug: 'makeup', label: 'Makeup' },
  { slug: 'decor', label: 'Decorators' },
  { slug: 'catering', label: 'Caterers' },
]

export const metadata = { title: 'Enquiries', robots: { index: false, follow: false } }

export default async function AdminEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const status = typeof params.status === 'string' ? params.status : 'all'
  const category = typeof params.category === 'string' ? params.category : 'all'

  const all = await getAdminEnquiries()
  const rows = all.filter(
    (e) =>
      (status === 'all' || e.status === status) &&
      (category === 'all' || e.categorySlug === category),
  )

  const byStatus = all.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1
    return acc
  }, {})

  const unrouted = all.filter((e) => e.status === 'pending_otp').length
  const spam = all.filter((e) => e.status === 'spam').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enquiries"
        description="Everything the enquiry form has produced, with the vendors each one reached."
      />

      {all[0]?.isDemo && (
        <p className="rounded-md border border-warning-500/40 bg-warning-50 px-4 py-3 text-sm text-warning-700">
          No database is attached, so these are demo rows. Nothing here is a real customer.
        </p>
      )}

      {/* Plain counts, not StatBar. StatBar renders progress against a stated target -
          right for plan §13's "3,000 live listings" gates, wrong here: there is no target
          number of enquiries to hit, and inventing one would make the bar decoration. */}
      <Panel className="grid grid-cols-2 divide-ink-100 sm:grid-cols-4 sm:divide-x">
        <Count label="Total" value={all.length} />
        <Count label="Awaiting OTP" value={unrouted} hint="Never verified, so never sent" />
        <Count label="Routed" value={byStatus.routed ?? 0} />
        <Count label="Held as spam" value={spam} />
      </Panel>

      <div className="space-y-3">
        <FilterRow
          label="Status"
          options={[
            { key: 'all', label: `All (${all.length})` },
            ...(Object.keys(LABEL) as EnquiryStatusKey[]).map((k) => ({
              key: k,
              label: `${LABEL[k]} (${byStatus[k] ?? 0})`,
            })),
          ]}
          active={status}
          hrefFor={(k) => `/admin/enquiries?status=${k}&category=${category}`}
        />
        <FilterRow
          label="Category"
          options={CATEGORIES.map((c) => ({ key: c.slug, label: c.label }))}
          active={category}
          hrefFor={(k) => `/admin/enquiries?status=${status}&category=${k}`}
        />
      </div>

      <Panel>
        <AdminTable<AdminEnquiry>
          rows={rows}
          rowKey={(r) => r.id}
          empty="Nothing matches those filters."
          columns={[
            {
              key: 'who',
              header: 'Enquiry',
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
              key: 'event',
              header: 'Event',
              render: (r) => (
                <div className="text-sm">
                  <p className="text-ink-800">{titleCase(r.eventType)}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {r.eventDate ? shortDate(r.eventDate) : r.dateFlexible ? 'Flexible' : '—'}
                    {r.guestCount ? ` · ${r.guestCount} guests` : ''}
                  </p>
                </div>
              ),
            },
            {
              key: 'budget',
              header: 'Budget',
              render: (r) => <span className="text-sm text-ink-700">{r.budgetLabel ?? '—'}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <Pill tone={TONE[r.status]}>{LABEL[r.status]}</Pill>,
            },
            {
              key: 'routed',
              header: 'Sent to',
              render: (r) => <RoutedSummary enquiry={r} />,
            },
            {
              key: 'when',
              header: 'Received',
              render: (r) => <span className="text-xs text-ink-500">{shortDate(r.createdAt)}</span>,
            },
          ]}
        />
      </Panel>
    </div>
  )
}

/**
 * "3 of 5 replied" rather than a list of names.
 *
 * The number that matters in a list view is how many of the five actually did something -
 * that is the funnel health plan §10 measures. Names belong on the detail page, where there
 * is room to say what each one did.
 */
function RoutedSummary({ enquiry }: { enquiry: AdminEnquiry }) {
  const n = enquiry.routedVendors.length
  if (n === 0) {
    return <span className="text-xs text-ink-400">Not routed</span>
  }
  const replied = enquiry.routedVendors.filter(
    (v) => v.status === 'responded' || v.status === 'quoted' || v.status === 'converted',
  ).length

  return (
    <span className="text-sm text-ink-700">
      {replied} of {n} replied
      {/* The cap is a database constraint, not a policy someone can override — worth
          surfacing when a row is at the ceiling. */}
      {n === 5 && <span className="ml-1 text-xs text-ink-400">(at cap)</span>}
    </span>
  )
}

function Count({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums text-ink-900">
        {value.toLocaleString('en-IN')}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

function FilterRow({
  label,
  options,
  active,
  hrefFor,
}: {
  label: string
  options: { key: string; label: string }[]
  active: string
  hrefFor: (key: string) => string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
        {label}
      </span>
      {options.map((o) => (
        <Link
          key={o.key}
          href={hrefFor(o.key)}
          className={
            'rounded-md border px-3 py-1.5 text-sm transition-colors ' +
            (active === o.key
              ? 'border-ink-800 bg-ink-800 text-white'
              : 'border-ink-200 bg-surface-raised text-ink-700 hover:border-ink-300')
          }
        >
          {o.label}
        </Link>
      ))}
    </div>
  )
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

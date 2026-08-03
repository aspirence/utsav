import Link from 'next/link'

import { AdminModal } from '@/components/admin-modal'
import { AdminTable, PageHeader, Panel, Pill } from '@/components/admin-ui'
import { getAdminVendors, type AdminVendor } from '@/lib/admin-data'
import { getAdminReference } from '@/lib/admin-reference'

import { CreateVendorForm } from './new/create-form'

export const metadata = { title: 'Vendors' }

const STATUS_TONE: Record<AdminVendor['status'], 'green' | 'amber' | 'red' | 'neutral' | 'blue'> = {
  live: 'green',
  pending_review: 'amber',
  draft: 'neutral',
  paused: 'blue',
  suspended: 'red',
}

const KYC_TONE: Record<AdminVendor['kyc'], 'green' | 'amber' | 'red' | 'neutral'> = {
  verified: 'green',
  submitted: 'amber',
  not_started: 'neutral',
  rejected: 'red',
}

/**
 * Vendor management. Plan §6 scopes what staff may do: a field agent works draft
 * listings in their own city, a moderator approves, only a moderator or super admin
 * publishes. The database enforces all of that — this screen just has to make the
 * current state legible.
 */
export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const status = typeof params.status === 'string' ? params.status : 'all'
  const category = typeof params.category === 'string' ? params.category : 'all'

  // The create form's dropdowns are foreign keys, so they need the real lists. Fetched here
  // rather than inside the dialog because a dialog is a client component and this is a read.
  const reference = await getAdminReference()
  const all = getAdminVendors()
  const rows = all.filter(
    (v) =>
      (status === 'all' || v.status === status) &&
      (category === 'all' || v.category === category),
  )

  const counts = all.reduce<Record<string, number>>((acc, v) => {
    acc[v.status] = (acc[v.status] ?? 0) + 1
    return acc
  }, {})

  /**
   * Categories are derived from the roster rather than hardcoded.
   *
   * A fixed list would go stale the day a sixth category is added, and would show a tab with
   * nothing behind it in the meantime. This shows exactly what exists, with its count.
   */
  const categoryCounts = all.reduce<Record<string, number>>((acc, v) => {
    acc[v.category] = (acc[v.category] ?? 0) + 1
    return acc
  }, {})
  const categoryTabs = [
    { key: 'all', label: 'All categories', count: all.length },
    ...Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, label: key, count })),
  ]

  const tabs = [
    { key: 'all', label: 'All', count: all.length },
    { key: 'live', label: 'Live', count: counts.live ?? 0 },
    { key: 'pending_review', label: 'Pending review', count: counts.pending_review ?? 0 },
    { key: 'draft', label: 'Draft', count: counts.draft ?? 0 },
    { key: 'paused', label: 'Paused', count: counts.paused ?? 0 },
    { key: 'suspended', label: 'Suspended', count: counts.suspended ?? 0 },
  ]

  return (
    <>
      <PageHeader
        title="Vendors"
        description="A listing only becomes discoverable when a moderator approves it — vendors can pause and resume themselves, but never publish. is_seo_eligible additionally gates whether they receive routed leads at all."
        action={
          /* A dialog rather than a jump to /admin/vendors/new. That route still exists for a
             bookmark or a link from the dashboard, but filing a listing from the roster you are
             already looking at should not lose your place in it. */
          <AdminModal
            trigger="New listing"
            title="File a new listing"
            description="Everything filed here starts as a draft — not publicly visible, not receiving enquiries — until a moderator publishes it."
            width="lg"
          >
            <CreateVendorForm
              cities={reference.cities}
              categories={reference.categories}
              isLive={reference.isLive}
            />
          </AdminModal>
        }
      />

      {/* Both filters carry the other's current value, so picking a category does not
          silently reset the status tab back to All. */}
      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/vendors?status=${t.key}&category=${category}`}
            className={
              status === t.key
                ? 'rounded-full bg-ink-900 px-3.5 py-1.5 text-sm font-medium text-white'
                : 'rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm text-ink-700 hover:border-ink-300'
            }
          >
            {t.label} ({t.count})
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {categoryTabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/vendors?status=${status}&category=${t.key}`}
            className={
              category === t.key
                ? 'rounded-md bg-ink-700 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-600 hover:border-ink-300'
            }
          >
            {t.label} ({t.count})
          </Link>
        ))}
      </div>

      <Panel>
        <AdminTable
          rowKey={(r) => r.slug}
          rows={rows}
          empty="No vendors in this state."
          columns={[
            {
              key: 'name',
              header: 'Vendor',
              render: (r) => (
                <div>
                  <p className="flex items-center gap-2 font-medium text-ink-900">
                    {r.name}
                    {/* Plan §11: the disclosure follows the listing everywhere,
                        including into the staff tools. */}
                    {r.isAnchor && <Pill tone="amber">Fremmo-owned</Pill>}
                  </p>
                  <p className="text-xs text-ink-500">
                    {r.locality}, {r.city} · {r.category}
                  </p>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <Pill tone={STATUS_TONE[r.status]}>{r.status.replace(/_/g, ' ')}</Pill>,
            },
            {
              key: 'score',
              header: 'Profile',
              align: 'right',
              render: (r) => (
                <span className={r.profileScore >= 60 ? 'tabular-nums text-ink-900' : 'tabular-nums text-danger-700'}>
                  {r.profileScore}
                </span>
              ),
            },
            {
              key: 'media',
              header: 'Photos',
              align: 'right',
              render: (r) => (
                <span className={r.mediaCount >= 5 ? 'tabular-nums' : 'tabular-nums text-danger-700'}>
                  {r.mediaCount}
                </span>
              ),
            },
            {
              key: 'seo',
              header: 'Gets leads',
              align: 'right',
              render: (r) => (r.seoEligible ? <Pill tone="green">yes</Pill> : <Pill tone="red">no</Pill>),
            },
            {
              key: 'kyc',
              header: 'KYC',
              render: (r) => <Pill tone={KYC_TONE[r.kyc]}>{r.kyc.replace(/_/g, ' ')}</Pill>,
            },
            {
              key: 'rating',
              header: 'Rating',
              align: 'right',
              render: (r) =>
                r.ratingAvg == null ? (
                  <span className="text-ink-400">—</span>
                ) : (
                  <span className="tabular-nums">
                    {r.ratingAvg.toFixed(1)}{' '}
                    <span className="text-ink-500">({r.ratingCount})</span>
                  </span>
                ),
            },
            {
              key: 'act',
              header: '',
              align: 'right',
              render: (r) => (
                <Link
                  href={`/admin/vendors/${r.slug}`}
                  className="inline-flex h-8 items-center rounded-md border border-ink-200 px-3 text-xs font-medium text-ink-800 hover:bg-ink-50"
                >
                  Open
                </Link>
              ),
            },
          ]}
        />
      </Panel>
    </>
  )
}

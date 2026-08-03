import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { StatTile } from '@/components/admin-charts'
import { AdminTable, PageHeader, Panel, Pill } from '@/components/admin-ui'

import { getStaffGate } from '@/lib/admin-auth'
import { formatPaise, type ResellerCommissionStatus, type ResellerStatus } from '@/lib/db'
import {
  getResellerDetail,
  type ResellerCommissionEntry,
  type ResellerCustomerLink,
} from '@/lib/resellers'

import { RateLabel } from '../rate'
import {
  AssignCustomerForm,
  MarkSettledButton,
  RateForm,
  ReleaseCustomerButton,
  StatusControls,
} from '../reseller-controls'

export const metadata: Metadata = {
  title: 'Reseller',
  robots: { index: false, follow: false },
}

/**
 * One reseller: who they own, what they have earned, and the four things that can be changed
 * about them.
 *
 * THE THREE PANELS ARE IN ORDER OF HOW OFTEN THEY ARE USED, not of how important they are. The
 * ledger is what somebody opens this page for — a settlement run walks down it marking payable
 * rows — so it is the widest thing on screen. The rate and the status are two boxes in the rail,
 * because they are changed twice a year.
 *
 * `force-dynamic` for the same reason the index is: this page shows money it also changes, and a
 * cached copy would show a commission settled ten seconds ago as still payable.
 */
export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<ResellerStatus, 'green' | 'amber' | 'neutral'> = {
  active: 'green',
  suspended: 'amber',
  closed: 'neutral',
}

/**
 * The ledger's own vocabulary, coloured by what it means for the money.
 *
 * `reversed` is red and `pending` is amber, which is the right way round: pending is money that
 * is expected to arrive and reversed is money that was expected and will not. Neither is an
 * error, so neither says so in words — the tone carries the difference and the status carries the
 * meaning.
 */
const COMMISSION_TONE: Record<ResellerCommissionStatus, 'amber' | 'blue' | 'green' | 'red'> = {
  pending: 'amber',
  payable: 'blue',
  paid: 'green',
  reversed: 'red',
}

/**
 * A route parameter is a string somebody typed, and getResellerDetail() puts it straight into an
 * `.eq('id', …)` — PostgREST answers a malformed uuid with an error, which lib/resellers.ts turns
 * into a thrown exception and Next into a 500. A 404 is the truthful answer to "/admin/resellers/
 * banana", so the shape is checked here rather than letting the database object to it.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ResellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await getStaffGate()
  if (gate.state !== 'staff' || !gate.identity.roles.includes('super')) notFound()

  const { id } = await params
  if (!UUID.test(id)) notFound()

  const detail = await getResellerDetail(id)
  if (!detail) notFound()

  const { reseller, customers, commissions } = detail
  const live = customers.filter((c) => c.releasedAt == null)
  const payableCount = commissions.filter((c) => c.status === 'payable').length

  return (
    <>
      <Link
        href="/admin/resellers"
        className="text-ink-500 hover:text-ink-800 mb-4 inline-block text-sm"
      >
        ← Back to resellers
      </Link>

      <PageHeader
        title={reseller.displayName}
        description={`${reseller.code} · ${live.length} ${live.length === 1 ? 'customer' : 'customers'} · ${reseller.orderCount} attributed ${reseller.orderCount === 1 ? 'order' : 'orders'} · joined ${when(reseller.createdAt)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <RateLabel bps={reseller.commissionBps} />
            <Pill tone={STATUS_TONE[reseller.status]}>{reseller.status}</Pill>
          </div>
        }
      />

      {(reseller.contactEmail || reseller.contactPhone) && (
        <p className="text-ink-600 mb-5 text-sm">
          {[reseller.contactEmail, reseller.contactPhone].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Earned"
          value={formatPaise(reseller.earnedPaise)}
          hint="Everything not reversed"
        />
        <StatTile
          label="Pending"
          value={formatPaise(reseller.pendingPaise)}
          hint="Paid for, not yet delivered — can still reverse"
        />
        <StatTile
          label="Payable"
          value={formatPaise(reseller.payablePaise)}
          hint={payableCount === 0 ? 'Nothing waiting to be settled' : `${payableCount} to settle`}
          tone={reseller.payablePaise > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          label="Paid"
          value={formatPaise(reseller.paidPaise)}
          hint="Settled out of band and recorded"
          tone="good"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Panel>
            <div className="border-ink-200 border-b px-4 py-3">
              <h2 className="font-display text-ink-900 text-lg">Customers</h2>
              <p className="text-ink-600 mt-1 text-sm">
                Accounts this reseller owns. A live assignment means every invitation order that
                account places is attributed here — resolved by a trigger at insert, not by anything
                the browser sends.
              </p>
            </div>

            <AdminTable<ResellerCustomerLink>
              rows={customers}
              rowKey={(c) => c.id}
              empty="Nobody is assigned yet, so nothing is being attributed."
              columns={[
                {
                  key: 'who',
                  header: 'Customer',
                  render: (c) => (
                    <div className="min-w-0">
                      <span className="text-ink-900 block truncate font-medium">
                        {c.fullName ?? c.email ?? c.phone ?? 'No name'}
                      </span>
                      {/* Staff read these unmasked — unlike the reseller themselves, who gets
                          public.reseller_orders and a first name. */}
                      <span className="text-ink-500 block truncate text-xs">
                        {c.email ?? c.phone ?? c.customerId}
                      </span>
                    </div>
                  ),
                },
                {
                  key: 'assigned',
                  header: 'Assigned',
                  render: (c) => <span className="text-ink-500 text-xs">{when(c.assignedAt)}</span>,
                },
                {
                  key: 'state',
                  header: 'State',
                  render: (c) =>
                    c.releasedAt ? (
                      <Pill tone="neutral">released {when(c.releasedAt)}</Pill>
                    ) : (
                      <Pill tone="green">live</Pill>
                    ),
                },
                {
                  key: 'act',
                  header: '',
                  align: 'right',
                  render: (c) =>
                    c.releasedAt ? null : (
                      <ReleaseCustomerButton
                        assignmentId={c.id}
                        resellerId={reseller.id}
                        who={c.fullName ?? c.email ?? c.phone ?? 'this account'}
                      />
                    ),
                },
              ]}
            />

            <AssignCustomerForm resellerId={reseller.id} />
          </Panel>

          <Panel>
            <div className="border-ink-200 border-b px-4 py-3">
              <h2 className="font-display text-ink-900 text-lg">Commission ledger</h2>
              <p className="text-ink-600 mt-1 text-sm">
                One row per attributed order that was paid for. The rate and the amount it was
                applied to were frozen at accrual, so this reconciles against a statement sent
                months ago even if the reseller&rsquo;s rate has changed twice since.
              </p>
            </div>

            <AdminTable<ResellerCommissionEntry>
              rows={commissions}
              rowKey={(c) => c.id}
              empty="Nothing has accrued yet. A commission is written when an attributed order's payment lands."
              columns={[
                {
                  key: 'order',
                  header: 'Order',
                  render: (c) => (
                    <div className="min-w-0">
                      <p className="text-ink-900 font-mono text-xs tracking-wide">
                        {c.orderReference}
                      </p>
                      <p className="text-ink-500 mt-0.5 truncate text-xs">{c.templateName}</p>
                    </div>
                  ),
                },
                {
                  key: 'rate',
                  header: 'Rate',
                  render: (c) => <RateLabel bps={c.rateBps} />,
                },
                {
                  key: 'base',
                  header: 'Order price',
                  align: 'right',
                  render: (c) => (
                    <span className="text-ink-700 tabular-nums">{formatPaise(c.basePaise)}</span>
                  ),
                },
                {
                  key: 'amount',
                  header: 'Commission',
                  align: 'right',
                  render: (c) => (
                    <span
                      className={`tabular-nums ${
                        c.status === 'reversed'
                          ? 'text-ink-400 line-through'
                          : 'text-ink-900 font-medium'
                      }`}
                    >
                      {formatPaise(c.amountPaise)}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (c) => (
                    <div>
                      <Pill tone={COMMISSION_TONE[c.status]}>{c.status}</Pill>
                      <p className="text-ink-500 mt-0.5 text-[11px]">earned {when(c.earnedAt)}</p>
                    </div>
                  ),
                },
                {
                  /*
                    Settlement, and the control that records one.

                    The button appears only on a payable row, which is a courtesy rather than the
                    rule: markCommissionPaid() pins the update to `status = 'payable'`, so a row
                    that reverses between this render and the click is refused by the database
                    rather than by the absence of a button.
                  */
                  key: 'settlement',
                  header: 'Settlement',
                  align: 'right',
                  render: (c) => {
                    if (c.status === 'payable') {
                      return (
                        <MarkSettledButton
                          commissionId={c.id}
                          resellerId={reseller.id}
                          amountPaise={c.amountPaise}
                        />
                      )
                    }
                    if (c.status === 'paid') {
                      return (
                        <div className="text-right">
                          <p className="text-ink-700 font-mono text-[11px] break-all">
                            {c.settlementRef ?? '—'}
                          </p>
                          <p className="text-ink-500 mt-0.5 text-[11px]">
                            {c.paidAt ? when(c.paidAt) : ''}
                          </p>
                        </div>
                      )
                    }
                    return (
                      <span className="text-ink-400 text-[11px]">
                        {c.status === 'pending' ? 'not yet delivered' : 'nothing to settle'}
                      </span>
                    )
                  },
                },
              ]}
            />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <h2 className="text-ink-900 text-sm font-semibold">Commission rate</h2>
            <div className="mt-3">
              <RateForm resellerId={reseller.id} commissionBps={reseller.commissionBps} />
            </div>
          </Panel>

          <Panel className="p-4">
            <h2 className="text-ink-900 text-sm font-semibold">Status</h2>
            <div className="mt-3">
              <StatusControls
                resellerId={reseller.id}
                displayName={reseller.displayName}
                status={reseller.status}
              />
            </div>
          </Panel>

          <p className="text-ink-500 text-xs leading-relaxed">
            Marking a commission settled records a transfer that already happened — it does not move
            money. Every change on this page is written to the append-only audit log with your
            identity and your reason attached, which is the only thing that can answer &ldquo;why is
            this partner on a different rate&rdquo; a year from now.
          </p>
        </div>
      </div>
    </>
  )
}

/** Short, absolute, unambiguous. A relative "3 days ago" is useless in a settlement call. */
function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

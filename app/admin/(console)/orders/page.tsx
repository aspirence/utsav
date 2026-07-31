import { formatPaise } from '@/lib/db'

import { AdminTable, PageHeader, Panel, Pill } from '@/components/admin-ui'
import { StatTile } from '@/components/admin-charts'
import {
  getInvitationOrders,
  orderTotals,
  ORDER_STATUS_LABEL,
  type AdminInvitationOrder,
} from '@/lib/invitation-orders'

export const metadata = { title: 'Invitation orders' }

const TONE: Record<AdminInvitationOrder['status'], 'green' | 'amber' | 'red' | 'neutral' | 'blue'> =
  {
    awaiting_payment: 'amber',
    booked: 'blue',
    details_received: 'blue',
    draft_sent: 'blue',
    approved: 'green',
    delivered: 'green',
    refunded: 'red',
    cancelled: 'neutral',
  }

/**
 * Everyone who has booked an invitation.
 *
 * WHAT THE NUMBERS AT THE TOP DO AND DO NOT COUNT. "Collected" is booking amounts whose payment
 * actually landed — not the full template price, which is a hope rather than income, and not
 * orders sitting at awaiting_payment. "Outstanding" is balances owed on orders still in flight,
 * so delivered ones (settled) and refunded ones (never coming) are both out. A console that
 * totals optimistically is a console somebody makes a decision on.
 *
 * Amounts are read from the order row, not recomputed from the template. A template's price can
 * change after an order is placed; the order remembers what was agreed, which is why those three
 * columns are denormalised onto it.
 */
export default async function AdminOrdersPage() {
  const orders = await getInvitationOrders()
  const totals = orderTotals(orders)
  const isDemo = orders.some((o) => o.isDemo)

  return (
    <>
      <PageHeader
        title="Invitation orders"
        description="Anyone who has reserved a design slot. Amounts are what was agreed when the order was placed — a later price change on the template does not rewrite them."
      />

      {isDemo && (
        <p className="mb-5 rounded-md border border-warning-500/40 bg-warning-50 px-3 py-2.5 text-sm leading-relaxed text-warning-700">
          These are demo orders, not database rows — no Supabase instance is attached. They include
          the awkward cases on purpose: one that never paid, one still waiting on the customer, and
          one refunded.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Orders"
          value={orders.length}
          hint="All time"
          icon={<IconReceipt />}
        />
        <StatTile
          label="Collected"
          value={formatPaise(totals.collectedPaise)}
          hint="Booking amounts actually received"
          tone="good"
          icon={<IconRupee />}
        />
        <StatTile
          label="Outstanding"
          value={formatPaise(totals.outstandingPaise)}
          hint="Balances owed on orders still in flight"
          icon={<IconClock />}
        />
        <StatTile
          label="Needs action"
          value={totals.needsAction}
          hint="Paid, and waiting on us for the next step"
          tone={totals.needsAction > 0 ? 'warning' : 'good'}
          icon={<IconBell />}
        />
      </div>

      {totals.awaitingPayment > 0 && (
        <p className="mt-4 rounded-md border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-700">
          {totals.awaitingPayment}{' '}
          {totals.awaitingPayment === 1 ? 'order has' : 'orders have'} not paid their booking amount
          yet. Nothing is reserved for them until it lands.
        </p>
      )}

      <Panel className="mt-5">
        <div className="border-b border-ink-200 px-4 py-3">
          <h2 className="font-display text-lg text-ink-900">All orders</h2>
        </div>
        <AdminTable
          rowKey={(r: AdminInvitationOrder) => r.reference}
          rows={orders}
          empty="No orders yet. They arrive here the moment somebody reserves a slot."
          columns={[
            {
              key: 'ref',
              header: 'Reference',
              render: (r) => (
                <div>
                  <p className="font-mono text-xs tracking-wide text-ink-900">{r.reference}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{when(r.createdAt)}</p>
                </div>
              ),
            },
            {
              key: 'who',
              header: 'Customer',
              render: (r) => (
                <div>
                  <p className="flex items-center gap-2 font-medium text-ink-900">
                    {r.contactName}
                    {/* An unclaimed order has no account behind it, so the customer cannot see it
                        on their own dashboard. Worth knowing before telling them to "check your
                        account". */}
                    {!r.claimed && <Pill tone="neutral">guest</Pill>}
                  </p>
                  {/* Staff read these unmasked: unlike a vendor lead (plan §6), they are the party
                      who has to deliver the order. */}
                  <p className="mt-0.5 text-xs text-ink-500">
                    {r.contactPhone} · {r.contactEmail}
                  </p>
                </div>
              ),
            },
            {
              key: 'design',
              header: 'Design',
              render: (r) => <span className="text-ink-800">{r.templateName}</span>,
            },
            {
              key: 'paid',
              header: 'Paid',
              align: 'right',
              render: (r) =>
                r.paidAt ? (
                  <span className="tabular-nums text-ink-900">
                    {formatPaise(r.bookingAmountPaise)}
                  </span>
                ) : (
                  <span className="text-ink-400">—</span>
                ),
            },
            {
              key: 'balance',
              header: 'Balance',
              align: 'right',
              render: (r) => (
                <span className="tabular-nums text-ink-700">{formatPaise(r.balancePaise)}</span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <Pill tone={TONE[r.status]}>{ORDER_STATUS_LABEL[r.status]}</Pill>,
            },
          ]}
        />
      </Panel>

      <p className="mt-5 max-w-3xl text-xs leading-relaxed text-ink-500">
        Amounts, references and payment stamps cannot be edited from this console —
        app.guard_invitation_order_columns() rejects it. They are set when the order is placed and
        by the payment webhook, so a price cannot be rewritten after a customer has agreed to it.
        Moving an order along its statuses is a separate change and is not built yet.
      </p>
    </>
  )
}

/** Short, absolute, and unambiguous. A relative "3 days ago" is useless in a support call. */
function when(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

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

function IconClock() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg {...S}>
      <path d="M18 15V10a6 6 0 10-12 0v5l-1.5 3h15L18 15z" />
      <path d="M10 21h4" />
    </svg>
  )
}

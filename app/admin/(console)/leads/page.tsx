import { AdminTable, PageHeader, Panel, Pill } from '@/components/admin-ui'
import { getRoutingHealth } from '@/lib/admin-data'

import { RefundCreditButton } from './refund-button'

export const metadata = { title: 'Leads' }

interface RecentEnquiry {
  id: string
  customer: string
  category: string
  city: string
  routed: number
  responded: number
  status: string
  minutesAgo: number
}

const RECENT: RecentEnquiry[] = [
  {
    id: 'FRM-E-4821',
    customer: 'Ananya I.',
    category: 'Photography',
    city: 'Lucknow',
    routed: 5,
    responded: 2,
    status: 'routed',
    minutesAgo: 14,
  },
  {
    id: 'FRM-E-4820',
    customer: 'Rohit M.',
    category: 'Venues',
    city: 'Delhi NCR',
    routed: 5,
    responded: 4,
    status: 'routed',
    minutesAgo: 52,
  },
  {
    id: 'FRM-E-4819',
    customer: 'Meera R.',
    category: 'Photography',
    city: 'Lucknow',
    routed: 5,
    responded: 5,
    status: 'routed',
    minutesAgo: 96,
  },
  {
    id: 'FRM-E-4818',
    customer: 'Karthik I.',
    category: 'Makeup',
    city: 'Lucknow',
    routed: 3,
    responded: 1,
    status: 'routed',
    minutesAgo: 140,
  },
  {
    id: 'FRM-E-4817',
    customer: 'Deepa S.',
    category: 'Catering',
    city: 'Lucknow',
    routed: 5,
    responded: 0,
    status: 'routed',
    minutesAgo: 190,
  },
  {
    id: 'FRM-E-4816',
    customer: '—',
    category: 'Photography',
    city: 'Delhi NCR',
    routed: 0,
    responded: 0,
    status: 'pending_otp',
    minutesAgo: 210,
  },
  {
    id: 'FRM-E-4815',
    customer: 'Lakshmi S.',
    category: 'Photography',
    city: 'Lucknow',
    routed: 5,
    responded: 3,
    status: 'routed',
    minutesAgo: 265,
  },
  {
    id: 'FRM-E-4814',
    customer: '—',
    category: 'Decor',
    city: 'Lucknow',
    routed: 0,
    responded: 0,
    status: 'spam',
    minutesAgo: 300,
  },
]

/**
 * Routing health. Plan §10's Match-stage KPIs: cap compliance and median vendor
 * response under two hours.
 *
 * "Cap breaches" is the important row. It is not a policy we monitor — it is a unique
 * index on (enquiry_id, routed_seq) with routed_seq constrained to 1–5, so a non-zero
 * value would mean the database invariant itself failed. Showing it as a metric is a
 * canary for exactly that.
 */
export default function AdminLeadsPage() {
  const health = getRoutingHealth()

  return (
    <>
      <PageHeader
        title="Leads & routing"
        description="Lead quality is the thing renewal depends on, so it is monitored as a first-class operational metric rather than a growth chart."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Routed today', value: String(health.routedToday), tone: 'neutral' as const },
          {
            label: 'Cap breaches',
            value: String(health.capBreaches),
            tone: health.capBreaches === 0 ? ('green' as const) : ('red' as const),
            hint: 'DB invariant',
          },
          {
            label: 'Median response',
            value: `${health.medianResponseMins} min`,
            tone: health.medianResponseMins <= 120 ? ('green' as const) : ('amber' as const),
            hint: 'Target < 120',
          },
          {
            label: 'Expiring in 48h',
            value: String(health.unworkedExpiringSoon),
            tone: 'amber' as const,
            hint: 'Unworked',
          },
          {
            label: 'OTP verification',
            value: `${health.verificationRatePct}%`,
            tone: 'neutral' as const,
            hint: 'Of started enquiries',
          },
        ].map((t) => (
          <Panel key={t.label} className="p-4">
            <p className="text-ink-500 text-xs tracking-wide uppercase">{t.label}</p>
            <p className="font-display text-ink-900 mt-1.5 text-2xl">{t.value}</p>
            <div className="mt-1.5">
              {t.hint && <span className="text-ink-500 text-xs">{t.hint}</span>}
            </div>
          </Panel>
        ))}
      </div>

      <Panel>
        <h2 className="border-ink-200 font-display text-ink-900 border-b px-4 py-3 text-lg">
          Recent enquiries
        </h2>
        <AdminTable
          rowKey={(r) => r.id}
          rows={RECENT}
          columns={[
            {
              key: 'id',
              header: 'Enquiry',
              render: (r) => <span className="font-mono text-xs">{r.id}</span>,
            },
            { key: 'cust', header: 'Customer', render: (r) => r.customer },
            { key: 'cat', header: 'Category', render: (r) => r.category },
            {
              key: 'city',
              header: 'City',
              render: (r) => <span className="text-ink-500">{r.city}</span>,
            },
            {
              key: 'routed',
              header: 'Vendors routed',
              align: 'right',
              render: (r) =>
                r.routed === 0 ? (
                  <span className="text-ink-400">—</span>
                ) : (
                  <span className="tabular-nums">
                    {r.routed} / 5
                    {r.routed < 5 && (
                      <span className="text-ink-500 ml-1.5 text-xs">(thin supply)</span>
                    )}
                  </span>
                ),
            },
            {
              key: 'resp',
              header: 'Responded',
              align: 'right',
              render: (r) =>
                r.routed === 0 ? (
                  <span className="text-ink-400">—</span>
                ) : (
                  <span
                    className={r.responded === 0 ? 'text-danger-700 tabular-nums' : 'tabular-nums'}
                  >
                    {r.responded}
                  </span>
                ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => (
                <Pill
                  tone={r.status === 'routed' ? 'green' : r.status === 'spam' ? 'red' : 'amber'}
                >
                  {r.status.replace(/_/g, ' ')}
                </Pill>
              ),
            },
            {
              key: 'age',
              header: 'Age',
              align: 'right',
              render: (r) => (
                <span className="text-ink-500">
                  {r.minutesAgo < 60 ? `${r.minutesAgo}m` : `${Math.round(r.minutesAgo / 60)}h`}
                </span>
              ),
            },
            {
              key: 'act',
              header: '',
              align: 'right',
              render: (r) =>
                r.routed > 0 ? (
                  // In demo mode `r.id` is an enquiry reference rather than a lead UUID.
                  // refundLeadCredit() checks hasSupabaseEnv() before it validates, so the
                  // fixture reference never reaches zod and the operator gets a message
                  // about the missing instance instead of a puzzling format error.
                  <RefundCreditButton leadId={r.id} reference={r.id} />
                ) : null,
            },
          ]}
        />
      </Panel>

      <Panel className="mt-5 p-4">
        <h2 className="font-display text-ink-900 text-base">About credit refunds</h2>
        <p className="text-ink-600 mt-1.5 max-w-3xl text-sm">
          Refunding a credit returns it to the vendor&rsquo;s plan, removes the lead from their
          response-rate denominator, and revokes their access to the customer&rsquo;s contact
          details. It is logged against your identity. Use it generously — plan §12 treats junk
          leads as the single biggest threat to renewal.
        </p>
      </Panel>
    </>
  )
}

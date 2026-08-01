import Link from 'next/link'

import { Card, CardBody } from '@/components/ui'

import { StatusBadge } from '@/components/partner-lead-parts'
import { getPartnerLeads, getPartnerStats } from '@/lib/partner-queries'

/**
 * Plan §2: "honest vendor dashboards … are core MVP scope — renewal, the model's most
 * sensitive assumption, depends on them."
 *
 * So the numbers here are deliberately unflattering where they should be: the response
 * rate is the same figure customers see on the public profile and the same one
 * app.vendor_rank() uses for ranking. There is no separate "dashboard metric".
 */
export default async function PartnerOverviewPage() {
  const [stats, leads] = await Promise.all([getPartnerStats(), getPartnerLeads()])
  const recent = leads.slice(0, 4)

  const tiles = [
    {
      label: 'New leads',
      value: String(stats.newLeads),
      hint: stats.expiringSoon > 0 ? `${stats.expiringSoon} expiring within 48h` : 'All worked',
      tone: stats.newLeads > 0 ? 'primary' : 'neutral',
    },
    {
      label: 'Response rate',
      value: stats.responseRatePct == null ? '—' : `${stats.responseRatePct}%`,
      hint: 'Last 90 days',
      tone: (stats.responseRatePct ?? 0) >= 80 ? 'success' : 'warning',
    },
    {
      label: 'Median reply',
      value:
        stats.medianResponseMins == null
          ? '—'
          : stats.medianResponseMins <= 60
            ? `${stats.medianResponseMins} min`
            : `${Math.round(stats.medianResponseMins / 60)} h`,
      // Plan §10 KPI. Stating the target makes the number actionable rather than vanity.
      hint: 'Target: under 2 hours',
      tone: (stats.medianResponseMins ?? 999) <= 120 ? 'success' : 'warning',
    },
    {
      label: 'Lead → booking',
      value: stats.conversionPct == null ? '—' : `${stats.conversionPct}%`,
      hint: 'Category median: 6%',
      tone: 'neutral',
    },
  ] as const

  return (
    <div className="space-y-8">
      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.label}>
              <CardBody>
                <p className="text-xs uppercase tracking-wide text-ink-500">{t.label}</p>
                <p className="mt-1.5 font-display text-3xl text-ink-900">{t.value}</p>
                <p className="mt-1 text-xs text-ink-500">{t.hint}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl text-ink-900">Recent leads</h2>
          <Link
            href="/partner/dashboard/leads"
            className="text-sm font-medium text-primary-700 hover:text-primary-800"
          >
            See all {stats.totalLeads} →
          </Link>
        </div>

        <div className="space-y-3">
          {recent.map((lead) => (
            <Link key={lead.leadId} href={`/partner/dashboard/leads/${lead.leadId}`}>
              <Card>
                <CardBody className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">
                      {lead.contactFirstName} · {lead.eventType.replace(/_/g, ' ')}
                      {lead.localityName ? ` in ${lead.localityName}` : ''}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {lead.eventDate
                        ? new Date(lead.eventDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Date flexible'}
                      {lead.guestCount ? ` · ${lead.guestCount} guests` : ''}
                    </p>
                  </div>
                  <StatusBadge status={lead.status} />
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Plan §12: credit refunds are the lead-quality mitigation that protects renewal.
          Telling vendors the mechanism exists is what makes it worth anything. */}
      <Card className="border-ink-200 bg-surface-sunken">
        <CardBody>
          <h2 className="font-display text-lg text-ink-900">Got a lead that was not real?</h2>
          <p className="mt-1.5 text-sm text-ink-600">
            Every enquiry is phone-verified before it reaches you, and goes to at most five
            vendors. If one still turns out to be junk, report it and we refund the credit —
            no argument. Your dashboard shows refunded leads separately so your response
            rate is never penalised for them.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

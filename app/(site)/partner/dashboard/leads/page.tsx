import Link from 'next/link'

import { formatPriceBand } from '@/lib/db'
import { Badge, Card, CardBody } from '@/components/ui'

import { ContactLine } from '@/components/partner-lead-parts'
import { getPartnerLeads, type PartnerLead } from '@/lib/partner-queries'

/**
 * The lead inbox. Plan §S7 ships this in sprint 7, ahead of the Expo app.
 *
 * The masking behaviour on this screen is not cosmetic: public.vendor_leads returns NULL
 * for contact_phone until the lead reaches a permitted state (plan §6). The UI shows a
 * locked placeholder rather than pretending the number is merely hidden, because opening
 * the lead is what actually reveals it — and that reveal is stamped and audited.
 */
export default async function PartnerLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filter = typeof params.status === 'string' ? params.status : 'open'

  const all = await getPartnerLeads()

  const open = all.filter((l) => ['routed', 'viewed', 'responded', 'quoted'].includes(l.status))
  const won = all.filter((l) => l.status === 'converted')
  const closed = all.filter((l) => l.status === 'expired')

  const shown = filter === 'won' ? won : filter === 'closed' ? closed : open

  const tabs = [
    { key: 'open', label: 'Open', count: open.length },
    { key: 'won', label: 'Booked', count: won.length },
    { key: 'closed', label: 'Expired', count: closed.length },
  ]

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/partner/dashboard/leads?status=${tab.key}`}
            className={
              filter === tab.key
                ? 'rounded-full bg-ink-900 px-4 py-1.5 text-sm font-medium text-white'
                : 'rounded-full border border-ink-200 bg-surface-raised px-4 py-1.5 text-sm text-ink-700 hover:border-ink-300'
            }
          >
            {tab.label} ({tab.count})
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <p className="font-display text-lg text-ink-900">Nothing here right now</p>
            <p className="mt-1.5 text-sm text-ink-600">
              New enquiries appear the moment they are verified and routed to you.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((lead) => (
            <LeadRow key={lead.leadId} lead={lead} />
          ))}
        </div>
      )}
    </div>
  )
}

function LeadRow({ lead }: { lead: PartnerLead }) {
  const hoursLeft = Math.round(
    (new Date(lead.expiresAt).getTime() - Date.now()) / 3_600_000,
  )
  const urgent = ['routed', 'viewed'].includes(lead.status) && hoursLeft > 0 && hoursLeft < 48

  return (
    <Card className={urgent ? 'border-primary-200' : undefined}>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg text-ink-900">
                {lead.contactName ?? `${lead.contactFirstName} ·`}{' '}
                <span className="capitalize">{lead.eventType.replace(/_/g, ' ')}</span>
              </h2>
              {/* Plan §2: the vendor is told exactly how much competition there is.
                  Hiding it would be the easy lie; showing it is what makes the
                  five-vendor cap a promise rather than a marketing line. */}
              <Badge tone="neutral">Vendor {lead.routedSeq} of 5</Badge>
            </div>

            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-600">
              <div>
                <dt className="sr-only">Event date</dt>
                <dd>
                  {lead.eventDate
                    ? new Date(lead.eventDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : 'Date flexible'}
                  {lead.dateFlexible && lead.eventDate ? ' (flexible)' : ''}
                </dd>
              </div>
              {lead.guestCount && <div><dt className="sr-only">Guests</dt><dd>{lead.guestCount} guests</dd></div>}
              {lead.localityName && <div><dt className="sr-only">Locality</dt><dd>{lead.localityName}</dd></div>}
              <div>
                <dt className="sr-only">Budget</dt>
                <dd className="font-medium text-ink-800">
                  {formatPriceBand(lead.budgetMin, lead.budgetMax)}
                </dd>
              </div>
            </dl>

            {lead.stylePreferences.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {lead.stylePreferences.map((s) => (
                  <Badge key={s} tone="neutral" className="capitalize">
                    {s.replace(/-/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}

            <div className="mt-3">
              <ContactLine lead={lead} />
            </div>
          </div>

          <div className="shrink-0 text-right">
            {urgent && (
              <p className="mb-2 text-xs font-semibold text-primary-700">
                Expires in {hoursLeft}h
              </p>
            )}
            <Link
              href={`/partner/dashboard/leads/${lead.leadId}`}
              className="inline-flex h-9 items-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
            >
              {lead.contactVisible ? 'Open' : 'Open & reveal contact'}
            </Link>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}


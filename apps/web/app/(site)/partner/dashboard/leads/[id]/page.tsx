import Link from 'next/link'
import { notFound } from 'next/navigation'

import { formatPriceBand } from '@utsava/db'
import { Badge, Card, CardBody } from '@utsava/ui'

import { ContactLine } from '@/components/partner-lead-parts'
import { getPartnerLead } from '@/lib/partner-queries'

import { LeadWorkActions, ReportJunkForm } from '../lead-actions'

/**
 * Lead detail. Plan §5: transitions happen through app.transition_lead() only — there is
 * no vendor UPDATE policy on public.leads, so the buttons below post to the server
 * actions in ../actions.ts, which call the RPC.
 *
 * Loading this page deliberately does NOT move routed → viewed. The reveal is a POST the
 * vendor makes on purpose: a GET that spent it would fire on a link prefetch, and
 * contact_revealed_at would then record an opening that never happened. Everything on
 * screen is read from public.vendor_leads, so whatever the mask hides, this page hides.
 */
export default async function PartnerLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lead = await getPartnerLead(id)
  if (!lead) notFound()

  const canWork = ['routed', 'viewed', 'responded', 'quoted'].includes(lead.status)

  return (
    <div className="space-y-6">
      <Link
        href="/partner/dashboard/leads"
        className="inline-block text-sm text-ink-500 hover:text-ink-800"
      >
        ← Back to leads
      </Link>

      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl text-ink-900">
                {lead.contactName ?? lead.contactFirstName}
              </h1>
              <p className="mt-1 capitalize text-ink-600">
                {lead.eventType.replace(/_/g, ' ')}
                {lead.localityName ? ` · ${lead.localityName}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">Vendor {lead.routedSeq} of 5</Badge>
              <Badge tone={lead.status === 'converted' ? 'success' : 'primary'} className="capitalize">
                {lead.status}
              </Badge>
            </div>
          </div>

          <div className="rounded-lg bg-surface-sunken p-4">
            <ContactLine lead={lead} />
          </div>

          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {[
              [
                'Event date',
                lead.eventDate
                  ? new Date(lead.eventDate).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Flexible',
              ],
              ['Guests', lead.guestCount ? String(lead.guestCount) : '—'],
              ['Budget', formatPriceBand(lead.budgetMin, lead.budgetMax)],
              [
                'Received',
                new Date(lead.routedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                }),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
                <dd className="mt-0.5 font-medium text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>

          {lead.message && (
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">What they said</p>
              <p className="mt-1.5 leading-relaxed text-ink-700">{lead.message}</p>
            </div>
          )}

          {lead.stylePreferences.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">Style preference</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {lead.stylePreferences.map((s) => (
                  <Badge key={s} tone="accent" className="capitalize">
                    {s.replace(/-/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {canWork && (
        <Card>
          <CardBody>
            <h2 className="font-display text-lg text-ink-900">Respond</h2>
            <p className="mt-1 text-sm text-ink-600">
              Replying within two hours roughly doubles your chance of winning the booking —
              and response time is a ranking input, so it compounds. This lead is open until{' '}
              {new Date(lead.expiresAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
              })}
              .
            </p>
            <LeadWorkActions
              leadId={lead.leadId}
              status={lead.status}
              contactVisible={lead.contactVisible}
              contactPhone={lead.contactPhone}
              contactFirstName={lead.contactFirstName}
            />
          </CardBody>
        </Card>
      )}

      <Card className="border-ink-200 bg-surface-sunken">
        <CardBody>
          <p className="text-sm text-ink-600">
            <strong className="font-semibold text-ink-800">Was this lead junk?</strong>{' '}
            Tell us why and a moderator reviews it, usually within a day. If it was junk they
            refund the credit — that call is theirs, not automatic. We use these reports to
            tune routing, so it genuinely improves what you get next.
          </p>
          <ReportJunkForm leadId={lead.leadId} alreadyRefunded={Boolean(lead.creditRefundedAt)} />
        </CardBody>
      </Card>
    </div>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader, Panel, Pill } from '@/components/admin-ui'
import { getAdminEnquiry } from '@/lib/admin-enquiries'

/**
 * One enquiry, in full.
 *
 * CONTACT DETAILS ARE SHOWN UNMASKED HERE, and that is a deliberate difference from the
 * vendor side. Plan §6 masks a customer's phone from vendors until the lead state permits
 * it - that masking lives in the `vendor_leads` view and exists so a vendor cannot harvest
 * numbers from leads they never worked. Staff are the party who has to ring a customer back
 * about a complaint, so they read the row itself; the audit log is what keeps that
 * accountable rather than a mask.
 *
 * The routed list is the plan's five-vendor cap made visible. `routed_seq` is constrained to
 * 1–5 with a UNIQUE on (enquiry_id, routed_seq), so a sixth row cannot exist - if this ever
 * shows six, the constraint is gone and that is a far bigger problem than the page.
 */
export const metadata = { title: 'Enquiry', robots: { index: false, follow: false } }

export default async function AdminEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const e = await getAdminEnquiry(id)
  if (!e) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/enquiries" className="text-sm text-ink-500 hover:text-ink-800">
          &larr; All enquiries
        </Link>
        <div className="mt-2">
          <PageHeader
            title={e.contactName}
            description={`${e.categoryName} · ${[e.localityName, e.cityName].filter(Boolean).join(', ')} · received ${longDate(e.createdAt)}`}
          />
        </div>
      </div>

      {e.isDemo && (
        <p className="rounded-md border border-warning-500/40 bg-warning-50 px-4 py-3 text-sm text-warning-700">
          Demo row — no database attached. Not a real customer.
        </p>
      )}

      {e.spamScore >= 50 && (
        <p className="rounded-md border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          Spam score {e.spamScore}/100. Held back from routing — plan §12 names lead quality
          as the top risk, so this is deliberately not a soft signal.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <Panel className="p-5">
          <h2 className="font-display text-lg text-ink-900">What they asked for</h2>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Row label="Event">{titleCase(e.eventType)}</Row>
            <Row label="Date">
              {e.eventDate ? longDate(e.eventDate) : e.dateFlexible ? 'Not fixed' : '—'}
            </Row>
            <Row label="Guests">{e.guestCount ? String(e.guestCount) : '—'}</Row>
            <Row label="Budget">{e.budgetLabel ?? '—'}</Row>
            <Row label="Source">{e.source}</Row>
            <Row label="Status">
              <Pill tone={e.status === 'routed' ? 'green' : e.status === 'spam' ? 'red' : 'amber'}>
                {e.status.replace(/_/g, ' ')}
              </Pill>
            </Row>
          </dl>

          {e.stylePreferences.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
                Styles asked for
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {e.stylePreferences.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-ink-200 px-3 py-1 text-xs text-ink-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {e.message && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
                Their message
              </p>
              <p className="mt-2 border-l-2 border-ink-200 pl-4 leading-relaxed text-ink-700">
                {e.message}
              </p>
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-lg text-ink-900">Contact</h2>
          <p className="mt-1 text-xs text-ink-500">
            Unmasked for staff. Vendors see this through `vendor_leads`, and only once the lead
            state permits it (plan §6).
          </p>

          <dl className="mt-4 space-y-4">
            <Row label="Name">{e.contactName}</Row>
            <Row label="Phone">
              <a href={`tel:${e.contactPhone}`} className="text-primary-700 hover:underline">
                {e.contactPhone}
              </a>
            </Row>
            <Row label="Email">
              {e.contactEmail ? (
                <a href={`mailto:${e.contactEmail}`} className="text-primary-700 hover:underline">
                  {e.contactEmail}
                </a>
              ) : (
                '—'
              )}
            </Row>
          </dl>
        </Panel>
      </div>

      <Panel className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-ink-900">
            Routed to {e.routedVendors.length}{' '}
            {e.routedVendors.length === 1 ? 'vendor' : 'vendors'}
          </h2>
          <p className="text-xs text-ink-500">
            Cap of five is a database constraint, not a setting
          </p>
        </div>

        {e.routedVendors.length === 0 ? (
          <p className="mt-4 text-sm text-ink-600">
            {e.status === 'pending_otp'
              ? 'Never verified, so it was never sent. No vendor was charged a credit for it.'
              : 'Not routed.'}
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-ink-100">
            {e.routedVendors.map((v) => (
              <li key={v.vendorSlug} className="flex flex-wrap items-center gap-4 py-3">
                <span className="w-6 shrink-0 font-display text-lg text-ink-300">
                  {v.routedSeq}
                </span>
                <Link
                  href={`/admin/vendors/${v.vendorSlug}`}
                  className="flex-1 font-medium text-ink-900 hover:text-primary-700"
                >
                  {v.vendorName}
                </Link>
                <LeadPill status={v.status} />
                <span className="w-full text-xs text-ink-500 sm:w-auto">
                  {[
                    v.viewedAt && `opened ${shortDate(v.viewedAt)}`,
                    v.respondedAt && `replied ${shortDate(v.respondedAt)}`,
                    v.quotedAt && `quoted ${shortDate(v.quotedAt)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'no activity'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}

function LeadPill({ status }: { status: string }) {
  const tone: Record<string, 'green' | 'amber' | 'red' | 'neutral' | 'blue'> = {
    routed: 'neutral',
    viewed: 'blue',
    responded: 'green',
    quoted: 'green',
    converted: 'green',
    expired: 'red',
  }
  return <Pill tone={tone[status] ?? 'neutral'}>{status}</Pill>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">{label}</dt>
      <dd className="mt-1 text-ink-900">{children}</dd>
    </div>
  )
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

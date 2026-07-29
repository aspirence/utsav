import type { Metadata } from 'next'
import Link from 'next/link'

import { formatPaise } from '@utsava/db'
import { Badge, Card, CardBody } from '@utsava/ui'

import { getPartnerQuotes, getQuotableLeads, type PartnerQuote } from '@/lib/quote-queries'

import { QuoteForm, QuoteRowActions } from './quote-form'

export const metadata: Metadata = {
  title: 'Quotes · Partner dashboard',
  robots: { index: false, follow: false },
}

/**
 * The quote pipeline. Plan §2 Should-tier ("quotes", Jul 2027) and plan §14, where
 * quoting ships alongside escrow because one is what the other is made of.
 *
 * The states shown here are the vendor's half of a two-sided machine. A vendor moves a
 * quote draft → sent → withdrawn; only the customer can move it to accepted, and they do
 * it through public.accept_quote(), which creates the booking and converts the lead in
 * one transaction. Nothing on this screen can manufacture a booking.
 */

const GROUPS: Record<string, PartnerQuote['status'][]> = {
  draft: ['draft'],
  sent: ['sent'],
  accepted: ['accepted'],
  closed: ['rejected', 'expired', 'withdrawn'],
}

export default async function PartnerQuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const requested = typeof params.status === 'string' ? params.status : 'sent'
  const filter = requested in GROUPS ? requested : 'sent'
  const compose = typeof params.compose === 'string' ? params.compose : null

  const [quotes, leads] = await Promise.all([getPartnerQuotes(), getQuotableLeads()])

  const shown = quotes.filter((q) => (GROUPS[filter] ?? []).includes(q.status))

  const outstanding = quotes.filter((q) => q.status === 'sent')
  const inPlay = outstanding.reduce((sum, q) => sum + q.total, 0)
  const advanceInPlay = outstanding.reduce((sum, q) => sum + q.advanceAmount, 0)

  const tabs = [
    { key: 'sent', label: 'With customers', count: countOf(quotes, 'sent') },
    { key: 'draft', label: 'Drafts', count: countOf(quotes, 'draft') },
    { key: 'accepted', label: 'Accepted', count: countOf(quotes, 'accepted') },
    { key: 'closed', label: 'Closed', count: countOf(quotes, 'closed') },
  ]

  // IST, not UTC: between midnight and 05:30 IST the UTC date is still yesterday, which
  // would date-stamp a quote a day behind for the vendor writing it.
  const todayIst = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-ink-900">Quotes</h2>
          <p className="mt-1 text-sm text-ink-600">
            {outstanding.length === 0
              ? 'Nothing is with a customer right now.'
              : `${outstanding.length} quote${outstanding.length === 1 ? '' : 's'} with customers, ` +
                `${formatPaise(inPlay)} in play — ${formatPaise(advanceInPlay)} of it as advances.`}
          </p>
        </div>

        <Link
          href={
            compose
              ? `/partner/dashboard/quotes?status=${filter}`
              : `/partner/dashboard/quotes?status=${filter}&compose=1`
          }
          className={
            compose
              ? 'inline-flex h-11 items-center rounded-lg border border-ink-200 bg-surface-raised px-5 text-sm font-medium text-ink-800 hover:border-ink-300'
              : 'inline-flex h-11 items-center rounded-lg bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700'
          }
        >
          {compose ? 'Close' : 'Write a quote'}
        </Link>
      </div>

      {compose && (
        <QuoteForm
          leads={leads}
          today={todayIst}
          {...(leads.some((l) => l.leadId === compose) ? { defaultLeadId: compose } : {})}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/partner/dashboard/quotes?status=${tab.key}`}
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
            <p className="font-display text-lg text-ink-900">{EMPTY_COPY[filter]?.title}</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-600">
              {EMPTY_COPY[filter]?.body}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((quote) => (
            <QuoteRow key={quote.id} quote={quote} />
          ))}
        </div>
      )}

      <Card className="border-ink-200 bg-surface-sunken">
        <CardBody>
          <p className="text-sm text-ink-600">
            <strong className="font-semibold text-ink-800">How acceptance works.</strong> When a
            customer accepts, Utsava creates the booking and asks them for the advance only —
            never the full amount. The balance stays with them until you have delivered. You
            cannot accept on their behalf, and neither can we.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

function QuoteRow({ quote }: { quote: PartnerQuote }) {
  const balance = Math.max(0, quote.total - quote.advanceAmount)
  const expiring =
    quote.status === 'sent' &&
    quote.validUntil != null &&
    new Date(quote.validUntil).getTime() - Date.now() < 3 * 86_400_000

  return (
    <Card className={expiring ? 'border-warning-500/40' : undefined}>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg text-ink-900">{quote.title}</h3>
              <Badge tone={toneFor(quote.status)} className="capitalize">
                {quote.status}
              </Badge>
            </div>

            <p className="mt-1 text-sm text-ink-600">
              {quote.customerLabel}
              {quote.eventType ? ` · ${quote.eventType.replace(/_/g, ' ')}` : ''}
              {quote.eventDate ? ` · ${formatDay(quote.eventDate)}` : ''}
              {` · ${quote.lineItems.length} line${quote.lineItems.length === 1 ? '' : 's'}`}
            </p>

            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">Total</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-ink-900">
                  {formatPaise(quote.total)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">
                  Advance{quote.advancePct == null ? '' : ` (${quote.advancePct}%)`}
                </dt>
                <dd className="mt-0.5 font-medium tabular-nums text-ink-900">
                  {formatPaise(quote.advanceAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">Balance later</dt>
                <dd className="mt-0.5 tabular-nums text-ink-700">{formatPaise(balance)}</dd>
              </div>
              {quote.taxAmount > 0 && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-500">Of which GST</dt>
                  <dd className="mt-0.5 tabular-nums text-ink-700">
                    {formatPaise(quote.taxAmount)}
                  </dd>
                </div>
              )}
            </dl>

            <p className="mt-3 text-xs text-ink-500">
              {quote.sentAt
                ? `Sent ${formatDay(quote.sentAt)}`
                : `Drafted ${formatDay(quote.createdAt)}`}
              {quote.validUntil ? ` · price held until ${formatDay(quote.validUntil)}` : ''}
              {quote.acceptedAt ? ` · accepted ${formatDay(quote.acceptedAt)}` : ''}
            </p>

            {expiring && (
              <p className="mt-2 text-xs font-medium text-warning-700">
                This price expires within three days. app.accept_quote() refuses an expired
                quote, so send a fresh one if you still want the job.
              </p>
            )}
          </div>

          <div className="shrink-0">
            <QuoteRowActions quoteId={quote.id} status={quote.status} />
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

const EMPTY_COPY: Record<string, { title: string; body: string }> = {
  sent: {
    title: 'No quotes with customers',
    body: 'Once you send a quote it appears here until the customer accepts it, it expires, or you withdraw it.',
  },
  draft: {
    title: 'No drafts',
    body: 'Drafts are private to you. Start one and it stays here, unseen, until you send it.',
  },
  accepted: {
    title: 'Nothing accepted yet',
    body: 'An accepted quote becomes a booking with the advance held in escrow. It will show up here the moment the customer accepts.',
  },
  closed: {
    title: 'Nothing closed',
    body: 'Withdrawn, rejected and expired quotes collect here so you can see what pricing did not land.',
  },
}

function countOf(quotes: PartnerQuote[], group: string): number {
  const statuses = GROUPS[group] ?? []
  return quotes.filter((q) => statuses.includes(q.status)).length
}

function toneFor(status: PartnerQuote['status']): 'neutral' | 'primary' | 'success' | 'danger' {
  if (status === 'accepted') return 'success'
  if (status === 'sent') return 'primary'
  if (status === 'rejected') return 'danger'
  return 'neutral'
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

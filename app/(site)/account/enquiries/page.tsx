import Link from 'next/link'

import { getMyEnquiries } from '@/lib/account-queries'

/**
 * Sent enquiries, each with the vendors it went to.
 *
 * This is the screen that makes an account worth having. Plan §1 promises "we tell you
 * exactly who received your enquiry" and "at most five vendors reply" - and until this page
 * existed, both were claims made on the confirmation screen and then never kept. The
 * enquiry disappeared the moment that screen closed.
 *
 * The vendor list is ordered by routing sequence, not by who replied first. `routed_seq` is
 * what the five-vendor cap counts (a UNIQUE constraint on enquiry × seq, plan §4), so
 * showing it in order means the list does not reshuffle under the reader as replies land.
 */
export default async function EnquiriesPage() {
  const enquiries = await getMyEnquiries()

  if (enquiries.length === 0) {
    return (
      <div className="max-w-prose">
        <h2 className="font-display text-ink-900 text-xl">No enquiries yet</h2>
        <p className="text-ink-700 mt-3 leading-relaxed">
          When you send one, it appears here with the five vendors it went to and what each of them
          did with it.
        </p>
        <Link
          href="/lucknow/photography"
          className="bg-primary-600 hover:bg-primary-700 mt-6 inline-flex items-center gap-2 rounded-md px-5 py-3 font-medium text-white transition-colors"
        >
          Find photographers
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {enquiries.map((e) => (
        <article key={e.id} className="border-ink-100 bg-surface-raised rounded-2xl border p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-ink-900 text-lg">
                {e.categoryName ?? 'Vendors'}
                {e.cityName ? ` in ${e.cityName}` : ''}
              </h2>
              <p className="text-ink-600 mt-1 text-sm">
                {[
                  e.eventDate ? formatDate(e.eventDate) : 'Date to be decided',
                  e.budgetLabel,
                  `Sent ${formatDate(e.createdAt)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <EnquiryStatus status={e.status} />
          </div>

          {e.message && (
            <p className="border-ink-200 text-ink-700 mt-4 border-l-2 pl-4 text-sm leading-relaxed">
              {e.message}
            </p>
          )}

          <div className="border-ink-100 mt-6 border-t pt-5">
            <p className="text-ink-500 text-xs font-semibold tracking-[0.14em] uppercase">
              {/* Stated as a count, because the count is the promise. */}
              Sent to {e.vendors.length} {e.vendors.length === 1 ? 'vendor' : 'vendors'}
              {e.vendors.length < 5 && ' — never more than five'}
            </p>

            {e.vendors.length === 0 ? (
              <p className="text-ink-600 mt-3 text-sm">
                Not routed yet. This happens within a few minutes of verifying your number.
              </p>
            ) : (
              <ul className="divide-ink-100 mt-4 divide-y">
                {e.vendors.map((v) => (
                  <li key={v.vendorSlug} className="flex items-center justify-between gap-4 py-3">
                    <Link
                      href={`/vendor/${v.vendorSlug}`}
                      className="text-ink-900 hover:text-primary-700 font-medium"
                    >
                      {v.vendorName}
                    </Link>
                    <LeadStatus status={v.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

/**
 * Enquiry status in the customer's terms, not the enum's.
 *
 * `pending_otp` is the one that matters: it means the enquiry exists but has gone nowhere,
 * because the OTP was never entered. The enum name says nothing to the person who has to
 * act, so the label tells them what to do.
 */
function EnquiryStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_otp: {
      label: 'Not verified — nothing sent',
      cls: 'border-warning-500/40 bg-warning-50 text-warning-700',
    },
    verified: { label: 'Verified', cls: 'border-ink-200 bg-surface text-ink-700' },
    routed: {
      label: 'Sent to vendors',
      cls: 'border-success-500/40 bg-success-50 text-success-700',
    },
    closed: { label: 'Closed', cls: 'border-ink-200 bg-surface text-ink-600' },
    spam: { label: 'Held for review', cls: 'border-ink-200 bg-surface text-ink-600' },
  }
  const s = map[status] ?? { label: status, cls: 'border-ink-200 bg-surface text-ink-700' }

  return (
    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

/** Per-vendor lead state. The sequence a customer actually cares about is did they reply. */
function LeadStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    routed: { label: 'Not opened yet', cls: 'text-ink-500' },
    viewed: { label: 'Opened it', cls: 'text-ink-600' },
    responded: { label: 'Replied', cls: 'text-success-700' },
    quoted: { label: 'Sent a quote', cls: 'text-success-700 font-medium' },
    converted: { label: 'Booked', cls: 'text-primary-700 font-medium' },
    expired: { label: 'Did not reply in time', cls: 'text-ink-400' },
  }
  const s = map[status] ?? { label: status, cls: 'text-ink-600' }
  return <span className={`shrink-0 text-sm ${s.cls}`}>{s.label}</span>
}

/** en-IN, because the audience is Indian and 1st May is not May 1st here. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

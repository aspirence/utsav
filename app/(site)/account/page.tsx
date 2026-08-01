import Link from 'next/link'

import {
  getMyEnquiries,
  getMyEvents,
  getMyInvitationOrders,
  getMyShortlist,
} from '@/lib/account-queries'
import { getProfile, getSessionUser } from '@/lib/auth'

/**
 * Account overview.
 *
 * Deliberately thin. This is the end of chunk one - the auth spine - and the things this
 * page will eventually summarise (events, shortlists, enquiries, bookings) are chunks two
 * and three. Every table behind them already exists in the schema with its RLS policies;
 * what is missing is the UI, so this says so rather than showing four empty boxes that
 * look like a bug.
 *
 * Deliberately absent: any count read off a table whose page is not built. A "0 shortlists"
 * tile that never changes because nothing can write to it is worse than no tile.
 */
export default async function AccountPage() {
  // All four in parallel. They are four independent RLS-scoped reads against one connection,
  // so waterfalling them would cost four round trips to say the same thing.
  const [user, profile, enquiries, shortlist, events, invitations] = await Promise.all([
    getSessionUser(),
    getProfile(),
    getMyEnquiries(),
    getMyShortlist(),
    getMyEvents(),
    getMyInvitationOrders(),
  ])

  const counts = {
    enquiries: enquiries.length,
    shortlist: shortlist.length,
    events: events.filter((e) => !e.isArchived).length,
    invitations: invitations.length,
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div>
        <h2 className="font-display text-xl text-ink-900">
          {profile?.fullName ? `Hello, ${profile.fullName}.` : 'You are signed in.'}
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-700">
          Your number is your account — there is no password to keep. Anything you enquire
          about from now on is tied to it, so you can come back to the replies from any
          phone or laptop.
        </p>

        <dl className="mt-8 space-y-4 border-t border-ink-100 pt-6">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
              Mobile
            </dt>
            <dd className="mt-1 text-ink-900">{profile?.phone ?? user?.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
              Email
            </dt>
            <dd className="mt-1 text-ink-900">
              {profile?.email ?? user?.email ?? (
                <span className="text-ink-500">Not added yet</span>
              )}
            </dd>
          </div>
        </dl>

        <Link
          href="/lucknow/photography"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary-600 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-700"
        >
          Browse photographers
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      {/* Counts, now that there are screens behind them. A tile is only worth showing when
          tapping it goes somewhere - a "0 bookings" tile whose page does not exist reads as
          a fault rather than as a fact, so bookings and reviews stay in the note below. */}
      <aside className="rounded-2xl border border-ink-100 bg-surface-sunken/50 p-6">
        <h3 className="font-display text-lg text-ink-900">Your planning</h3>

        <ul className="mt-5 space-y-1">
          {[
            { href: '/account/enquiries', label: 'Enquiries sent', n: counts.enquiries },
            { href: '/account/shortlists', label: 'Vendors saved', n: counts.shortlist },
            { href: '/account/events', label: 'Events', n: counts.events },
            // Counts orders, not designs browsed — the number that means something is how many
            // cards this person actually has.
            { href: '/account/invitations', label: 'Invitation cards', n: counts.invitations },
          ].map((row) => (
            <li key={row.href}>
              <Link
                href={row.href}
                className="flex items-center justify-between gap-4 border-b border-ink-100 py-3 text-ink-800 transition-colors hover:text-primary-700"
              >
                <span>{row.label}</span>
                <span className="font-display text-xl text-ink-900">{row.n}</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-sm leading-relaxed text-ink-600">
          Bookings and reviews arrive with escrow — plan §14. A review needs a completed
          booking behind it, which is why they come together.
        </p>
      </aside>
    </div>
  )
}

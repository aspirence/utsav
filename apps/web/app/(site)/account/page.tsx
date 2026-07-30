import Link from 'next/link'

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
  const [user, profile] = await Promise.all([getSessionUser(), getProfile()])

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

      {/* What is coming, stated plainly. The tables and policies for all of it are already
          in supabase/migrations - only these screens are outstanding. */}
      <aside className="rounded-2xl border border-ink-100 bg-surface-sunken/50 p-6">
        <h3 className="font-display text-lg text-ink-900">Not built yet</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          The database already holds all of this, with the policies that keep it yours. The
          screens are next.
        </p>
        <ul className="mt-5 space-y-3 text-sm">
          {[
            ['Events', 'Your wedding, with its date, city and budget'],
            ['Shortlists', 'Vendors you saved, kept per event'],
            ['Enquiries', 'Who replied, who quoted, and the five it went to'],
            ['Checklist', 'What to book and when'],
            ['Bookings & reviews', 'After escrow ships — plan §14'],
          ].map(([title, detail]) => (
            <li key={title} className="border-b border-ink-100 pb-3 last:border-0 last:pb-0">
              <span className="font-medium text-ink-900">{title}</span>
              <span className="mt-0.5 block text-ink-600">{detail}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

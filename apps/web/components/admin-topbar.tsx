import Link from 'next/link'

import { signOutStaff } from '@/app/admin/login/actions'
import { roleLabel, type StaffIdentity } from '@/lib/admin-auth'

/**
 * The console's top bar: search, who you are, and the way out.
 *
 * IT USED TO LIE. Before there was a login, this rendered `admin@utsava.test` / `super admin`
 * / an `SA` avatar as hardcoded strings — a bar that told you were signed in as someone when
 * nobody was signed in at all. It now renders the session, or says plainly that there isn't one.
 *
 * A Server Component. The search box is a real GET form, so it works before any JavaScript
 * arrives and the result is a URL a moderator can bookmark or paste into a ticket. A controlled
 * input with a debounce would be more fashionable and less useful. Sign-out is a form posting
 * to a Server Action, for the same reason.
 *
 * NO NOTIFICATION BELL. The references have one and one here would be fiction: there is no
 * notification store for staff, so it could only render an empty tray or an invented count. The
 * queues carry their own counts, which is where a moderator is going anyway.
 */
export function AdminTopBar({ identity }: { identity: StaffIdentity | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-6">
        {/* method=get, so submitting puts the query in the URL. /admin/enquiries reads it. */}
        <form action="/admin/enquiries" method="get" className="min-w-0 flex-1">
          <label htmlFor="admin-q" className="sr-only">
            Search enquiries
          </label>
          <div className="flex max-w-md items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 focus-within:border-ink-400">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              className="h-4 w-4 shrink-0 text-ink-500"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              id="admin-q"
              name="q"
              type="search"
              placeholder="Search enquiries by name or number"
              className="w-full bg-transparent py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400"
            />
          </div>
        </form>

        {identity ? (
          <>
            <span className="hidden shrink-0 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700 ring-1 ring-success-100 sm:inline">
              Live data
            </span>

            <div className="flex shrink-0 items-center gap-2.5">
              <span className="hidden text-right text-xs leading-tight sm:block">
                <span className="block max-w-[14rem] truncate font-medium text-ink-900">
                  {identity.fullName ?? identity.email ?? identity.phone ?? 'Signed in'}
                </span>
                <span className="block text-ink-500">{roleLabel(identity.role)}</span>
              </span>
              {/* Initials, not a photo: there is no staff avatar in the schema, and a
                  placeholder headshot would imply one exists. */}
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white"
                aria-hidden="true"
              >
                {initials(identity)}
              </span>
            </div>

            <form action={signOutStaff} className="shrink-0">
              <button
                type="submit"
                className="rounded-md border border-ink-200 px-3 py-2 text-xs font-medium text-ink-700 transition-colors hover:border-ink-300 hover:text-ink-900"
              >
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            {/* Demo mode. The badge is not decoration: this console shares an origin with the
                customer site, and saying "nothing you do here is written" in the chrome is
                cheaper than someone spending ten minutes wondering why a suspension did not
                stick. */}
            <span className="hidden shrink-0 rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700 sm:inline">
              Demo data — no database attached
            </span>
            <Link
              href="/admin/login"
              className="shrink-0 rounded-md border border-ink-200 px-3 py-2 text-xs font-medium text-ink-700 transition-colors hover:border-ink-300 hover:text-ink-900"
            >
              Staff log in
            </Link>
          </>
        )}

        <Link
          href="/"
          className="hidden shrink-0 text-xs text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline lg:inline"
        >
          View site ↗
        </Link>
      </div>
    </header>
  )
}

/**
 * Up to two initials from whatever the account actually has.
 *
 * Falls back through name → email → phone, because a staff account created in the Supabase
 * dashboard may well have no profile name yet, and an empty circle reads as a broken avatar
 * rather than as missing data.
 */
function initials(identity: StaffIdentity): string {
  const name = identity.fullName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
    return (first + last).toUpperCase()
  }

  const email = identity.email
  if (email) return email.slice(0, 2).toUpperCase()

  // Last two digits of the number — more distinguishing than the country code.
  const phone = identity.phone
  if (phone) return phone.slice(-2)

  return '??'
}

import Link from 'next/link'

/**
 * The console's top bar: search, the environment badge, and who you are signed in as.
 *
 * A Server Component. It renders no interactive state of its own - the search box is a real
 * GET form, which means it works before any JavaScript arrives and the result is a URL a
 * moderator can bookmark or paste into a ticket. A controlled input with a debounce would be
 * more fashionable and less useful.
 *
 * NO NOTIFICATION BELL. The references have one, and one here would be a lie: there is no
 * notification store for staff, so it could only ever render an empty tray or a fake count.
 * The queues themselves carry their counts, which is where a moderator is going anyway.
 *
 * The environment badge is not decoration either. This console shares an origin with the
 * customer site and, with no Supabase attached, serves demo data - saying so in the chrome is
 * cheaper than someone spending ten minutes wondering why a suspension did not stick.
 */
export function AdminTopBar() {
  const live = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)

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

        <span
          className={
            'hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline ' +
            (live
              ? 'bg-success-50 text-success-700 ring-1 ring-success-100'
              : 'bg-warning-50 text-warning-700')
          }
        >
          {live ? 'Live data' : 'Demo data — no database attached'}
        </span>

        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden text-right text-xs leading-tight sm:block">
            <span className="block font-medium text-ink-900">admin@utsava.test</span>
            <span className="block text-ink-500">super admin</span>
          </span>
          {/* Initials, not an avatar image: there is no staff profile photo in the schema, and
              a placeholder headshot would imply one exists. */}
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            SA
          </span>
        </div>

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

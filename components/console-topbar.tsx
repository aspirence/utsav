import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The workspace top bar: search, a status badge, who you are, and the way out.
 *
 * Shared by the staff console, the partner dashboard and the customer account, which is the
 * point — plan §3's one human wears several hats, and until now each hat came with a different
 * chrome. What changes between them is the content, not the furniture.
 *
 * A Server Component. The search box is a real GET form, so it works before any JavaScript
 * arrives and the result is a URL somebody can bookmark or paste into a ticket; a controlled
 * input with a debounce would be more fashionable and less useful. Sign-out is a form posting to
 * a Server Action, for the same reason.
 *
 * NO NOTIFICATION BELL. The references have one and one here would be fiction: there is no
 * notification store, so it could only render an empty tray or an invented count. The queues
 * carry their own counts, which is where the reader is going anyway.
 */

export interface ConsoleTopBarProps {
  /** A GET form. Omitted where the workspace has nothing worth searching. */
  search?: { action: string; placeholder: string; label: string }
  /** Right-hand status pill — "Live data", a listing status, whatever the surface needs. */
  badge?: { text: string; tone: 'ok' | 'warn' } | undefined
  /** Two lines: who, and in what capacity. */
  identity: { name: string; detail: string; initials: string }
  /** The dashboard switcher, built by the layout because it needs database reads. */
  switcher?: ReactNode
  /** Posts to whichever sign-out the surface belongs to. */
  signOut: () => Promise<void>
  /** Where "View site" points. Absent inside the public site, where it would point at itself. */
  viewSiteHref?: string
}

export function ConsoleTopBar({
  search,
  badge,
  identity,
  switcher,
  signOut,
  viewSiteHref,
}: ConsoleTopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-6">
        {search ? (
          // method=get, so submitting puts the query in the URL and the target page reads it.
          <form action={search.action} method="get" className="min-w-0 flex-1">
            <label htmlFor="console-q" className="sr-only">
              {search.label}
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
                id="console-q"
                name="q"
                type="search"
                placeholder={search.placeholder}
                className="w-full bg-transparent py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400"
              />
            </div>
          </form>
        ) : (
          // Holds the row's shape so the identity block stays right-aligned rather than
          // sliding into the middle on the surfaces with nothing to search.
          <div className="min-w-0 flex-1" />
        )}

        {/* Not decoration on the console: a local session means every screen is a fixture and
            nothing is written, so a suspension that quietly went nowhere would otherwise look
            like it worked. On the partner surface it carries the listing's status instead. */}
        {badge && (
          <span
            className={
              'hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline ' +
              (badge.tone === 'warn'
                ? 'bg-warning-50 text-warning-700'
                : 'bg-success-50 text-success-700 ring-1 ring-success-100')
            }
          >
            {badge.text}
          </span>
        )}

        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden text-right text-xs leading-tight sm:block">
            <span className="block max-w-[14rem] truncate font-medium text-ink-900">
              {identity.name}
            </span>
            <span className="block text-ink-500">{identity.detail}</span>
          </span>
          {/* Initials, not a photo: there is no avatar anywhere in the schema, and a
              placeholder headshot would imply one exists. */}
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {identity.initials}
          </span>
        </div>

        {switcher}

        <form action={signOut} className="shrink-0">
          <button
            type="submit"
            className="rounded-md border border-ink-200 px-3 py-2 text-xs font-medium text-ink-700 transition-colors hover:border-ink-300 hover:text-ink-900"
          >
            Sign out
          </button>
        </form>

        {viewSiteHref && (
          <Link
            href={viewSiteHref}
            className="hidden shrink-0 text-xs text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline lg:inline"
          >
            View site ↗
          </Link>
        )}
      </div>
    </header>
  )
}

/**
 * Up to two initials from whatever the account actually has.
 *
 * Falls through name → email → phone, because an account created by the first OTP has no name at
 * all and an empty circle reads as a broken avatar rather than as missing data.
 */
export function initialsFrom(source: {
  fullName?: string | null
  email?: string | null
  phone?: string | null
}): string {
  const name = source.fullName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
    return (first + last).toUpperCase()
  }

  if (source.email) return source.email.slice(0, 2).toUpperCase()
  // Last two digits of the number — more distinguishing than the country code.
  if (source.phone) return source.phone.slice(-2)
  return '??'
}

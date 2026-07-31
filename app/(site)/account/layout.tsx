import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'

import { Container } from '@/components/ui'

import { requireUser } from '@/lib/auth'

import { SignOutButton } from './sign-out-button'

/**
 * The customer account shell.
 *
 * `requireUser` here rather than in each page: the whole subtree is private, and a gate
 * repeated per route is a gate that eventually gets forgotten on one of them. It redirects
 * to /login carrying the path being guarded, so signing in returns you to what you were
 * reaching for.
 *
 * That said - this is a convenience, not the boundary. Plan §6: "RLS is the authorization
 * model - there is no trusted API between clients and Postgres for reads." Every page below
 * reads through the caller's own session, so a signed-in user who somehow reached a page
 * they have no rows for sees an empty page rather than someone else's data.
 *
 * noindex and no-store: this is the one part of the customer site that shows PII.
 */
export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
}

const TABS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/enquiries', label: 'Enquiries' },
  { href: '/account/shortlists', label: 'Saved' },
  { href: '/account/events', label: 'Events' },
  { href: '/account/profile', label: 'Profile' },
]

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware; Next gives a Server Component no way to read its own path. Falling
  // back to /account keeps the gate working if the header is ever absent - it just returns
  // you to the overview instead of the exact page.
  const path = (await headers()).get('x-pathname') ?? '/account'
  await requireUser(path.startsWith('/account') ? path : '/account')

  return (
    <Container className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink-100 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-700">
            Your account
          </p>
          <h1 className="mt-2 text-3xl leading-tight text-ink-900 sm:text-4xl">
            Everything in one place
          </h1>
        </div>
        <SignOutButton />
      </div>

      <nav aria-label="Account" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-full border border-ink-200 bg-surface-raised px-4 py-2 text-sm text-ink-700 transition-colors hover:border-ink-300 hover:text-ink-900"
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-10">{children}</div>
    </Container>
  )
}

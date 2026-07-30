import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { default: 'Utsava Admin', template: '%s · Utsava Admin' },
  // Plan §3 keeps the staff console off the public web. It now shares an origin with the
  // customer site, so this — plus the Disallow in robots.ts and the X-Robots-Tag header
  // set by middleware.ts — is what keeps it out of the index.
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Nothing under /admin is ever cached, and this is not a performance trade.
 *
 * Without it, the pages that do not happen to read a cookie get prerendered at build time —
 * the build output had /admin, /admin/leads and /admin/pipeline all marked static. A moderator
 * reading "awaiting OTP: 3" would be reading a number from whenever the last deploy ran, and
 * the dashboard's "this week" bucket would mean the week the build happened, permanently.
 *
 * It matters more now that there is a login: a cached page is a page rendered for whoever
 * asked first, and this one renders the signed-in staff member's own name and role.
 */
export const dynamic = 'force-dynamic'

/**
 * The bare /admin shell. Metadata and caching policy, and nothing else.
 *
 * THE CHROME AND THE GUARD ARE ONE LEVEL DOWN, in (console)/layout.tsx. That split exists for
 * one reason: /admin/login has to be reachable *without* passing the staff gate, and a gate in
 * this file would run on the login page too — redirecting to a page that redirects to itself.
 *
 * Route groups do not appear in the URL, so /admin, /admin/vendors and the rest are unmoved.
 * The only difference is which layout wraps them.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}

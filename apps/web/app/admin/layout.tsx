import type { Metadata } from 'next'

import { AdminSidebar } from '@/components/admin-sidebar'
import { AdminTopBar } from '@/components/admin-topbar'

export const metadata: Metadata = {
  title: { default: 'Utsava Admin', template: '%s · Utsava Admin' },
  // Plan §3 keeps the staff console off the public web. It now shares an origin with the
  // customer site, so this — plus the Disallow in robots.ts and the X-Robots-Tag header
  // set by middleware.ts — is what keeps it out of the index.
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Nothing in the console is ever cached, and this is not a performance trade.
 *
 * Without it, the pages that do not happen to read a cookie get prerendered at build time -
 * the build output had /admin, /admin/leads and /admin/pipeline all marked static. A moderator
 * reading "awaiting OTP: 3" would be reading a number from whenever the last deploy ran, and
 * the dashboard's "this week" bucket would mean the week the build happened, permanently.
 *
 * A staff console has a handful of users behind an IP allowlist. There is nothing to gain from
 * caching it and a wrong number to lose.
 */
export const dynamic = 'force-dynamic'

/**
 * Staff console shell, nested under the root document layout at /admin.
 *
 * Plan §3 specifies "a separate deploy, SSO + IP allowlist, append-only audit log". It now
 * lives on the same origin as the customer site by explicit product decision, so the
 * network-level isolation the plan assumed is replaced by:
 *
 *   · middleware.ts — IP allowlist on /admin/* via ADMIN_IP_ALLOWLIST
 *   · robots.ts + the metadata above — never indexed
 *   · public.staff_roles + RLS — the real authorization boundary, unchanged
 *
 * LAYOUT. A fixed dark rail on the left, a light working plane on the right. The rail was a
 * horizontal nav strip; six sections plus a seventh later do not fit across a laptop without
 * scrolling, and a rail also gives the console an unmistakable silhouette — there is never a
 * moment's doubt about which surface you are on when you click "suspend".
 *
 * `lg:pl-60` on the plane rather than a flex row, because the rail is `fixed`: a
 * position-fixed sidebar is out of flow, so the content has to be inset by hand. A flex row
 * would work too but scrolls the rail away with the page, and a nav that scrolls off is one
 * you have to scroll back for.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // Denser type than the customer site: a moderator working a queue needs rows per screen,
    // not whitespace. Scoped here so it cannot leak into the public pages.
    <div className="min-h-screen bg-ink-50 text-[0.9375rem]">
      <AdminSidebar />

      <div className="lg:pl-60">
        <AdminTopBar />

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>

        <footer className="mx-auto max-w-[1500px] px-4 pb-8 sm:px-6">
          <p className="border-t border-ink-200 pt-5 text-xs text-ink-500">
            Every action taken here is written to an append-only audit log with your identity
            attached.
          </p>
        </footer>
      </div>
    </div>
  )
}

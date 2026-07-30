import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: { default: 'Utsava Admin', template: '%s · Utsava Admin' },
  // Plan §3 keeps the staff console off the public web. It now shares an origin with the
  // customer site, so this — plus the Disallow in robots.ts and the X-Robots-Tag header
  // set by middleware.ts — is what keeps it out of the index.
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Staff console shell, nested under the root document layout at /admin.
 *
 * Plan §3 specifies "a separate deploy, SSO + IP allowlist, append-only audit log". It
 * now lives on the same origin as the customer site by explicit product decision, so the
 * network-level isolation the plan assumed is replaced by:
 *
 *   · middleware.ts — IP allowlist on /admin/* via ADMIN_IP_ALLOWLIST
 *   · robots.ts + the metadata above — never indexed
 *   · public.staff_roles + RLS — the real authorization boundary, unchanged
 *
 * The chrome is deliberately dark and dense so there is never a moment's doubt about
 * which surface you are looking at when you click "suspend".
 */
const NAV = [
  { href: '/admin', label: 'Launch readiness' },
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/admin/vendors', label: 'Vendors' },
  { href: '/admin/pipeline', label: 'Pipeline' },
  { href: '/admin/enquiries', label: 'Enquiries' },
  { href: '/admin/leads', label: 'Routing health' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // Denser type than the customer site: a moderator working a queue needs rows per
    // screen, not whitespace. Scoped here so it cannot leak into the public pages.
    <div className="min-h-screen bg-ink-50 text-[0.9375rem]">
      <header className="border-b border-ink-800 bg-ink-900">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-5">
          <Link href="/admin" className="font-display text-lg tracking-tight text-white">
            Utsava <span className="text-ink-400">Admin</span>
          </Link>

          <nav aria-label="Sections" className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-ink-300 transition-colors hover:bg-ink-800 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="rounded-full bg-primary-900/60 px-2.5 py-0.5 text-xs font-medium text-primary-200">
              super admin
            </span>
            <span className="hidden text-ink-400 sm:inline">admin@utsava.test</span>
            {/* A way back to the customer site, since they now share an origin. */}
            <Link href="/" className="text-ink-400 underline-offset-2 hover:text-white hover:underline">
              View site ↗
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-7">{children}</main>

      <footer className="border-t border-ink-200 py-5">
        <div className="mx-auto max-w-[1600px] px-5 text-xs text-ink-500">
          Every action taken here is written to an append-only audit log with your identity
          attached.
        </div>
      </footer>
    </div>
  )
}

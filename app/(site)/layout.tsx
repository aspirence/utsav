import { headers } from 'next/headers'

import { BottomNavSpacer } from '@/components/bottom-nav'
import { SiteBottomNav } from '@/components/site-bottom-nav'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/**
 * The customer-facing shell. Lives in a route group, so `(site)` adds nothing to any
 * URL — every public path is exactly what it was before the admin console moved in
 * under /admin.
 *
 * TWO SUBTREES OPT OUT OF THE CHROME: /account and /partner/dashboard. Both now render the
 * workspace shell from components/console-shell.tsx — a full-height dark rail and their own top
 * bar — and stacking the public header and footer around that gives two navigations, two
 * sign-out buttons, and a footer sitting under a fixed sidebar.
 *
 * WHY A PATH CHECK RATHER THAN MOVING THE FILES. Lifting them out of this group into their own
 * would be the tidier shape, and it collides with the routes that stay: `(site)/partner/page.tsx`
 * is the public pitch at /partner and has to keep this chrome, while /partner/dashboard must not.
 * Splitting one path segment across two route groups is the kind of thing that resolves
 * differently between Next versions. A named list of prefixes is duller and says what it does.
 *
 * `x-pathname` is set by middleware.ts — a Server Component has no way to read its own URL. With
 * that header absent the check falls through to rendering the chrome, which is the safe
 * direction: a workspace with an extra header is ugly, a public page with none is broken.
 */
const BARE = ['/account', '/partner/dashboard']

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get('x-pathname') ?? ''
  const bare = BARE.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))

  if (bare) return <>{children}</>

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="focus:bg-ink-900 sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />

      {/*
        After the footer, not inside <main>. The footer has its own dark background that runs to
        the bottom of the page, so padding <main> would leave the bar sitting on top of the
        footer's last row — the legal links and the copyright line, which are exactly the things
        somebody scrolls all the way down to reach.
      */}
      <BottomNavSpacer hideFrom="md" />
      <SiteBottomNav />
    </div>
  )
}

import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/**
 * The customer-facing shell. Lives in a route group, so `(site)` adds nothing to any
 * URL — every public path is exactly what it was before the admin console moved in
 * under /admin.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}

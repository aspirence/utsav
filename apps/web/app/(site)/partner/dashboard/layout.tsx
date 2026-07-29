import type { Metadata } from 'next'
import Link from 'next/link'

import { Badge, Container } from '@utsava/ui'

import { hasSupabaseEnv } from '@/lib/supabase'

export const metadata: Metadata = {
  title: 'Partner dashboard',
  robots: { index: false, follow: false },
}

const NAV = [
  { href: '/partner/dashboard', label: 'Overview' },
  { href: '/partner/dashboard/leads', label: 'Leads' },
  { href: '/partner/dashboard/calendar', label: 'Calendar' },
  { href: '/partner/dashboard/profile', label: 'Profile' },
]

/**
 * Partner PWA shell. Plan §4.1 puts the partner surface inside apps/web rather than a
 * separate deploy — it shares the design system and the session, and plan §4 ships it
 * before the Expo app so the workflows are proven on the web first.
 */
export default function PartnerDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-ink-100 bg-surface-sunken/30">
      <Container className="py-8">
        {!hasSupabaseEnv() && (
          <div className="mb-6 rounded-lg border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-700">
            <strong className="font-semibold">Demo mode.</strong> No Supabase instance is
            connected, so this dashboard is showing a sample inbox. Run{' '}
            <code className="rounded bg-warning-500/10 px-1">pnpm db:start</code> to work
            against real data.
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-ink-500">Partner</p>
            <h1 className="font-display text-2xl text-ink-900">Lightleak Studio</h1>
          </div>
          <Badge tone="success">Listing live</Badge>
        </div>

        <div className="grid gap-8 lg:grid-cols-[190px_1fr]">
          <nav aria-label="Dashboard" className="lg:sticky lg:top-24 lg:self-start">
            <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">{children}</div>
        </div>
      </Container>
    </div>
  )
}

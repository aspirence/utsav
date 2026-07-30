'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

/**
 * The console's left rail.
 *
 * A client component for two reasons and no more: it marks the active section from the
 * pathname, and it collapses on a phone. Everything it renders is a link - no data, no
 * session, nothing that belongs on the server.
 *
 * ACTIVE MATCHING IS EXACT FOR /admin AND PREFIX FOR THE REST. `/admin` is a prefix of every
 * other route, so a plain startsWith would light the dashboard up on every page. The one place
 * that rule bites is a detail route - /admin/vendors/lightleak-studio should keep Vendors lit,
 * which prefix matching gets right.
 */
const NAV: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: '/admin', label: 'Dashboard', icon: <IconGrid /> },
  { href: '/admin/enquiries', label: 'Enquiries', icon: <IconInbox /> },
  { href: '/admin/vendors', label: 'Vendors', icon: <IconStore /> },
  { href: '/admin/moderation', label: 'Moderation', icon: <IconShield /> },
  { href: '/admin/pipeline', label: 'Pipeline', icon: <IconFlow /> },
  { href: '/admin/leads', label: 'Routing health', icon: <IconPulse /> },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  return (
    <>
      {/* Phone: a bar with a toggle. The rail itself is the same markup, slid in. */}
      <div className="flex h-14 items-center gap-3 border-b border-ink-800 bg-ink-900 px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-ink-800"
        >
          <span className="relative block h-3.5 w-5" aria-hidden="true">
            <span className="absolute left-0 top-0 block h-0.5 w-5 bg-current" />
            <span className="absolute left-0 top-1.5 block h-0.5 w-5 bg-current" />
            <span className="absolute bottom-0 left-0 block h-0.5 w-5 bg-current" />
          </span>
        </button>
        <span className="font-display text-base tracking-tight text-white">
          Utsava <span className="text-ink-400">Admin</span>
        </span>
      </div>

      <aside
        className={
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-ink-900 transition-transform duration-300 lg:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <div className="flex h-16 items-center gap-2.5 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-600 font-display text-sm text-white">
            U
          </span>
          <span className="font-display text-base leading-tight tracking-tight text-white">
            Utsava
            <span className="block text-[10px] font-normal uppercase tracking-[0.18em] text-ink-400">
              Admin
            </span>
          </span>
        </div>

        <nav aria-label="Sections" className="mt-3 flex-1 overflow-y-auto px-3">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={
                      'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ' +
                      (active
                        ? // A left bar as well as a fill: aria-current tells assistive tech,
                          // and two visual cues mean the state does not rest on colour alone.
                          'bg-ink-800 text-white shadow-[inset_3px_0_0_0_var(--color-primary-500)]'
                        : 'text-ink-300 hover:bg-ink-800/60 hover:text-white')
                    }
                  >
                    <span className="shrink-0 text-current">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-t border-ink-800 p-3">
          <Link
            href="/"
            className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm text-ink-300 transition-colors hover:bg-ink-800 hover:text-white"
          >
            Visit site
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-ink-950/50 lg:hidden"
        />
      )}
    </>
  )
}

/* Icons. 18px, 1.6 stroke, currentColor - so they take the link's own colour and its
   transition rather than needing an active variant each. */
const S = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'h-[18px] w-[18px]',
  'aria-hidden': true,
}

function IconGrid() {
  return (
    <svg {...S}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function IconInbox() {
  return (
    <svg {...S}>
      <path d="M3 12l2.5-7h13L21 12v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6z" />
      <path d="M3 12h5l1 2h6l1-2h5" />
    </svg>
  )
}

function IconStore() {
  return (
    <svg {...S}>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9" />
      <path d="M9 20v-6h6v6" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg {...S}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function IconFlow() {
  return (
    <svg {...S}>
      <rect x="3" y="4" width="6" height="4" rx="1" />
      <rect x="15" y="10" width="6" height="4" rx="1" />
      <rect x="3" y="16" width="6" height="4" rx="1" />
      <path d="M9 6h3a2 2 0 012 2v2M9 18h3a2 2 0 002-2v-2" />
    </svg>
  )
}

function IconPulse() {
  return (
    <svg {...S}>
      <path d="M3 12h4l2-5 3 10 2-5h7" />
    </svg>
  )
}

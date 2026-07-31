'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { canSee } from '@/lib/admin-roles'
import type { StaffRoleKind } from '@/lib/db'

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
 *
 * THE ROLE FILTER IS COURTESY, NOT SECURITY. It comes from the server as a plain string, and a
 * client component is the wrong place to enforce anything - anyone can edit what arrives here.
 * Every page behind these links is governed by its own RLS policies, so a hand-typed URL
 * reaches a screen with no rows rather than someone else's data. Hiding a link the caller
 * cannot use saves them a pointless click; it is not what stops them.
 */
/**
 * Grouped, not a flat list of eight.
 *
 * The grouping is by what a person is doing, not by table: Today is the queue you work through,
 * Catalogue is what you are selling, Oversight is what you check. Eight identical rows make a
 * moderator read all eight every time; three short lists mean they read one.
 *
 * Group labels are ink-400, not ink-500. Measured rather than picked: on the ink-900 rail,
 * ink-500 comes in at 3.26:1 and these are 11px, which needs 4.5. ink-400 is 5.13:1.
 */
const GROUPS: {
  label: string
  items: { href: string; label: string; icon: React.ReactNode }[]
}[] = [
  {
    label: 'Today',
    items: [
      { href: '/admin', label: 'Dashboard', icon: <IconGrid /> },
      { href: '/admin/enquiries', label: 'Enquiries', icon: <IconInbox /> },
      { href: '/admin/orders', label: 'Orders', icon: <IconReceipt /> },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { href: '/admin/vendors', label: 'Vendors', icon: <IconStore /> },
      { href: '/admin/templates', label: 'Invitations', icon: <IconCard /> },
    ],
  },
  {
    label: 'Oversight',
    items: [
      { href: '/admin/moderation', label: 'Moderation', icon: <IconShield /> },
      { href: '/admin/pipeline', label: 'Pipeline', icon: <IconFlow /> },
      { href: '/admin/leads', label: 'Routing health', icon: <IconPulse /> },
    ],
  },
]

export function AdminSidebar({ role }: { role: StaffRoleKind | null }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  // A null role is demo mode - no database, so no session to read a role from. Showing the
  // full rail there is right: it is the only way to see what the console consists of.
  //
  // A group whose every item is filtered out drops with them, or the rail grows a heading with
  // nothing under it.
  const groups = GROUPS.map((g) => ({
    ...g,
    items: role ? g.items.filter((item) => canSee(role, item.href)) : g.items,
  })).filter((g) => g.items.length > 0)

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
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-ink-800/60 bg-gradient-to-b from-ink-900 via-ink-900 to-ink-950 transition-transform duration-300 lg:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        {/*
          The mark alone, knocked to white — the same treatment the footer uses on its dark band.

          The "Utsava / Console" wordmark that sat beside it is gone: the artwork already
          carries the name, so the two together said it twice.

          THE ALT TEXT IS NOT OPTIONAL NOW, and this is the part that is easy to get wrong when
          deleting the label. It used to be alt="" and aria-hidden, which was right while the
          text next to it carried the name — a screen reader heard "Utsava Console" once, from
          the words. With the words gone the image is the only thing identifying this panel, so
          it has to say so out loud or the sidebar starts with nothing at all.

          Larger too, at h-11. At h-9 it was sized to sit politely beside a line of type; alone
          in a 240px rail it just looked small, and the wordmark inside the artwork was too fine
          to read.
        */}
        <div className="flex h-[4.5rem] shrink-0 items-center border-b border-ink-800/70 px-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no Vercel optimizer */}
          <img
            src="/logo.webp"
            alt="Utsava console"
            width={623}
            height={576}
            className="h-11 w-auto shrink-0 [filter:brightness(0)_invert(1)]"
          />
        </div>

        <nav aria-label="Sections" className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ' +
                          (active
                            ? 'bg-gradient-to-r from-ink-800 to-ink-800/40 font-semibold text-white'
                            : 'font-medium text-ink-300 hover:bg-ink-800/50 hover:text-white')
                        }
                      >
                        {/*
                          The active bar is its own element rather than an inset shadow, so it can
                          be rounded and inset from the row's edges — a full-height square bar butts
                          into the row above and below and reads as a rendering seam.

                          Two cues, not one: aria-current tells assistive tech, and the bar plus the
                          fill means the state never rests on colour alone.
                        */}
                        {active && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary-500"
                          />
                        )}
                        <span
                          className={
                            'shrink-0 transition-colors ' +
                            (active ? 'text-primary-400' : 'text-ink-400 group-hover:text-ink-200')
                          }
                        >
                          {item.icon}
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/*
          pb-14 rather than p-3.

          Next's dev-tools badge floats in the bottom-left corner and was sitting on top of this
          link — the word "site" was half-covered by it in dev. The extra bottom padding lifts the
          link clear of it, and costs a production build nothing but 44px of dark rail.
        */}
        <div className="shrink-0 border-t border-ink-800/70 p-3 pb-14">
          <Link
            href="/"
            className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-ink-300 transition-colors hover:bg-ink-800 hover:text-white"
          >
            Visit site
            <span aria-hidden="true" className="text-ink-400">
              &#8599;
            </span>
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

function IconCard() {
  return (
    <svg {...S}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </svg>
  )
}

function IconReceipt() {
  return (
    <svg {...S}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
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

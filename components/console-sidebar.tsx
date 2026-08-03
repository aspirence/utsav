'use client'

import { Brand } from '@/components/brand'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'

/**
 * The dark left rail, shared by all three workspaces — the staff console, the partner
 * dashboard and the customer account.
 *
 * IT USED TO BE THE CONSOLE'S ALONE. /account and /partner/dashboard had a light sticky column
 * inside the public site chrome, so the same person switching hats got a different navigation
 * model each time. Plan §3 says one human, many contexts; three different shells made that read
 * as three different products. The rail is the same everywhere now and only the items change.
 *
 * A client component for two reasons and no more: it marks the active section from the pathname,
 * and it collapses on a phone. Everything it renders is a link — no data, no session.
 *
 * ACTIVE MATCHING IS EXACT FOR THE ROOT AND PREFIX FOR THE REST. `/admin` is a prefix of every
 * route under it, so a plain startsWith lights the dashboard up on every page. The place that
 * rule earns its keep is a detail route — /admin/vendors/lightleak-studio should keep Vendors
 * lit, which prefix matching gets right.
 *
 * NOTHING HERE IS A PERMISSION CHECK. The caller decides which items to pass, every page behind
 * them re-derives access on arrival, and RLS decides what any of them return. Hiding a link
 * somebody cannot use saves them a pointless click; it is not what stops them.
 */

export interface ConsoleNavItem {
  href: string
  label: string
  icon: ReactNode
}

export interface ConsoleNavGroup {
  /** Omitted on a group that is a single row, where a heading would be noise. */
  label?: string
  items: ConsoleNavItem[]
}

export function ConsoleSidebar({
  groups,
  rootHref,
  brand,
  footer,
}: {
  groups: ConsoleNavGroup[]
  /** The one route matched exactly rather than by prefix — this workspace's own index. */
  rootHref: string
  /** Read out in place of the wordmark, which the artwork already carries. */
  brand: string
  footer: { href: string; label: string }
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string) =>
    href === rootHref ? pathname === href : pathname.startsWith(href)

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
        <span className="text-base tracking-tight text-white">{brand}</span>
      </div>

      <aside
        className={
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-ink-800/60 bg-gradient-to-b from-ink-900 via-ink-900 to-ink-950 transition-transform duration-300 lg:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        {/*
          The lockup, knocked to white — the same treatment the footer uses on its dark band.

          This used to be the old single-image lockup with alt={brand}, and a long comment here
          argued the alt text was load-bearing because the artwork was the only thing naming the
          panel. That reasoning retired with the artwork: <Brand> renders the name as real text,
          so the mark is decorative and the accessible name comes from the DOM.

          `brand` still says which surface this is — "Fremmo console", "Fremmo partner" — and it
          is now sr-only. Printing it beside a lockup that already reads "Fremmo" would set the
          word twice in one 72px header; a screen reader still gets the distinction.
        */}
        <div className="flex h-[4.5rem] shrink-0 items-center border-b border-ink-800/70 px-5">
          <Brand
            markClassName="h-8 w-auto [filter:brightness(0)_invert(1)]"
            wordClassName="text-xl text-white"
          />
          <span className="sr-only">{brand}</span>
        </div>

        {/*
          `scrollbar-none` and not `overflow-hidden`: the rail still scrolls, it just does not
          paint a bar. macOS renders one in the system light theme regardless of the surface
          under it, so on ink-900 it came out as a pale vertical line hard against the rail's
          right edge — it read as a misplaced divider rather than as a scrollbar.

          The nav keeps `overflow-y-auto`, so a role with enough sections to overflow can still
          reach them by wheel, trackpad, touch, or by tabbing to a link below the fold.
        */}
        <nav
          aria-label="Sections"
          className="scrollbar-none flex-1 overflow-y-auto px-3 py-4"
        >
          {groups.map((group, index) => (
            <div key={group.label ?? `group-${index}`} className="mb-5 last:mb-0">
              {/*
                Group labels are ink-400, not ink-500. Measured rather than picked: on the ink-900
                rail, ink-500 comes in at 3.26:1 and these are 11px, which needs 4.5. ink-400 is
                5.13:1.
              */}
              {group.label && (
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                  {group.label}
                </p>
              )}
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
                          // `relative` went with the active bar — it was only there to position
                          // it, and nothing inside this link is absolutely positioned any more.
                          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ' +
                          (active
                            ? 'bg-gradient-to-r from-ink-800 to-ink-800/40 font-semibold text-white'
                            : 'font-medium text-ink-300 hover:bg-ink-800/50 hover:text-white')
                        }
                      >
                        {/*
                          NO ACTIVE BAR. There was a 3px primary-500 rule down the left edge of
                          the selected row; it is gone by request.

                          What carries the state now is the background fill and `font-semibold`
                          against the `font-medium` of every other row. The weight is the part
                          worth protecting — it is the one cue that survives for somebody who
                          cannot separate the fill from the rail behind it, so the state still
                          does not rest on colour alone. aria-current carries it for assistive
                          tech either way.

                          If the fill is ever softened, put a non-colour cue back before doing it.
                        */}
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
          pb-14 rather than p-3. Next's dev-tools badge floats in the bottom-left corner and sat
          on top of this link — the word was half-covered by it in dev. The extra bottom padding
          lifts it clear, and costs a production build nothing but 44px of dark rail.
        */}
        <div className="shrink-0 border-t border-ink-800/70 p-3 pb-14">
          <Link
            href={footer.href}
            className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-ink-300 transition-colors hover:bg-ink-800 hover:text-white"
          >
            {footer.label}
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

/* Icons. 18px, 1.6 stroke, currentColor — so they take the row's own colour and its transition
   rather than needing an active variant each. Shared, because the three workspaces overlap:
   every one of them has a dashboard, and two of them have an inbox. */
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

export function IconGrid() {
  return (
    <svg {...S}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function IconInbox() {
  return (
    <svg {...S}>
      <path d="M3 12l2.5-7h13L21 12v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6z" />
      <path d="M3 12h5l1 2h6l1-2h5" />
    </svg>
  )
}

export function IconStore() {
  return (
    <svg {...S}>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9" />
      <path d="M9 20v-6h6v6" />
    </svg>
  )
}

export function IconShield() {
  return (
    <svg {...S}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

export function IconFlow() {
  return (
    <svg {...S}>
      <rect x="3" y="4" width="6" height="4" rx="1" />
      <rect x="15" y="10" width="6" height="4" rx="1" />
      <rect x="3" y="16" width="6" height="4" rx="1" />
      <path d="M9 6h3a2 2 0 012 2v2M9 18h3a2 2 0 002-2v-2" />
    </svg>
  )
}

export function IconCard() {
  return (
    <svg {...S}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </svg>
  )
}

export function IconReceipt() {
  return (
    <svg {...S}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  )
}

export function IconPulse() {
  return (
    <svg {...S}>
      <path d="M3 12h4l2-5 3 10 2-5h7" />
    </svg>
  )
}

export function IconPeople() {
  return (
    <svg {...S}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19a6 6 0 0112 0" />
      <path d="M16 5.2a3.2 3.2 0 010 5.6M17.5 19a6 6 0 00-2.2-4.6" />
    </svg>
  )
}

/** A percent sign — a share of a sale, which is the whole of what a reseller is. */
export function IconShare() {
  return (
    <svg {...S}>
      <circle cx="7.5" cy="7.5" r="2.2" />
      <circle cx="16.5" cy="16.5" r="2.2" />
      <path d="M18 6L6 18" />
    </svg>
  )
}

export function IconHeart() {
  return (
    <svg {...S}>
      <path d="M12 20s-7-4.4-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.6-7 9-7 9z" />
    </svg>
  )
}

export function IconCalendar() {
  return (
    <svg {...S}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

export function IconUser() {
  return (
    <svg {...S}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0114 0" />
    </svg>
  )
}

export function IconBox() {
  return (
    <svg {...S}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </svg>
  )
}

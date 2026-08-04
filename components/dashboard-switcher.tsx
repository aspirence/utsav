import Link from 'next/link'

import { DASHBOARDS, type DashboardKind, type Viewer } from '@/lib/viewer'

/**
 * The hat switcher, shown only to people wearing more than one.
 *
 * Plan §3: "One human = one auth identity; capabilities come from memberships." The
 * consequence is that a studio owner who books a caterer for their own wedding, or a moderator
 * who is also a customer, has two or three real dashboards and no way to reach the others
 * without typing a URL. This is that way.
 *
 * RENDERS NOTHING FOR A SINGLE-SURFACE VIEWER — the overwhelming majority. A switcher with one
 * entry is chrome that teaches the reader nothing, and putting "Account" above a page already
 * titled "Your account" is worse than putting nothing.
 *
 * IT IS NOT A PERMISSION CHECK. Every destination re-derives access on arrival: the console has
 * its own gate, the partner shell checks membership, and RLS decides what any of them return.
 * A link rendered in error leads to a page that refuses, not to somebody else's data.
 */

interface Surface {
  href: string
  label: string
  detail: string
}

export function DashboardSwitcher({
  viewer,
  current,
  className,
}: {
  viewer: Viewer
  /**
   * Which surface is being rendered — shown as the selected pill rather than a link.
   *
   * Keyed to DASHBOARDS rather than a hand-written union, so adding a fifth surface to that map
   * is one edit rather than two that can disagree. `DASHBOARDS[current]` is the only use.
   */
  current: DashboardKind
  className?: string
}) {
  const surfaces = surfacesFor(viewer)
  if (surfaces.length < 2) return null

  return (
    <nav
      aria-label="Switch dashboard"
      className={`border-ink-200 bg-surface-raised inline-flex items-center gap-1 rounded-full border p-1 ${className ?? ''}`}
    >
      {surfaces.map((surface) => {
        const active = surface.href === DASHBOARDS[current]
        return active ? (
          <span
            key={surface.href}
            aria-current="page"
            className="bg-ink-900 rounded-full px-4 py-1.5 text-sm font-semibold text-white"
          >
            {surface.label}
          </span>
        ) : (
          <Link
            key={surface.href}
            href={surface.href}
            title={surface.detail}
            className="text-ink-600 hover:text-ink-900 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
          >
            {surface.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Ordered widest-authority first, matching `homeFor()` in lib/viewer.ts so the switcher reads
 * left to right in the same order sign-in resolves. Account is always present: everyone who can
 * sign in has one, including staff.
 */
function surfacesFor(viewer: Viewer): Surface[] {
  const out: Surface[] = []

  if (viewer.staffRoles.length > 0) {
    out.push({ href: DASHBOARDS.console, label: 'Console', detail: 'Staff console' })
  }
  if (viewer.vendors.length > 0) {
    out.push({
      href: DASHBOARDS.partner,
      label: 'Partner',
      // Named rather than counted when there is one, because "1 business" tells nobody which.
      detail:
        viewer.vendors.length === 1
          ? (viewer.vendors[0]?.name ?? 'Your business')
          : `${viewer.vendors.length} businesses`,
    })
  }
  /*
   * The reseller statement, offered whatever its status.
   *
   * A suspended or closed reseller still gets the link, matching `homeFor()`: their record reads
   * back under resellers_select_self precisely so the portal can *tell* them they are suspended,
   * and hiding the entry would take away the page that answers the question. It is the database
   * that locks them out — app.my_reseller_id() filters on `status = 'active'` — not this list.
   *
   * The detail is the code rather than a count, because the code is the string we ask them to
   * quote when they write in about a statement.
   */
  if (viewer.reseller) {
    out.push({
      href: DASHBOARDS.reseller,
      label: 'Reseller',
      detail: `${viewer.reseller.displayName} · ${viewer.reseller.code}`,
    })
  }
  out.push({ href: DASHBOARDS.account, label: 'Account', detail: 'Your bookings and saves' })

  return out
}

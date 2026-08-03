import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

import { AdminSidebar } from '@/components/admin-sidebar'
import type { BottomNavItem } from '@/components/bottom-nav'
import { ConsoleShell } from '@/components/console-shell'
import {
  IconGrid,
  IconInbox,
  IconReceipt,
  IconShield,
  IconStore,
} from '@/components/console-sidebar'
import { initialsFrom } from '@/components/console-topbar'
import { DashboardSwitcher } from '@/components/dashboard-switcher'
import { signOutStaff } from '@/app/admin/actions'
import { getStaffGate, roleLabel } from '@/lib/admin-auth'
import { canSee } from '@/lib/admin-roles'
import { getViewer } from '@/lib/viewer'

import type { StaffRoleKind } from '@/lib/db'

/**
 * The console's phone tab bar — the five queues, filtered to what this role may open.
 *
 * IT RUNS THROUGH canSee() FOR THE SAME REASON THE RAIL DOES, and with the same caveat: this is
 * courtesy, not security. Every page behind these links is governed by its own policies, so a
 * field agent who types /admin/moderation reaches a screen whose queries return nothing rather
 * than somebody else's queue. Filtering here only saves them a pointless tap.
 *
 * A role that can open fewer than five gets fewer than five tabs, and the row simply spreads —
 * which is correct. Padding it out to five with links that lead nowhere would be worse than a
 * short bar.
 *
 * Pipeline, Routing health, Templates, Team and Resellers are not here and are not meant to be.
 * They are read-and-decide screens rather than queues worked all day, they are the ones most
 * likely to be opened on a laptop, and the drawer behind the hamburger still carries every one
 * of them.
 */
function bottomNavFor(role: StaffRoleKind): BottomNavItem[] {
  const all: BottomNavItem[] = [
    // `exact`, because /admin is a prefix of every other console route — without it the
    // Dashboard tab stays lit on all of them.
    { href: '/admin', label: 'Dashboard', icon: <IconGrid />, exact: true },
    { href: '/admin/enquiries', label: 'Enquiries', icon: <IconInbox /> },
    { href: '/admin/orders', label: 'Orders', icon: <IconReceipt /> },
    { href: '/admin/vendors', label: 'Vendors', icon: <IconStore /> },
    { href: '/admin/moderation', label: 'Moderation', icon: <IconShield /> },
  ]

  return all.filter((item) => canSee(role, item.href))
}

/**
 * The staff console proper: the gate, then the chrome.
 *
 * Plan §3 specifies "a separate deploy, SSO + IP allowlist, append-only audit log". It shares
 * an origin with the customer site by explicit product decision, so the network isolation the
 * plan assumed is replaced by three layers:
 *
 *   · middleware.ts — IP allowlist on /admin/*, and a 404 rather than a 403 for outsiders
 *   · this gate — email + password, and a staff role, before any screen renders
 *   · public.staff_roles + RLS — the actual authorization boundary, unchanged
 *
 * THE GATE IS NOT THE BOUNDARY, and it matters that this is understood before anyone edits it.
 * Every query the console makes runs on the caller's own session and is filtered by policies
 * that call app.is_staff() independently. Remove this file and a stranger sees empty tables,
 * not data. What the gate adds is that they see a login screen instead — and that a moderator
 * whose role was revoked this morning stops seeing the console rather than seeing an oddly
 * empty one.
 *
 * NOTHING RENDERS WITHOUT A SESSION. There was a `demo` state that opened the console whenever
 * no Supabase was attached, on the reasoning that a login wall in front of fixtures protects
 * nothing. That reasoning was wrong in the way that matters: the dashboard was on screen, so
 * the login link beside it was decoration. Log in first, always — and with no database the
 * credentials come from .env.local instead of Supabase (see lib/admin-local-auth.ts).
 *
 * FOUR OUTCOMES, and the last two are the ones worth arguing about:
 *
 *   anonymous → /login, carrying where they were headed.
 *   locked    → /login with ?error=locked, which says no login exists yet and points at the
 *               README. Locked rather than open is the safe default; locked with no explanation
 *               is a bug report.
 *   not_staff → /login with ?error=not_staff, which explains it and offers a sign-out. NOT a
 *               404: the likeliest person here is a colleague whose role has not been granted
 *               yet, and telling them "this does not exist" sends them to debug a working
 *               system. It reveals nothing — they are being shown facts about their own session.
 *   staff     → the console.
 *
 * ALL THREE REFUSALS GO TO THE ONE LOGIN. /admin/login used to render its own dark-chromed form;
 * it is now a redirect to /login, because plan §3 gives one human one auth identity and two
 * forms writing to one auth.users table gave that human two doors. Which dashboard somebody
 * lands on is decided by /dashboard reading their memberships.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const gate = await getStaffGate()

  if (gate.state !== 'staff') {
    // Middleware forwards the path because a Server Component has no way to read it. Without
    // it, someone deep-linked to an enquiry would sign in and land on the dashboard, then have
    // to find their way back.
    const path = (await headers()).get('x-pathname')
    const params = new URLSearchParams()
    if (path && path.startsWith('/admin')) params.set('next', path)
    // 'anonymous' gets no error: there is nothing to explain to somebody who simply is not
    // signed in yet, and a red banner over an empty form reads as a failed attempt.
    if (gate.state !== 'anonymous') params.set('error', gate.state)
    redirect(`/login?${params}`)
  }

  // Past the redirect, so this is always a real session. Narrowed rather than defaulted: a
  // `?? null` here would quietly reintroduce the signed-out render path this change removed.
  const { identity } = gate

  /**
   * Null on the local-credential path — that session has no auth.users row, so there are no
   * memberships to read and no other surface to switch to. The switcher renders nothing for a
   * staff account that is only staff, which is most of them.
   */
  const viewer = await getViewer()

  return (
    <ConsoleShell
      sidebar={<AdminSidebar role={identity.role} />}
      topBar={{
        search: {
          action: '/admin/enquiries',
          placeholder: 'Search enquiries by name or number',
          label: 'Search enquiries',
        },
        badge: identity.isLocal
          ? { text: 'Local session — fixtures, nothing saved', tone: 'warn' }
          : { text: 'Live data', tone: 'ok' },
        identity: {
          name: identity.fullName ?? identity.email ?? identity.phone ?? 'Signed in',
          detail: roleLabel(identity.role),
          initials: initialsFrom(identity),
        },
        switcher: viewer ? <DashboardSwitcher viewer={viewer} current="console" /> : undefined,
        signOut: signOutStaff,
        viewSiteHref: '/',
      }}
      bottomNav={bottomNavFor(identity.role)}
      footnote={
        identity.isLocal
          ? 'Local admin session — no database is attached, so every screen is showing fixtures and nothing you do here is saved.'
          : 'Every action taken here is written to an append-only audit log with your identity attached.'
      }
    >
      {children}
    </ConsoleShell>
  )
}

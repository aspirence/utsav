import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { ConsoleShell } from '@/components/console-shell'
import {
  ConsoleSidebar,
  IconBox,
  IconCalendar,
  IconGrid,
  IconInbox,
  IconReceipt,
  IconUser,
  type ConsoleNavGroup,
} from '@/components/console-sidebar'
import { initialsFrom } from '@/components/console-topbar'
import { DashboardSwitcher } from '@/components/dashboard-switcher'

import { requireUser } from '@/lib/auth'
import { hasSupabaseEnv } from '@/lib/supabase'
import { getViewer } from '@/lib/viewer'

import type { VendorMemberRole } from '@/lib/db'

import { signOut } from '../../login/actions'

export const metadata: Metadata = {
  title: 'Partner dashboard',
  robots: { index: false, follow: false },
}

/**
 * Grouped by what a partner is doing, not by table.
 *
 * "Your day" is the queue they work through — the enquiry lands, they quote it, they block the
 * date. "Your listing" is what they maintain occasionally. Six identical rows make somebody read
 * all six every morning; two short lists mean they read one.
 */
const NAV_GROUPS: ConsoleNavGroup[] = [
  {
    items: [{ href: '/partner/dashboard', label: 'Overview', icon: <IconGrid /> }],
  },
  {
    label: 'Your day',
    items: [
      { href: '/partner/dashboard/leads', label: 'Leads', icon: <IconInbox /> },
      { href: '/partner/dashboard/quotes', label: 'Quotes', icon: <IconReceipt /> },
      { href: '/partner/dashboard/calendar', label: 'Calendar', icon: <IconCalendar /> },
    ],
  },
  {
    label: 'Your listing',
    items: [
      { href: '/partner/dashboard/packages', label: 'Packages', icon: <IconBox /> },
      { href: '/partner/dashboard/profile', label: 'Profile', icon: <IconUser /> },
    ],
  },
]

/** owner ⊃ manager ⊃ responder, per the comment on public.vendor_members. */
const ROLE_LABEL: Record<VendorMemberRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  responder: 'Responder',
}

/**
 * Partner PWA shell. Plan §4.1 puts the partner surface inside apps/web rather than a separate
 * deploy — it shares the design system and the session, and plan §4 ships it before the Expo app
 * so the workflows are proven on the web first.
 *
 * THIS USED TO BE UNGATED AND TO HARD-CODE "Lightleak Studio" AS ITS HEADING. Anyone who knew
 * the URL got the shell, and every visitor saw the same business name regardless of which one
 * they actually belong to. Both are fixed here: the subtree requires a session, and the business
 * is read from public.vendor_members for the caller.
 *
 * The gate is a convenience, not the boundary — plan §6 keeps that in RLS, and a non-member who
 * slipped past would find a dashboard of empty queries. What it buys is the right failure: a
 * customer following a partner link lands somewhere that explains itself instead of on an
 * operational surface with nothing in it.
 *
 * IT WEARS THE CONSOLE'S CHROME NOW. It used to be a light sticky column inside the public site
 * header, which was a third arrangement beside the console's rail and the account's pill tabs.
 * Plan §3's one human wears all three hats; they should not have to relearn the furniture on the
 * way between them.
 */
export default async function PartnerDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Set by middleware; a Server Component cannot read its own path. The fallback keeps the gate
  // working if that header is ever absent — it just returns you to the overview.
  const path = (await headers()).get('x-pathname') ?? '/partner/dashboard'
  await requireUser(path.startsWith('/partner/dashboard') ? path : '/partner/dashboard')

  const viewer = await getViewer()

  /**
   * The membership check only applies once there is a database to check against. With no
   * Supabase the pages below deliberately render a sample inbox, and an empty membership list is
   * then the normal state rather than a refusal — redirecting on it would make the demo
   * unreachable.
   */
  if (hasSupabaseEnv() && viewer && viewer.vendors.length === 0) {
    redirect('/partner?from=dashboard')
  }

  /**
   * First membership wins. Someone who belongs to two businesses needs a picker rather than an
   * arbitrary choice, and that is its own piece of work; until then the switcher's tooltip is
   * what says there is more than one.
   */
  const vendor = viewer?.vendors[0]
  const live = !vendor || vendor.status === 'live'

  return (
    <ConsoleShell
      sidebar={
        <ConsoleSidebar
          groups={NAV_GROUPS}
          rootHref="/partner/dashboard"
          brand="Utsava partner"
          footer={{ href: '/', label: 'Visit site' }}
        />
      }
      topBar={{
        search: {
          action: '/partner/dashboard/leads',
          placeholder: 'Search leads by name or date',
          label: 'Search leads',
        },
        // The listing's own status, in the slot the console uses for "Live data". A draft
        // listing is invisible to every public query, which is worth saying on every screen
        // rather than only on the profile page.
        badge: live
          ? { text: 'Listing live', tone: 'ok' }
          : { text: `Listing ${vendor?.status ?? 'draft'}`, tone: 'warn' },
        identity: {
          name: vendor?.name ?? 'Lightleak Studio',
          detail: vendor ? ROLE_LABEL[vendor.role] : 'Demo',
          initials: initialsFrom({ fullName: vendor?.name ?? 'Lightleak Studio' }),
        },
        switcher: viewer ? <DashboardSwitcher viewer={viewer} current="partner" /> : undefined,
        signOut,
        viewSiteHref: vendor ? `/vendor/${vendor.slug}` : '/',
      }}
      footnote={
        hasSupabaseEnv()
          ? 'Customer contact details are unmasked only on leads you have accepted — that boundary lives in the database, not in this page.'
          : 'Demo mode — no Supabase instance is connected, so this dashboard is showing a sample inbox. Run `pnpm db:start` to work against real data.'
      }
    >
      {children}
    </ConsoleShell>
  )
}

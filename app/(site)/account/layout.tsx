import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { ConsoleShell } from '@/components/console-shell'
import {
  ConsoleSidebar,
  IconCalendar,
  IconCard,
  IconGrid,
  IconHeart,
  IconInbox,
  IconUser,
  type ConsoleNavGroup,
} from '@/components/console-sidebar'
import { initialsFrom } from '@/components/console-topbar'
import { DashboardSwitcher } from '@/components/dashboard-switcher'

import { requireUser } from '@/lib/auth'
import { getViewer } from '@/lib/viewer'

import { signOut } from '../login/actions'

/**
 * The customer workspace.
 *
 * `requireUser` here rather than in each page: the whole subtree is private, and a gate repeated
 * per route is a gate that eventually gets forgotten on one of them. It redirects to /login
 * carrying the path being guarded, so signing in returns you to what you were reaching for.
 *
 * That said — this is a convenience, not the boundary. Plan §6: "RLS is the authorization model
 * — there is no trusted API between clients and Postgres for reads." Every page below reads
 * through the caller's own session, so a signed-in user who somehow reached a page they have no
 * rows for sees an empty page rather than someone else's data.
 *
 * IT LOOKS LIKE THE CONSOLE NOW, AND THAT IS THE POINT. This used to be a Container with a
 * heading and a row of pill tabs sitting under the public site header; the partner dashboard had
 * a third arrangement again. Plan §3 gives one human many contexts, and three different shells
 * made switching hats feel like switching products. Same rail, same top bar, different items.
 *
 * noindex and no-store: this is the one part of the customer site that shows PII.
 */
export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
}

/**
 * Grouped the way a customer thinks about the wedding, not by table.
 *
 * "Planning" is the live work — who has been asked, who has been saved, what the dates are.
 * "You" is the settings drawer everyone opens twice. Overview sits above both, ungrouped,
 * because a heading over a single row is noise.
 */
const NAV_GROUPS: ConsoleNavGroup[] = [
  {
    items: [{ href: '/account', label: 'Overview', icon: <IconGrid /> }],
  },
  {
    label: 'Planning',
    items: [
      { href: '/account/enquiries', label: 'Enquiries', icon: <IconInbox /> },
      { href: '/account/shortlists', label: 'Saved', icon: <IconHeart /> },
      { href: '/account/events', label: 'Events', icon: <IconCalendar /> },
      // Plan §2 puts the invitation storefront in the Must tier. It was reachable from the
      // homepage feature and from nowhere else, so a customer who bought a card had no way
      // back to it and one who had not had no way to it at all.
      { href: '/account/invitations', label: 'Invitations', icon: <IconCard /> },
    ],
  },
  {
    label: 'You',
    items: [{ href: '/account/profile', label: 'Profile', icon: <IconUser /> }],
  },
]

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware; Next gives a Server Component no way to read its own path. Falling back
  // to /account keeps the gate working if the header is ever absent — it just returns you to the
  // overview instead of the exact page.
  const path = (await headers()).get('x-pathname') ?? '/account'
  await requireUser(path.startsWith('/account') ? path : '/account')

  const viewer = await getViewer()
  const profile = viewer?.profile

  return (
    <ConsoleShell
      sidebar={
        <ConsoleSidebar
          groups={NAV_GROUPS}
          rootHref="/account"
          brand="Utsava account"
          footer={{ href: '/', label: 'Visit site' }}
        />
      }
      topBar={{
        // Nothing to search yet. The enquiries and shortlists lists are short enough to read,
        // and a box that filters nothing is worse than no box.
        identity: {
          name: profile?.fullName ?? profile?.email ?? profile?.phone ?? 'Signed in',
          detail: 'Customer',
          initials: initialsFrom({
            fullName: profile?.fullName,
            email: profile?.email,
            phone: profile?.phone,
          }),
        },
        switcher: viewer ? <DashboardSwitcher viewer={viewer} current="account" /> : undefined,
        signOut,
        viewSiteHref: '/',
      }}
      footnote="Your enquiries, saved vendors, events and invitation cards. Only you can see this — every read here runs under your own session."
    >
      {children}
    </ConsoleShell>
  )
}

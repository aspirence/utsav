import {
  ConsoleSidebar,
  IconCard,
  IconFlow,
  IconGrid,
  IconInbox,
  IconPeople,
  IconPulse,
  IconReceipt,
  IconShield,
  IconStore,
  type ConsoleNavGroup,
} from '@/components/console-sidebar'

import { canSee } from '@/lib/admin-roles'
import type { StaffRoleKind } from '@/lib/db'

/**
 * The console's rail — its nav, on the shared chrome.
 *
 * THE RAIL ITSELF MOVED to components/console-sidebar.tsx, where the partner dashboard and the
 * customer account now use the same one. What is left here is the part that was only ever about
 * staff: which sections exist, and which roles are shown them.
 *
 * Grouped, not a flat list of nine. The grouping is by what a person is doing, not by table:
 * Today is the queue you work through, Catalogue is what you are selling, Oversight is what you
 * check. Nine identical rows make a moderator read all nine every time; three short lists mean
 * they read one.
 *
 * THE ROLE FILTER IS COURTESY, NOT SECURITY. It runs on a role string the server sent, and a
 * client can edit what it sees. Every page behind these links is governed by its own RLS
 * policies, so a hand-typed URL reaches a screen with no rows rather than someone else's data.
 * Hiding a link the caller cannot use saves them a pointless click; it is not what stops them,
 * and nothing should ever be added here on the assumption that it is.
 */
const GROUPS: ConsoleNavGroup[] = [
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
      { href: '/admin/users', label: 'Team', icon: <IconPeople /> },
    ],
  },
]

export function AdminSidebar({ role }: { role: StaffRoleKind | null }) {
  /*
   * A null role is demo mode — no database, so no session to read a role from. Showing the full
   * rail there is right: it is the only way to see what the console consists of.
   *
   * A group whose every item is filtered out drops with them, or the rail grows a heading with
   * nothing under it.
   */
  const groups = GROUPS.map((g) => ({
    ...g,
    items: role ? g.items.filter((item) => canSee(role, item.href)) : g.items,
  })).filter((g) => g.items.length > 0)

  return (
    <ConsoleSidebar
      groups={groups}
      rootHref="/admin"
      brand="Utsava console"
      footer={{ href: '/', label: 'Visit site' }}
    />
  )
}

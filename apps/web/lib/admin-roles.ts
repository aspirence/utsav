import type { StaffRoleKind } from '@utsava/db'

/**
 * Pure role helpers. No session, no database, no `server-only`.
 *
 * Split out of lib/admin-auth.ts because the sidebar is a client component and needs `canSee`.
 * admin-auth.ts is marked `server-only` — correctly, it reads cookies and queries Postgres —
 * and importing it from a client component fails the build. These three have no such
 * dependency, so they live where both sides can reach them.
 *
 * That split is also a useful boundary to have drawn. Everything in this file is safe to ship
 * to a browser precisely because none of it decides anything: it maps a role to a label and to
 * a set of nav links. The decisions are in RLS.
 */

/**
 * Highest authority first.
 *
 * Order is load-bearing: it picks which role a person holding several is shown as, and which
 * grant their city scope is read from. `super` first because app.is_staff() short-circuits on
 * it — any check passes for a super admin, so displaying anything else would understate what
 * they can do.
 */
export const STAFF_ROLE_RANK: StaffRoleKind[] = ['super', 'moderator', 'finance', 'field_agent']

/** Human-readable role, for the top bar. */
export function roleLabel(role: StaffRoleKind): string {
  return {
    super: 'Super admin',
    moderator: 'Moderator',
    finance: 'Finance',
    field_agent: 'Field agent',
  }[role]
}

/**
 * Should this role see a link to a section of the console?
 *
 * COURTESY, NOT SECURITY, and the distinction is the whole point of this comment. This runs in
 * the browser on a role string the server sent, so anyone can change what it sees. Every page
 * behind these links is governed by its own RLS policies — a field agent who types
 * /admin/moderation reaches a screen whose queries return nothing, not someone else's queue.
 *
 * Hiding a link the caller cannot use saves them a pointless click. It is not what stops them,
 * and nothing should ever be added here on the assumption that it is.
 *
 * Sections mirror plan §3's capability matrix: field agents file and edit drafts, moderators
 * approve, finance handles money with four eyes, super does everything.
 */
export function canSee(role: StaffRoleKind, href: string): boolean {
  if (role === 'super') return true

  switch (href) {
    case '/admin/moderation':
      return role === 'moderator'
    // Routing health carries refunds and payout signals, so it is moderator-and-up.
    case '/admin/leads':
      return role === 'moderator' || role === 'finance'
    // National storefront copy with a price on it. A field agent's remit is vendor listings in
    // their own city, which is a different job — and invitation_templates_write_staff agrees.
    case '/admin/templates':
      return role === 'moderator'
    default:
      return true
  }
}

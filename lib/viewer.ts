import 'server-only'

import { getStaffGate } from '@/lib/admin-auth'
import { getProfile, getSessionUser, type Profile, type SessionUser } from '@/lib/auth'
import { getServerClientOrNull } from '@/lib/supabase'

import type { StaffRoleKind, VendorMemberRole } from '@/lib/db'

/**
 * Which dashboards the signed-in person can open, and which one is theirs by default.
 *
 * WHY THIS IS NOT A ROLE COLUMN. Plan §3: "One human = one auth identity; capabilities come
 * from memberships, not a role column." The same person can be a customer booking their
 * sister's mehendi, the owner of a studio, and a moderator — at once, on one login. So this
 * does not answer "what is this user", it answers "what can this user open", and it answers it
 * by reading the membership tables rather than by trusting anything on the session.
 *
 * THIS IS NAVIGATION, NOT AUTHORIZATION. Every read behind every one of these dashboards is
 * still RLS-scoped (plan §6), and the console has its own gate in lib/admin-auth.ts. Nothing
 * here grants access — it decides which door to point somebody at. A tampered answer would
 * land the caller on a dashboard whose queries return nothing, which is the failure mode we
 * want: useless rather than dangerous.
 *
 * WHY VENDORS COME BACK AS A LIST. `vendor_members` is unique on (vendor_id, profile_id), not
 * on profile_id — a photographer who also runs a decor firm holds two memberships, and plan §3
 * calls that "one human, many contexts". The partner dashboard picks one; the switcher needs
 * to know about the rest.
 */

export interface ViewerVendor {
  id: string
  slug: string
  name: string
  role: VendorMemberRole
  /** 'live' means the listing is public. Anything else and the dashboard says so. */
  status: string | null
}

export interface Viewer {
  user: SessionUser
  profile: Profile | null
  /** Unrevoked, accepted vendor memberships. Empty for a plain customer. */
  vendors: ViewerVendor[]
  /** Every unrevoked staff role, highest first. Empty for everyone who is not staff. */
  staffRoles: StaffRoleKind[]
  /** Where this person lands when they sign in without a `next`. */
  home: string
}

/** The three surfaces. Ordered by precedence — see `homeFor`. */
export const DASHBOARDS = {
  console: '/admin',
  partner: '/partner/dashboard',
  account: '/account',
} as const

export type DashboardKind = keyof typeof DASHBOARDS

/**
 * The whole picture for the current request, or null when nobody is signed in.
 *
 * Three round trips at worst, and they are the same three the pages behind this would make
 * anyway. Callers that only need the redirect target should use `viewerHome()`.
 */
export async function getViewer(): Promise<Viewer | null> {
  const user = await getSessionUser()
  if (!user) return null

  const [profile, vendors, staffRoles] = await Promise.all([
    getProfile(),
    getViewerVendors(),
    getViewerStaffRoles(),
  ])

  return { user, profile, vendors, staffRoles, home: homeFor({ vendors, staffRoles }) }
}

/**
 * The vendor accounts this person may act for.
 *
 * `revoked_at is null` and `accepted_at not null` are both required: an invitation that was
 * sent but never accepted is not a membership, and RLS agrees — app.is_vendor_member() applies
 * the same two conditions, so including a pending row here would advertise a dashboard whose
 * every query returns empty.
 *
 * The join is an inner one by construction (vendor_id is NOT NULL with a FK), but a vendor the
 * caller cannot SELECT under `vendors_select_member` would still come back null, so rows
 * without a vendor are dropped rather than rendered as a nameless entry.
 */
export async function getViewerVendors(): Promise<ViewerVendor[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return []

  const user = await getSessionUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('vendor_members')
    .select('vendor_id, role, vendors ( slug, display_name, status )')
    .eq('profile_id', user.id)
    .is('revoked_at', null)
    .not('accepted_at', 'is', null)

  if (error || !data) return []

  return data.flatMap((row) => {
    // postgrest types an embedded to-one relation as possibly-array; it is one row here.
    const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors
    if (!vendor) return []
    return [
      {
        id: row.vendor_id,
        slug: vendor.slug,
        name: vendor.display_name,
        role: row.role,
        status: vendor.status ?? null,
      },
    ]
  })
}

/**
 * Staff roles, via the console's own gate rather than a second query.
 *
 * getStaffGate() is the module that decides what the console lets in, including the
 * local-credential path and the revoked-role filtering. Re-deriving that here would be a second
 * authorization model beside the real one, and the two would drift.
 */
export async function getViewerStaffRoles(): Promise<StaffRoleKind[]> {
  const gate = await getStaffGate()
  return gate.state === 'staff' ? gate.identity.roles : []
}

/**
 * Precedence: console, then partner, then account.
 *
 * A moderator who is also a customer wants the console — that is the surface they signed in to
 * do a job on, and /account is one click away. The reverse order would put staff on a page
 * showing their own shortlists every morning.
 */
export function homeFor({
  vendors,
  staffRoles,
}: {
  vendors: readonly ViewerVendor[]
  staffRoles: readonly StaffRoleKind[]
}): string {
  if (staffRoles.length > 0) return DASHBOARDS.console
  if (vendors.length > 0) return DASHBOARDS.partner
  return DASHBOARDS.account
}

/**
 * Just the landing path — for sign-in redirects, which do not need the rest.
 *
 * Falls back to /account rather than /login for a signed-out caller: the sign-in actions call
 * this to decide where to send somebody they have *just* authenticated, and a race on
 * getUser() should land them on their own account page, not back at the form they came from.
 */
export async function viewerHome(): Promise<string> {
  const [vendors, staffRoles] = await Promise.all([getViewerVendors(), getViewerStaffRoles()])
  return homeFor({ vendors, staffRoles })
}

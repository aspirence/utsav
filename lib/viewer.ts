import 'server-only'

import { getStaffGate } from '@/lib/admin-auth'
import { getProfile, getSessionUser, type Profile, type SessionUser } from '@/lib/auth'
import { getMyReseller } from '@/lib/resellers'
import { getServerClientOrNull } from '@/lib/supabase'

import type { ResellerStatus, StaffRoleKind, VendorMemberRole } from '@/lib/db'

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
 *
 * WHY THE RESELLER COMES BACK AS ONE ROW OR NULL, AND NOT AS A ROLE. `resellers.profile_id` is
 * unique — one login owns one reseller record — so there is no list to keep. It is read as a
 * membership here for the same reason the other two are: 20260803000100 deliberately kept
 * 'reseller' out of public.staff_role_kind, because app.is_staff() with no arguments passes for
 * any staff row and would have handed every reseller everything guarded by a bare is_staff(),
 * including raw Cashfree payloads. A reseller is an external commercial partner, and this file
 * treats them as one.
 */

export interface ViewerVendor {
  id: string
  slug: string
  name: string
  role: VendorMemberRole
  /** 'live' means the listing is public. Anything else and the dashboard says so. */
  status: string | null
}

/**
 * The reseller record behind this login, if there is one.
 *
 * `status` is carried because it is the whole message on the portal. A suspended or closed
 * reseller still reads their own row — the resellers_select_self policy is keyed on
 * `profile_id = auth.uid()` rather than on app.my_reseller_id() precisely so they can be *told*
 * they are suspended instead of being shown an empty screen and left to guess.
 */
export interface ViewerReseller {
  id: string
  displayName: string
  /** FRM-RS-XXXXXX. What they quote at us when they ask about a statement. */
  code: string
  status: ResellerStatus
}

export interface Viewer {
  user: SessionUser
  profile: Profile | null
  /** Unrevoked, accepted vendor memberships. Empty for a plain customer. */
  vendors: ViewerVendor[]
  /** Every unrevoked staff role, highest first. Empty for everyone who is not staff. */
  staffRoles: StaffRoleKind[]
  /** Their reseller record whatever its status, or null for everyone who is not one. */
  reseller: ViewerReseller | null
  /** Where this person lands when they sign in without a `next`. */
  home: string
}

/** The four surfaces. Ordered by precedence — see `homeFor`. */
export const DASHBOARDS = {
  console: '/admin',
  partner: '/partner/dashboard',
  reseller: '/reseller/dashboard',
  account: '/account',
} as const

export type DashboardKind = keyof typeof DASHBOARDS

/**
 * The whole picture for the current request, or null when nobody is signed in.
 *
 * Four round trips at worst, and they are the same four the pages behind this would make
 * anyway. Callers that only need the redirect target should use `viewerHome()`.
 */
export async function getViewer(): Promise<Viewer | null> {
  const user = await getSessionUser()
  if (!user) return null

  const [profile, vendors, staffRoles, reseller] = await Promise.all([
    getProfile(),
    getViewerVendors(),
    getViewerStaffRoles(),
    getViewerReseller(),
  ])

  return {
    user,
    profile,
    vendors,
    staffRoles,
    reseller,
    home: homeFor({ vendors, staffRoles, reseller }),
  }
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
 * The caller's reseller record, or null.
 *
 * Delegated to lib/resellers.ts rather than queried here, for getViewerStaffRoles()'s reason: the
 * module that owns the reseller surface should own what "the caller's reseller" means. The trap
 * it is protecting against is concrete. `resellers` carries two SELECT policies — the self one
 * *and* resellers_select_staff — so an unfiltered read of that table hands a staff member the
 * whole list and this function would hand back the first row as if it were theirs. getMyReseller()
 * pins `profile_id` for exactly that reason; a second copy of the query here is a second place to
 * forget it.
 *
 * IT RETURNS SUSPENDED AND CLOSED RESELLERS TOO, and that is not laxity. app.my_reseller_id()
 * filters on `status = 'active'`, so a suspended reseller's data reads as empty everywhere — if
 * this returned null for them as well, the portal would be unreachable and they would have no
 * screen that says why. Status is navigation-visible here; it is the *database* that does the
 * locking out.
 */
export async function getViewerReseller(): Promise<ViewerReseller | null> {
  const reseller = await getMyReseller()
  if (!reseller) return null

  return {
    id: reseller.id,
    displayName: reseller.displayName,
    code: reseller.code,
    status: reseller.status,
  }
}

/**
 * Precedence: console, then partner, then reseller, then account.
 *
 * A moderator who is also a customer wants the console — that is the surface they signed in to
 * do a job on, and /account is one click away. The reverse order would put staff on a page
 * showing their own shortlists every morning.
 *
 * RESELLER SITS BELOW PARTNER ON PURPOSE, AND THE POINT OF THAT IS WHAT IT DOES NOT CHANGE.
 * Placing it there means this addition alters where nobody currently lands: every existing
 * session resolves to the same dashboard it did before, because a reseller row is new and
 * nobody has one yet. A studio owner who later becomes a reseller keeps the partner dashboard
 * as their home — the surface they run a business from outranks the one they read a statement on.
 * components/dashboard-switcher.tsx lists the surfaces in this same order, so the other hat is one
 * click away rather than a URL somebody has to remember.
 *
 * A closed reseller still lands here rather than on /account. Closing is terminal, so this is
 * the last thing that surface will ever tell them — but "this arrangement has ended" is an
 * answer, and silently routing them to /account is not.
 */
export function homeFor({
  vendors,
  staffRoles,
  reseller,
}: {
  vendors: readonly ViewerVendor[]
  staffRoles: readonly StaffRoleKind[]
  reseller: ViewerReseller | null
}): string {
  if (staffRoles.length > 0) return DASHBOARDS.console
  if (vendors.length > 0) return DASHBOARDS.partner
  if (reseller) return DASHBOARDS.reseller
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
  const [vendors, staffRoles, reseller] = await Promise.all([
    getViewerVendors(),
    getViewerStaffRoles(),
    getViewerReseller(),
  ])
  return homeFor({ vendors, staffRoles, reseller })
}

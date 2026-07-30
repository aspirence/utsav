import 'server-only'

import { cookies } from 'next/headers'

import type { StaffRoleKind } from '@utsava/db'

import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/admin-supabase'
import { STAFF_ROLE_RANK } from '@/lib/admin-roles'
import {
  LOCAL_COOKIE_NAME,
  localAuthStatus,
  readLocalCookie,
  type LocalAuthStatus,
} from '@/lib/admin-local-auth'

/**
 * Is the caller staff, and which kind?
 *
 * Plan §3 gives staff their own identity scheme: "Field agent · moderator/support · finance
 * (four-eyes) · super admin; email + MFA" — email and a password, not the phone OTP customers
 * use. Both providers run on the same Supabase project and the same auth.users table, so one
 * human can be a customer on their phone and a moderator at their desk without two accounts.
 *
 * WHAT THIS IS AND IS NOT.
 *
 * This decides what the *screen* does: show the console, send you to the login page, or tell
 * you your account is not staff. It is not the authorization boundary. That is RLS, and it
 * does not depend on this file being called: `app.is_staff()` re-derives the role from
 * public.staff_roles inside every policy on every query. Delete this module and the console
 * becomes ugly, not unsafe — a non-staff visitor would see empty tables rather than data.
 *
 * That distinction is why the gate lives here rather than in middleware. Middleware runs on
 * the edge without a database round trip available cheaply, and a role check there would be
 * a second authorization model to keep in step with the first. The perimeter (IP allowlist)
 * belongs in middleware; identity belongs next to the query.
 *
 * `getUser()`, never `getSession()`. getSession decodes the cookie and trusts it, which on a
 * server is worthless — the cookie is client-supplied. getUser verifies it against the auth
 * server.
 */

export type StaffGate =
  /** Nobody is signed in on this browser. */
  | { state: 'anonymous' }
  /**
   * No Supabase, and no local credentials configured either — so there is no way to log in and
   * nothing may be opened. The login screen explains how to set it up.
   *
   * THIS IS THE SAFE DEFAULT, and it used to be the unsafe one. A `demo` state that rendered
   * the console for anyone who reached the URL made the login button decoration: the dashboard
   * was already on screen behind it.
   */
  | { state: 'locked'; reason: LocalAuthStatus }
  /** Signed in, but this account holds no staff role. A customer who wandered in. */
  | { state: 'not_staff'; email: string | null; phone: string | null }
  | { state: 'staff'; identity: StaffIdentity }

export interface StaffIdentity {
  id: string
  email: string | null
  phone: string | null
  fullName: string | null
  /** Every unrevoked role held, highest first. */
  roles: StaffRoleKind[]
  /** The one to show and to gate the UI on. */
  role: StaffRoleKind
  /**
   * Cities a field agent is scoped to. Empty means unscoped — which is what moderators,
   * finance and super admins always have, and what app.staff_covers_city() reads as "all".
   */
  cityIds: string[]
  /**
   * True when this session came from the local credentials rather than Supabase.
   *
   * Everything on screen is then a fixture and nothing written is persisted, so the chrome has
   * to say so — otherwise a suspension that quietly went nowhere looks like it worked.
   */
  isLocal: boolean
}

export async function getStaffGate(): Promise<StaffGate> {
  /**
   * No Supabase: the local credential path, or locked.
   *
   * Ordered before the Supabase branch and mutually exclusive with it — localAuthConfig()
   * returns null whenever Supabase is configured, so a real deployment can never reach this.
   */
  if (!hasSupabaseEnv()) {
    const status = localAuthStatus()
    if (status !== 'available') return { state: 'locked', reason: status }

    const jar = await cookies()
    const local = readLocalCookie(jar.get(LOCAL_COOKIE_NAME)?.value)
    if (!local) return { state: 'anonymous' }

    return {
      state: 'staff',
      identity: {
        id: 'local-super-admin',
        email: local.email,
        phone: null,
        fullName: 'Local super admin',
        roles: ['super'],
        role: 'super',
        cityIds: [],
        isLocal: true,
      },
    }
  }

  const supabase = await getServerClientOrNull()
  // Supabase is configured but the client could not be built — a broken cookie store, not a
  // reason to open the console.
  if (!supabase) return { state: 'anonymous' }

  const user = await verifiedUser(supabase)
  if (!user) return { state: 'anonymous' }

  /**
   * Both reads go through the caller's own session, so RLS is doing the work.
   *
   * `staff_roles_select_own` is `profile_id = auth.uid() or app.is_staff('super')`, which
   * means a customer querying this table gets their own zero rows rather than an error — and
   * a caller cannot learn anything about anyone else's roles by asking.
   *
   * Revoked roles are filtered here as well as in the policy because the policy does not
   * filter them: `staff_roles_select_own` returns your revoked rows too, and app.is_staff()
   * is the thing that ignores them. Reading the table directly means honouring that myself,
   * otherwise a sacked moderator keeps their console.
   *
   * A THROW HERE WOULD BE A 500 ON EVERY /admin PAGE, because this is called from a layout.
   * The catch turns a database we cannot reach into "no roles found", which routes to the
   * not_staff screen rather than to the console — the safe direction. It reads as a wrong
   * answer to the staff member, but a wrong answer that denies is recoverable and one that
   * admits is not.
   */
  let rows: { role: string; city_ids: string[] }[] = []
  let profile: { full_name: string | null } | null = null
  try {
    const [roleRes, profileRes] = await Promise.all([
      supabase
        .from('staff_roles')
        .select('role, city_ids')
        .eq('profile_id', user.id)
        .is('revoked_at', null),
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ])
    rows = roleRes.data ?? []
    profile = profileRes.data
  } catch {
    rows = []
  }

  if (rows.length === 0) {
    return { state: 'not_staff', email: user.email ?? null, phone: user.phone ?? null }
  }

  const roles = STAFF_ROLE_RANK.filter((r) => rows.some((row) => row.role === r))
  const primary = roles[0]
  if (!primary) {
    // A role string the enum has since grown past. Treat it as no access rather than
    // guessing: an unrecognised capability is not a capability.
    return { state: 'not_staff', email: user.email ?? null, phone: user.phone ?? null }
  }

  return {
    state: 'staff',
    identity: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      fullName: profile?.full_name ?? null,
      roles,
      role: primary,
      // The scope belongs to the row granting the highest role, not to a merge of all rows —
      // a merged list could widen an agent's reach beyond any single grant they were given.
      cityIds: rows.find((row) => row.role === primary)?.city_ids ?? [],
      isLocal: false,
    },
  }
}

/**
 * The verified session user, or null.
 *
 * `getUser()`, never `getSession()` — getSession decodes the cookie and trusts it, which on a
 * server is worthless because the cookie is client-supplied. getUser revalidates the token
 * against the auth server.
 *
 * The try/catch is not defensive noise. supabase-js usually reports network trouble as `error`
 * rather than throwing, but not always, and this is called from a layout: a throw is a 500 on
 * every page under /admin rather than one broken panel. Returning null routes to the login
 * page, which renders the form rather than gating on anything — so no redirect loop, and it
 * fails closed. An auth server we cannot reach is one whose answer we do not have.
 */
async function verifiedUser(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerClientOrNull>>>,
): Promise<{ id: string; email: string | null; phone: string | null } | null> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      phone: data.user.phone ?? null,
    }
  } catch {
    return null
  }
}

// roleLabel and canSee live in lib/admin-roles.ts — the sidebar is a client component and
// cannot import a `server-only` module. Re-exported so a Server Component has one place to
// import from rather than two.
export { canSee, roleLabel } from '@/lib/admin-roles'

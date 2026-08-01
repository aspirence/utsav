import 'server-only'

import { getStaffGate, type StaffIdentity } from '@/lib/admin-auth'
import { getServerClientOrNull } from '@/lib/admin-supabase'
import { createAdminClient } from '@/lib/db'

import type { StaffRoleKind } from '@/lib/db'

/**
 * Team and role management, for super admins.
 *
 * WHY THE WRITES ARE SERVICE-ROLE AND THE READS ARE NOT. `public.staff_roles` has a SELECT
 * policy and no write policy whatsoever — migration 001300 says so out loud: "granting staff
 * access is a service-role operation, audited in audit_log." That is a deliberate shape, not an
 * omission: a privilege grant is the one write that must not be expressible from a session,
 * because a policy that lets some role write staff_roles is a policy that can be made to grant
 * that role to somebody.
 *
 * So this module is split down the middle. Reads go through the caller's own session and are
 * RLS-scoped exactly like the rest of the console (`staff_roles_select_own` admits super admins,
 * `profiles_select_own` admits all staff). Writes take the service-role key, and every one of
 * them is preceded by `requireSuper()` and followed by an audit row.
 *
 * REQUIRE-SUPER IS THE BOUNDARY HERE, and that is unusual enough to say plainly. Everywhere else
 * in this codebase RLS is the boundary and the application check is courtesy — see
 * lib/admin-roles.ts. Not here: the service-role key bypasses RLS entirely, so on this path
 * there is no policy standing behind the check. It has to be right.
 */

// ---------------------------------------------------------------------------
// Reads — the caller's own session, RLS-scoped.
// ---------------------------------------------------------------------------

export interface TeamMember {
  profileId: string
  fullName: string | null
  email: string | null
  phone: string | null
  /** Every unrevoked role this person holds, highest first. */
  roles: StaffRoleKind[]
  /** Cities a field agent is scoped to. Empty means unscoped. */
  cityIds: string[]
  grantedAt: string | null
}

/** Highest authority first, matching STAFF_ROLE_RANK. */
const RANK: StaffRoleKind[] = ['super', 'moderator', 'finance', 'field_agent']

function byRank(a: StaffRoleKind, b: StaffRoleKind): number {
  return RANK.indexOf(a) - RANK.indexOf(b)
}

/**
 * Everybody who currently holds a staff role.
 *
 * Revoked rows are filtered here rather than left to the caller. `staff_roles_select_own` returns
 * them — it keys on ownership, not on liveness — and a revoked moderator listed alongside live
 * ones is the kind of thing somebody reads once, wrongly, and acts on.
 */
export async function listTeam(): Promise<TeamMember[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return []

  const { data: roleRows, error } = await supabase
    .from('staff_roles')
    .select('profile_id, role, city_ids, granted_at')
    .is('revoked_at', null)

  if (error || !roleRows?.length) return []

  const ids = [...new Set(roleRows.map((r) => r.profile_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .in('id', ids)

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))

  const merged = new Map<string, TeamMember>()
  for (const row of roleRows) {
    const existing = merged.get(row.profile_id)
    if (existing) {
      existing.roles.push(row.role)
      // A field agent scoped to two cities across two rows is scoped to both.
      existing.cityIds = [...new Set([...existing.cityIds, ...row.city_ids])]
      continue
    }
    const profile = byId.get(row.profile_id)
    merged.set(row.profile_id, {
      profileId: row.profile_id,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      roles: [row.role],
      cityIds: row.city_ids,
      grantedAt: row.granted_at,
    })
  }

  const team = [...merged.values()]
  for (const member of team) member.roles.sort(byRank)
  team.sort(
    (a, b) =>
      byRank(a.roles[0] ?? 'field_agent', b.roles[0] ?? 'field_agent') ||
      (a.fullName ?? a.email ?? '').localeCompare(b.fullName ?? b.email ?? ''),
  )
  return team
}

export interface AccountMatch {
  profileId: string
  fullName: string | null
  email: string | null
  phone: string | null
}

/**
 * Find an account to grant a role to, by email or phone.
 *
 * A SEARCH RATHER THAN A LIST OF EVERY USER. `profiles_select_own` lets any staff member read
 * every profile, so listing them all is possible — and it would put the phone number of every
 * customer on the marketplace onto one screen behind one session. A super admin granting a role
 * already knows who they are granting it to; making them type the address is the difference
 * between looking somebody up and downloading the user table.
 *
 * The account must already exist. There is no create-user path here on purpose: making an
 * `auth.users` row is `admin.createUser`, which belongs to scripts/bootstrap-super-admin.mjs and
 * an operator at a terminal, not to a form that is one misclick from minting an identity.
 */
export async function findAccounts(query: string): Promise<AccountMatch[]> {
  const term = query.trim()
  if (term.length < 3) return []

  const supabase = await getServerClientOrNull()
  if (!supabase) return []

  // Escape the PostgREST filter metacharacters before interpolating. A comma would otherwise
  // end the `or()` term and let the rest of the string be read as another filter.
  const safe = term.replace(/[,()*]/g, ' ')

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .or(`email.ilike.%${safe}%,phone.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .is('deleted_at', null)
    .limit(10)

  return (data ?? []).map((p) => ({
    profileId: p.id,
    fullName: p.full_name,
    email: p.email,
    phone: p.phone,
  }))
}

// ---------------------------------------------------------------------------
// Writes — service-role, gated, audited.
// ---------------------------------------------------------------------------

export class NotSuperAdmin extends Error {
  constructor() {
    super('Only a super admin may change staff roles.')
    this.name = 'NotSuperAdmin'
  }
}

/**
 * The gate for every write below. Throws rather than returning a flag, so a caller cannot
 * forget to check the result — the one failure mode that matters on a path that then picks up
 * a key which ignores RLS.
 *
 * The local-credential session is refused. It has no auth.users row, so there is no honest
 * actor_id to write into the audit log, and an unattributable privilege grant is worse than a
 * refused one. That session only exists when no database is attached, where there is nothing to
 * grant anyway.
 */
async function requireSuper(): Promise<StaffIdentity> {
  const gate = await getStaffGate()
  if (gate.state !== 'staff') throw new NotSuperAdmin()
  if (!gate.identity.roles.includes('super')) throw new NotSuperAdmin()
  if (gate.identity.isLocal) throw new NotSuperAdmin()
  return gate.identity
}

async function writeAudit(
  actor: StaffIdentity,
  entry: {
    action: string
    subjectId: string
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    reason?: string | null
  },
): Promise<void> {
  const admin = createAdminClient()
  await admin.from('audit_log').insert({
    actor_id: actor.id,
    actor_role: actor.role,
    action: entry.action,
    subject_type: 'staff_role',
    subject_id: entry.subjectId,
    before_state: entry.before ?? null,
    after_state: entry.after ?? null,
    reason: entry.reason ?? null,
  })
}

/**
 * Grant a staff role, or restore one that was revoked.
 *
 * `revoked_at: null` in the upsert is what makes this the way back: re-granting a role somebody
 * lost restores the same row rather than leaving a revoked one beside a live one, and the unique
 * index is on (profile_id, role), so there is only ever one.
 *
 * `city_ids` is meaningful for `field_agent` and ignored for the rest — plan §3 scopes agents to
 * their own city and leaves moderators, finance and super unscoped. Passing cities with a
 * moderator grant is silently dropped rather than rejected, because the column would be read as
 * "all" anyway and a validation error there teaches nobody anything.
 */
export async function grantRole(input: {
  profileId: string
  role: StaffRoleKind
  cityIds?: string[]
  reason?: string | null
}): Promise<void> {
  const actor = await requireSuper()
  const admin = createAdminClient()

  const cityIds = input.role === 'field_agent' ? (input.cityIds ?? []) : []

  const { data: before } = await admin
    .from('staff_roles')
    .select('role, city_ids, revoked_at')
    .eq('profile_id', input.profileId)
    .eq('role', input.role)
    .maybeSingle()

  const { error } = await admin.from('staff_roles').upsert(
    {
      profile_id: input.profileId,
      role: input.role,
      city_ids: cityIds,
      revoked_at: null,
      granted_by: actor.id,
    },
    { onConflict: 'profile_id,role' },
  )
  if (error) throw new Error(error.message)

  await writeAudit(actor, {
    action: before?.revoked_at ? 'staff_role.restored' : 'staff_role.granted',
    subjectId: input.profileId,
    before: before ?? null,
    after: { role: input.role, city_ids: cityIds },
    reason: input.reason ?? null,
  })
}

export class LastSuperAdmin extends Error {
  constructor() {
    super('That is the only super admin left — grant the role to somebody else first.')
    this.name = 'LastSuperAdmin'
  }
}

/**
 * Revoke a staff role.
 *
 * TWO RAILS, AND BOTH ARE ABOUT LOCKING THE CONSOLE. Revoking your own super role is refused,
 * and so is revoking the last super role held by anybody. Either one leaves a console nobody can
 * administer, recoverable only by an operator with the service-role key running
 * scripts/bootstrap-super-admin.mjs — which is a fine escape hatch and a terrible Tuesday.
 *
 * Revoked, not deleted. `revoked_at` keeps the row so the audit trail has something to point at
 * and so a restore is an update rather than a fresh grant with a new history.
 */
export async function revokeRole(input: {
  profileId: string
  role: StaffRoleKind
  reason?: string | null
}): Promise<void> {
  const actor = await requireSuper()

  if (input.role === 'super') {
    if (input.profileId === actor.id) throw new LastSuperAdmin()

    const admin = createAdminClient()
    const { count } = await admin
      .from('staff_roles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super')
      .is('revoked_at', null)

    if ((count ?? 0) <= 1) throw new LastSuperAdmin()
  }

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('staff_roles')
    .select('role, city_ids, revoked_at')
    .eq('profile_id', input.profileId)
    .eq('role', input.role)
    .maybeSingle()

  const { error } = await admin
    .from('staff_roles')
    .update({ revoked_at: new Date().toISOString() })
    .eq('profile_id', input.profileId)
    .eq('role', input.role)
    .is('revoked_at', null)

  if (error) throw new Error(error.message)

  await writeAudit(actor, {
    action: 'staff_role.revoked',
    subjectId: input.profileId,
    before: before ?? null,
    after: null,
    reason: input.reason ?? null,
  })
}

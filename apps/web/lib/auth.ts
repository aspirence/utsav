import 'server-only'

import { redirect } from 'next/navigation'

import { getServerClientOrNull } from '@/lib/supabase'

/**
 * Who is asking, on the server.
 *
 * Plan §3: "One human = one auth identity; capabilities come from memberships, not a role
 * column." So this returns the identity and nothing else - no role, no permissions. What
 * a caller may do is decided by RLS against their memberships, and asking that question
 * here would be building a second authorization model beside the real one.
 *
 * ALWAYS `getUser()`, NEVER `getSession()`. getSession decodes the cookie and trusts it,
 * which is fine in a browser and worthless on a server: the cookie is client-supplied.
 * getUser verifies the token against the auth server. The difference is the difference
 * between an auth check and a suggestion.
 */
export interface SessionUser {
  id: string
  phone: string | null
  email: string | null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return null

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  return {
    id: data.user.id,
    phone: data.user.phone ?? null,
    email: data.user.email ?? null,
  }
}

/**
 * The profile row behind the session. Created by the `on_auth_user_created` trigger in
 * migration 000300, so it exists by the time anyone can call this - but it is still read
 * through RLS, so a bad policy shows up as null here rather than as someone else's row.
 */
export interface Profile {
  id: string
  fullName: string | null
  phone: string | null
  email: string | null
  cityId: string | null
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return null

  const user = await getSessionUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, phone, email, city_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    fullName: data.full_name,
    phone: data.phone,
    email: data.email,
    cityId: data.city_id,
  }
}

/**
 * Gate a page on being signed in.
 *
 * Carries the path being guarded through as `next`, so signing in returns you to what you
 * were trying to reach rather than dumping you on a dashboard. `redirect()` throws, so
 * nothing after this line runs for an anonymous caller.
 *
 * This is a convenience, not the boundary. The boundary is RLS: a signed-in user who
 * reaches a page they have no rows for simply sees nothing.
 */
export async function requireUser(next: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`)
  return user
}

import 'server-only'

import { cookies } from 'next/headers'

import { createFremmoServerClient, hasSupabaseEnv, type FremmoClient } from '@/lib/db'

/**
 * Request-scoped Supabase client for the staff console.
 *
 * Deliberately identical to apps/web/lib/supabase.ts. The admin app is a separate deploy
 * (plan §3: "separate deploy, SSO + IP allowlist, append-only audit log"), so it needs its
 * own module — but it must not get its own *rules*. Every read and write from this console
 * still carries the staff member's own session, and RLS decides what it may touch.
 *
 * That matters more here than anywhere else. `moderation_queue_staff`,
 * `vendors_update_staff` and `audit_log_insert_staff` all key off app.is_staff(), which
 * reads public.staff_roles for auth.uid(). A service-role client would bypass all three
 * and the audit row would have no honest actor to attach. The service-role key is for the
 * routing and escrow RPCs (plan §6), not for making a moderator's decision anonymous.
 */
export async function getServerClient(): Promise<FremmoClient> {
  const store = await cookies()

  return createFremmoServerClient({
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list) => {
      for (const { name, value, options } of list) {
        store.set(name, value, options)
      }
    },
  })
}

/** Returns null instead of throwing when the console has no Supabase configured yet. */
export async function getServerClientOrNull(): Promise<FremmoClient | null> {
  if (!hasSupabaseEnv()) return null
  try {
    return await getServerClient()
  } catch {
    return null
  }
}

export { hasSupabaseEnv }

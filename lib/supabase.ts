import 'server-only'

import { cookies } from 'next/headers'

import { createUtsavaServerClient, hasSupabaseEnv, type UtsavaClient } from '@/lib/db'

/**
 * Request-scoped Supabase client for Server Components and server actions.
 *
 * Plan §4: "Server Components do all reads (RLS-scoped)". Every read through this
 * client carries the caller's session, so RLS — not application code — decides what
 * comes back (plan §6).
 */
export async function getServerClient(): Promise<UtsavaClient> {
  const store = await cookies()

  return createUtsavaServerClient({
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list) => {
      for (const { name, value, options } of list) {
        store.set(name, value, options)
      }
    },
  })
}

/** Returns null instead of throwing when the app has no Supabase configured yet. */
export async function getServerClientOrNull(): Promise<UtsavaClient | null> {
  if (!hasSupabaseEnv()) return null
  try {
    return await getServerClient()
  } catch {
    return null
  }
}

export { hasSupabaseEnv }

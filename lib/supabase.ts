import 'server-only'

import { cookies } from 'next/headers'

import {
  createUtsavaPublicClient,
  createUtsavaServerClient,
  hasSupabaseEnv,
  type UtsavaClient,
} from '@/lib/db'

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

/**
 * Client for reading the public catalogue: the session's if there is one, an anonymous
 * one if there is not.
 *
 * THE DIFFERENCE FROM getServerClientOrNull() IS WHAT HAPPENS DURING PRERENDERING.
 * cookies() needs a request, and the discovery pages, vendor profiles and stories are all
 * statically generated with generateStaticParams — so at build time getServerClient()
 * throws and the null-returning version reports "no database". Callers read that as "not
 * configured yet" and fall back to fixtures, which is right before a project is attached
 * and badly wrong after: the SEO surface plan §12 exists to prerender would bake demo
 * listings into static HTML, silently and without an error anywhere.
 *
 * Falling back to the anonymous client instead means a prerender reads the real catalogue
 * as a signed-out visitor — which is precisely who those pages are for.
 *
 * ONLY FOR ANON-READABLE DATA. There is no session on the fallback path, so a query that
 * depends on auth.uid() returns a stranger's view rather than failing. Shortlists, the
 * account area, partner dashboards and the console must keep getServerClientOrNull().
 */
export async function getPublicReadClient(): Promise<UtsavaClient | null> {
  if (!hasSupabaseEnv()) return null
  try {
    return await getServerClient()
  } catch {
    try {
      return createUtsavaPublicClient()
    } catch {
      return null
    }
  }
}

export { hasSupabaseEnv }

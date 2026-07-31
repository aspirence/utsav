/**
 * Supabase client factories.
 *
 * Plan §4: "Server Components do all reads (RLS-scoped) … client-side Supabase only
 * for Realtime and Storage uploads; money paths only in Edge Functions / route
 * handlers with signature verification."
 *
 * Plan §6: "the service-role key never ships in a client bundle" — createAdminClient()
 * below enforces that at runtime rather than trusting the bundler.
 */

import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

import type { Database } from './generated/database.types'

/**
 * The client type used across the app.
 *
 * Derived from the factory rather than written as `SupabaseClient<Database>`: since
 * supabase-js 2.5x the class carries five generic parameters whose defaults are
 * conditional on the shape of `Database`, so a hand-written alias resolves to a
 * *different* instantiation than the one createServerClient actually returns. Inferring
 * it keeps the two in lockstep through future supabase-js upgrades.
 */
export type UtsavaClient = ReturnType<typeof createUtsavaServerClient>

export interface SupabaseEnv {
  url: string
  anonKey: string
}

function readPublicEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.example to .env.local, then run `pnpm db:start` for local values.',
    )
  }
  return { url, anonKey }
}

/** True when the app has been pointed at a Supabase instance. */
export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/**
 * Browser client. Anon key only — RLS is the boundary (plan §6), so this is safe to
 * ship. Use it for Realtime subscriptions and Storage uploads, not for page reads.
 */
export function createUtsavaBrowserClient() {
  const { url, anonKey } = readPublicEnv()
  return createBrowserClient<Database>(url, anonKey)
}

/**
 * Cookie adapter, so this package stays framework-agnostic. apps/web wires it to
 * `next/headers`; the Expo app and any worker supply their own.
 */
export interface CookieAdapter {
  getAll(): { name: string; value: string }[]
  setAll(cookies: { name: string; value: string; options?: CookieOptions }[]): void
}

/**
 * Server client carrying the caller's session. Every read through this client is
 * RLS-scoped to that user — which is what makes plan §6's "no trusted API between
 * clients and Postgres" workable.
 */
export function createUtsavaServerClient(cookies: CookieAdapter) {
  const { url, anonKey } = readPublicEnv()

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (list: { name: string; value: string; options?: CookieOptions }[]) => {
        try {
          cookies.setAll(list)
        } catch {
          // Server Components cannot set cookies. Session refresh happens in
          // middleware instead, so swallowing this is correct rather than lossy.
        }
      },
    },
  })
}

/**
 * Sessionless public client. Anon key, no cookies, therefore no request scope needed.
 *
 * WHY IT EXISTS. createUtsavaServerClient() is fed from next/headers' cookies(), which is
 * unavailable while a page is being statically generated. Every caller wrapped that in a
 * try/catch returning null, and the public read paths treated null as "no database" and
 * fell back to fixtures — so the discovery pages, which are exactly the pages plan §12
 * wants prerendered, baked fake listings into static HTML the moment a real project was
 * attached. Nothing errored; the pages just quietly showed the wrong vendors.
 *
 * The catalogue is anon-readable by policy, so a session adds nothing to those queries.
 * This client is that fact made explicit.
 *
 * IT IS NOT A BACKDOOR. It carries the anon key, so PostgREST runs it as `anon` and every
 * RLS policy applies unchanged — it can only ever see what a signed-out visitor sees. Use
 * it for the public catalogue; anything user-scoped must keep the session client, or it
 * will silently read as a stranger.
 *
 * Built on createServerClient with an inert cookie adapter rather than createClient, so it
 * returns the same UtsavaClient type. A structurally different client here would resolve
 * the schema generics differently and collapse callers to `never` — the trap documented on
 * UtsavaClient above.
 */
export function createUtsavaPublicClient() {
  const { url, anonKey } = readPublicEnv()

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  })
}

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Plan §6 restricts this to "money paths … in Edge Functions / route handlers with
 * signature verification" plus the routing and escrow RPCs. The window check is a
 * runtime backstop: if a refactor ever pulls this into a client component, it throws
 * at import time instead of quietly shipping the key to a browser.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createAdminClient() was called in a browser context. The service-role key must ' +
        'never reach a client bundle (plan §6).',
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Public image URL via Supabase Storage CDN transforms.
 *
 * Plan §12: "Supabase CDN transforms bypass the image optimizer; static-first pages;
 * budget alarms" — the mitigation for "Vercel/media cost creep at SEO scale". Never
 * route these through next/image's optimizer.
 *
 * A path starting with `/` is returned untouched. Those are files served from the app's
 * own public/ directory, not Storage objects — there is nothing to sign and no transform
 * to request, and wrapping one in a Storage render URL would produce a 404. This is what
 * lets the fixture vendors in apps/web/lib/fixtures.ts carry real artwork while the
 * project has no Supabase project attached; a real `cover_path` from the database is a
 * bucket-relative key with no leading slash, so the two can never be confused.
 */
export function storageImageUrl(
  storagePath: string | null | undefined,
  opts: { width?: number; height?: number; quality?: number; bucket?: string } = {},
): string | null {
  if (!storagePath) return null
  if (storagePath.startsWith('/')) return storagePath

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null

  const { width, height, quality = 75, bucket = 'vendor-media' } = opts
  const params = new URLSearchParams()
  if (width) params.set('width', String(width))
  if (height) params.set('height', String(height))
  params.set('quality', String(quality))
  params.set('resize', 'cover')

  return `${base}/storage/v1/render/image/public/${bucket}/${storagePath}?${params.toString()}`
}

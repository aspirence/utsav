import { NextResponse, type NextRequest } from 'next/server'

import { createUtsavaServerClient, hasSupabaseEnv } from '@utsava/db'

/**
 * Edge middleware.
 *
 * Two jobs, and the first one is load-bearing.
 *
 * ── 1. Guarding /admin ────────────────────────────────────────────────────────
 * Plan §3 specifies the staff console as "a separate deploy, SSO + IP allowlist,
 * append-only audit log". It now shares an origin with the customer site by explicit
 * product decision, which means the network-level isolation the plan assumed no longer
 * exists — a separate Vercel project could be locked down at the edge; a path on the
 * public site cannot.
 *
 * This restores the intent in the only place left to do it. ADMIN_IP_ALLOWLIST holds a
 * comma-separated list of IPv4/IPv6 addresses or CIDR-ish prefixes; when it is set, any
 * request to /admin from outside the list gets a 404 rather than a 403. A 404 does not
 * confirm the console exists.
 *
 * IMPORTANT: an IP allowlist is a perimeter, not an authorization model. The real
 * boundary is unchanged and lives in the database — public.staff_roles plus the RLS
 * policies in migration 20260727001300. A leaked laptop on an allowlisted network still
 * cannot moderate anything without a staff role. Do not treat this file as the guard.
 *
 * When ADMIN_IP_ALLOWLIST is empty the allowlist is skipped, so local development and
 * preview deploys work. Set it in production.
 *
 * ── 2. Supabase session refresh ───────────────────────────────────────────────
 * Server Components cannot set cookies (see the note in packages/db/src/clients.ts), so
 * a rotated refresh token has nowhere to land and the user silently logs out. Middleware
 * is the one place in the request lifecycle that can write them back.
 *
 * `getUser()` is the call that does it. It is not a read for its own sake - it revalidates
 * the access token against the auth server and, if the refresh token has rotated, hands
 * the new pair to `setAll`, which writes them onto the outgoing response. Drop the call
 * and sessions expire after an hour no matter how recently the user was active.
 *
 * It must be `getUser()` and not `getSession()`. getSession reads the cookie and trusts
 * it; a cookie is client-supplied, so on the server it proves nothing. getUser verifies.
 */

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const allowlist = parseAllowlist(process.env.ADMIN_IP_ALLOWLIST)

    if (allowlist.length > 0 && !isAllowed(clientIp(request), allowlist)) {
      // Not 403: a 403 tells an attacker there is something here worth attacking.
      return new NextResponse(null, { status: 404 })
    }

    const response = await refreshSession(request)
    // Defence in depth alongside robots.ts and the route's own metadata.
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Referrer-Policy', 'no-referrer')
    // The console shows customer PII; it must never sit in a shared cache.
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    return response
  }

  return refreshSession(request)
}

/**
 * Revalidate the session and carry any rotated cookies onto the response.
 *
 * The two-place cookie write is the part that is easy to get wrong. A rotated token has to
 * land on *both* the request (so anything later in this same request sees it) and the
 * response (so the browser keeps it). Writing only the response means the current render
 * still runs on the old token; writing only the request means the browser never gets it and
 * the next request starts over.
 *
 * No Supabase configured is not an error. The site runs off fixtures until it is pointed at
 * an instance, and every page has to keep working - so this passes the request through
 * untouched rather than throwing at the edge, where a throw is a 500 on every route.
 */
/**
 * Next gives a Server Component no way to read the current path, so middleware forwards it.
 *
 * The account layout needs it to build `/login?next=…`: without it every sub-page redirects
 * to the same hardcoded `/account`, and someone who followed a link to their enquiries
 * lands on the overview after signing in and has to find them again.
 *
 * A request header rather than a cookie: it is per-request by nature, never persisted, and
 * cannot be read by the client.
 */
function withPath(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

async function refreshSession(request: NextRequest): Promise<NextResponse> {
  if (!hasSupabaseEnv()) return withPath(request)

  let response = withPath(request)

  // Through @utsava/db rather than @supabase/ssr directly. pnpm's strict layout means a
  // transitive dependency is not resolvable from here, and going through the package keeps
  // one typed factory instead of a second client configured slightly differently.
  const supabase = createUtsavaServerClient({
    getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list) => {
      for (const { name, value } of list) request.cookies.set(name, value)
      response = withPath(request)
      for (const { name, value, options } of list) response.cookies.set(name, value, options)
    },
  })

  try {
    await supabase.auth.getUser()
  } catch {
    // A reachability failure must not take the whole site down with it. The user simply
    // stays unauthenticated for this request; RLS then returns nothing, which is the
    // correct outcome rather than a 500 on every route.
  }

  return response
}

/**
 * Vercel and most proxies set x-forwarded-for. The left-most entry is the original
 * client; everything after it was appended by intermediaries. Reading the right-most
 * value instead would let a caller spoof their address by sending their own header.
 */
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return normalise(first)
  }
  const real = request.headers.get('x-real-ip')
  return real ? normalise(real.trim()) : null
}

/** ::ffff:203.0.113.4 is an IPv4 address wearing an IPv6 coat. */
function normalise(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Exact match, or a dotted prefix match so "203.0.113." allows that whole /24 without
 * needing real CIDR arithmetic at the edge. The prefix form must end in a dot, otherwise
 * "10.1.1" would also match "10.1.11.x".
 */
function isAllowed(ip: string | null, allowlist: string[]): boolean {
  if (!ip) return false
  return allowlist.some((entry) =>
    entry.endsWith('.') ? ip.startsWith(entry) : ip === entry,
  )
}

export const config = {
  // Skip static assets and image requests — they carry no session and no PII.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

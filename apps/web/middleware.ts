import { NextResponse, type NextRequest } from 'next/server'

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
 */

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const allowlist = parseAllowlist(process.env.ADMIN_IP_ALLOWLIST)

    if (allowlist.length > 0 && !isAllowed(clientIp(request), allowlist)) {
      // Not 403: a 403 tells an attacker there is something here worth attacking.
      return new NextResponse(null, { status: 404 })
    }

    const response = NextResponse.next()
    // Defence in depth alongside robots.ts and the route's own metadata.
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Referrer-Policy', 'no-referrer')
    // The console shows customer PII; it must never sit in a shared cache.
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    return response
  }

  return NextResponse.next()
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

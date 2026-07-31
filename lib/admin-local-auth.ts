import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { hasSupabaseEnv } from '@/lib/db'

/**
 * A super-admin login that works with no database attached.
 *
 * WHY THIS EXISTS. Until this, the console had no gate when Supabase was absent: it rendered
 * on fixtures and offered a "Staff log in" link beside a dashboard you could already read,
 * which is a login button that protects nothing. The requirement is login first, always —
 * and real Supabase auth cannot satisfy it before a Supabase project exists.
 *
 * WHY IT IS NOT A BACKDOOR. Three properties, and all three matter:
 *
 *  1. IT TURNS ITSELF OFF. `isLocalAuthAvailable()` returns false the moment
 *     NEXT_PUBLIC_SUPABASE_URL is set. Once there is a real auth server, this path stops
 *     existing — it cannot be left enabled in production by forgetting to remove it, because
 *     production has Supabase configured and that alone disables it.
 *  2. THE COOKIE IS SIGNED. HMAC-SHA256 over the email and an expiry, compared in constant
 *     time. A cookie called `admin=true` would be a login anyone can type into devtools; this
 *     one cannot be produced without the secret.
 *  3. IT REQUIRES DELIBERATE SETUP. No default password, no fallback secret. With the three
 *     variables unset the console is *locked*, not open — which is the safe direction and the
 *     opposite of what it did before.
 *
 * WHAT IT IS NOT. It is not an identity. There is no profile row, no staff_roles row, no
 * auth.uid() — so nothing it does can be written to the audit log with a real actor, which is
 * fine because with no database there is nothing to write. Every screen is serving fixtures.
 * The moment a database appears, this path is gone and plan §3's email+MFA staff identity is
 * the only way in.
 */

const COOKIE = 'utsava_admin_local'

/** Eight hours. A working day, and short enough that a forgotten browser is not a standing key. */
const TTL_MS = 8 * 60 * 60 * 1000

export interface LocalAuthConfig {
  email: string
  password: string
  secret: string
}

/**
 * The configured local credentials, or null.
 *
 * Returns null whenever Supabase is configured — not as a courtesy, as the mechanism that
 * makes this safe to have in the tree at all.
 */
export function localAuthConfig(): LocalAuthConfig | null {
  if (hasSupabaseEnv()) return null

  const email = process.env.ADMIN_LOCAL_EMAIL?.trim()
  const password = process.env.ADMIN_LOCAL_PASSWORD
  const secret = process.env.ADMIN_LOCAL_SECRET

  if (!email || !password || !secret) return null
  // A short secret is a guessable secret. Refusing is better than signing with one, because a
  // forgeable cookie looks exactly like a working login until someone forges it.
  if (secret.length < 32) return null
  if (password.length < 8) return null

  return { email: email.toLowerCase(), password, secret }
}

/** True when a local login is possible at all. False once Supabase exists. */
export function isLocalAuthAvailable(): boolean {
  return localAuthConfig() !== null
}

/**
 * Why the local login is unavailable, for the login screen to explain.
 *
 * 'supabase' is not a problem — it means the real thing is wired up. The other two are setup
 * states the operator has to resolve, and telling them which one they are in is the difference
 * between a five-second fix and a bug report.
 */
export type LocalAuthStatus = 'available' | 'supabase' | 'unset' | 'weak'

export function localAuthStatus(): LocalAuthStatus {
  if (hasSupabaseEnv()) return 'supabase'

  const email = process.env.ADMIN_LOCAL_EMAIL?.trim()
  const password = process.env.ADMIN_LOCAL_PASSWORD
  const secret = process.env.ADMIN_LOCAL_SECRET

  if (!email || !password || !secret) return 'unset'
  if (secret.length < 32 || password.length < 8) return 'weak'
  return 'available'
}

/**
 * Do these credentials match?
 *
 * Both comparisons are constant-time. The email one matters less than the password one, but a
 * fast-failing email check still leaks which addresses are configured, and the cost of doing
 * it properly is one function call.
 */
export function checkLocalCredentials(email: string, password: string): boolean {
  const config = localAuthConfig()
  if (!config) return false

  return (
    constantTimeEqual(email.trim().toLowerCase(), config.email) &&
    constantTimeEqual(password, config.password)
  )
}

// ---------------------------------------------------------------------------
// The signed cookie
// ---------------------------------------------------------------------------

export const LOCAL_COOKIE_NAME = COOKIE

export interface LocalCookie {
  value: string
  maxAge: number
}

/**
 * Mint a session cookie for the local admin.
 *
 * Format is `<base64url payload>.<hex hmac>` — the same shape as a JWT minus the header,
 * because the header would only ever say HS256 here. The payload carries the email and an
 * absolute expiry, and the expiry is *inside the signature*: a cookie whose Max-Age the browser
 * ignores is still refused on the server.
 */
export function mintLocalCookie(): LocalCookie | null {
  const config = localAuthConfig()
  if (!config) return null

  const payload = { email: config.email, exp: Date.now() + TTL_MS }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(encoded, config.secret)

  return { value: `${encoded}.${signature}`, maxAge: Math.floor(TTL_MS / 1000) }
}

/**
 * Verify a cookie and return the email it was signed for.
 *
 * Every failure returns null and none of them are distinguished, because the only caller is a
 * gate and there is nothing useful to do with the difference between "tampered", "expired" and
 * "malformed".
 */
export function readLocalCookie(raw: string | undefined): { email: string } | null {
  const config = localAuthConfig()
  if (!config || !raw) return null

  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null

  const encoded = raw.slice(0, dot)
  const signature = raw.slice(dot + 1)

  // Signature first. Parsing attacker-controlled JSON before authenticating it is how a check
  // becomes an attack surface.
  if (!constantTimeEqual(signature, sign(encoded, config.secret))) return null

  let payload: { email?: unknown; exp?: unknown }
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (typeof payload.email !== 'string' || typeof payload.exp !== 'number') return null
  if (payload.exp < Date.now()) return null
  // The configured email may have changed since the cookie was minted. It is no longer a
  // session for anyone we recognise.
  if (payload.email !== config.email) return null

  return { email: payload.email }
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

/**
 * Constant-time string comparison.
 *
 * timingSafeEqual throws on length mismatch, which would itself be a timing signal — so both
 * sides are hashed to a fixed 32 bytes first. That makes the comparison independent of input
 * length without needing to pad or truncate anything.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'utsava-compare').update(a).digest()
  const hb = createHmac('sha256', 'utsava-compare').update(b).digest()
  return timingSafeEqual(ha, hb)
}

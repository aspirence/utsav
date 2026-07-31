'use server'

import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'

import { createUtsavaServerClient, hasSupabaseEnv } from '@utsava/db'

import {
  LOCAL_COOKIE_NAME,
  checkLocalCredentials,
  isLocalAuthAvailable,
  localAuthStatus,
  mintLocalCookie,
} from '@/lib/admin-local-auth'

/**
 * Staff sign-in, and sign-out.
 *
 * Email and password, not the phone OTP the customer site uses. Plan §3 asks for exactly
 * this: "Field agent · moderator/support · finance (four-eyes) · super admin; email + MFA."
 * Both providers live on one Supabase project and one auth.users table, so a person can be a
 * customer on their phone and a moderator at their desk on the same identity.
 *
 * A PASSWORD BRINGS RISKS AN OTP DOES NOT. Four of them are handled here.
 *
 * 1. NO SIGN-UP PATH. signUp() is not called anywhere in this file and must not be. Staff
 *    accounts are created by a super admin (or, for the first one, by hand in the Supabase
 *    dashboard). An open signup would let anyone mint an account; they would hold no staff
 *    role and see nothing, but it would still fill auth.users with strangers and put a
 *    password-reset surface on the console.
 *
 * 2. NO ENUMERATION. Every failure returns the same sentence regardless of whether the email
 *    exists, the password was wrong, or the account is unconfirmed. Supabase's own errors
 *    distinguish these; passing them through would turn this form into a tool for finding out
 *    who works here.
 *
 * 3. NO "IS THIS PERSON STAFF" CHECK HERE. Sign-in establishes identity; it does not grant
 *    console access. The layout's gate decides that, and RLS decides what any query returns.
 *    Refusing to sign in a non-staff account would leak the same thing as (2) — that this
 *    email is or is not a staff account.
 *
 * 4. NO next= REDIRECT FROM AN ARBITRARY PATH. Only same-origin absolute paths are honoured,
 *    so a crafted link cannot bounce a freshly-signed-in staff member off-site with their
 *    session warm.
 *
 * What is NOT handled here, and should be before this carries real traffic: rate limiting
 * beyond Supabase's own defaults, and MFA. The plan asks for MFA on staff accounts and this
 * does not implement it — Supabase supports TOTP enrolment and it is a separate piece of work.
 */

export type StaffAuthState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

const credentialsSchema = z.object({
  // Not .email(): the point is only to catch an obviously-empty box before a network call.
  // Whether the address is real is the auth server's answer to give, and it gives it the same
  // way for every failure (see 2 above).
  email: z.string().trim().min(3, 'Enter your work email').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
  next: z.string().optional(),
})

/** One sentence for every failure. See note 2 above before making this more helpful. */
const REFUSED =
  'That email and password do not match a staff account. Check both, or ask a super admin to ' +
  'reset your password.'

export async function signInStaff(
  _prev: StaffAuthState,
  form: FormData,
): Promise<StaffAuthState> {
  const parsed = credentialsSchema.safeParse({
    email: text(form.get('email')),
    password: typeof form.get('password') === 'string' ? form.get('password') : '',
    next: text(form.get('next')),
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? REFUSED }
  }

  /**
   * No Supabase: the local credential path.
   *
   * Mutually exclusive with the Supabase branch below — isLocalAuthAvailable() is false the
   * moment NEXT_PUBLIC_SUPABASE_URL is set, so a real deployment cannot reach this even if
   * ADMIN_LOCAL_* are somehow still in the environment.
   */
  if (!hasSupabaseEnv()) {
    if (!isLocalAuthAvailable()) return { status: 'unconfigured', message: setupMessage() }

    if (!checkLocalCredentials(parsed.data.email, parsed.data.password)) {
      return { status: 'error', message: REFUSED }
    }

    const cookie = mintLocalCookie()
    if (!cookie) return { status: 'error', message: setupMessage() }

    const jar = await cookies()
    jar.set(LOCAL_COOKIE_NAME, cookie.value, {
      // httpOnly so no script can read it; the signature stops it being forged, and httpOnly
      // stops it being stolen by one.
      httpOnly: true,
      sameSite: 'lax',
      /*
       * `secure` follows the REQUEST's scheme, not NODE_ENV.
       *
       * It used to be `process.env.NODE_ENV === 'production'`, and that was a real bug rather than
       * a nitpick: `next start` runs with NODE_ENV=production, so a build served over
       * http://192.168.1.x — which is exactly how this local-auth path gets used — set a Secure
       * cookie that the browser then refused to store. Every navigation looked like a sign-out,
       * because the session was never saved in the first place.
       *
       * The comment that used to sit here described that exact hazard and the code did it anyway.
       * Deciding from the scheme cannot drift from reality the same way: https gets Secure, plain
       * http does not, and nothing has to be remembered about which command started the server.
       */
      secure: await isHttpsRequest(),
      path: '/',
      maxAge: cookie.maxAge,
    })

    redirect(safeNext(parsed.data.next))
  }

  const supabase = await authClient()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the sign-in service. Try again.' }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  })

  // Deliberately not inspecting error.code or error.message. See note 2.
  if (error) return { status: 'error', message: REFUSED }

  /**
   * redirect() throws, so nothing after it runs — which is what we want: the session cookie
   * is already on the response by the time signInWithPassword resolves, written by the
   * setAll adapter below.
   */
  redirect(safeNext(parsed.data.next))
}

export async function signOutStaff(): Promise<void> {
  // Clear both, unconditionally. Which one is live depends on the environment, and a sign-out
  // that only clears the session it expects to find is a sign-out that sometimes does nothing.
  const jar = await cookies()
  jar.delete(LOCAL_COOKIE_NAME)

  if (hasSupabaseEnv()) {
    const supabase = await authClient()
    // scope 'local' clears this browser only. 'global' would sign the same person out of the
    // customer site on their phone, which is a different context and not this button's business.
    if (supabase) await supabase.auth.signOut({ scope: 'local' })
  }

  redirect('/admin/login')
}

/**
 * The setup instructions, as one sentence plus three lines to paste.
 *
 * Shown when there is neither a Supabase project nor local credentials — the state a fresh
 * checkout is in. The console is locked then, which is correct, and being locked out with no
 * explanation is not.
 */
function setupMessage(): string {
  const status = localAuthStatus()

  if (status === 'weak') {
    return (
      'The local admin credentials are set but too weak to sign with: ADMIN_LOCAL_SECRET needs ' +
      'at least 32 characters and ADMIN_LOCAL_PASSWORD at least 8. A short secret is a forgeable ' +
      'cookie, which looks exactly like a working login until somebody forges it.'
    )
  }

  return (
    'No database is attached and no local admin is configured, so there is nothing to sign in ' +
    'to. Add ADMIN_LOCAL_EMAIL, ADMIN_LOCAL_PASSWORD and ADMIN_LOCAL_SECRET to ' +
    'apps/web/.env.local and restart — or connect a Supabase project, which replaces this path ' +
    'entirely.'
  )
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * A cookie-writing client.
 *
 * This is the one place in the console that must be able to *set* cookies rather than only
 * read them — signing in produces a fresh token pair with nowhere else to go. Server Actions
 * can write cookies; Server Components cannot, which is why the session-refresh path lives in
 * middleware instead.
 */
/**
 * Did this request arrive over https?
 *
 * `x-forwarded-proto` is what a proxy sets — Vercel, nginx, a load balancer — and the left-most
 * entry is the original client's scheme; anything after it was appended by a later hop. With no
 * proxy in front there is no header at all, which means a direct connection, which for this server
 * means plain http.
 *
 * Erring towards "not secure" is right here and only here: this path exists solely when no Supabase
 * is attached, so it is a local or LAN session by definition. A real deployment has Supabase
 * configured, and that disables local auth entirely — see lib/admin-local-auth.ts.
 */
async function isHttpsRequest(): Promise<boolean> {
  try {
    const h = await headers()
    const proto = h.get('x-forwarded-proto')
    if (!proto) return false
    return proto.split(',')[0]?.trim().toLowerCase() === 'https'
  } catch {
    return false
  }
}

async function authClient() {
  try {
    const store = await cookies()
    return createUtsavaServerClient({
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          store.set(name, value, options)
        }
      },
    })
  } catch {
    return null
  }
}

/**
 * Same-origin absolute paths only.
 *
 * `//evil.example` is a protocol-relative URL that browsers treat as another host, so the
 * second test is not redundant with the first. Anything else falls back to the dashboard.
 */
function safeNext(next: string | undefined): string {
  if (!next) return '/admin'
  if (!next.startsWith('/') || next.startsWith('//')) return '/admin'
  // Keep staff inside the console: a next= pointing at a customer page after a staff sign-in
  // is either a mistake or an attempt to make the console the entry point to somewhere else.
  if (next !== '/admin' && !next.startsWith('/admin/')) return '/admin'
  return next
}

function text(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

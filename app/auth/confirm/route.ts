import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { getServerClient, hasSupabaseEnv } from '@/lib/supabase'

/**
 * Where the link in a confirmation email lands.
 *
 * The email/password sign-up in app/(site)/login/actions.ts creates an account that cannot do
 * anything until the address is proven, because this project has email confirmations on
 * (`mailer_autoconfirm: false`). Supabase mails a link carrying a one-time `token_hash`; this
 * route spends it for a session and writes the cookies. Without it the link resolves to a 404
 * and every account created this way stays permanently inert.
 *
 * WHY A ROUTE HANDLER AND NOT A PAGE. Establishing a session means setting cookies, and a
 * Server Component cannot — the same reason the sign-in lives in a server action rather than
 * in the page that renders the form.
 *
 * THE TOKEN IS SINGLE-USE AND SHORT-LIVED, so the failure path is not an edge case: mail
 * clients prefetch links, people click twice, and a day-old mail is simply expired. All of
 * those land on /login with a reason rather than on a blank error.
 *
 * NO OPEN REDIRECT. `next` is attacker-controllable — it is a query parameter on a URL that
 * arrives by email — so only same-origin absolute paths are honoured. `//evil.example` is a
 * protocol-relative URL that browsers treat as another host, which is why the second test is
 * not redundant with the first.
 */
export async function GET(request: NextRequest): Promise<never> {
  const params = request.nextUrl.searchParams
  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  const next = safeNext(params.get('next'))

  if (!hasSupabaseEnv()) redirect('/login?error=unconfigured')
  if (!tokenHash || !isOtpType(type)) redirect('/login?error=link')

  const supabase = await getServerClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  // redirect() throws, so it stays outside anything that would catch it. The session cookies
  // are already on the response by this point, written by the setAll adapter in lib/supabase.ts.
  if (error) redirect('/login?error=link')
  redirect(next)
}

/**
 * The email-borne OTP types, as a guard rather than a cast.
 *
 * verifyOtp() dispatches on this string, and letting an arbitrary query parameter through
 * would hand a caller the choice of which flow to spend the token in — 'recovery' and
 * 'email_change' are password-reset and address-change, not sign-up.
 */
const OTP_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'] as const

type ConfirmOtpType = (typeof OTP_TYPES)[number]

function isOtpType(value: string | null): value is ConfirmOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value)
}

function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard'
  return next
}

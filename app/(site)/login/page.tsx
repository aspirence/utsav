import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Container } from '@/components/ui'

import { getStaffGate } from '@/lib/admin-auth'
import { getSessionUser } from '@/lib/auth'

import { signOut } from './actions'
import { LoginForm } from './login-form'

/**
 * The login. Singular — customers, partners and staff all sign in here.
 *
 * THERE USED TO BE TWO. /admin/login was a separate dark-chromed form on the reasoning that
 * nobody should mistake which surface they are typing a staff password into. That page is now a
 * redirect to this one: plan §3 gives one human one auth identity, and two forms writing to one
 * `auth.users` table meant the same person had two doors, two sign-out buttons and two places
 * for the session to go stale. What decides where you land is /dashboard reading your
 * memberships, not which URL you happened to open.
 *
 * WHAT THAT COSTS, AND IT IS WORTH KNOWING. /admin/login sat behind the ADMIN_IP_ALLOWLIST
 * check in middleware.ts, so an outsider could not even see the staff form. This page is public
 * and has to be. The allowlist still guards /admin/* itself, so a stolen staff password does not
 * open the console from an unlisted address — but the form is now reachable, and rate limiting
 * beyond Supabase's own defaults is still not implemented.
 *
 * Plan §3 is "Guest becomes Customer on first OTP-verified enquiry" — the phone is the customer
 * identity and the code that makes a lead real is the code that makes the account. Email and
 * password sit beside that path rather than replacing it, because the Supabase project has the
 * phone provider switched off and an identity model nobody can sign in under is not a model.
 *
 * Sign-up lives inside the form rather than on a page of its own: it is one toggle on the email
 * panel, and there is still nothing to sign up for on the OTP side.
 *
 * noindex: a login form has nothing to offer a search result, and plan §12 wants the
 * crawl budget spent on listings.
 */
export const metadata: Metadata = {
  title: 'Login',
  description: 'Log in to Fremmo with your email or mobile number.',
  robots: { index: false, follow: false },
}

/**
 * Why callers report failure through a query parameter rather than rendering their own page: an
 * expired link, or a console you hold no role for, is not an error page — it is a reason to be
 * standing at the login form. The strings live here so those routes stay redirects.
 */
const LINK_ERRORS: Record<string, string> = {
  link: 'That confirmation link has expired or was already used. Sign in below, or create the account again to get a fresh one.',
  unconfigured: 'Sign-in is not connected yet.',
  /*
   * Deliberately explicit rather than a 404. The likeliest person seeing this is a colleague
   * whose role has not been granted yet, and "this does not exist" sends them off to debug a
   * working system. It reveals nothing either — they are being told a fact about their own
   * session, which they are already holding.
   */
  not_staff:
    'You are signed in, but this account holds no staff role, so the console has nothing to show you. Ask a super admin to grant one — or sign in with a different account below.',
  locked:
    'The console is locked: there is no database attached and no local admin configured, so there is nothing to sign in to. See "Test logins" in the README.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  const linkError = error ? LINK_ERRORS[error] : undefined
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  /*
   * Already signed in, so there is nothing to do here. Honour `next` so a stale link in a second
   * tab still lands somewhere sensible — and only if it is a path on this origin, because an
   * open redirect off a signed-in page is how sessions get handed to phishing. Without one,
   * /dashboard resolves the right surface from their memberships.
   *
   * The staff gate is checked first for the same reason /dashboard checks it first: with no
   * Supabase attached a staff session is a signed cookie and no auth.users row, so getSessionUser
   * returns null and an admin who just signed in would be shown the form again.
   *
   * `not_staff` is the exception. That caller IS signed in, and bouncing them straight back to
   * the console they were refused from is a loop — they need to read the message and sign in as
   * somebody else.
   */
  if (error !== 'not_staff') {
    const gate = await getStaffGate()
    const user = gate.state === 'staff' ? null : await getSessionUser()
    if (gate.state === 'staff' || user) redirect(safeNext)
  }

  return (
    <Container className="max-w-md py-16 sm:py-24">
      <h1 className="text-3xl leading-tight text-ink-900 sm:text-4xl">Login</h1>
      <p className="mt-3 text-ink-700">
        Use your email and password, or your mobile number and a code.
      </p>

      {linkError && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-danger-500/30 bg-danger-50 px-3.5 py-2.5 text-sm leading-relaxed text-danger-700"
        >
          {linkError}

          {/* The only one of these states where a session already exists — so the useful next
              action is to drop it, not to type into a form that is about to refuse the same
              account again. */}
          {error === 'not_staff' && (
            <form action={signOut} className="mt-2.5">
              <button
                type="submit"
                className="font-semibold underline underline-offset-2 hover:text-danger-500"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      )}

      <div className="mt-8">
        <LoginForm {...(next ? { next } : {})} />
      </div>

      <p className="mt-8 border-t border-ink-100 pt-6 text-sm leading-relaxed text-ink-600">
        By continuing you agree to our{' '}
        <Link href="/p/terms" className="underline underline-offset-2 hover:text-ink-900">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/p/privacy" className="underline underline-offset-2 hover:text-ink-900">
          privacy policy
        </Link>
        .
      </p>
    </Container>
  )
}

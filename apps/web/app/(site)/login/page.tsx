import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Container } from '@utsava/ui'

import { getSessionUser } from '@/lib/auth'

import { LoginForm } from './login-form'

/**
 * Login.
 *
 * There is no companion "sign up" page, and that is the product working as designed. Plan
 * §3: "Guest becomes Customer on first OTP-verified enquiry." The first code someone
 * enters creates their account; there is no second path to create one, and no password to
 * choose, forget or leak.
 *
 * noindex: a login form has nothing to offer a search result, and plan §12 wants the
 * crawl budget spent on listings.
 */
export const metadata: Metadata = {
  title: 'Login',
  description: 'Log in to Utsava with your mobile number.',
  robots: { index: false, follow: false },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  // Already signed in, so there is nothing to do here. Honour `next` so a stale link in a
  // second tab still lands somewhere sensible - and only if it is a path on this origin,
  // because an open redirect off a signed-in page is how sessions get handed to phishing.
  const user = await getSessionUser()
  if (user) {
    redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/account')
  }

  return (
    <Container className="max-w-md py-16 sm:py-24">
      <h1 className="text-3xl leading-tight text-ink-900 sm:text-4xl">Login</h1>
      <p className="mt-3 text-ink-700">
        Your number is your account. Enter it and we will text you a code.
      </p>

      <div className="mt-8">
        <LoginForm {...(next ? { next } : {})} />
      </div>

      <p className="mt-8 border-t border-ink-100 pt-6 text-sm leading-relaxed text-ink-600">
        No account needed first — signing in for the first time creates one. By continuing
        you agree to our{' '}
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

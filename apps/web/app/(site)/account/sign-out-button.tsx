'use client'

import { useTransition } from 'react'

import { signOut } from '@/app/(site)/login/actions'

/**
 * Sign out.
 *
 * A form posting to a server action, not a link. Signing out changes state, and a GET that
 * changes state is a link a prefetcher, a crawler or an email scanner can trip - people
 * have been logged out by their own inbox for exactly this.
 *
 * The action clears the Supabase cookies and revalidates the root layout, so the header
 * re-renders as anonymous rather than showing a stale signed-in state until the next hard
 * load.
 */
export function SignOutButton() {
  const [pending, start] = useTransition()

  return (
    <form action={() => start(() => void signOut())}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:border-ink-300 hover:text-ink-900 disabled:opacity-60"
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
    </form>
  )
}

'use client'

import { useActionState } from 'react'

import { signInStaff, type StaffAuthState } from './actions'

/**
 * The staff credentials form.
 *
 * `type="password"` with `autoComplete="current-password"` so a password manager fills it and
 * the browser never offers to save it as a new one. `autoComplete="username"` on the email
 * pairs with that — without it, managers guess, and a manager that guesses wrong is a manager
 * staff stop using.
 *
 * No "forgot password" link. There is no reset flow yet, and a link to a page that does not
 * exist is worse than its absence — the fallback is a super admin resetting it, which the
 * error message says.
 *
 * No "remember me". The session already persists in a cookie until it expires; a checkbox
 * that changes nothing is a lie about how the thing works.
 */
export function StaffLoginForm({ next }: { next?: string }) {
  const [state, act, pending] = useActionState<StaffAuthState, FormData>(signInStaff, {
    status: 'idle',
  })

  return (
    <form action={act} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <label
          htmlFor="email"
          className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-400"
        >
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          spellCheck={false}
          placeholder="you@utsava.in"
          className="mt-2 w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-white outline-none placeholder:text-ink-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-400"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-2 w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500"
        />
      </div>

      {(state.status === 'error' || state.status === 'unconfigured') && (
        <p
          role="alert"
          className={
            'rounded-md px-3 py-2.5 text-sm leading-relaxed ' +
            (state.status === 'unconfigured'
              ? 'bg-warning-500/15 text-warning-500'
              : 'bg-danger-500/15 text-danger-500')
          }
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
      >
        {pending ? 'Checking…' : 'Log in'}
      </button>
    </form>
  )
}

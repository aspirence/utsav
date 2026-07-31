'use client'

import { useActionState, useState } from 'react'

import { signInStaff, type StaffAuthState } from './actions'

/**
 * The staff credentials form.
 *
 * ── NOTHING IS PREFILLED, AND THAT IS DELIBERATE ─────────────────────────────
 *
 * This used to carry autoComplete="username" and "current-password" so a password manager
 * would fill it. On a laptop that has run another project on the same host and port — which
 * is what 192.168.1.20:3000 is during development — the browser treats the two as one site
 * and offers the other app's credentials here. Somebody logging into Utsava was being shown
 * an unrelated account and a saved password for it.
 *
 * So the email asks for no completion and the password is marked "new-password", which is
 * the one value Chrome and Safari honour as "do not fill a saved credential into this".
 *
 * IT IS A REQUEST, NOT A GUARANTEE. Browsers ignore autocomplete hints on credential fields
 * whenever they judge the user is better served by filling — that is their prerogative and
 * arguing with it is how sites end up breaking password managers. The real fix is a hostname
 * of its own, which production has and a LAN address does not.
 *
 * ── The rest ─────────────────────────────────────────────────────────────────
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
  const [shown, setShown] = useState(false)

  return (
    <form action={act} className="space-y-4" autoComplete="off">
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
          autoComplete="off"
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
        {/* Relative, so the reveal button can sit inside the field rather than beside it —
            beside it, the input shortens and the two fields stop lining up. */}
        <div className="relative mt-2">
          <input
            id="password"
            name="password"
            type={shown ? 'text' : 'password'}
            required
            /*
              "new-password" rather than "off". Chrome ignores "off" on a password field and
              fills a saved credential anyway; "new-password" is the value it honours, because
              filling an old password into a field asking for a new one is obviously wrong.
              It is the only reliable way to say "leave this empty".
            */
            autoComplete="new-password"
            // Right padding is the button's width plus its inset. Without it a long password
            // runs under the icon.
            className="w-full rounded-md border border-ink-700 bg-ink-800 py-2.5 pl-3 pr-11 text-sm text-white outline-none focus:border-primary-500"
          />

          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            /*
              aria-pressed, not a changing label alone. This is a toggle that stays in the
              state you put it in, and a screen reader should say so rather than announcing a
              button whose name changed under it. The label still changes, because the two
              together read correctly in every reader.

              tabIndex is left alone: someone typing a password with a keyboard is exactly who
              needs to check what they typed, and skipping it would be an odd thing to take
              away.
            */
            aria-pressed={shown}
            aria-label={shown ? 'Hide password' : 'Show password'}
            title={shown ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-ink-300 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none"
          >
            {shown ? <EyeOff /> : <Eye />}
          </button>
        </div>
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

/*
 * The two states of the reveal.
 *
 * aria-hidden on both: the button already carries its name and pressed state, and an icon
 * that also announces itself makes a screen reader read the control twice.
 *
 * currentColor throughout, so the hover and focus transitions on the button carry the icon
 * with them rather than needing their own rules.
 */
const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function Eye() {
  return (
    <svg {...ICON}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg {...ICON}>
      {/* The open eye with a stroke through it, rather than a different glyph. The two states
          should read as one control switching, not as two unrelated icons. */}
      <path d="M2 12s3.6-6.5 10-6.5c1.5 0 2.9.36 4.1.92M22 12s-3.6 6.5-10 6.5c-1.5 0-2.9-.36-4.1-.92" />
      <path d="M9.6 9.7a2.6 2.6 0 003.7 3.66" />
      <path d="M3 3l18 18" />
    </svg>
  )
}

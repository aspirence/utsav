'use client'

import { useActionState } from 'react'

import { requestCode, verifyCode, type AuthState } from './actions'

/**
 * The two-step OTP form.
 *
 * Two `useActionState` hooks rather than one, because the steps are two different actions
 * with two different validation shapes. Sharing one reducer would mean a discriminated
 * union and a branch inside the action to decide which half of the form it was handed -
 * more moving parts to say the same thing.
 *
 * The step is driven by whichever state is live: `sent.step === 'code'` means a code went
 * out. That keeps the truth on the server. Holding a local `step` state as well would let
 * the two disagree the moment an action failed.
 *
 * `inputMode="numeric"` and `autoComplete="one-time-code"` are not decoration. On a phone
 * they bring up the number pad and let the OS offer the code straight from the SMS, which
 * removes the app-switch that loses people mid sign-in.
 */
export function LoginForm({ next }: { next?: string }) {
  const [sent, doRequest, requesting] = useActionState<AuthState, FormData>(requestCode, {
    step: 'phone',
  })
  const [checked, doVerify, verifying] = useActionState<AuthState, FormData>(verifyCode, {
    step: 'code',
  })

  const onCodeStep = sent.step === 'code'
  const phone = checked.phone ?? sent.phone ?? ''
  // The verify step owns the error once it has run; before that, the request step does.
  const error = onCodeStep ? (checked.error ?? sent.error) : sent.error

  return (
    <div>
      {!onCodeStep ? (
        <form action={doRequest} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-ink-800">
              Mobile number
            </label>
            <div className="mt-2 flex items-center rounded-md border border-ink-200 bg-surface-raised focus-within:border-ink-400">
              <span className="pl-3.5 pr-2 text-ink-500">+91</span>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                required
                placeholder="98765 43210"
                className="w-full rounded-r-md bg-transparent py-3 pr-3.5 text-ink-900 outline-none placeholder:text-ink-400"
              />
            </div>
            <p className="mt-2 text-xs text-ink-500">
              We text you a code. No password to remember.
            </p>
          </div>

          <button
            type="submit"
            disabled={requesting}
            className="w-full rounded-md bg-primary-600 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {requesting ? 'Sending…' : 'Send me a code'}
          </button>
        </form>
      ) : (
        <form action={doVerify} className="space-y-4">
          <input type="hidden" name="phone" value={phone} />
          {next && <input type="hidden" name="next" value={next} />}

          <div>
            <label htmlFor="code" className="block text-sm font-medium text-ink-800">
              Enter the code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              // The OS fills this; autofocus means it lands without a tap.
              autoFocus
              required
              maxLength={8}
              placeholder="······"
              className="mt-2 w-full rounded-md border border-ink-200 bg-surface-raised px-3.5 py-3 text-center text-2xl tracking-[0.4em] text-ink-900 outline-none focus:border-ink-400 placeholder:tracking-[0.3em] placeholder:text-ink-300"
            />
            <p className="mt-2 text-xs text-ink-500">Sent to {phone}.</p>
          </div>

          <button
            type="submit"
            disabled={verifying}
            className="w-full rounded-md bg-primary-600 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {verifying ? 'Checking…' : 'Sign in'}
          </button>

          {/* Submits the phone step again, which sends a fresh code and keeps the server
              as the only thing that decides which step we are on. */}
          <form action={doRequest}>
            <input type="hidden" name="phone" value={phone} />
            {next && <input type="hidden" name="next" value={next} />}
            <button
              type="submit"
              className="w-full text-sm text-ink-600 underline underline-offset-2 hover:text-ink-900"
            >
              Send a new code
            </button>
          </form>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger-500/30 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700"
        >
          {error}
        </p>
      )}
    </div>
  )
}

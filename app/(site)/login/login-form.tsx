'use client'

import { useActionState, useState } from 'react'

import {
  requestCode,
  signInWithEmail,
  signUpWithEmail,
  verifyCode,
  type AuthState,
  type EmailAuthState,
} from './actions'

/**
 * Sign-in, by email or by mobile.
 *
 * WHY EMAIL IS THE DEFAULT TAB when plan §3 makes the phone the primary customer identity:
 * the Supabase project has the phone provider disabled, so the OTP path cannot mint a session
 * today. Leading with the method that works beats leading with the one that is intended.
 * Flip `INITIAL_METHOD` once Auth → Providers → Phone is on.
 *
 * The tab is the one piece of local state here. Everything else — which OTP step we are on,
 * whether a confirmation mail went out — is driven by whichever server state is live, so the
 * client cannot disagree with the server about what happened.
 */

const INITIAL_METHOD: 'email' | 'phone' = 'email'

const FIELD =
  'mt-2 w-full rounded-md border border-ink-200 bg-surface-raised px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400 placeholder:text-ink-400'
const SUBMIT =
  'w-full rounded-md bg-primary-600 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60'
const LABEL = 'block text-sm font-medium text-ink-800'

export function LoginForm({ next }: { next?: string }) {
  const [method, setMethod] = useState<'email' | 'phone'>(INITIAL_METHOD)

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="mb-6 flex rounded-md border border-ink-200 p-1"
      >
        <MethodTab active={method === 'email'} onClick={() => setMethod('email')}>
          Email
        </MethodTab>
        <MethodTab active={method === 'phone'} onClick={() => setMethod('phone')}>
          Mobile
        </MethodTab>
      </div>

      {method === 'email' ? <EmailForm next={next} /> : <PhoneForm next={next} />}
    </div>
  )
}

function MethodTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 rounded px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Email and password, in two modes on one panel.
 *
 * Two `useActionState` hooks rather than one, for the same reason the OTP form has two: sign-in
 * and sign-up are different actions with different validation shapes, and sharing a reducer
 * would mean branching inside the action to work out which half of the form it was handed.
 *
 * Sign-up does not redirect — with email confirmations on it returns a notice instead, because
 * the account is inert until the link in that mail is clicked.
 */
function EmailForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  const [signedIn, doSignIn, signingIn] = useActionState<EmailAuthState, FormData>(
    signInWithEmail,
    { mode: 'signin' },
  )
  const [signedUp, doSignUp, signingUp] = useActionState<EmailAuthState, FormData>(
    signUpWithEmail,
    { mode: 'signup' },
  )

  const live = mode === 'signin' ? signedIn : signedUp
  const pending = mode === 'signin' ? signingIn : signingUp

  /*
   * Sign-up normally redirects, so a notice here means the account was created but the sign-in
   * that should have followed did not — see signUpWithEmail. The fields go away, because
   * submitting them again would only be told the address is taken; the way to the sign-in panel
   * stays, because that is the one thing left to do.
   */
  if (signedUp.notice) {
    return (
      <div>
        <p
          role="status"
          className="rounded-md border border-ink-200 bg-surface-raised px-3.5 py-3 text-sm leading-relaxed text-ink-700"
        >
          {signedUp.notice}
        </p>
        <p className="mt-4 text-center text-sm text-ink-600">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className="font-semibold underline underline-offset-2 hover:text-ink-900"
          >
            Log in
          </button>
        </p>
      </div>
    )
  }

  return (
    <div>
      <form
        action={mode === 'signin' ? doSignIn : doSignUp}
        // Remounts on mode change, so a half-typed sign-up password does not carry into the
        // sign-in form where it would be submitted against a different action.
        key={mode}
        className="space-y-4"
      >
        {next && <input type="hidden" name="next" value={next} />}

        {mode === 'signup' && (
          <div>
            <label htmlFor="fullName" className={LABEL}>
              Your name <span className="font-normal text-ink-500">(optional)</span>
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              maxLength={120}
              placeholder="Ananya Sharma"
              className={FIELD}
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className={LABEL}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            defaultValue={live.email ?? ''}
            placeholder="you@example.com"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="password" className={LABEL}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            // Tells a password manager to offer a new one rather than an existing one, and
            // stops it silently filling the signup box with a saved credential.
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 8 : 1}
            maxLength={200}
            className={FIELD}
          />
          {mode === 'signup' && (
            <p className="mt-2 text-xs text-ink-500">At least 8 characters.</p>
          )}
        </div>

        <button type="submit" disabled={pending} className={SUBMIT}>
          {pending
            ? mode === 'signin'
              ? 'Checking…'
              : 'Creating…'
            : mode === 'signin'
              ? 'Login'
              : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-600">
        {mode === 'signin' ? 'No account yet?' : 'Already have an account?'}{' '}
        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="underline underline-offset-2 hover:text-ink-900"
        >
          {mode === 'signin' ? 'Create one' : 'Login'}
        </button>
      </p>

      {live.error && <ErrorNote>{live.error}</ErrorNote>}
    </div>
  )
}

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
function PhoneForm({ next }: { next?: string }) {
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
            <label htmlFor="phone" className={LABEL}>
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

          <button type="submit" disabled={requesting} className={SUBMIT}>
            {requesting ? 'Sending…' : 'Send me a code'}
          </button>
        </form>
      ) : (
        <form action={doVerify} className="space-y-4">
          <input type="hidden" name="phone" value={phone} />
          {next && <input type="hidden" name="next" value={next} />}

          <div>
            <label htmlFor="code" className={LABEL}>
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

          <button type="submit" disabled={verifying} className={SUBMIT}>
            {verifying ? 'Checking…' : 'Login'}
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

      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  )
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-md border border-danger-500/30 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700"
    >
      {children}
    </p>
  )
}

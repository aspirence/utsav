'use client'

import { useActionState } from 'react'

import { saveProfile, type ProfileState } from './actions'

/**
 * Profile form.
 *
 * `defaultValue`, not `value`: these are uncontrolled inputs whose initial state comes from
 * the server. Controlling them would mean holding a copy of the row in React state and then
 * keeping it in step with what the action wrote back - two sources of truth for one row.
 *
 * The mobile number is shown and not editable. It is the account identity, set by verifying
 * an OTP, so changing it is a re-verification flow rather than a text field - and
 * profiles.phone is unique, so a plain update fails on collision with a message about a
 * database constraint.
 */
export function ProfileForm({
  fullName,
  email,
  phone,
}: {
  fullName: string | null
  email: string | null
  phone: string | null
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {})

  return (
    <form action={action} className="max-w-md space-y-5">
      <div>
        <label htmlFor="fullName" className="block text-sm font-medium text-ink-800">
          Your name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          defaultValue={fullName ?? ''}
          placeholder="Radha Jariwala"
          className="mt-2 w-full rounded-md border border-ink-200 bg-surface-raised px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400 placeholder:text-ink-400"
        />
        <p className="mt-2 text-xs text-ink-500">
          Vendors see this on an enquiry, so they know who they are replying to.
        </p>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink-800">
          Email <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={email ?? ''}
          placeholder="you@example.com"
          className="mt-2 w-full rounded-md border border-ink-200 bg-surface-raised px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400 placeholder:text-ink-400"
        />
        <p className="mt-2 text-xs text-ink-500">
          For quotes and receipts. Everything urgent goes to your phone.
        </p>
      </div>

      <div>
        <span className="block text-sm font-medium text-ink-800">Mobile</span>
        <p className="mt-2 rounded-md border border-ink-100 bg-surface-sunken/60 px-3.5 py-3 text-ink-700">
          {phone ?? '—'}
        </p>
        <p className="mt-2 text-xs text-ink-500">
          This is your account. Changing it means verifying the new number.
        </p>
      </div>

      <div className="flex items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary-600 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {state.saved && !pending && (
          <span role="status" className="text-sm text-success-700">
            Saved.
          </span>
        )}
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-danger-500/30 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700"
        >
          {state.error}
        </p>
      )}
    </form>
  )
}

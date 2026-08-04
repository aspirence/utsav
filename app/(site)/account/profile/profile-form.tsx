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
        <label htmlFor="fullName" className="text-ink-800 block text-sm font-medium">
          Your name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          defaultValue={fullName ?? ''}
          placeholder="Radha Jariwala"
          className="border-ink-200 bg-surface-raised text-ink-900 focus:border-ink-400 placeholder:text-ink-400 mt-2 w-full rounded-md border px-3.5 py-3 outline-none"
        />
        <p className="text-ink-500 mt-2 text-xs">
          Vendors see this on an enquiry, so they know who they are replying to.
        </p>
      </div>

      <div>
        <label htmlFor="email" className="text-ink-800 block text-sm font-medium">
          Email <span className="text-ink-500 font-normal">(optional)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={email ?? ''}
          placeholder="you@example.com"
          className="border-ink-200 bg-surface-raised text-ink-900 focus:border-ink-400 placeholder:text-ink-400 mt-2 w-full rounded-md border px-3.5 py-3 outline-none"
        />
        <p className="text-ink-500 mt-2 text-xs">
          For quotes and receipts. Everything urgent goes to your phone.
        </p>
      </div>

      <div>
        <span className="text-ink-800 block text-sm font-medium">Mobile</span>
        <p className="border-ink-100 bg-surface-sunken/60 text-ink-700 mt-2 rounded-md border px-3.5 py-3">
          {phone ?? '—'}
        </p>
        <p className="text-ink-500 mt-2 text-xs">
          This is your account. Changing it means verifying the new number.
        </p>
      </div>

      <div className="flex items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary-600 hover:bg-primary-700 rounded-md px-5 py-3 font-medium text-white transition-colors disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {state.saved && !pending && (
          <span role="status" className="text-success-700 text-sm">
            Saved.
          </span>
        )}
      </div>

      {state.error && (
        <p
          role="alert"
          className="border-danger-500/30 bg-danger-50 text-danger-700 rounded-md border px-3.5 py-2.5 text-sm"
        >
          {state.error}
        </p>
      )}
    </form>
  )
}

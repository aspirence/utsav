'use client'

import { useActionState, useEffect, useState } from 'react'

import { AccountPicker, Note } from './account-picker'
import { createResellerAction, type ResellerActionState } from './actions'

import { formatBps } from '@/lib/db'

import type { AssignableAccount } from '@/lib/resellers'

/**
 * Sign somebody up as a reseller.
 *
 * ONE LOGIN, ONE RESELLER — `resellers.profile_id` is unique — so this form starts by picking an
 * existing account rather than collecting a name and an email. Creating the login is a different
 * job and is not something this screen does; a reseller who cannot sign in has no dashboard, and
 * app.my_reseller_id() keys off auth.uid().
 *
 * THE RATE FIELD IS BASIS POINTS AND SAYS SO THREE TIMES: in the label, in the placeholder, and
 * in the live reading under the box. The field is the one on this screen where a plausible typo
 * is a hundredfold error — 2.5 typed into a bps box is 0.025%, which on a ₹5,000 order accrues
 * one paise and looks like a rounding artefact rather than a mistake. The reading under the input
 * is what makes it visible before the button is pressed.
 *
 * NOTHING HERE IS A PERMISSION CHECK. requireSuper() in lib/resellers.ts runs before the
 * service-role key is touched, whatever this form posts.
 */
export function CreateResellerForm() {
  const [state, submit, pending] = useActionState<ResellerActionState, FormData>(
    createResellerAction,
    {},
  )

  const [picked, setPicked] = useState<AssignableAccount | null>(null)
  // 250 bps = 2.5%. A default rather than an empty box, so the first thing the operator sees is a
  // well-formed value in the unit the field wants.
  const [bps, setBps] = useState('250')
  const [generation, setGeneration] = useState(0)

  /*
   * A successful create empties the form, and the `key` bump is the part that matters.
   *
   * The controlled fields are easy — clear the picked account, or the next create silently reuses
   * it and is refused by the unique constraint with a message about a duplicate that reads as a
   * bug. The name, the contacts and the notes are uncontrolled DOM inputs and `useActionState`
   * does not reset them, so without this the second reseller is created carrying the first one's
   * name and phone number. Remounting the form is the cheap way to clear inputs this component
   * does not hold state for.
   */
  useEffect(() => {
    if (!state.notice) return
    setPicked(null)
    setBps('250')
    setGeneration((g) => g + 1)
  }, [state.notice])

  return (
    <form key={generation} action={submit} className="space-y-4 p-4">
      <AccountPicker
        id="reseller-account"
        fieldName="profileId"
        picked={picked}
        onPick={setPicked}
        label="Account"
        hint="The login this reseller will sign in with. It has to exist already — three characters to search."
      />

      <div>
        <label htmlFor="displayName" className="text-ink-700 block text-xs font-semibold">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          maxLength={120}
          placeholder="Aarti Events, Lucknow"
          className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none"
        />
        <p className="text-ink-500 mt-1.5 text-xs">
          What appears on their statement. It does not have to match the account name.
        </p>
      </div>

      <BpsField id="commissionBps" value={bps} onChange={setBps} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="contactEmail" className="text-ink-700 block text-xs font-semibold">
            Contact email <span className="text-ink-500 font-normal">(optional)</span>
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
        </div>
        <div>
          <label htmlFor="contactPhone" className="text-ink-700 block text-xs font-semibold">
            Contact phone <span className="text-ink-500 font-normal">(optional)</span>
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            inputMode="tel"
            placeholder="+919812345678"
            className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="text-ink-700 block text-xs font-semibold">
          Notes <span className="text-ink-500 font-normal">(internal)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={1000}
          placeholder="Introduced by the Lucknow field team. Settles monthly."
          className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={pending || !picked}
        className="bg-ink-900 hover:bg-ink-800 w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create reseller'}
      </button>

      <p className="text-ink-500 text-xs leading-relaxed">
        The FRM-RS code is minted here and is what goes on a statement. Nothing is attributed until
        an account is assigned to them.
      </p>

      {state.error && <Note tone="error">{state.error}</Note>}
      {state.notice && <Note tone="ok">{state.notice}</Note>}
    </form>
  )
}

/**
 * The rate input, with the percentage said back.
 *
 * Shared with the rate-change control on the detail page, because the trap is the same in both
 * and the reading under the box is the whole mitigation. The value posted is always the bps
 * integer — the percentage is never a form value, so there is no path where a display transform
 * becomes a stored one.
 */
export function BpsField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (v: string) => void
}) {
  const digits = /^\d{1,5}$/.test(value.trim())
  const bps = digits ? Number(value.trim()) : null
  const valid = bps != null && bps <= 10000

  return (
    <div>
      <label htmlFor={id} className="text-ink-700 block text-xs font-semibold">
        Commission rate <span className="text-ink-500 font-normal">(basis points)</span>
      </label>
      <input
        id={id}
        name="commissionBps"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="250"
        className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 font-mono text-sm tabular-nums outline-none"
      />
      <p className={`mt-1.5 text-xs ${valid ? 'text-ink-500' : 'text-danger-700'}`}>
        {valid
          ? `${bps} basis points is ${formatBps(bps)} of the order price.`
          : 'Basis points, so 250 means 2.5%. A whole number from 0 to 10000.'}
      </p>
    </div>
  )
}

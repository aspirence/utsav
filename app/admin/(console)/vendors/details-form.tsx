'use client'

import { useActionState } from 'react'

import { updateVendorDetails } from './actions'
import type { VendorActionState } from './actions'

/**
 * Edit a listing's copy.
 *
 * Everything else in this console moves a listing's *state* - publish, suspend, send back -
 * and each of those needs a reason because it changes what the public sees. This is the one
 * form that edits the listing itself, and it goes through the same audit path so the change
 * is on record with the patch that was applied.
 *
 * Uncontrolled inputs seeded from the server. Controlling them would mean holding a copy of
 * the row in React state and keeping it in step with what the action wrote back - two sources
 * of truth for one row.
 *
 * DELIBERATELY NOT EDITABLE HERE: status and published_at (they belong to the transition
 * controls, so every move carries a reason), profile_score / media_count / rating (derived
 * columns that app.guard_vendor_columns rejects a write to), and the anchor-studio flag,
 * which is a channel-conflict disclosure under plan §11 rather than a field.
 */
export function VendorDetailsForm({
  slug,
  displayName,
  about,
  priceBandMinPaise,
  priceBandMaxPaise,
  establishedYear,
  teamSize,
  travelsOutstation,
}: {
  slug: string
  displayName: string
  about: string | null
  priceBandMinPaise: number | null
  priceBandMaxPaise: number | null
  establishedYear: number | null
  teamSize: number | null
  travelsOutstation: boolean
}) {
  const [state, act, pending] = useActionState<VendorActionState, FormData>(updateVendorDetails, {
    status: 'idle',
  })

  return (
    <form action={act} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />

      <Field label="Listing name" htmlFor="displayName">
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          defaultValue={displayName}
          className="border-ink-200 text-ink-900 focus:border-ink-400 w-full rounded-md border px-3 py-2 text-sm outline-none"
        />
      </Field>

      <Field label="About" htmlFor="about">
        <textarea
          id="about"
          name="about"
          rows={5}
          defaultValue={about ?? ''}
          className="border-ink-200 text-ink-900 focus:border-ink-400 w-full rounded-md border px-3 py-2 text-sm leading-relaxed outline-none"
        />
        <p className="text-ink-500 mt-1 text-xs">
          Shown on the public profile. Plan §13 gates going live on this being filled in.
        </p>
      </Field>

      <Field label="Price band, in rupees" htmlFor="priceBandMin">
        <div className="flex items-center gap-2">
          <input
            id="priceBandMin"
            name="priceBandMin"
            type="text"
            inputMode="numeric"
            defaultValue={paiseToRupees(priceBandMinPaise)}
            placeholder="1,20,000"
            className="border-ink-200 text-ink-900 focus:border-ink-400 w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
          <span className="text-ink-500 text-sm">to</span>
          <input
            name="priceBandMax"
            type="text"
            inputMode="numeric"
            aria-label="Upper price band, in rupees"
            defaultValue={paiseToRupees(priceBandMaxPaise)}
            placeholder="3,50,000"
            className="border-ink-200 text-ink-900 focus:border-ink-400 w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
        </div>
        <p className="text-ink-500 mt-1 text-xs">
          Typed in rupees, stored as integer paise (plan §5).
        </p>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Established" htmlFor="establishedYear">
          <input
            id="establishedYear"
            name="establishedYear"
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            defaultValue={establishedYear ?? ''}
            className="border-ink-200 text-ink-900 focus:border-ink-400 w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
        </Field>

        <Field label="Team size" htmlFor="teamSize">
          <input
            id="teamSize"
            name="teamSize"
            type="number"
            min={1}
            defaultValue={teamSize ?? ''}
            className="border-ink-200 text-ink-900 focus:border-ink-400 w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
        </Field>
      </div>

      <label className="text-ink-800 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="travelsOutstation"
          defaultChecked={travelsOutstation}
          className="h-4 w-4"
        />
        Travels outstation
        <span className="text-ink-500 text-xs">
          — what the destination-wedding filters search on
        </span>
      </label>

      <div className="border-ink-100 flex items-center gap-3 border-t pt-4">
        <button
          type="submit"
          disabled={pending}
          className="bg-ink-900 hover:bg-ink-800 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>

        {state.status === 'done' && !pending && (
          <span role="status" className="text-success-700 text-sm">
            {state.message}
          </span>
        )}
      </div>

      {(state.status === 'error' || state.status === 'unconfigured') && (
        <p
          role="alert"
          className={
            'rounded-md border px-3 py-2 text-sm ' +
            (state.status === 'unconfigured'
              ? 'border-warning-500/40 bg-warning-50 text-warning-700'
              : 'border-danger-500/30 bg-danger-50 text-danger-700')
          }
        >
          {state.message}
        </p>
      )}
    </form>
  )
}

/**
 * Paise to a plain rupee number for the input's default value.
 *
 * No grouping separators: the field is a text input the action parses back, and a value it
 * has to strip commas out of is a value one bad regex away from being read as 12 instead of
 * 1,20,000.
 */
function paiseToRupees(paise: number | null): string {
  if (paise == null) return ''
  return String(Math.round(paise / 100))
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-ink-500 block text-xs font-semibold tracking-[0.14em] uppercase"
      >
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

'use client'

import { useActionState } from 'react'

import {
  CATEGORY_ATTRIBUTES,
  paiseToRupeeInput,
  type AttributeField,
  type AttributeMap,
} from '@/lib/category-attributes'

import { saveVendorAttributes, type AttributesActionState } from './attributes-actions'

/**
 * The category-specific half of a listing's details.
 *
 * Rendered from the same definitions the action validates against, so what a person sees and what
 * the server enforces cannot drift. A venue gets capacity and catering rules; a caterer gets two
 * per-plate rates and a minimum; a makeup artist gets a trial charge and whether she travels.
 *
 * NOT IN A DIALOG, unlike the rest of the console's forms. This one is a dozen fields an operator
 * fills once and then edits a value at a time, and it is the reason they opened the listing — the
 * dialog pattern is for creating a thing from a list, where the list is what you came for.
 *
 * Money fields are typed in rupees and stored in paise (plan §5). `paiseToRupeeInput` is the only
 * place that boundary is crossed on the way in.
 */
export function VendorAttributesForm({
  vendorSlug,
  categorySlug,
  categoryName,
  values,
}: {
  vendorSlug: string
  categorySlug: string
  categoryName: string
  values: AttributeMap
}) {
  const [state, act, pending] = useActionState<AttributesActionState, FormData>(
    saveVendorAttributes,
    { status: 'idle' },
  )

  const set = CATEGORY_ATTRIBUTES[categorySlug]

  /*
   * A category with no definition gets a sentence, not an empty form.
   *
   * That is a real state — the questions worth asking a pandit are not obvious enough to invent,
   * and a form of fields nobody can answer teaches operators to skip the section.
   */
  if (!set) {
    return (
      <p className="text-ink-600 text-sm leading-relaxed">
        No category-specific questions are defined for {categoryName} yet. The listing details above
        cover everything this category is currently asked.
      </p>
    )
  }

  return (
    <form action={act} className="space-y-5">
      <input type="hidden" name="vendorSlug" value={vendorSlug} />

      <p className="text-ink-600 max-w-2xl text-sm leading-relaxed">{set.intro}</p>

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {set.fields.map((field) => (
          <AttributeInput key={field.key} field={field} value={values[field.key]} />
        ))}
      </div>

      {(state.status === 'error' || state.status === 'unconfigured') && (
        <p
          role="alert"
          className={
            'rounded-md border px-3 py-2.5 text-sm leading-relaxed ' +
            (state.status === 'unconfigured'
              ? 'border-warning-500/40 bg-warning-50 text-warning-700'
              : 'border-danger-500/30 bg-danger-50 text-danger-700')
          }
        >
          {state.message}
        </p>
      )}

      <div className="border-ink-100 flex flex-wrap items-center gap-3 border-t pt-4">
        <button
          type="submit"
          disabled={pending}
          className="bg-ink-900 hover:bg-ink-800 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60"
        >
          {pending ? 'Saving…' : `Save ${categoryName.toLowerCase()} details`}
        </button>

        {state.status === 'done' && !pending && (
          <span role="status" className="text-success-700 text-sm">
            {state.message}
          </span>
        )}
      </div>
    </form>
  )
}

/**
 * One field, rendered from its definition.
 *
 * Uncontrolled and seeded from the server. Controlling a dozen of these would mean holding a copy
 * of the row in React state and keeping it in step with what the action wrote back — two sources of
 * truth for one row, which is the bug the vendor details form already avoids the same way.
 *
 * A checkbox spans both columns on its own line rather than sitting in the grid: a two-word label
 * beside a 16px box in a half-width cell leaves a hand's width of dead space, and eleven of them
 * makes a form look broken.
 */
function AttributeInput({
  field,
  value,
}: {
  field: AttributeField
  value: AttributeMap[string] | undefined
}) {
  const id = `attr-${field.key}`
  const name = `attr_${field.key}`

  if (field.type === 'boolean') {
    return (
      <label className="text-ink-800 flex items-start gap-2.5 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name={name}
          defaultChecked={value === true}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          {field.label}
          {field.hint && <span className="text-ink-500 block text-xs">{field.hint}</span>}
        </span>
      </label>
    )
  }

  return (
    <div>
      <label htmlFor={id} className="text-ink-500 block text-xs font-semibold uppercase tracking-[0.14em]">
        {field.label}
        {field.type === 'money' && (
          <span className="text-ink-400 ml-1 font-normal normal-case tracking-normal">
            in rupees
          </span>
        )}
      </label>

      <div className="mt-2">
        {field.type === 'select' ? (
          <select id={id} name={name} defaultValue={typeof value === 'string' ? value : ''} className={INPUT}>
            <option value="">Not set</option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-2">
            <input
              id={id}
              name={name}
              type={field.type === 'number' ? 'number' : 'text'}
              inputMode={field.type === 'money' ? 'numeric' : undefined}
              {...(field.type === 'number' && field.min != null ? { min: field.min } : {})}
              {...(field.type === 'number' && field.max != null ? { max: field.max } : {})}
              defaultValue={defaultFor(field, value)}
              className={INPUT}
            />
            {field.type === 'number' && field.unit && (
              <span className="text-ink-500 shrink-0 text-xs">{field.unit}</span>
            )}
          </div>
        )}
      </div>

      {field.hint && <p className="text-ink-500 mt-1.5 text-xs leading-relaxed">{field.hint}</p>}
    </div>
  )
}

function defaultFor(field: AttributeField, value: AttributeMap[string] | undefined): string {
  if (value === undefined) return ''
  if (field.type === 'money') return paiseToRupeeInput(value)
  if (field.type === 'tags') return Array.isArray(value) ? value.join(', ') : ''
  if (typeof value === 'boolean') return ''
  return String(value)
}

const INPUT =
  'w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-ink-400'

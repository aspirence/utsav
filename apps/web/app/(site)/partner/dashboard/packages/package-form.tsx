'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { formatPaise, formatPerDay, rupeesToPaise } from '@utsava/db'
import { Button, Card, CardBody } from '@utsava/ui'

import {
  createPackage,
  deactivatePackage,
  updatePackage,
  type PackageState,
} from './actions'

/**
 * Plan §S4's package card, from the vendor's side.
 *
 * The per-day figure is the whole point of this screen. A customer comparing a
 * ₹3,30,000 three-day package against a ₹1,40,000 single day is really comparing
 * ₹1.1 L/day against ₹1.4 L/day, and that is the number app.vendor_rank() and the
 * price_asc sort both work from. The database computes it as a generated column; this
 * form mirrors the same expression so the vendor sees it move as they type, rather than
 * discovering it after publishing.
 */

export interface PackageCategoryOption {
  slug: string
  name: string
  pricingUnit: string
  styleTags: { slug: string; name: string }[]
}

export interface PackageFormValues {
  id: string | null
  name: string
  description: string
  categorySlug: string
  styleTags: string[]
  /** Paise. Plan §5: money never leaves the database as rupees. */
  price: number | null
  pricingUnit: string
  durationDays: number
  crewSize: number | null
  editedPhotoCount: number | null
  deliveryDays: number | null
  deliverables: string[]
  inclusions: string[]
  exclusions: string[]
  isActive: boolean
}

const PRICING_UNITS: { value: string; label: string }[] = [
  { value: 'per_day', label: 'Per day' },
  { value: 'per_event', label: 'Per event' },
  { value: 'per_hour', label: 'Per hour' },
  { value: 'per_plate', label: 'Per plate' },
  { value: 'per_person', label: 'Per person' },
]

export function PackageForm({
  mode,
  values,
  categories,
}: {
  mode: 'create' | 'edit'
  values: PackageFormValues
  categories: PackageCategoryOption[]
}) {
  const [state, formAction] = useActionState<PackageState, FormData>(
    mode === 'create' ? createPackage : updatePackage,
    { status: 'idle' },
  )

  const [categorySlug, setCategorySlug] = useState(
    values.categorySlug || categories[0]?.slug || '',
  )
  const [priceRupees, setPriceRupees] = useState(paiseToRupeeInput(values.price))
  const [durationDays, setDurationDays] = useState(String(values.durationDays))

  const category = categories.find((c) => c.slug === categorySlug)
  const perDay = perDayPaise(priceRupees, durationDays)
  const duration = Number(durationDays)

  return (
    <form action={formAction} className="space-y-6">
      {values.id && <input type="hidden" name="packageId" value={values.id} />}

      {(state.status === 'created' || state.status === 'saved') && state.message && (
        <p className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700">
          {state.message}
        </p>
      )}
      {state.status === 'error' && state.message && (
        <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{state.message}</p>
      )}
      {state.status === 'unconfigured' && state.message && (
        <p className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700">
          {state.message}
        </p>
      )}

      <Card>
        <CardBody className="space-y-4">
          <h2 className="font-display text-lg text-ink-900">What is in it</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Package name"
              hint="Say what a couple gets, not a tier name. “Three-Day Wedding” beats “Gold”."
              error={state.fieldErrors?.name}
              className="sm:col-span-2"
            >
              <input
                name="name"
                defaultValue={values.name}
                required
                maxLength={160}
                placeholder="Wedding Day — Candid"
                className={inputClass}
              />
            </Field>

            <Field label="Category" error={state.fieldErrors?.categorySlug}>
              <select
                name="categorySlug"
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                className={inputClass}
              >
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Priced"
              hint={
                category
                  ? `Most ${category.name.toLowerCase()} listings quote ${
                      PRICING_UNITS.find((u) => u.value === category.pricingUnit)?.label.toLowerCase() ??
                      'per day'
                    }.`
                  : undefined
              }
              error={state.fieldErrors?.pricingUnit}
            >
              <select
                name="pricingUnit"
                defaultValue={values.pricingUnit || category?.pricingUnit || 'per_day'}
                className={inputClass}
              >
                {PRICING_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Description" error={state.fieldErrors?.description} className="sm:col-span-2">
              <textarea
                name="description"
                rows={3}
                maxLength={2000}
                defaultValue={values.description}
                placeholder="Single-day candid coverage by two photographers, from haldi to vidaai."
                className={inputClass}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="font-display text-lg text-ink-900">Price</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total price (₹)" error={state.fieldErrors?.price}>
              <input
                type="number"
                name="price"
                value={priceRupees}
                onChange={(e) => setPriceRupees(e.target.value)}
                min={0}
                step={1000}
                required
                placeholder="140000"
                className={inputClass}
              />
            </Field>

            <Field
              label="Days of coverage"
              hint="Half days are fine — 0.5 for a morning."
              error={state.fieldErrors?.durationDays}
            >
              <input
                type="number"
                name="durationDays"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                min={0.5}
                max={30}
                step={0.5}
                required
                className={inputClass}
              />
            </Field>
          </div>

          {/* The number customers actually compare on. Same expression as the generated
              column: (price / greatest(duration_days, 0.5)), rounded the way Postgres
              rounds a numeric cast to bigint. */}
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-ink-500">
              Customers compare this
            </p>
            <p className="mt-1 font-display text-2xl text-ink-900">
              {perDay == null ? '—' : formatPerDay(perDay)}
            </p>
            <p className="mt-1 text-sm text-ink-600">
              {perDay == null
                ? 'Enter a price and a duration to see your per-day figure.'
                : `${formatPaise(rupeesToPaise(Number(priceRupees)), { compact: false })} over ${
                    Number.isFinite(duration) ? duration : 1
                  } ${duration === 1 ? 'day' : 'days'}. Search results sort on this, not on the total.`}
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="font-display text-lg text-ink-900">The detail couples ask for</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Crew size" error={state.fieldErrors?.crewSize}>
              <input
                type="number"
                name="crewSize"
                defaultValue={values.crewSize ?? ''}
                min={1}
                max={100}
                placeholder="2"
                className={inputClass}
              />
            </Field>
            <Field label="Edited photos" error={state.fieldErrors?.editedPhotoCount}>
              <input
                type="number"
                name="editedPhotoCount"
                defaultValue={values.editedPhotoCount ?? ''}
                min={0}
                placeholder="600"
                className={inputClass}
              />
            </Field>
            <Field label="Delivery (days)" error={state.fieldErrors?.deliveryDays}>
              <input
                type="number"
                name="deliveryDays"
                defaultValue={values.deliveryDays ?? ''}
                min={1}
                max={365}
                placeholder="21"
                className={inputClass}
              />
            </Field>
          </div>

          {category && category.styleTags.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-ink-800">Styles in this package</p>
              <div className="flex flex-wrap gap-2">
                {category.styleTags.map((tag) => (
                  <label
                    key={tag.slug}
                    className="cursor-pointer rounded-full border border-ink-200 bg-surface-raised px-3.5 py-1.5 text-sm text-ink-700 has-[:checked]:border-ink-900 has-[:checked]:bg-ink-900 has-[:checked]:text-white"
                  >
                    <input
                      type="checkbox"
                      name="styleTags"
                      value={tag.slug}
                      defaultChecked={values.styleTags.includes(tag.slug)}
                      className="sr-only"
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
              {state.fieldErrors?.styleTags && (
                <p className="mt-1 text-xs text-danger-700">{state.fieldErrors.styleTags[0]}</p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <ListField
              label="Deliverables"
              name="deliverables"
              value={values.deliverables}
              placeholder={'600+ edited photos\nOnline gallery\nUSB drive'}
              error={state.fieldErrors?.deliverables}
            />
            <ListField
              label="Included"
              name="inclusions"
              value={values.inclusions}
              placeholder={'2 photographers\nFull-day coverage\nColour grading'}
              error={state.fieldErrors?.inclusions}
            />
            <ListField
              label="Not included"
              name="exclusions"
              value={values.exclusions}
              placeholder={'Travel outside Lucknow\nAlbum printing'}
              error={state.fieldErrors?.exclusions}
            />
          </div>
        </CardBody>
      </Card>

      {mode === 'edit' && (
        <label className="flex items-center gap-2.5 text-sm text-ink-700">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={values.isActive}
            className="h-4 w-4 rounded"
          />
          Show this package on my listing
        </label>
      )}

      <SubmitButton mode={mode} />
    </form>
  )
}

function SubmitButton({ mode }: { mode: 'create' | 'edit' }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Saving…' : mode === 'create' ? 'Add package' : 'Save package'}
    </Button>
  )
}

/**
 * Hiding a package is a soft change: quotes and bookings still reference the row, so it
 * is never deleted. The button says what actually happens.
 */
export function DeactivatePackageButton({
  packageId,
  packageName,
}: {
  packageId: string
  packageName: string
}) {
  const [state, formAction] = useActionState<PackageState, FormData>(deactivatePackage, {
    status: 'idle',
  })

  if (state.status === 'deactivated') {
    return <p className="text-xs text-ink-500">{state.message}</p>
  }

  return (
    <form action={formAction} className="text-right">
      <input type="hidden" name="packageId" value={packageId} />
      <HideButton />
      {state.message && state.status !== 'idle' && (
        <p className="mt-1 text-xs text-danger-700">{state.message}</p>
      )}
      <span className="sr-only">{packageName}</span>
    </form>
  )
}

function HideButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? 'Hiding…' : 'Hide from customers'}
    </Button>
  )
}

// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-lg border border-ink-200 bg-surface-raised px-3.5 py-2.5 text-ink-900 ' +
  'placeholder:text-ink-400 focus:border-primary-500 focus:outline-none'

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string
  hint?: string
  error?: string[]
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger-700">{error[0]}</span>}
    </label>
  )
}

/** One item per line — the fastest thing to type on a phone in someone's studio. */
function ListField({
  label,
  name,
  value,
  placeholder,
  error,
}: {
  label: string
  name: string
  value: string[]
  placeholder: string
  error?: string[]
}) {
  return (
    <Field label={label} hint="One per line" error={error}>
      <textarea
        name={name}
        rows={4}
        defaultValue={value.join('\n')}
        placeholder={placeholder}
        className={inputClass}
      />
    </Field>
  )
}

function paiseToRupeeInput(paise: number | null): string {
  return paise == null ? '' : String(Math.round(paise / 100))
}

/**
 * Mirrors packages.price_per_day:
 *   (price / greatest(duration_days, 0.5))::bigint
 * Postgres rounds on the numeric → bigint cast, so this rounds too rather than truncating.
 */
function perDayPaise(priceRupees: string, durationDays: string): number | null {
  const price = Number(priceRupees)
  const days = Number(durationDays)
  if (!priceRupees.trim() || !Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(days) || days <= 0) return null
  return Math.round(rupeesToPaise(price) / Math.max(days, 0.5))
}

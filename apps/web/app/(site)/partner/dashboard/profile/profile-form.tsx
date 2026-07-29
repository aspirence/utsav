'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { formatPriceBand, rupeesToPaise } from '@utsava/db'
import { Button, Card, CardBody } from '@utsava/ui'

import { updateVendorProfile, type ProfileState } from './actions'

/**
 * Plan §S3's portfolio-first profile editor, minus the portfolio itself — photo capture
 * is its own screen. Everything here is what a field agent fills in while sitting in the
 * vendor's studio, so the fields are ordered the way that conversation actually goes:
 * who you are, where you work, what you charge.
 *
 * The two numbers that decide whether this listing is discoverable at all — the price
 * band and the style tags — are given their own sections rather than buried, because
 * app.route_enquiry() filters on the band and the discovery page filters on the tags.
 */

export interface ProfileFormValues {
  displayName: string
  about: string
  establishedYear: number | null
  teamSize: number | null
  travelsOutstation: boolean
  localityId: string | null
  websiteUrl: string
  instagramHandle: string
  /** Paise. Plan §5: money never leaves the database as rupees. */
  priceBandMin: number | null
  priceBandMax: number | null
  styleTags: string[]
}

export interface LocalityOption {
  id: string
  name: string
}

export interface StyleTagOption {
  slug: string
  name: string
}

/** The completeness meter awards its "about" points at 120 characters. */
const ABOUT_TARGET = 120

export function ProfileForm({
  values,
  localities,
  styleTags,
}: {
  values: ProfileFormValues
  localities: LocalityOption[]
  styleTags: StyleTagOption[]
}) {
  const [state, formAction] = useActionState<ProfileState, FormData>(updateVendorProfile, {
    status: 'idle',
  })

  const [about, setAbout] = useState(values.about)
  const [bandMin, setBandMin] = useState(paiseToRupeeInput(values.priceBandMin))
  const [bandMax, setBandMax] = useState(paiseToRupeeInput(values.priceBandMax))

  const bandLabel = formatPriceBand(inputToPaise(bandMin), inputToPaise(bandMax), {
    compact: false,
  })

  return (
    <form action={formAction} className="space-y-6">
      {state.status === 'saved' && state.message && (
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
          <h2 className="font-display text-lg text-ink-900">Who you are</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" error={state.fieldErrors?.displayName}>
              <input
                name="displayName"
                defaultValue={values.displayName}
                required
                maxLength={120}
                className={inputClass}
              />
            </Field>

            <Field
              label="Locality"
              hint="Customers filter by this, so pick where you are actually based."
              error={state.fieldErrors?.localityId}
            >
              <select
                name="localityId"
                defaultValue={values.localityId ?? ''}
                className={inputClass}
              >
                <option value="">Not set</option>
                {localities.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Working since" error={state.fieldErrors?.establishedYear}>
              <input
                type="number"
                name="establishedYear"
                defaultValue={values.establishedYear ?? ''}
                min={1900}
                max={new Date().getFullYear()}
                placeholder="2016"
                className={inputClass}
              />
            </Field>

            <Field label="Team size" error={state.fieldErrors?.teamSize}>
              <input
                type="number"
                name="teamSize"
                defaultValue={values.teamSize ?? ''}
                min={1}
                max={500}
                placeholder="4"
                className={inputClass}
              />
            </Field>
          </div>

          <Field
            label="About"
            hint={`${about.trim().length}/${ABOUT_TARGET} characters — the completeness score counts the first ${ABOUT_TARGET}.`}
            error={state.fieldErrors?.about}
          >
            <textarea
              name="about"
              rows={5}
              maxLength={4000}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="How you work, how many weddings you have shot, what a couple can expect from you."
              className={inputClass}
            />
          </Field>

          <label className="flex items-center gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              name="travelsOutstation"
              defaultChecked={values.travelsOutstation}
              className="h-4 w-4 rounded"
            />
            I travel outside the city for events
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="font-display text-lg text-ink-900">Price band</h2>
          <p className="text-sm text-ink-600">
            This is the range you normally work in, not a quote. Enquiries with a budget
            below your lower figure are not routed to you, so setting it honestly is what
            keeps your lead inbox worth reading.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Typically from (₹)" error={state.fieldErrors?.priceBandMin}>
              <input
                type="number"
                name="priceBandMin"
                value={bandMin}
                onChange={(e) => setBandMin(e.target.value)}
                min={0}
                step={1000}
                placeholder="120000"
                className={inputClass}
              />
            </Field>
            <Field label="Up to (₹)" error={state.fieldErrors?.priceBandMax}>
              <input
                type="number"
                name="priceBandMax"
                value={bandMax}
                onChange={(e) => setBandMax(e.target.value)}
                min={0}
                step={1000}
                placeholder="350000"
                className={inputClass}
              />
            </Field>
          </div>

          <p className="rounded-lg bg-surface-sunken px-4 py-3 text-sm text-ink-700">
            Customers will see <strong className="font-semibold text-ink-900">{bandLabel}</strong>{' '}
            on your card.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="font-display text-lg text-ink-900">Style</h2>
          <p className="text-sm text-ink-600">
            Up to eight. These are the filters couples use most, and they decide which
            searches you appear in.
          </p>

          <div className="flex flex-wrap gap-2">
            {styleTags.map((tag) => (
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
            <p className="text-xs text-danger-700">{state.fieldErrors.styleTags[0]}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="font-display text-lg text-ink-900">Where else you are</h2>
          <p className="text-sm text-ink-600">
            Public links only. Your phone number and email stay private — customers reach
            you through a verified enquiry, never off the page.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website" error={state.fieldErrors?.websiteUrl}>
              <input
                type="url"
                name="websiteUrl"
                defaultValue={values.websiteUrl}
                placeholder="https://lightleak.studio"
                className={inputClass}
              />
            </Field>
            <Field label="Instagram handle" error={state.fieldErrors?.instagramHandle}>
              <input
                name="instagramHandle"
                defaultValue={values.instagramHandle}
                placeholder="lightleak.studio"
                className={inputClass}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <SaveButton />
        <p className="text-xs text-ink-500">
          Your rating, response time and profile score are calculated by Utsava and cannot
          be edited here.
        </p>
      </div>
    </form>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  )
}

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

/** Paise in, whole rupees out — the form talks rupees, the database never does. */
function paiseToRupeeInput(paise: number | null): string {
  return paise == null ? '' : String(Math.round(paise / 100))
}

function inputToPaise(value: string): number | null {
  const n = Number(value)
  return value.trim() === '' || !Number.isFinite(n) ? null : rupeesToPaise(n)
}

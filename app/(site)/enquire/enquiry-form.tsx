'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { CONSENT_TEXT } from '@/lib/db'
import { Button } from '@/components/ui'

import { submitEnquiry, type EnquiryState } from './actions'
import { OtpStep } from './otp-step'

interface Option {
  slug: string
  name: string
}

/**
 * Plan §2 Must-tier: "enquiry flow with OTP + budget/date verification".
 * Plan §1: these fields are not a form-design preference — budget and date capture are
 * what make the resulting lead worth a vendor's money, so none of them is optional.
 */
export function EnquiryForm({
  cities,
  categories,
  styleTags,
  defaultCity,
  defaultCategory,
  vendorName,
  continueHref = '/',
}: {
  cities: Option[]
  categories: Option[]
  styleTags: Option[]
  defaultCity: string
  defaultCategory: string
  vendorName?: string
  /** Where "Keep browsing" goes once the enquiry is routed. */
  continueHref?: string
}) {
  const [state, formAction] = useActionState<EnquiryState, FormData>(submitEnquiry, {
    status: 'idle',
  })

  // Step two of the same screen. The enquiry id and the E.164 number both come from the
  // action's own result — the OTP step never re-reads the form, so nothing the customer
  // can retype after submitting changes which row gets verified.
  if (state.status === 'awaiting_otp') {
    return (
      <OtpStep
        enquiryId={state.enquiryId}
        phone={state.phone}
        message={state.message}
        continueHref={continueHref}
      />
    )
  }

  // `fieldErrors` only exists on the error member of the union, and every Field below
  // needs to read it regardless of state.
  const fieldErrors: Record<string, string[] | undefined> =
    state.status === 'error' ? (state.fieldErrors ?? {}) : {}

  return (
    <form action={formAction} className="space-y-8">
      {state.status === 'error' && (
        <p className="bg-danger-50 text-danger-700 rounded-lg px-4 py-3 text-sm">{state.message}</p>
      )}
      {state.status === 'unconfigured' && (
        <p className="bg-warning-50 text-warning-700 rounded-lg px-4 py-3 text-sm">
          {state.message}
        </p>
      )}

      <Fieldset legend="What are you planning?">
        <Field label="I need a" error={fieldErrors.categorySlug}>
          <Select name="categorySlug" defaultValue={defaultCategory} options={categories} />
        </Field>
        <Field label="In" error={fieldErrors.citySlug}>
          <Select name="citySlug" defaultValue={defaultCity} options={cities} />
        </Field>
        <Field label="Occasion" error={fieldErrors.eventType}>
          <select name="eventType" defaultValue="wedding" className={inputClass}>
            <option value="wedding">Wedding</option>
            <option value="engagement">Engagement</option>
            <option value="reception">Reception</option>
            <option value="sangeet">Sangeet</option>
            <option value="mehendi">Mehendi</option>
            <option value="birthday">Birthday</option>
            <option value="anniversary">Anniversary</option>
            <option value="corporate">Corporate event</option>
            <option value="other">Something else</option>
          </select>
        </Field>
      </Fieldset>

      <Fieldset legend="When and how big?">
        <Field label="Event date" error={fieldErrors.eventDate}>
          <input type="date" name="eventDate" className={inputClass} />
        </Field>
        <Field label="Guests (approx.)" error={fieldErrors.guestCount}>
          <input type="number" name="guestCount" min={1} placeholder="350" className={inputClass} />
        </Field>
        {/* min-h-11 on the label, not just a bigger box: the whole row is the hit area, and a
            20px checkbox in a 20px row is still a 20px target. */}
        <label className="text-ink-700 col-span-full flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="dateFlexible"
            className="accent-primary-600 focus:ring-primary-600/25 h-5 w-5 shrink-0 rounded focus:ring-2 focus:outline-none"
          />
          My dates are still flexible
        </label>
      </Fieldset>

      <Fieldset legend="Budget">
        <Field
          label="Up to (₹)"
          hint="Vendors above your budget will not be contacted."
          error={fieldErrors.budgetMax}
        >
          <input
            type="number"
            name="budgetMax"
            min={0}
            step={1000}
            placeholder="200000"
            required
            className={inputClass}
          />
        </Field>
      </Fieldset>

      {styleTags.length > 0 && (
        <Fieldset legend="Any style preference?">
          <div className="col-span-full flex flex-wrap gap-2">
            {styleTags.map((tag) => (
              /*
                `has-[:focus-visible]` is the part that was missing, and it mattered.

                The checkbox is sr-only, so the browser's own focus outline is drawn on an
                invisible element — tabbing through these chips moved focus with nothing on
                screen to show where it had gone. `has-[:checked]` styled the selected state and
                nothing styled the focused one, which is a different thing and the one a keyboard
                depends on.

                min-h-11 for the same reason as every other control here: py-1.5 made a 30px
                target, and these sit in a wrapped row where the neighbours are 8px away.
              */
              <label
                key={tag.slug}
                className="border-ink-200 bg-surface-raised text-ink-700 has-[:checked]:border-ink-900 has-[:checked]:bg-ink-900 has-[:focus-visible]:ring-primary-600/40 inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2"
              >
                <input
                  type="checkbox"
                  name="stylePreferences"
                  value={tag.slug}
                  className="sr-only"
                />
                {tag.name}
              </label>
            ))}
          </div>
        </Fieldset>
      )}

      <Fieldset legend="How should vendors reach you?">
        <Field label="Your name" error={fieldErrors.contactName}>
          <input name="contactName" required placeholder="Priya Sharma" className={inputClass} />
        </Field>
        <Field
          label="Mobile number"
          hint="We send a one-time code to verify it."
          error={fieldErrors.contactPhone}
        >
          <input
            name="contactPhone"
            required
            inputMode="tel"
            placeholder="98450 12345"
            className={inputClass}
          />
        </Field>
        <Field label="Email (optional)" error={fieldErrors.contactEmail}>
          <input type="email" name="contactEmail" className={inputClass} />
        </Field>
        <Field label="Anything else?" className="col-span-full">
          <textarea
            name="message"
            rows={3}
            placeholder={
              vendorName ? `Tell ${vendorName} about your event…` : 'Tell vendors about your event…'
            }
            className={inputClass}
          />
        </Field>
      </Fieldset>

      {/* Plan §6: DPDP consent with purpose limitation, stated in full before submit. */}
      {/* The consent row stays items-start — its label runs to several lines, and centring a
          checkbox against a paragraph puts it halfway down the text. */}
      <label className="bg-surface-sunken text-ink-700 flex cursor-pointer items-start gap-3 rounded-lg p-4 text-sm">
        <input
          type="checkbox"
          name="consentGiven"
          required
          className="accent-primary-600 focus:ring-primary-600/25 mt-0.5 h-5 w-5 shrink-0 rounded focus:ring-2 focus:outline-none"
        />
        <span>{CONSENT_TEXT}</span>
      </label>
      {fieldErrors.consentGiven && (
        <p className="text-danger-700 text-sm">{fieldErrors.consentGiven[0]}</p>
      )}

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Sending…' : 'Send my enquiry'}
    </Button>
  )
}

/**
 * One control style for every field on this form.
 *
 * `min-h-11` is 44px. `py-2.5` came out around 40px, which is under Apple's 44px and Material's
 * 48px minimum — and this is the form that stands between somebody and an enquiry, filled in on
 * a phone more often than not.
 *
 * A REAL FOCUS RING. This used to be `focus:outline-none` with the border stepping from ink-200
 * to primary-500 — a change of one border colour, and the browser's own outline removed to make
 * room for it. Removing an outline without replacing it is the standard way a form becomes
 * unusable by keyboard: on a nine-field form there was no way to tell which field had focus.
 *
 * The size is left alone deliberately. These inherit the site's 16px body text, which is already
 * at the threshold below which iOS Safari zooms the viewport on focus and does not zoom back —
 * so there is nothing to fix and a `text-sm` here would create the problem.
 */
const inputClass =
  'w-full min-h-11 rounded-lg border border-ink-200 bg-surface-raised px-3.5 py-2.5 text-ink-900 ' +
  'transition-colors placeholder:text-ink-400 ' +
  'focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/25'

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="font-display text-ink-900 mb-4 text-xl">{legend}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

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
      <span className="text-ink-800 mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="text-ink-500 mt-1 block text-xs">{hint}</span>}
      {error && <span className="text-danger-700 mt-1 block text-xs">{error[0]}</span>}
    </label>
  )
}

function Select({
  name,
  defaultValue,
  options,
}: {
  name: string
  defaultValue: string
  options: Option[]
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={inputClass}>
      {options.map((option) => (
        <option key={option.slug} value={option.slug}>
          {option.name}
        </option>
      ))}
    </select>
  )
}

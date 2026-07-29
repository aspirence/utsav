'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { CONSENT_TEXT } from '@utsava/db'
import { Button } from '@utsava/ui'

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
        <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{state.message}</p>
      )}
      {state.status === 'unconfigured' && (
        <p className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700">
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
        <label className="col-span-full flex items-center gap-2.5 text-sm text-ink-700">
          <input type="checkbox" name="dateFlexible" className="h-4 w-4 rounded" />
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
              <label
                key={tag.slug}
                className="cursor-pointer rounded-full border border-ink-200 bg-surface-raised px-3.5 py-1.5 text-sm text-ink-700 has-[:checked]:border-ink-900 has-[:checked]:bg-ink-900 has-[:checked]:text-white"
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
              vendorName
                ? `Tell ${vendorName} about your event…`
                : 'Tell vendors about your event…'
            }
            className={inputClass}
          />
        </Field>
      </Fieldset>

      {/* Plan §6: DPDP consent with purpose limitation, stated in full before submit. */}
      <label className="flex items-start gap-3 rounded-lg bg-surface-sunken p-4 text-sm text-ink-700">
        <input type="checkbox" name="consentGiven" required className="mt-0.5 h-4 w-4 rounded" />
        <span>{CONSENT_TEXT}</span>
      </label>
      {fieldErrors.consentGiven && (
        <p className="text-sm text-danger-700">{fieldErrors.consentGiven[0]}</p>
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

const inputClass =
  'w-full rounded-lg border border-ink-200 bg-surface-raised px-3.5 py-2.5 text-ink-900 ' +
  'placeholder:text-ink-400 focus:border-primary-500 focus:outline-none'

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-4 font-display text-xl text-ink-900">{legend}</legend>
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
      <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger-700">{error[0]}</span>}
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

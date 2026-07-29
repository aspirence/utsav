'use client'

import { useState, useTransition, type FormEvent } from 'react'

import { Badge, Button, Card, CardBody, cn } from '@utsava/ui'

import { submitReview, type ReviewState } from '@/app/actions/review'

/**
 * Booking-gated review form. Plan §2 Must-tier; plan §13 gates launch on "500
 * beta-verified reviews", so this is the page that has to convert.
 *
 * Client-side only for form state, per plan §4. The eligibility rules live in
 * `reviews_insert_completed_booking` and the copy below never pretends otherwise: the
 * form submits, the policy decides, and whatever the action reports is shown verbatim.
 *
 * The overall rating and a body of at least 20 characters are required — a one-word
 * review helps nobody choose a photographer. The four sub-ratings are collected on the
 * same screen but stay optional, matching the nullable columns on `public.reviews`.
 */

const MIN_BODY = 20

const SUB_RATINGS = [
  { key: 'ratingQuality', label: 'Quality of work', hint: 'The photos, film or output itself' },
  { key: 'ratingValue', label: 'Value for money', hint: 'What you got for what you paid' },
  { key: 'ratingPunctuality', label: 'Punctuality', hint: 'On time on the day, and on delivery' },
  {
    key: 'ratingProfessionalism',
    label: 'Professionalism',
    hint: 'How the team handled themselves and your guests',
  },
] as const

type SubRatingKey = (typeof SUB_RATINGS)[number]['key']

export function ReviewForm({
  bookingId,
  vendorName,
  className,
}: {
  bookingId: string
  vendorName: string
  className?: string
}) {
  const [rating, setRating] = useState(0)
  const [subRatings, setSubRatings] = useState<Partial<Record<SubRatingKey, number>>>({})
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [state, setState] = useState<ReviewState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()

  const bodyLength = body.trim().length
  const canSubmit = rating > 0 && bodyLength >= MIN_BODY && !pending

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!canSubmit) return

    startTransition(async () => {
      const result = await submitReview({
        bookingId,
        rating,
        ...subRatings,
        title: title.trim() || undefined,
        body: body.trim(),
      })
      setState(result)
    })
  }

  if (state.status === 'submitted') {
    return (
      <Card className={className}>
        <CardBody className="p-6 sm:p-8">
          <Badge tone="success" className="mb-3">
            Review received
          </Badge>
          <h2 className="font-display text-xl text-ink-900">Thank you</h2>
          <p className="mt-2 text-ink-600">{state.message}</p>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardBody className="p-6 sm:p-8">
        <h2 className="font-display text-xl text-ink-900">How was {vendorName}?</h2>
        <p className="mt-2 text-sm text-ink-600">
          Only customers with a completed booking can review, which is why these reviews are
          worth reading. Yours goes to a moderator before it appears on the profile.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-7">
          <Notice state={state} />

          <StarPicker
            name="rating"
            label="Overall"
            hint="Required"
            value={rating}
            onChange={setRating}
            size="lg"
          />

          <fieldset className="space-y-4 rounded-lg bg-surface-sunken p-4">
            <legend className="px-1 text-sm font-medium text-ink-800">
              A little more detail (optional)
            </legend>
            {SUB_RATINGS.map((sub) => (
              <StarPicker
                key={sub.key}
                name={sub.key}
                label={sub.label}
                hint={sub.hint}
                value={subRatings[sub.key] ?? 0}
                onChange={(next) => setSubRatings((prev) => ({ ...prev, [sub.key]: next }))}
              />
            ))}
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-800">
              Headline (optional)
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="Calm on a very hectic mandap day"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-800">Your review</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={4000}
              required
              placeholder={`What should the next couple know about working with ${vendorName}? Briefing, the day itself, how the delivery went.`}
              className={inputClass}
              aria-describedby="review-body-count"
            />
            <span
              id="review-body-count"
              className={cn(
                'mt-1 block text-xs',
                bodyLength >= MIN_BODY ? 'text-ink-500' : 'text-ink-600',
              )}
            >
              {bodyLength >= MIN_BODY
                ? `${bodyLength} characters`
                : `${MIN_BODY - bodyLength} more characters needed`}
            </span>
          </label>

          {state.status === 'error' && state.fieldErrors?.body && (
            <p className="text-sm text-danger-700">{state.fieldErrors.body[0]}</p>
          )}

          <Button type="submit" size="lg" fullWidth disabled={!canSubmit}>
            {pending ? 'Sending…' : 'Submit review'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function Notice({ state }: { state: ReviewState }) {
  if (state.status === 'idle' || state.status === 'submitted') return null

  const tone =
    state.status === 'unconfigured'
      ? 'bg-warning-50 text-warning-700'
      : state.status === 'error'
        ? 'bg-danger-50 text-danger-700'
        : 'bg-surface-sunken text-ink-700'

  return (
    <p role="status" className={cn('rounded-lg px-4 py-3 text-sm', tone)}>
      {state.message}
    </p>
  )
}

function StarPicker({
  name,
  label,
  hint,
  value,
  onChange,
  size = 'md',
}: {
  name: string
  label: string
  hint?: string
  value: number
  onChange: (value: number) => void
  size?: 'md' | 'lg'
}) {
  const [hovered, setHovered] = useState(0)
  const shown = hovered || value
  const dim = size === 'lg' ? 'h-9 w-9' : 'h-6 w-6'

  return (
    <fieldset>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <legend className="text-sm font-medium text-ink-800">{label}</legend>
        {hint && <span className="text-xs text-ink-500">{hint}</span>}
      </div>
      <div className="mt-1.5 flex gap-1" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            onMouseEnter={() => setHovered(star)}
            className="cursor-pointer rounded p-0.5 focus-within:ring-2 focus-within:ring-primary-500"
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
            />
            <span className="sr-only">
              {star} out of 5 for {label}
            </span>
            <svg
              className={cn(dim, star <= shown ? 'fill-accent-400' : 'fill-ink-200')}
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9z" />
            </svg>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const inputClass =
  'w-full rounded-lg border border-ink-200 bg-surface-raised px-3.5 py-2.5 text-ink-900 ' +
  'placeholder:text-ink-400 focus:border-primary-500 focus:outline-none'

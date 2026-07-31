'use client'

import { useActionState, useState } from 'react'

import { saveEvent, type EventState } from './actions'

/**
 * Create or edit an event.
 *
 * Collapsed by default. This screen's job is to show the events you have; a permanently
 * open eleven-field form above them makes the list the secondary thing on its own page.
 *
 * Budgets are typed in rupees and converted to paise in the action (plan §5). The inputs say
 * so, because "50000" meaning fifty thousand rupees and "50000" meaning five hundred rupees
 * look identical and only one of them is what anybody means.
 */
const TYPE_LABELS: [string, string][] = [
  ['wedding', 'Wedding'],
  ['engagement', 'Engagement'],
  ['reception', 'Reception'],
  ['sangeet', 'Sangeet'],
  ['mehendi', 'Mehendi'],
  ['anniversary', 'Anniversary'],
  ['birthday', 'Birthday'],
  ['baby_shower', 'Baby shower'],
  ['housewarming', 'Housewarming'],
  ['corporate', 'Corporate'],
  ['other', 'Something else'],
]

export function EventForm({ cities }: { cities: { id: string; name: string }[] }) {
  const [state, act, pending] = useActionState<EventState, FormData>(saveEvent, {})
  const [open, setOpen] = useState(false)

  // Collapse once it has saved, so the new row is what you are looking at rather than the
  // form you just finished with.
  if (state.saved && open && !pending) setOpen(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary-600 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-700"
      >
        Add an event
      </button>
    )
  }

  return (
    <form
      action={act}
      className="rounded-2xl border border-ink-100 bg-surface-raised p-6"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="What is it?" htmlFor="eventType">
          <select
            id="eventType"
            name="eventType"
            defaultValue="wedding"
            className="w-full rounded-md border border-ink-200 bg-surface px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400"
          >
            {TYPE_LABELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Name it (optional)" htmlFor="name">
          <input
            id="name"
            name="name"
            type="text"
            placeholder="Radha & Dhanesh"
            className="w-full rounded-md border border-ink-200 bg-surface px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400 placeholder:text-ink-400"
          />
        </Field>

        <Field label="Date" htmlFor="eventDate">
          <input
            id="eventDate"
            name="eventDate"
            type="date"
            className="w-full rounded-md border border-ink-200 bg-surface px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400"
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" name="dateFlexible" className="h-4 w-4" />
            Not fixed yet
          </label>
        </Field>

        <Field label="City" htmlFor="cityId">
          <select
            id="cityId"
            name="cityId"
            className="w-full rounded-md border border-ink-200 bg-surface px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400"
          >
            <option value="">Not decided</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Guests" htmlFor="guestCount">
          <input
            id="guestCount"
            name="guestCount"
            type="number"
            min={1}
            placeholder="400"
            className="w-full rounded-md border border-ink-200 bg-surface px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400 placeholder:text-ink-400"
          />
        </Field>

        <Field label="Budget, in rupees" htmlFor="budgetMin">
          <div className="flex items-center gap-2">
            <input
              id="budgetMin"
              name="budgetMin"
              type="text"
              inputMode="numeric"
              placeholder="3,00,000"
              className="w-full rounded-md border border-ink-200 bg-surface px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400 placeholder:text-ink-400"
            />
            <span className="text-ink-500">to</span>
            <input
              name="budgetMax"
              type="text"
              inputMode="numeric"
              placeholder="5,00,000"
              aria-label="Upper budget, in rupees"
              className="w-full rounded-md border border-ink-200 bg-surface px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400 placeholder:text-ink-400"
            />
          </div>
        </Field>
      </div>

      <Field label="Anything else" htmlFor="notes" className="mt-5">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Two functions, both at the same venue…"
          className="w-full rounded-md border border-ink-200 bg-surface px-3.5 py-3 text-ink-900 outline-none focus:border-ink-400 placeholder:text-ink-400"
        />
      </Field>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary-600 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save event'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-3 text-sm text-ink-600 hover:text-ink-900"
        >
          Cancel
        </button>
      </div>

      {state.error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger-500/30 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700"
        >
          {state.error}
        </p>
      )}
    </form>
  )
}

function Field({
  label,
  htmlFor,
  className = '',
  children,
}: {
  label: string
  htmlFor: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

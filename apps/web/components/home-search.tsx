'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The homepage search widget. Plan §2 Must-tier: "Category × locality discovery with
 * price bands and the 'free on my date' availability filter".
 *
 * The date field is the point. Every competitor in this category asks for vendor type
 * and city; none of them can answer "who is actually free on 14 February". Putting it in
 * the first control a couple touches is the clearest way to say what is different here —
 * and it lands them on a result set that is already filtered, rather than on a list they
 * then have to narrow.
 */
export function HomeSearch({
  cities,
  categories,
  defaultCity,
}: {
  cities: { slug: string; name: string }[]
  categories: { slug: string; name: string }[]
  defaultCity: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [category, setCategory] = useState(categories[0]?.slug ?? 'photography')
  const [city, setCity] = useState(defaultCity)
  const [date, setDate] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const qs = date ? `?freeOn=${date}` : ''
    startTransition(() => router.push(`/${city}/${category}${qs}`))
  }

  return (
    <form
      onSubmit={submit}
      className="mt-8 rounded-xl border border-ink-100 bg-surface-raised p-3 shadow-lg sm:p-4"
    >
      <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr_1fr_auto]">
        <Field label="I'm looking for" htmlFor="h-cat">
          <select
            id="h-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={control}
          >
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="In" htmlFor="h-city">
          <select
            id="h-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={control}
          >
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Free on" htmlFor="h-date" hint="Optional">
          <input
            id="h-date"
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={control}
          />
        </Field>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="h-12 w-full rounded-lg bg-primary-600 px-7 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60 sm:w-auto"
          >
            {pending ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>
    </form>
  )
}

const control =
  'h-12 w-full rounded-lg border border-ink-200 bg-surface px-3 text-ink-900 ' +
  'focus:border-primary-500 focus:outline-none'

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
        {label}
        {hint && <span className="font-normal text-ink-400">· {hint}</span>}
      </label>
      {children}
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'

import { Button, cn } from '@/components/ui'

export interface SearchBoxOption {
  slug: string
  name: string
}

/**
 * The city × category × keyword entry point. Plan §2 Must-tier: "category × locality
 * discovery" — so the box resolves to a real, indexable discovery URL rather than a
 * `/search?q=` dead end that plan §12's SEO engine cannot use.
 *
 * Both selects are plain uncontrolled-ish state and the submit is a `router.push`, so
 * this stays a small client island; the results page below it remains a Server
 * Component doing RLS-scoped reads (plan §4).
 */
export function SearchBox({
  cities,
  categories,
  defaultCity,
  defaultCategory,
  defaultQuery = '',
  className,
}: {
  cities: SearchBoxOption[]
  categories: SearchBoxOption[]
  defaultCity: string
  defaultCategory: string
  defaultQuery?: string
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [city, setCity] = useState(defaultCity)
  const [category, setCategory] = useState(defaultCategory)
  const [query, setQuery] = useState(defaultQuery)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    const href = trimmed
      ? `/${city}/${category}?q=${encodeURIComponent(trimmed)}`
      : `/${city}/${category}`

    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className={cn(
        'grid gap-2 rounded-full border border-ink-100 bg-surface-raised p-2',
        'sm:grid-cols-[1fr_auto_auto_auto] sm:items-center',
        className,
      )}
    >
      <label className="sm:contents">
        <span className="sr-only">What are you looking for?</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Candid photographer, farmhouse venue…"
          className="w-full rounded-lg border border-ink-200 bg-surface-raised px-3.5 py-2.5 text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none sm:border-transparent sm:shadow-none"
        />
      </label>

      <label className="sm:contents">
        <span className="sr-only">Category</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className={selectClass}
        >
          {categories.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

      <label className="sm:contents">
        <span className="sr-only">City</span>
        <select
          value={city}
          onChange={(event) => setCity(event.target.value)}
          className={selectClass}
        >
          {cities.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

      <Button type="submit" disabled={pending} className="sm:px-6">
        {pending ? 'Searching…' : 'Search'}
      </Button>
    </form>
  )
}

const selectClass =
  'w-full rounded-lg border border-ink-200 bg-surface-raised px-3 py-2.5 text-sm text-ink-800 ' +
  'focus:border-primary-500 focus:outline-none sm:w-auto sm:border-transparent'

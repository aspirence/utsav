'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'

/**
 * The discovery filter bar. Plan §2 Must-tier:
 * "Category × locality discovery with price bands and the 'free on my date'
 * availability filter … package cards normalised to per-day pricing".
 *
 * Every control writes to the URL rather than to component state. Three reasons, all
 * from the plan: a filtered view has to be linkable and crawlable (§2 programmatic SEO),
 * the server does the filtering through search_vendors() so results stay RLS-scoped (§4
 * "Server Components do all reads"), and back/forward has to behave.
 *
 * Note what is deliberately absent: there is no "featured" or "promoted" sort. Plan §11
 * commits to ranking with no paid preference, so exposing one here would contradict the
 * ranking SQL — and the pgTAP suite that guards it.
 */

export interface DiscoverFiltersProps {
  basePath: string
  /** Budget rungs in paise, chosen per category so they read naturally in lakh. */
  priceRungs: { label: string; value: number }[]
  showDurationFilter: boolean
}

const SORTS = [
  { value: 'relevance', label: 'Best match' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Highest rated' },
]

export function DiscoverFilters({
  basePath,
  priceRungs,
  showDurationFilter,
}: DiscoverFiltersProps) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  /** Rewrite one param, drop it when empty, and always reset paging. */
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString())
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
      next.delete('page')
      const qs = next.toString()
      startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false }))
    },
    [params, router, basePath],
  )

  const freeOn = params.get('freeOn') ?? ''
  const budgetMax = params.get('budgetMax') ?? ''
  const minRating = params.get('minRating') ?? ''
  const days = params.get('days') ?? ''
  const sort = params.get('sort') ?? 'relevance'

  const activeCount = [freeOn, budgetMax, minRating, days].filter(Boolean).length
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div
      className={`mt-5 flex flex-wrap items-end gap-3 ${pending ? 'opacity-60' : ''}`}
      aria-busy={pending}
    >
      {/*
        The availability filter leads, because it is the one thing a couple cannot find
        out anywhere else without messaging every vendor individually. Absence of a
        blocked date means available, so this narrows honestly rather than optimistically.
      */}
      <Control label="Free on my date" htmlFor="f-date">
        <input
          id="f-date"
          type="date"
          min={today}
          value={freeOn}
          onChange={(e) => setParam('freeOn', e.target.value || null)}
          className={inputClass}
        />
      </Control>

      <Control label="Budget up to" htmlFor="f-budget">
        <select
          id="f-budget"
          value={budgetMax}
          onChange={(e) => setParam('budgetMax', e.target.value || null)}
          className={inputClass}
        >
          <option value="">Any budget</option>
          {priceRungs.map((r) => (
            <option key={r.value} value={String(r.value)}>
              {r.label}
            </option>
          ))}
        </select>
      </Control>

      {/* Plan §2's per-day normalisation only pays off if the customer can say how many
          days they need — a 3-day quote and a 1-day quote are otherwise incomparable. */}
      {showDurationFilter && (
        <Control label="Days needed" htmlFor="f-days">
          <select
            id="f-days"
            value={days}
            onChange={(e) => setParam('days', e.target.value || null)}
            className={inputClass}
          >
            <option value="">Any</option>
            <option value="1">1 day</option>
            <option value="2">2 days</option>
            <option value="3">3 days</option>
            <option value="4">4+ days</option>
          </select>
        </Control>
      )}

      <Control label="Rating" htmlFor="f-rating">
        <select
          id="f-rating"
          value={minRating}
          onChange={(e) => setParam('minRating', e.target.value || null)}
          className={inputClass}
        >
          <option value="">Any rating</option>
          <option value="4.5">4.5+</option>
          <option value="4">4.0+</option>
          <option value="3.5">3.5+</option>
        </select>
      </Control>

      <Control label="Sort by" htmlFor="f-sort">
        <select
          id="f-sort"
          value={sort}
          onChange={(e) => setParam('sort', e.target.value === 'relevance' ? null : e.target.value)}
          className={inputClass}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Control>

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => startTransition(() => router.push(basePath, { scroll: false }))}
          className="h-10 rounded-lg px-3 text-sm font-medium text-ink-600 underline underline-offset-2 hover:text-ink-900"
        >
          Clear {activeCount} filter{activeCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

const inputClass =
  'h-10 rounded-lg border border-ink-200 bg-surface-raised px-3 text-sm text-ink-900 ' +
  'focus:border-primary-500 focus:outline-none'

function Control({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-500">
        {label}
      </label>
      {children}
    </div>
  )
}

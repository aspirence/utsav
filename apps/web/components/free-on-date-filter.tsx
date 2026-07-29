'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type ChangeEvent } from 'react'

import { cn } from '@utsava/ui'

/**
 * The "free on my date" filter. Plan §2 Must-tier names it explicitly, and plan §11
 * treats it as a defensibility feature: it only works because vendors keep
 * `vendor_availability` current, which is why the vendor app ships before demand does.
 *
 * It writes `freeOn` into the URL rather than holding it in component state — the
 * results are server-rendered and the filtered view has to stay shareable and
 * crawlable (plan §12). Every other active filter is passed in so a date change
 * narrows the current view instead of resetting it.
 */
export function FreeOnDateFilter({
  basePath,
  freeOn,
  styles = [],
  sort,
  minDate,
  className,
}: {
  /** e.g. `/lucknow/photography/gomti-nagar` */
  basePath: string
  /** Currently applied ISO `YYYY-MM-DD`, straight from searchParams. */
  freeOn?: string
  styles?: string[]
  sort?: string
  /** ISO `YYYY-MM-DD`; defaults to today in the browser's timezone. */
  minDate?: string
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [floor] = useState(() => minDate ?? todayIso())

  function go(nextFreeOn: string | undefined) {
    const search = new URLSearchParams()
    for (const style of styles) search.append('styles', style)
    if (nextFreeOn) search.set('freeOn', nextFreeOn)
    if (sort && sort !== 'relevance') search.set('sort', sort)
    const qs = search.toString()

    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath)
    })
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    go(value === '' ? undefined : value)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <label className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-surface-raised py-1 pl-3.5 pr-1.5 text-sm text-ink-700">
        <span className="whitespace-nowrap">Free on</span>
        <input
          type="date"
          value={freeOn ?? ''}
          min={floor}
          onChange={handleChange}
          disabled={pending}
          aria-label="Show only vendors free on this date"
          className="rounded-full bg-transparent px-1 py-1 text-sm text-ink-900 focus:outline-none"
        />
      </label>

      {freeOn && (
        <button
          type="button"
          onClick={() => go(undefined)}
          disabled={pending}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800 disabled:opacity-60"
        >
          Clear date
        </button>
      )}

      {pending && <span className="text-xs text-ink-500">Checking availability…</span>}
    </div>
  )
}

function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

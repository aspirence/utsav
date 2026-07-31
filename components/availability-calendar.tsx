'use client'

import { useMemo, useState } from 'react'

import { Button, LinkButton, cn } from '@/components/ui'

/**
 * Month-by-month availability for one vendor. Plan §2 Must-tier lists the "free on my
 * date" filter; this is the same question asked on the profile instead of the results
 * page, and it answers with the vendor's own `vendor_availability` blocks.
 *
 * Two honesty rules are baked in, because an availability calendar that overpromises
 * is worse than none:
 *   · An empty `blockedDates` means "nothing blocked that we know of", not "definitely
 *     free" — the copy says so rather than showing a wall of green.
 *   · Picking a date does not hold it. It pre-fills the enquiry, and the vendor
 *     confirms when they respond (plan §2: no instant booking in the wedge category).
 *
 * Pass `fromDate` from the server to pin the first month; otherwise the browser's own
 * clock decides, which is fine for a demo but drifts across timezones.
 */
export function AvailabilityCalendar({
  vendorSlug,
  vendorName,
  blockedDates = [],
  fromDate,
  monthsAhead = 6,
  className,
}: {
  vendorSlug: string
  vendorName: string
  /** ISO `YYYY-MM-DD` dates the vendor has blocked. */
  blockedDates?: string[]
  /** ISO `YYYY-MM-DD`. Defaults to today in the browser's timezone. */
  fromDate?: string
  monthsAhead?: number
  className?: string
}) {
  const [startIso] = useState(() => fromDate ?? todayIso())
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)

  const blocked = useMemo(() => new Set(blockedDates), [blockedDates])

  // A malformed `fromDate` falls back to the current month rather than throwing.
  const start = parseIso(startIso) ?? nowParts()
  const view = new Date(start.year, start.month + offset, 1)
  const year = view.getFullYear()
  const month = view.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: view.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const monthLabel = view.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div className={cn('rounded-xl border border-ink-100 bg-surface-raised p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
          aria-label="Previous month"
        >
          ←
        </Button>
        <p className="font-display text-lg text-ink-900" aria-live="polite">
          {monthLabel}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOffset((o) => Math.min(monthsAhead - 1, o + 1))}
          disabled={offset >= monthsAhead - 1}
          aria-label="Next month"
        >
          →
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-500">
        {WEEKDAYS.map((day, i) => (
          <span key={i} aria-hidden="true">
            {day}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day == null) return <span key={`blank-${i}`} />

          const iso = isoOf(year, month, day)
          const isPast = iso < startIso
          const isBlocked = blocked.has(iso)
          const isSelected = selected === iso
          const disabled = isPast || isBlocked

          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(isSelected ? null : iso)}
              aria-pressed={isSelected}
              aria-label={`${day} ${monthLabel}${isBlocked ? ' — already booked' : ''}`}
              className={cn(
                'aspect-square rounded-md text-sm transition-colors',
                isSelected && 'bg-primary-600 font-semibold text-white',
                !isSelected && !disabled && 'text-ink-800 hover:bg-ink-100',
                isBlocked && 'bg-ink-50 text-ink-300 line-through',
                isPast && !isBlocked && 'text-ink-300',
                disabled && 'cursor-not-allowed',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink-100 pt-3 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-ink-100" /> Already booked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary-600" /> Your date
        </span>
      </div>

      {blocked.size === 0 && (
        <p className="mt-3 text-xs text-ink-500">
          {vendorName} has not blocked any dates this month. Send an enquiry to have it
          confirmed — a date is only held once they respond.
        </p>
      )}

      <LinkButton
        href={
          selected
            ? `/enquire?vendor=${vendorSlug}&date=${selected}`
            : `/enquire?vendor=${vendorSlug}`
        }
        size="lg"
        fullWidth
        className="mt-4"
      >
        {selected ? `Check ${formatLong(selected)}` : 'Check availability'}
      </LinkButton>
    </div>
  )
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function nowParts(): { year: number; month: number; day: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() }
}

function todayIso(): string {
  const { year, month, day } = nowParts()
  return isoOf(year, month, day)
}

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const [, year = '', month = '', day = ''] = match
  return { year: Number(year), month: Number(month) - 1, day: Number(day) }
}

function formatLong(iso: string): string {
  const parts = parseIso(iso)
  if (!parts) return iso
  return new Date(parts.year, parts.month, parts.day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
  })
}

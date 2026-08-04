'use client'

import { useMemo, useOptimistic, useState, useTransition, type FormEvent } from 'react'

import { Badge, Button, Card, CardBody, cn } from '@/components/ui'

import {
  blockDateRange,
  toggleBlockedDate,
  type AvailabilityDay,
  type AvailabilityReason,
  type CalendarState,
} from './actions'

/**
 * The interactive half of the availability calendar (plan §S8).
 *
 * Optimism is deliberate here. A vendor blocking a fortnight taps twenty times in a row,
 * usually on a phone on a shoot; waiting for a round trip between taps makes the whole
 * screen feel broken. So every tap paints immediately through useOptimistic and is then
 * reconciled against what the server actually did — if the write was refused, React
 * discards the optimistic day when the transition ends and the message says why.
 *
 * Two states can only be resolved by the server, and the grid says so rather than
 * guessing:
 *   · a date held by a confirmed booking cannot be released here at all;
 *   · a date in the past is not editable.
 *
 * Every day is a real <button>, so the grid is tabbable, Space/Enter works, and
 * aria-pressed carries the blocked/free state to a screen reader.
 */

const REASON_OPTIONS: { value: AvailabilityReason; label: string }[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'travel', label: 'Travelling' },
  { value: 'held', label: 'Tentative hold' },
  { value: 'booked', label: 'Booked elsewhere' },
]

/** Mirrors MAX_RANGE_DAYS in actions.ts — checked here only to keep the optimistic
 *  paint honest, never as the authority. */
const MAX_RANGE_DAYS = 120

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

type Feedback = { tone: 'ok' | 'locked' | 'error' | 'unconfigured'; message: string }

type OptimisticPatch =
  | { kind: 'toggle'; date: string; reason: AvailabilityReason }
  | { kind: 'block'; dates: string[]; reason: AvailabilityReason }

export function CalendarGrid({
  initialDays,
  todayIso,
  canManage,
  notice,
  monthsShown = 3,
}: {
  initialDays: AvailabilityDay[]
  /** `YYYY-MM-DD` in Asia/Kolkata, from the server, so SSR and hydration agree. */
  todayIso: string
  canManage: boolean
  notice: string | null
  monthsShown?: number
}) {
  // The server is the authority. `serverDays` tracks it: it is replaced when an action
  // reports what it wrote, and again whenever revalidatePath() sends fresh props.
  const [serverDays, setServerDays] = useState(initialDays)
  const propsKey = signature(initialDays)
  const [lastPropsKey, setLastPropsKey] = useState(propsKey)
  if (propsKey !== lastPropsKey) {
    setLastPropsKey(propsKey)
    setServerDays(initialDays)
  }

  const [days, applyOptimistic] = useOptimistic(serverDays, applyPatch)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const [reason, setReason] = useState<AvailabilityReason>('personal')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')

  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days])

  const months = useMemo(() => {
    const [year = '1970', month = '01'] = todayIso.split('-')
    return Array.from({ length: monthsShown }, (_, offset) => {
      const base = new Date(Date.UTC(Number(year), Number(month) - 1 + offset, 1))
      return { year: base.getUTCFullYear(), month: base.getUTCMonth() }
    })
  }, [todayIso, monthsShown])

  function reconcile(result: CalendarState) {
    if (result.status === 'ok') {
      setServerDays(result.days)
      setFeedback({ tone: 'ok', message: result.message })
      return
    }
    if (result.status === 'idle') return
    setFeedback({ tone: result.status, message: result.message })
  }

  function onToggle(date: string) {
    const existing = byDate.get(date)

    if (existing?.fromBooking) {
      setFeedback({
        tone: 'locked',
        message: `${formatDay(date)} is held by a confirmed booking. Cancelling that booking is what releases the date.`,
      })
      return
    }

    startTransition(async () => {
      applyOptimistic({ kind: 'toggle', date, reason })
      reconcile(await toggleBlockedDate(date, reason))
    })
  }

  function onBlockRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!rangeFrom || !rangeTo) return

    if (rangeTo < rangeFrom) {
      setFeedback({ tone: 'error', message: 'The last date cannot be before the first one.' })
      return
    }

    const dates = enumerateDates(rangeFrom < todayIso ? todayIso : rangeFrom, rangeTo)
    if (dates.length === 0) {
      setFeedback({ tone: 'error', message: 'Pick a range that ends today or later.' })
      return
    }
    if (dates.length > MAX_RANGE_DAYS) {
      setFeedback({
        tone: 'error',
        message: `You can block at most ${MAX_RANGE_DAYS} days at a time. Split it into shorter stretches.`,
      })
      return
    }

    startTransition(async () => {
      applyOptimistic({ kind: 'block', dates, reason })
      reconcile(await blockDateRange(rangeFrom, rangeTo, reason))
    })
  }

  return (
    <div className="space-y-5">
      {notice && (
        <p className="border-ink-200 bg-surface-sunken text-ink-600 rounded-lg border px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      <Card>
        <CardBody>
          <form onSubmit={onBlockRange} className="flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <label
                htmlFor="availability-reason"
                className="text-ink-600 block text-xs font-medium"
              >
                Why
              </label>
              <select
                id="availability-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value as AvailabilityReason)}
                disabled={!canManage}
                className="border-ink-200 bg-surface-raised text-ink-900 focus:border-primary-500 mt-1 h-11 rounded-lg border px-3 text-sm focus:outline-none disabled:opacity-50"
              >
                {REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label htmlFor="range-from" className="text-ink-600 block text-xs font-medium">
                Block from
              </label>
              <input
                id="range-from"
                type="date"
                value={rangeFrom}
                min={todayIso}
                onChange={(event) => setRangeFrom(event.target.value)}
                disabled={!canManage}
                className="border-ink-200 bg-surface-raised text-ink-900 focus:border-primary-500 mt-1 h-11 rounded-lg border px-3 text-sm focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="min-w-0">
              <label htmlFor="range-to" className="text-ink-600 block text-xs font-medium">
                Until
              </label>
              <input
                id="range-to"
                type="date"
                value={rangeTo}
                min={rangeFrom || todayIso}
                onChange={(event) => setRangeTo(event.target.value)}
                disabled={!canManage}
                className="border-ink-200 bg-surface-raised text-ink-900 focus:border-primary-500 mt-1 h-11 rounded-lg border px-3 text-sm focus:outline-none disabled:opacity-50"
              />
            </div>

            <Button type="submit" disabled={!canManage || pending || !rangeFrom || !rangeTo}>
              {pending ? 'Saving…' : 'Block this stretch'}
            </Button>

            <p className="text-ink-500 w-full text-xs">
              Blocking a stretch only adds dates. Anything already blocked — including a date held
              by a confirmed booking — is left exactly as it is.
            </p>
          </form>
        </CardBody>
      </Card>

      <p
        role="status"
        aria-live="polite"
        className={cn(
          'min-h-[1.25rem] text-sm',
          feedback?.tone === 'ok' && 'text-success-700',
          feedback?.tone === 'locked' && 'text-ink-600',
          feedback?.tone === 'error' && 'text-danger-700',
          feedback?.tone === 'unconfigured' && 'text-warning-700',
        )}
      >
        {feedback?.message}
      </p>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {months.map(({ year, month }) => (
          <MonthCard
            key={`${year}-${month}`}
            year={year}
            month={month}
            byDate={byDate}
            todayIso={todayIso}
            canManage={canManage}
            pending={pending}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}

function MonthCard({
  year,
  month,
  byDate,
  todayIso,
  canManage,
  pending,
  onToggle,
}: {
  year: number
  month: number
  byDate: Map<string, AvailabilityDay>
  todayIso: string
  canManage: boolean
  pending: boolean
  onToggle: (date: string) => void
}) {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  // Monday-first, which is how Indian calendars are usually printed.
  const leading = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7

  const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const dates = Array.from({ length: daysInMonth }, (_, i) => iso(year, month, i + 1))
  const blockedCount = dates.filter((date) => byDate.has(date)).length

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-ink-900 text-base">{label}</h2>
          <Badge tone={blockedCount > 0 ? 'neutral' : 'success'}>{blockedCount} blocked</Badge>
        </div>

        <div className="text-ink-400 grid grid-cols-7 gap-1 text-center text-[11px]">
          {WEEKDAYS.map((day, i) => (
            <span key={i} aria-hidden="true">
              {day}
            </span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: leading }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}

          {dates.map((date, index) => {
            const day = byDate.get(date)
            const isBlocked = Boolean(day)
            const locked = day?.fromBooking ?? false
            const isPast = date < todayIso
            const isToday = date === todayIso

            return (
              <button
                key={date}
                type="button"
                // Past days are inert: there is nothing to route to a day that has gone.
                // A booking-held day stays focusable on purpose — it needs to explain
                // itself, and a disabled button cannot be reached to do that.
                disabled={isPast || !canManage}
                aria-disabled={locked || undefined}
                aria-pressed={isBlocked}
                aria-label={describe(date, { locked, isBlocked, isPast })}
                title={describe(date, { locked, isBlocked, isPast })}
                onClick={() => onToggle(date)}
                className={cn(
                  'h-9 rounded text-xs transition-colors',
                  'focus-visible:ring-primary-500 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
                  isPast && 'text-ink-300 cursor-not-allowed',
                  !isPast && locked && 'bg-success-600 cursor-not-allowed font-medium text-white',
                  !isPast &&
                    !locked &&
                    isBlocked &&
                    'bg-ink-900 hover:bg-ink-700 font-medium text-white',
                  !isPast &&
                    !isBlocked &&
                    'border-ink-100 bg-surface-raised text-ink-700 hover:border-ink-300 hover:bg-ink-50 border',
                  isToday && !isBlocked && 'ring-primary-300 ring-1',
                  pending && 'opacity-90',
                )}
              >
                {index + 1}
              </button>
            )
          })}
        </div>
      </CardBody>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Optimistic reducer
// ---------------------------------------------------------------------------

function applyPatch(days: AvailabilityDay[], patch: OptimisticPatch): AvailabilityDay[] {
  if (patch.kind === 'toggle') {
    const existing = days.find((day) => day.date === patch.date)
    // Never paint a booking-held date as released — the server will refuse it, and a
    // flash of "free" on a date the vendor has actually sold is the wrong thing to show.
    if (existing?.fromBooking) return days
    if (existing) return days.filter((day) => day.date !== patch.date)
    return sortDays([...days, { date: patch.date, reason: patch.reason, fromBooking: false }])
  }

  const have = new Set(days.map((day) => day.date))
  const added = patch.dates
    .filter((date) => !have.has(date))
    .map((date) => ({ date, reason: patch.reason, fromBooking: false }))

  return added.length === 0 ? days : sortDays([...days, ...added])
}

function sortDays(days: AvailabilityDay[]): AvailabilityDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date))
}

function signature(days: AvailabilityDay[]): string {
  return days.map((day) => `${day.date}:${day.reason}:${day.fromBooking ? 1 : 0}`).join('|')
}

// ---------------------------------------------------------------------------
// Dates. UTC throughout so the browser's timezone can never shift a day.
// ---------------------------------------------------------------------------

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function enumerateDates(from: string, to: string): string[] {
  const startMs = Date.parse(`${from}T00:00:00Z`)
  const endMs = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return []

  const out: string[] = []
  for (let ms = startMs; ms <= endMs && out.length <= MAX_RANGE_DAYS; ms += 86_400_000) {
    out.push(new Date(ms).toISOString().slice(0, 10))
  }
  return out
}

function formatDay(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return date
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function describe(
  date: string,
  state: { locked: boolean; isBlocked: boolean; isPast: boolean },
): string {
  const label = formatDay(date)
  if (state.isPast) return `${label} — past`
  if (state.locked) return `${label} — held by a confirmed booking, cannot be opened here`
  if (state.isBlocked) return `${label} — blocked, select to open it up`
  return `${label} — available, select to block it`
}

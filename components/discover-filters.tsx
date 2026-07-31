'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

/**
 * The discovery search bar. Plan §2 Must-tier:
 * "Category × locality discovery with price bands and the 'free on my date'
 * availability filter … package cards normalised to per-day pricing".
 *
 * ── ONE BAR, NOT A ROW OF SELECTS ────────────────────────────────────────────
 * It was a strip of native <select>s under a row of style chips. This is a single pill divided
 * into segments, each opening a panel — the shape people already know from booking sites.
 *
 * ── WHY SELECTIONS ARE STAGED ────────────────────────────────────────────────
 * The old bar pushed a new URL on every change, so picking a style, a date and a budget meant
 * three server renders and three scroll-position guesses. Here a choice lands in local state and
 * the whole set commits when Search is pressed.
 *
 * That is also what makes the Search button real. A bar that filters as you touch it does not
 * need one, and adding it anyway would be a control that changes nothing — the same defect as a
 * form field nobody reads. Staging gives it a job.
 *
 * The URL is still the source of truth for what is *applied*: the draft seeds from it on mount
 * and resets to it whenever it changes, so a shared link opens with its filters showing, the
 * server keeps doing the filtering through search_vendors() (§4 "Server Components do all
 * reads"), and back/forward behaves.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────
 * No "featured" or "promoted" sort. Plan §11 commits to ranking with no paid preference, so
 * offering one here would contradict the ranking SQL and the pgTAP test that guards it.
 */

export interface StyleTag {
  slug: string
  name: string
}

export interface DiscoverFiltersProps {
  basePath: string
  /** Budget rungs in paise, chosen per category so they read naturally in lakh. */
  priceRungs: { label: string; value: number }[]
  showDurationFilter: boolean
  /** The category's style taxonomy. Empty for categories that have none. */
  styleTags?: StyleTag[]
}

const SORTS = [
  { value: 'relevance', label: 'Best match' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Highest rated' },
]

const DAYS = [
  { value: '1', label: '1 day' },
  { value: '2', label: '2 days' },
  { value: '3', label: '3 days' },
  { value: '4', label: '4+ days' },
]

const RATINGS = [
  { value: '4.5', label: '4.5 and above' },
  { value: '4', label: '4.0 and above' },
  { value: '3.5', label: '3.5 and above' },
]

interface Draft {
  styles: string[]
  freeOn: string
  budgetMax: string
  days: string
  minRating: string
  sort: string
}

export function DiscoverFilters({
  basePath,
  priceRungs,
  showDurationFilter,
  styleTags = [],
}: DiscoverFiltersProps) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  /** What the URL currently says. This is what the server has actually filtered on. */
  const applied = useMemo<Draft>(
    () => ({
      styles: (params.get('styles') ?? '').split(',').filter(Boolean),
      freeOn: params.get('freeOn') ?? '',
      budgetMax: params.get('budgetMax') ?? '',
      days: params.get('days') ?? '',
      minRating: params.get('minRating') ?? '',
      sort: params.get('sort') ?? 'relevance',
    }),
    [params],
  )

  const [draft, setDraft] = useState<Draft>(applied)
  const [open, setOpen] = useState<string | null>(null)

  /**
   * Re-seed when the URL changes.
   *
   * Covers the back button, a link into the page with filters already on it, and the commit
   * below. Without it, pressing back would leave the bar showing the filters you just left.
   */
  useEffect(() => setDraft(applied), [applied])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const dirty = JSON.stringify(draft) !== JSON.stringify(applied)
  const activeCount =
    applied.styles.length +
    [applied.freeOn, applied.budgetMax, applied.days, applied.minRating].filter(Boolean).length

  /** Commit the whole draft as one navigation. */
  const commit = useCallback(() => {
    const next = new URLSearchParams()
    if (draft.styles.length) next.set('styles', draft.styles.join(','))
    if (draft.freeOn) next.set('freeOn', draft.freeOn)
    if (draft.budgetMax) next.set('budgetMax', draft.budgetMax)
    if (draft.days) next.set('days', draft.days)
    if (draft.minRating) next.set('minRating', draft.minRating)
    if (draft.sort && draft.sort !== 'relevance') next.set('sort', draft.sort)

    const qs = next.toString()
    setOpen(null)
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false }))
  }, [draft, router, basePath])

  const today = new Date().toISOString().slice(0, 10)

  const styleSummary = draft.styles.length
    ? draft.styles.length === 1
      ? (styleTags.find((t) => t.slug === draft.styles[0])?.name ?? '1 style')
      : `${draft.styles.length} styles`
    : 'All styles'

  return (
    <div className={`mt-6 ${pending ? 'opacity-60' : ''}`} aria-busy={pending}>
      <Bar onClose={() => setOpen(null)}>
        {styleTags.length > 0 && (
          <Segment
            id="style"
            label="Style"
            value={styleSummary}
            muted={draft.styles.length === 0}
            open={open}
            setOpen={setOpen}
          >
            {/*
              "All styles" first, and it is a real option rather than a way to clear — it reads as
              the default state because it is one.

              Styles are multi-select: a couple who wants candid *and* documentary is a normal
              request, and the old chip row already allowed it.
            */}
            <Option
              label="All styles"
              selected={draft.styles.length === 0}
              onSelect={() => set('styles', [])}
            />
            {styleTags.map((tag) => {
              const on = draft.styles.includes(tag.slug)
              return (
                <Option
                  key={tag.slug}
                  label={tag.name}
                  selected={on}
                  onSelect={() =>
                    set(
                      'styles',
                      on ? draft.styles.filter((s) => s !== tag.slug) : [...draft.styles, tag.slug],
                    )
                  }
                />
              )
            })}
          </Segment>
        )}

        {/*
          Availability leads among the rest, because it is the one thing a couple cannot find out
          anywhere else without messaging every studio individually. Absence of a blocked date
          means available, so this narrows honestly rather than optimistically.
        */}
        <Segment
          id="date"
          label="Free on"
          value={draft.freeOn ? formatDay(draft.freeOn) : 'Any date'}
          muted={!draft.freeOn}
          open={open}
          setOpen={setOpen}
        >
          <div className="p-3">
            <input
              type="date"
              min={today}
              value={draft.freeOn}
              onChange={(e) => set('freeOn', e.target.value)}
              aria-label="Free on my date"
              className="border-ink-200 text-ink-900 focus:border-primary-500 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
            />
            {draft.freeOn && (
              <button
                type="button"
                onClick={() => set('freeOn', '')}
                className="text-ink-600 hover:text-ink-900 mt-2 text-xs underline underline-offset-2"
              >
                Clear date
              </button>
            )}
          </div>
        </Segment>

        <Segment
          id="budget"
          label="Budget"
          value={
            priceRungs.find((r) => String(r.value) === draft.budgetMax)?.label ?? 'Any budget'
          }
          muted={!draft.budgetMax}
          open={open}
          setOpen={setOpen}
        >
          <Option
            label="Any budget"
            selected={!draft.budgetMax}
            onSelect={() => set('budgetMax', '')}
          />
          {priceRungs.map((r) => (
            <Option
              key={r.value}
              label={r.label}
              selected={draft.budgetMax === String(r.value)}
              onSelect={() => set('budgetMax', String(r.value))}
            />
          ))}
        </Segment>

        {/* Plan §2's per-day normalisation only pays off if the customer can say how many days
            they need — a 3-day quote and a 1-day quote are otherwise incomparable. */}
        {showDurationFilter && (
          <Segment
            id="days"
            label="Days"
            value={DAYS.find((d) => d.value === draft.days)?.label ?? 'Any'}
            muted={!draft.days}
            open={open}
            setOpen={setOpen}
          >
            <Option label="Any" selected={!draft.days} onSelect={() => set('days', '')} />
            {DAYS.map((d) => (
              <Option
                key={d.value}
                label={d.label}
                selected={draft.days === d.value}
                onSelect={() => set('days', d.value)}
              />
            ))}
          </Segment>
        )}

        <Segment
          id="rating"
          label="Rating"
          value={RATINGS.find((r) => r.value === draft.minRating)?.label ?? 'Any rating'}
          muted={!draft.minRating}
          open={open}
          setOpen={setOpen}
        >
          <Option
            label="Any rating"
            selected={!draft.minRating}
            onSelect={() => set('minRating', '')}
          />
          {RATINGS.map((r) => (
            <Option
              key={r.value}
              label={r.label}
              selected={draft.minRating === r.value}
              onSelect={() => set('minRating', r.value)}
            />
          ))}
        </Segment>

        <Segment
          id="sort"
          label="Sort by"
          value={SORTS.find((s) => s.value === draft.sort)?.label ?? 'Best match'}
          muted={draft.sort === 'relevance'}
          open={open}
          setOpen={setOpen}
          last
        >
          {SORTS.map((s) => (
            <Option
              key={s.value}
              label={s.label}
              selected={draft.sort === s.value}
              onSelect={() => set('sort', s.value)}
            />
          ))}
        </Segment>

        <div className="flex items-center p-2">
          <button
            type="button"
            onClick={commit}
            className="bg-ink-900 hover:bg-ink-800 inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold text-white transition-colors"
          >
            Search
            <SearchIcon />
          </button>
        </div>
      </Bar>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {/* Only when the draft has drifted from what is applied — a permanent hint is furniture. */}
        {dirty && (
          <span className="text-primary-700">Press Search to apply your changes.</span>
        )}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setOpen(null)
              startTransition(() => router.push(basePath, { scroll: false }))
            }}
            className="text-ink-600 hover:text-ink-900 underline underline-offset-2"
          >
            Clear {activeCount} filter{activeCount > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The pill, and the click-outside that closes whatever is open in it.
 *
 * `pointerdown` rather than `click`: a click fires after mouseup, so a selection inside the panel
 * and a dismissing click outside it can race. pointerdown resolves in the order things happened.
 */
function Bar({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="border-ink-200/70 bg-surface-raised relative flex flex-col rounded-3xl border shadow-[0_10px_30px_-18px_rgba(24,17,12,0.35)] sm:flex-row sm:items-stretch sm:rounded-full"
    >
      {children}
    </div>
  )
}

/**
 * One segment: a label, the current value, and a panel under it.
 *
 * The divider is a left border on every segment except the first, so the row reads as one object
 * split up rather than as several placed side by side. It only applies from `sm` — below that the
 * bar stacks and a vertical rule between stacked rows would point the wrong way.
 */
function Segment({
  id,
  label,
  value,
  muted,
  open,
  setOpen,
  last,
  children,
}: {
  id: string
  label: string
  value: string
  /** True when nothing is chosen, so the value renders as a placeholder. */
  muted?: boolean
  open: string | null
  setOpen: (id: string | null) => void
  last?: boolean
  children: React.ReactNode
}) {
  const isOpen = open === id

  return (
    <div
      className={
        'relative flex-1 ' +
        (last ? '' : 'border-ink-200/70 border-b sm:border-b-0 sm:border-r ') +
        (isOpen ? 'bg-surface-raised z-20 rounded-3xl sm:rounded-full' : '')
      }
    >
      <button
        type="button"
        onClick={() => setOpen(isOpen ? null : id)}
        aria-expanded={isOpen}
        className="hover:bg-ink-50/70 group flex w-full items-center justify-between gap-3 rounded-3xl px-5 py-3 text-left transition-colors sm:rounded-full"
      >
        <span className="min-w-0">
          <span className="text-ink-900 block text-[13px] font-semibold">{label}</span>
          <span
            className={'block truncate text-sm ' + (muted ? 'text-ink-400' : 'text-ink-700')}
          >
            {value}
          </span>
        </span>
        <Chevron open={isOpen} />
      </button>

      {isOpen && (
        /*
          Slides down as it fades in. `animate-*` classes would need a keyframe in the theme; a
          one-off transition on mount is what `u-pop` does in styles.css, so this borrows the same
          idea inline — the panel is mounted only while open, so the initial state is the animation.
        */
        <div
          className="border-ink-200 bg-surface-raised absolute left-0 top-[calc(100%+0.5rem)] z-30 max-h-72 w-full min-w-[15rem] overflow-y-auto rounded-2xl border py-1.5 shadow-[0_16px_40px_-20px_rgba(24,17,12,0.45)] sm:w-auto"
          style={{ animation: 'u-drop 160ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** A row in a panel. A tick rather than a radio: several of these lists are multi-select. */
function Option({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="hover:bg-ink-50 flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm transition-colors"
    >
      <span className={selected ? 'text-ink-900 font-medium' : 'text-ink-700'}>{label}</span>
      {selected && (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary-600 h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <path d="M4 10.5l4 4 8-9" />
        </svg>
      )}
    </button>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-ink-400 h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M5 7.5l5 5 5-5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="M16.5 16.5L13.5 13.5" />
    </svg>
  )
}

/** "12 Feb 2027" — short, absolute, and unambiguous in a segment that has little room. */
function formatDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

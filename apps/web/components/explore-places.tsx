'use client'

import Link from 'next/link'
import { useState } from 'react'

/**
 * Explore the place: a list of localities on the left, the selected one shown large on the
 * right.
 *
 * This replaced two flat rows of pill links - "photographers by locality" and "by budget".
 * Same destinations, same plan §12 internal-linking job, but a list you can walk through
 * rather than a wall of chips, and every row gets a photograph instead of a number.
 *
 * The right panel is driven by whichever row is selected. Rows select on hover *and* on
 * focus, so a keyboard walks the list exactly the way a mouse does, and the arrows step
 * through the same order. Nothing here is a carousel on a timer - a locality list is a
 * deliberate browse, not ambient decoration, so it only moves when someone moves it.
 *
 * Every row is a real <Link> to the locality page underneath the interaction, so the list
 * works with no JavaScript and a crawler sees every URL. The panel is an enhancement on
 * top of that, not the mechanism.
 *
 * Artwork is a placeholder until it is supplied - pass `imageUrl` per place.
 */

export interface PlaceCard {
  slug: string
  name: string
  /** The line above the title, e.g. "Lucknow, Uttar Pradesh". */
  region: string
  href: string
  /** Optional flag on the panel, e.g. "Most booked locality". */
  badge?: string
  count?: number
  imageUrl?: string | null
}

export function ExplorePlaces({
  places,
  eyebrow,
  title,
  description,
}: {
  places: PlaceCard[]
  eyebrow: string
  title: string
  description: string
}) {
  const [active, setActive] = useState(0)

  if (places.length === 0) return null

  const current = places[active] ?? places[0]!
  const step = (delta: number) =>
    setActive((i) => (i + delta + places.length) % places.length)

  return (
    <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
      {/* ── Left: the list ─────────────────────────────────────────────── */}
      <div>
        <p className="text-sm text-ink-600">{eyebrow}</p>
        <h2 className="mt-2 text-3xl leading-tight text-ink-900 sm:text-4xl">{title}</h2>
        <p className="mt-3 text-ink-600">{description}</p>

        <ul className="mt-10 border-t border-ink-200">
          {places.map((place, i) => (
            <li key={place.slug} className="border-b border-ink-200">
              <Link
                href={place.href}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                aria-current={i === active ? 'true' : undefined}
                className={
                  'group flex items-center justify-between gap-4 py-4 transition-colors ' +
                  (i === active ? 'text-ink-900' : 'text-ink-700 hover:text-ink-900')
                }
              >
                <span className="text-lg">
                  {place.name}
                  {place.count ? (
                    <span className="ml-2 align-middle text-sm text-ink-400">
                      {place.count}
                    </span>
                  ) : null}
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-ink-400 transition-transform group-hover:translate-x-1 group-[[aria-current]]:text-ink-900"
                >
                  &rarr;
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Right: the selected place ──────────────────────────────────── */}
      <div className="relative isolate h-[420px] overflow-hidden rounded-2xl sm:h-[560px] lg:h-[680px]">
        {current.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- plan §12: Storage CDN
          <img
            key={current.slug}
            src={current.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="u-media-fallback absolute inset-0" aria-hidden="true" />
        )}

        {/* Bottom-weighted, because everything on this panel sits along the floor. */}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink-950/85 via-ink-950/40 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <p className="text-sm text-white/80">{current.region}</p>
          <p className="mt-1 max-w-[70%] text-3xl leading-tight text-white sm:text-4xl">
            {current.name}
          </p>

          {current.badge && (
            <span className="mt-4 inline-block rounded-md bg-ink-950/55 px-3 py-1.5 text-sm text-white backdrop-blur-sm">
              {current.badge}
            </span>
          )}

          <div className="mt-5 flex items-end justify-between gap-4">
            <Link
              href={current.href}
              className="inline-flex items-center gap-3 rounded-md bg-surface-raised py-2.5 pl-5 pr-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Explore
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-900 text-white"
              >
                &rarr;
              </span>
            </Link>

            <div className="flex gap-2">
              <PanelArrow dir="prev" onClick={() => step(-1)} />
              <PanelArrow dir="next" onClick={() => step(1)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PanelArrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Previous place' : 'Next place'}
      className="flex h-10 w-10 items-center justify-center rounded-md border border-white/40 bg-ink-950/40 text-white backdrop-blur-sm transition-colors hover:bg-ink-950/70"
    >
      <span aria-hidden="true">{dir === 'prev' ? '←' : '→'}</span>
    </button>
  )
}

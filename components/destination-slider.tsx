'use client'

import Link from 'next/link'

import { paginate, useResponsivePerPage, usePagedLoop } from './use-paged-loop'

/**
 * Destination cards, two at a time, advancing on a loop.
 *
 * A pair holds still long enough to read the blurb, then steps to the next pair - nothing
 * is ever caught mid-slide. The loop mechanics, and why the track carries a clone of page
 * one on the end, live in usePagedLoop.
 *
 * The pair is asymmetric on purpose - a wide card then a square one - which is what stops
 * four identical rectangles from reading as a spreadsheet.
 */

export interface DestinationCard {
  slug: string
  /** The light script line above the title, e.g. "Wedding at". */
  script: string
  title: string
  blurb: string
  href: string
  imageUrl?: string | null
  /** Optional responsive set. Widths are the files' real widths, not their filenames -
      optimize-images.mjs never upscales, so `-1920.webp` off a 1536px source is 1536w. */
  imageSrcSet?: string
}

export function DestinationSlider({ items }: { items: DestinationCard[] }) {
  // Two per page, but one on a phone - the pair is a wide card beside a square one, and
  // stacking them makes a slide twice the height of the screen. An odd tail simply
  // renders a shorter final page.
  const perPage = useResponsivePerPage(1, 2, 2)
  const pages = paginate(items, perPage)
  const count = pages.length
  const { index, page, animate, next, prev, pauseProps } = usePagedLoop(count)

  if (count === 0) return null

  // Track holds every page plus a clone of the first, so the loop has somewhere to land.
  const slides = count > 1 ? [...pages, pages[0]!] : pages

  return (
    <div {...pauseProps}>
      <div className="mb-6 flex items-center justify-end gap-2">
        {/* Dots read as position; with two pages they also make it obvious that the
            movement is paging rather than free scrolling. */}
        <div className="mr-auto flex gap-1.5" aria-hidden="true">
          {pages.map((_, i) => (
            <span
              key={i}
              className={
                'h-1.5 rounded-full transition-all duration-300 ' +
                (page === i ? 'w-6 bg-ink-800' : 'w-1.5 bg-ink-300')
              }
            />
          ))}
        </div>
        <ArrowButton dir="prev" onClick={prev} />
        <ArrowButton dir="next" onClick={next} />
      </div>

      <div className="overflow-hidden">
        <div
          className={
            'flex ' + (animate ? 'transition-transform duration-700 ease-out' : '')
          }
          style={{ transform: `translateX(-${index * 100}%)` }}
          role="group"
          aria-label="Destination wedding settings"
        >
          {slides.map((pair, pi) => (
            <div
              key={pi}
              className="grid w-full shrink-0 grid-cols-1 gap-6 sm:grid-cols-[1.45fr_1fr]"
              // The clone exists only to close the loop; a screen reader should meet each
              // destination once.
              aria-hidden={pi >= count ? 'true' : undefined}
            >
              {pair.map((item) => (
                <Card key={item.slug} item={item} inert={pi >= count} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Card({ item, inert }: { item: DestinationCard; inert: boolean }) {
  return (
    <Link
      href={item.href}
      tabIndex={inert ? -1 : undefined}
      /*
        One fixed height for both cards rather than an aspect-ratio each.

        Aspect ratios were the bug: a CSS grid row stretches its items to the tallest, but
        an inner aspect-[5/4] box keeps its own height, so the narrower card ended up
        shorter than its own link and left a pale band under the image.

        With a shared height the shapes still differ, and for the right reason - the grid
        gives the left card 1.45fr and the right 1fr, so at equal height the left reads as
        a rectangle and the right as a square.
      */
      className="group relative block h-[340px] overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 sm:h-[420px] lg:h-[480px]"
    >
      <div className="h-full w-full">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- plan section 12: Storage CDN
          <img
            src={item.imageUrl}
            {...(item.imageSrcSet
              ? { srcSet: item.imageSrcSet, sizes: '(min-width: 640px) 58vw, 100vw' }
              : {})}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="u-media-fallback h-full w-full" aria-hidden="true" />
        )}
      </div>

      {/* Scrim weighted to the left, where the title sits, so the right of the
          photograph stays open. */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950/55 via-ink-950/20 to-transparent" />

      <div className="absolute inset-x-0 top-0 p-6 sm:p-7">
        <p
          className="font-display text-xl italic text-white/90 sm:text-2xl"
          style={{ textShadow: '0 1px 14px rgb(15 12 11 / 0.5)' }}
        >
          {item.script}
        </p>
        <h3
          className="mt-1 max-w-[70%] text-2xl font-semibold uppercase leading-tight tracking-wide text-white sm:text-3xl"
          style={{ textShadow: '0 1px 14px rgb(15 12 11 / 0.5)' }}
        >
          {item.title}
        </h3>
        <p className="mt-3 max-w-[64%] text-sm leading-snug text-white/85">{item.blurb}</p>
      </div>

      <span className="absolute bottom-5 right-5 inline-flex items-center gap-2 rounded-full bg-surface-raised py-2 pl-4 pr-2 text-sm font-medium text-ink-900 shadow-md">
        View details
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-900 text-white transition-transform group-hover:translate-x-0.5"
        >
          &rarr;
        </span>
      </span>
    </Link>
  )
}

function ArrowButton({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Previous destinations' : 'Next destinations'}
      className="flex h-10 w-10 items-center justify-center rounded-md border border-ink-200 bg-surface-raised text-ink-800 transition-colors hover:border-ink-300 hover:bg-ink-50"
    >
      <span aria-hidden="true">{dir === 'prev' ? '←' : '→'}</span>
    </button>
  )
}

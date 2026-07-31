'use client'

import Link from 'next/link'

import { formatPaise } from '@/lib/db'

import { paginate, useResponsivePerPage, usePagedLoop } from './use-paged-loop'

/**
 * Wedding packages, three at a time, looping.
 *
 * Same paging mechanism as the destinations and traditions bands - see usePagedLoop for
 * why the track carries a clone of page one on the end. Three per page here rather than
 * two or four, because these cards are portrait and three is what fits at the container
 * width without the place name wrapping.
 *
 * `startsAtPaise` is integer paise (plan §5) and is rendered through formatPaise, so the
 * ₹ sign and the Indian digit grouping are not hand-written per card.
 *
 * Artwork is a placeholder until it is supplied - pass `imageUrl` per item.
 */

export interface PackageCard {
  slug: string
  /** e.g. "Gomti Nagar, Lucknow" */
  place: string
  startsAtPaise: number
  href: string
  imageUrl?: string | null
  /** Optional responsive set. Descriptors are the files' real widths, not their filenames
      - optimize-images.mjs never upscales. See lib/place-art.ts. */
  imageSrcSet?: string
}

export function PackageSlider({ items }: { items: PackageCard[] }) {
  // One card per slide on a phone, two on a tablet, three on a desktop - and the grid
  // below uses the same breakpoints, so a page always holds exactly one row.
  const perPage = useResponsivePerPage(1, 2, 3)
  const pages = paginate(items, perPage)
  const count = pages.length
  const { index, page, animate, next, prev, pauseProps } = usePagedLoop(count)

  if (count === 0) return null

  const slides = count > 1 ? [...pages, pages[0]!] : pages

  return (
    <div {...pauseProps}>
      <div className="overflow-hidden">
        <div
          className={'flex ' + (animate ? 'transition-transform duration-700 ease-out' : '')}
          style={{ transform: `translateX(-${index * 100}%)` }}
          role="group"
          aria-label="Wedding packages"
        >
          {slides.map((group, pi) => (
            <ul
              key={pi}
              className="grid w-full shrink-0 grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
              // A screen reader should meet each package once, not twice.
              aria-hidden={pi >= count ? 'true' : undefined}
            >
              {group.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={item.href}
                    tabIndex={pi >= count ? -1 : undefined}
                    className="group relative block h-[340px] overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 sm:h-[400px]"
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- plan section 12: Storage CDN
                      <img
                        src={item.imageUrl}
                        {...(item.imageSrcSet
                          ? {
                              srcSet: item.imageSrcSet,
                              // Three across inside a 1280px container on a desktop, two
                              // on a tablet, one on a phone.
                              sizes: '(min-width: 1024px) 31vw, (min-width: 640px) 46vw, 92vw',
                            }
                          : {})}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="u-media-fallback h-full w-full" aria-hidden="true" />
                    )}

                    {/* Lower half only, so the price pill at the top sits on the
                        photograph rather than on a wash. */}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink-950/85 via-ink-950/40 to-transparent" />

                    <span className="absolute right-4 top-4 rounded-full bg-surface-raised px-4 py-2 text-sm font-medium text-ink-900 shadow-md">
                      Starts At {formatPaise(item.startsAtPaise)}
                    </span>

                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">
                        Wedding Packages
                      </p>
                      <p className="mt-1 text-xl leading-tight text-white">{item.place}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <Arrow dir="prev" onClick={prev} />
          <div className="flex gap-2" aria-hidden="true">
            {pages.map((_, i) => (
              <span
                key={i}
                className={
                  'h-2 rounded-full transition-all duration-300 ' +
                  (page === i ? 'w-6 bg-ink-800' : 'w-2 bg-ink-300')
                }
              />
            ))}
          </div>
          <Arrow dir="next" onClick={next} />
        </div>
      )}
    </div>
  )
}

function Arrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Previous packages' : 'Next packages'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-surface-raised text-ink-800 transition-colors hover:border-ink-300 hover:bg-ink-50"
    >
      <span aria-hidden="true">{dir === 'prev' ? '←' : '→'}</span>
    </button>
  )
}

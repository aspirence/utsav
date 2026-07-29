'use client'

import Link from 'next/link'

import { paginate, useResponsivePerPage, usePagedLoop } from './use-paged-loop'

/**
 * Cards in pages of four, looping forever, with the label over the image.
 *
 * This used to be a full-bleed CSS marquee that scrolled continuously to both edges of the
 * viewport. It is now contained - the track lines up with the section heading above it -
 * and it steps: four cards arrive together, hold long enough to read, then the next four.
 * Nothing is ever caught mid-slide.
 *
 * Generic on purpose. It takes a list of {title, blurb, href, imageUrl} and knows nothing
 * about what it is showing, so the homepage can point it at wedding traditions today and
 * at something else later without a second copy of this file.
 *
 * Four across is a desktop shape; below `sm` a page is two by two, because four 14px
 * blurbs side by side on a phone is four columns of one word each.
 *
 * The loop mechanics live in usePagedLoop - including why the track carries a clone of
 * page one on the end.
 *
 * Images are placeholders until real artwork lands - pass `imageUrl` on any item.
 */

export interface SliderCard {
  slug: string
  title: string
  blurb: string
  href: string
  imageUrl?: string | null
  /** Optional responsive set. Descriptors are the files' real widths, not their filenames
      - optimize-images.mjs never upscales, so `-1280.webp` off a 1254px source is 1254w. */
  imageSrcSet?: string
}

/** Held between pages, and how long a page takes to travel. */
const HOLD_MS = 3400
const SLIDE_MS = 550

export function TypeSlider({ items, label }: { items: SliderCard[]; label: string }) {
  // Two across on a phone rather than one: these are narrow portrait tiles with a short
  // blurb, and a single one per slide would leave a card taller than the viewport.
  const perPage = useResponsivePerPage(2, 4, 4)
  const pages = paginate(items, perPage)
  const count = pages.length
  /*
    Quicker than the default 5.2s hold.

    Eight traditions across two pages is a short loop, and a long hold on a short loop
    means most of the time nothing is happening. The destinations and packages bands keep
    the slower pace because their cards carry more to read.

    SLIDE_MS has to be passed *and* written into the track's class below. The hook uses it
    to time the jump back off the trailing clone; if the two disagree the reset lands
    mid-transition and the loop visibly stutters once per lap.
  */
  const { index, page, animate, next, prev, pauseProps } = usePagedLoop(
    count,
    HOLD_MS,
    SLIDE_MS,
  )

  if (count === 0) return null

  // The clone exists only to close the loop.
  const slides = count > 1 ? [...pages, pages[0]!] : pages

  return (
    <div {...pauseProps}>
      <div className="overflow-hidden">
        <div
          className={'flex ' + (animate ? 'transition-transform duration-[550ms] ease-out' : '')}
          style={{ transform: `translateX(-${index * 100}%)` }}
          role="group"
          aria-label={label}
        >
          {slides.map((group, pi) => (
            <ul
              key={pi}
              className="grid w-full shrink-0 grid-cols-2 gap-5 sm:grid-cols-4"
              // A screen reader should meet each tradition once, not twice.
              aria-hidden={pi >= count ? 'true' : undefined}
            >
              {group.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={item.href}
                    tabIndex={pi >= count ? -1 : undefined}
                    className="group relative block overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                  >
                    <div className="aspect-[3/4] w-full overflow-hidden">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- plan section 12: Storage CDN
                        <img
                          src={item.imageUrl}
                          {...(item.imageSrcSet
                            ? {
                                srcSet: item.imageSrcSet,
                                // Four across inside a 1280px container, two across below
                                // sm - so a card is never much more than a quarter of the
                                // viewport on a desktop, or half on a phone.
                                sizes: '(min-width: 640px) 23vw, 45vw',
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
                    </div>

                    {/*
                      Scrim on the lower half only, and only as strong as the type needs.
                      The label is 20px semibold - large text under WCAG, so 3:1 - but a
                      photograph varies, so this is sized for the worst case and the label
                      carries a soft shadow as a second line of defence.
                    */}
                    <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink-950/85 via-ink-950/45 to-transparent" />

                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <h3
                        className="text-xl font-semibold leading-tight text-white"
                        style={{ textShadow: '0 1px 12px rgb(15 12 11 / 0.55)' }}
                      >
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm leading-snug text-white/85">{item.blurb}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-7 flex items-center justify-center gap-3">
          <Arrow dir="prev" onClick={prev} />
          <div className="flex gap-1.5" aria-hidden="true">
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
      aria-label={dir === 'prev' ? 'Previous' : 'Next'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-surface-raised text-ink-800 transition-colors hover:border-ink-300 hover:bg-ink-50"
    >
      <span aria-hidden="true">{dir === 'prev' ? '←' : '→'}</span>
    </button>
  )
}

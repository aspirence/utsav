import Link from 'next/link'

import { Container } from '@utsava/ui'


/**
 * The reviews section: a photograph across the whole band, and the reviews themselves
 * running as an infinite vertical marquee on the left, as plain text with no card around
 * them.
 *
 * Two things worth knowing about the implementation:
 *
 *  1. **The loop needs no JavaScript.** The track renders the list twice and animates to
 *     translateY(-50%), so the second copy arrives exactly where the first started. That
 *     keeps this a Server Component (plan §4 wants reads on the server) and means the
 *     animation cannot jank while React hydrates.
 *
 *  2. **It pauses on hover and focus.** A testimonial that slides away mid-sentence is
 *     just decoration; these are real quotes tied to real bookings and people should be
 *     able to finish reading one. Focus-within matters separately — each quote links to
 *     the vendor, and a link must not move while a keyboard user is on it.
 *
 * Plan §2 is the reason this section exists at all: a review here requires a completed
 * booking, one per booking. That claim is the point, so it stays in the heading rather
 * than being softened into "what couples say".
 *
 * REUSED BY THE INVITATION PAGE, which is why the copy and the badge are props rather than
 * literals. One thing must not be reused blindly: the "Verified booking" badge. It is a factual
 * claim about a row in the bookings table, and invitation testimonials have no booking behind
 * them — nothing takes money yet. So `verified` is per review, and a quote without one simply
 * does not get the badge. Printing it anyway would be the cheapest possible lie on the site.
 */
export interface MarqueeReview {
  rating: number
  title: string
  body: string
  authorName: string
  /** Who or what the quote is about — a vendor, or a place. */
  sourceName: string
  /** Link target for the source. Omitted when the source is not a page. */
  sourceHref?: string
  /** True only where a completed booking backs the review (plan §2). */
  verified: boolean
}

export function ReviewsMarquee({
  reviews,
  eyebrow = 'Reviews',
  heading = 'Only people who actually booked can write these.',
  description = 'Every review needs a completed booking. Vendors can reply, never edit or remove.',
}: {
  reviews: MarqueeReview[]
  eyebrow?: string
  heading?: string
  description?: string
}) {
  if (reviews.length === 0) return null

  // Three passes through a short list, so a two-review fixture still fills the column and
  // the seam never lands in the visible area. Doubling that gives the loop its two halves.
  const filled = reviews.length >= 4 ? reviews : [...reviews, ...reviews, ...reviews]
  const track = [...filled, ...filled]

  // Longer lists need proportionally longer to travel, or they gallop.
  const duration = Math.max(28, filled.length * 9)

  return (
    <section className="relative isolate overflow-hidden border-y border-ink-100 bg-surface">
      {/*
        Full-bleed photograph, untouched — no wash, no mask.

        The composition does the work that an overlay would otherwise have to: the left
        of the frame is open sky, so white type sits on it cleanly, and the mandap and
        the couple occupy the right where nothing is written. That is why the copy column
        is capped at max-w-xl and the grid gives the right side the larger share.
      */}
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no Vercel optimizer */}
        <img
          src="/bg-image-1920.webp"
          srcSet="/bg-image-768.webp 768w, /bg-image-1280.webp 1280w, /bg-image-1920.webp 1920w"
          sizes="100vw"
          alt=""
          loading="lazy"
          decoding="async"
          // object-top, not object-center: the source is 2172x724, so a section shorter
          // than 1:3 has to crop somewhere. Anchoring to the top means the sky and the
          // canopy survive and the crop comes off the empty foreground at the bottom.
          className="h-full w-full object-cover object-top"
        />
      </div>

      <Container className="py-10 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-300">
              {eyebrow}
            </p>
            <h2 className="mt-3 max-w-xl text-3xl leading-[1.14] text-white sm:text-4xl">
              {heading}
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-white/85">{description}</p>

            <div
              className="u-marquee mt-7 h-[260px] sm:h-[280px]"
              style={{ ['--u-marquee-duration' as string]: `${duration}s` }}
            >
              <ul className="u-marquee-track">
                {track.map((review, i) => (
                  <li
                    key={`${review.authorName}-${i}`}
                    className="py-6"
                    /* The second half is a duplicate purely for the seam; hiding it from
                       assistive tech means a screen reader hears each quote once. */
                    aria-hidden={i >= filled.length ? 'true' : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <Stars rating={review.rating} />
                      {review.verified && (
                        <span className="text-xs font-medium text-accent-200">
                          Verified booking
                        </span>
                      )}
                    </div>

                    {review.title && (
                      <p className="mt-2 max-w-xl font-display text-base leading-snug text-white">
                        &ldquo;{review.title}&rdquo;
                      </p>
                    )}

                    {/*
                      14px and clamped to two lines. The full text is still in the DOM -
                      this is a visual cut, not a substring - so a screen reader and a
                      crawler both get the whole review, and the vendor link below leads
                      to it in full. Trimming in JS would have thrown away real words.

                      white/85 rather than /80 at this size: 14px is body text under WCAG
                      and needs 4.5:1, and /70 was measured at 4.3:1 against the brightest
                      part of the sky behind this column.
                    */}
                    <p className="mt-1.5 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/85">
                      {review.body}
                    </p>

                    {/* white/80, not /70: measured against the brightest part of the sky
                        the copy runs over, /70 came in at 4.3:1 and 14px needs 4.5:1. */}
                    <p className="mt-2 text-sm text-white/80">
                      {review.authorName} on{' '}
                      {review.sourceHref ? (
                        <Link
                          href={review.sourceHref}
                          className="font-medium text-white underline underline-offset-2 hover:text-accent-200"
                          tabIndex={i >= filled.length ? -1 : undefined}
                        >
                          {review.sourceName}
                        </Link>
                      ) : (
                        <span className="font-medium text-white">{review.sourceName}</span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right column intentionally empty: it is where the mandap and the couple sit
              in the photograph, so nothing is written over them. */}
          <div aria-hidden="true" />
        </div>
      </Container>
    </section>
  )
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 ${n <= Math.round(rating) ? 'fill-accent-400' : 'fill-ink-200'}`}
          aria-hidden="true"
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </span>
  )
}

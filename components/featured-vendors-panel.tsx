import Link from 'next/link'

import type { VendorCardData } from '@/components/ui'

/**
 * Featured vendors: the argument on the left, the work on the right.
 *
 * This replaced a plain three-up grid of vendor cards. The grid showed the same six
 * listings that the category page shows one click later, so it repeated itself and said
 * nothing. This version uses the space to make the one claim that actually distinguishes
 * Fremmo - how the ranking works - and shows four pieces of work as evidence.
 *
 * The ranking bullets are not marketing copy. They are the literal inputs to
 * app.vendor_rank(): portfolio completeness, a Bayesian review score, response speed and
 * proximity. Plan section 11 commits to the founder's studio getting no preference and to
 * that being "auditable in the ranking SQL", so the last bullet states the negative
 * outright - subscription tier is not an input, and there is a pgTAP test that fails the
 * build if anyone makes it one.
 *
 * Anything Fremmo owns still carries its disclosure badge here, exactly as it does on the
 * card and the profile.
 */
export function FeaturedVendorsPanel({
  vendors,
  cityName,
  seeAllHref,
  totalCount,
}: {
  vendors: VendorCardData[]
  cityName: string
  seeAllHref: string
  totalCount: number
}) {
  const four = vendors.slice(0, 4)
  if (four.length === 0) return null

  // Supplied artwork for the four slots. These are section assets, not vendor media: a
  // listing's own cover comes from `vendor.coverUrl` and wins when it exists, and this is
  // what fills the grid until real portfolios are uploaded. Positional by design - the
  // ranking decides which vendor lands in which slot, so the pairing is not fixed.
  const ART = ['/luck-1-1280.webp', '/luck-2-1280.webp', '/luck-3-1280.webp', '/luck-4-1280.webp']

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-12">
      {/*
        ── Left: the argument ──────────────────────────────────────────

        Top-aligned and full-height, not vertically centred. Centring left the first line
        of copy floating somewhere near the middle of the first image, which read as a
        mistake rather than a choice - the eyebrow and the top of the grid are the two
        things that should share a baseline.

        `flex flex-col` plus `mt-auto` on the link is what makes both columns end together
        as well as start together: the column stretches to the height of the image grid
        beside it, and the "see all" link is pushed to the floor rather than sitting in a
        pool of whitespace. Type is a step larger throughout for the same reason - four
        points at 14px cannot fill 760px of image without looking lost.
      */}
      {/* max-w-2xl, not xl. The heading is 48px Playfair and "Photographers in Lucknow"
          measures about 580px at that size, so a 576px cap broke it onto two lines by a
          handful of pixels.

          h-full and the column layout are lg-only. They exist so the link can be pushed to
          the floor and finish level with the image grid beside it - and there is no grid
          beside it below lg, so all they did there was open a hole above the link. */}
      <div className="max-w-2xl lg:flex lg:h-full lg:flex-col">
        <p className="text-ink-600 text-base">Ranked by the work, not by what anyone pays us.</p>

        {/* 30/36px, down from 36/48. At 48px the line measured wider than the column at
            every width below lg, so it was either wrapping or running off the edge. */}
        <h2 className="text-ink-900 mt-2 text-3xl leading-[1.12] sm:text-4xl lg:whitespace-nowrap">
          Photographers in {cityName}
        </h2>

        <p className="text-ink-700 mt-5 text-lg leading-relaxed">
          Ordering here is decided by one database function, and these are its only inputs. Nothing
          else moves a listing up.
        </p>

        <ul className="mt-8 space-y-6">
          {[
            {
              t: 'How complete the portfolio is',
              d: 'Photos, price band, packages, style tags. A thin listing does not rank, and does not receive enquiries at all.',
            },
            {
              t: 'Review history, weighted honestly',
              d: 'A single five-star review does not beat two hundred at 4.8. Reviews require a completed booking.',
            },
            {
              t: 'How fast they actually reply',
              d: 'Measured from real leads, not self-reported. The median here is under two hours.',
            },
            {
              t: 'Never how much they pay us',
              d: 'Subscription tier is not an input. A test in our CI pipeline fails the build if anyone makes it one.',
            },
          ].map((point) => (
            <li key={point.t} className="flex gap-3.5">
              <span className="bg-primary-600 mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-white" aria-hidden="true">
                  <path d="M8.1 13.4L4.7 10l-1.2 1.2 4.6 4.6 9-9-1.2-1.2z" />
                </svg>
              </span>
              <span>
                <span className="text-ink-900 text-lg font-medium">{point.t}</span>
                <span className="text-ink-600 mt-1 block leading-relaxed">{point.d}</span>
              </span>
            </li>
          ))}
        </ul>

        <Link
          href={seeAllHref}
          className="text-primary-700 hover:text-primary-800 mt-6 inline-flex w-fit items-center gap-1.5 font-semibold lg:mt-auto lg:pt-8"
        >
          See all {totalCount} photographers
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      {/* ── Right: the work, two by two ────────────────────────────────── */}
      <ul className="grid grid-cols-2 gap-5">
        {four.map((vendor, i) => (
          <li key={vendor.slug}>
            <Link
              href={`/vendor/${vendor.slug}`}
              className="group focus-visible:outline-primary-600 relative block h-[260px] overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 sm:h-[330px] lg:h-[370px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- plan section 12: Storage CDN */}
              <img
                src={vendor.coverUrl ?? ART[i] ?? ''}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />

              {/* Scrim on the lower half only, so the photograph keeps its top. */}
              <div className="from-ink-950/85 via-ink-950/40 absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t to-transparent" />

              <span
                aria-hidden="true"
                className="bg-ink-950/45 group-hover:bg-ink-950/70 absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-md text-white backdrop-blur-sm transition-colors"
              >
                &#8599;
              </span>

              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-[11px] font-semibold tracking-[0.12em] text-white/75 uppercase">
                  Photography
                </p>
                <p className="font-display mt-0.5 text-lg leading-tight text-white">
                  {vendor.displayName}
                </p>
                <p className="mt-0.5 text-xs text-white/70">
                  {vendor.localityName ?? vendor.cityName}
                  {vendor.ratingAvg ? ` · ${vendor.ratingAvg.toFixed(1)}★` : ''}
                </p>

                {/* Plan section 11/12: the disclosure follows the listing everywhere. */}
                {vendor.isAnchorStudio && (
                  <p className="text-accent-200 mt-1.5 text-[11px]">
                    Fremmo-owned · no ranking preference
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

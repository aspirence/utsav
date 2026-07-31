import Link from 'next/link'

import { Container } from '@/components/ui'

import { getCategories, getLaunchedCities } from '@/lib/queries'

/**
 * Footer. Categories left, the mark centred, company right.
 *
 * The outer grid is three equal columns rather than `justify-between`: the two link lists
 * are different lengths, so anything that packs them would push the logo off centre.
 *
 * A city list lived here and has been removed. Worth knowing what that costs: the
 * Categories column links /lucknow/*, so the launch city is still covered, but Delhi NCR
 * now has no internal link anywhere on the site. It is still in the sitemap, so it stays
 * crawlable - but plan §12 leans on internal linking, and if Delhi NCR traffic matters,
 * this is the change to look at first.
 *
 * COLOUR. ink-900, against the warm cream every other band on the site sits on. A footer
 * in the same family as the page does not end it, it just fades out - this gives the page
 * a floor. ink-900 rather than ink-950 because it keeps a little of the warmth the rest of
 * the palette is built on, and rather than a maroon because the footer should close the
 * page, not compete with it.
 *
 * Measured, not chosen by eye: white 18.0:1, ink-200 12.0:1, and the gold in the mark
 * 11.0:1 - which is the same gold-on-dark a printed invitation uses.
 */
export async function SiteFooter() {
  const [cities, categories] = await Promise.all([getLaunchedCities(), getCategories()])
  const defaultCity = cities[0]?.slug ?? 'lucknow'

  return (
    // Padding, not a margin, and it carries the frieze's own white. A margin left a strip
    // of the page's warm surface (#fffcf9) between the last section and the frieze - two
    // whites with a cream band across the middle, which reads as a seam rather than as
    // space. Padding is inside the element, so it takes the background with it.
    <footer className="bg-surface-raised pt-2 sm:pt-4">
      {/*
        A line-art frieze across the top of the footer - baraat, band, mandap, the couple,
        read left to right. It lives inside <footer> rather than in any page, so every
        route gets it without having to remember.

        THE ARTWORK IS footer2, chosen on 2026-07-31. An earlier note here recorded footer2
        as a failure, and that judgement was about a different file: the master
        design/source-images/footer2.png is white line work on transparent, 16% of its
        pixels *partially* so, which turned into a near-black haze when it sat on the dark
        band. The exported public/footer2-*.webp are black line work on a transparent
        ground, which is the opposite problem and no problem at all here - the strip they
        sit on is surface-raised, #ffffff exactly.

        THE ALPHA IS GONE ANYWAY, because the lesson from that failure outlives the file it
        came from: a frieze spanning the full width always covers whatever is behind it, so
        the ground may as well be baked in. Flattened onto #ffffff - the same value the
        strip already paints, so not one visible pixel moved - and the three files together
        went from 559 KB to 233 KB. No alpha channel means no partial-alpha region for lossy
        WebP to smear, which is what went wrong the first time.

        THREE WIDTHS, and the descriptors are the files' real pixel widths rather than the
        sizes they were asked for. The exporter does not enlarge, so a nominal 1920 that was
        only rendered at 1600 would make the browser pick the wrong candidate and the
        artwork would land soft.

        `block` kills the inline-element baseline gap - as an inline image it would leave a
        few pixels of dark under the white frieze.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no next/image */}
      <img
        src="/footer2-1920.webp"
        srcSet="/footer2-768.webp 768w, /footer2-1280.webp 1280w, /footer2-1920.webp 1920w"
        sizes="100vw"
        alt=""
        aria-hidden="true"
        width={1920}
        height={480}
        loading="lazy"
        decoding="async"
        // On a phone the frieze is 1920px of artwork squeezed into 375, which lands it at
        // about 94px tall - every figure in it too small to be anything. So below `sm` it
        // is given a real height and cropped to the centre instead: the mandap and the
        // couple at a size you can actually see, at the cost of the pavilions at the ends.
        // From `sm` up there is width enough to show the whole procession.
        className="block h-[130px] w-full object-cover object-center sm:h-auto sm:object-fill"
      />

      <div className="bg-ink-900">
        {/* The centre column's 192px mark plus its tagline already sets the footer's
            height, and the two link lists are five rows and four. Padding on top of that
            was just empty floor, so it is down from py-14 to py-8 and the rule above the
            copyright has come in with it. */}
        <Container className="py-8">
          {/*
            Two shapes, one markup.

            On a phone it is a two-column grid: the mark spans both and comes first, then
            the two lists sit side by side underneath, each aligned to its own left edge so
            their headings share a baseline. Stacked, the same content ran nearly a full
            screen of scrolling for four links a side.

            From `lg` it is the three-column layout the desktop footer has always had, with
            the mark back in the middle. `order-*` does the rearranging rather than a
            second copy of the markup, so the links only exist once in the document.
          */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-3 lg:items-center">
            {/* ── Left: categories ─────────────────────────────────────── */}
            <div className="order-2 text-center lg:order-1 lg:justify-self-start lg:text-left">
              <h2 className="text-accent-300 text-xs font-semibold uppercase tracking-[0.14em]">
                Categories
              </h2>
              <ul className="mt-4 space-y-2.5">
                {categories.slice(0, 6).map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/${defaultCity}/${category.slug}`}
                      className="text-ink-200 text-sm hover:text-white"
                    >
                      {category.pluralName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Centre: the mark ─────────────────────────────────────── */}
            <div className="order-1 col-span-2 flex flex-col items-center text-center lg:order-2 lg:col-span-1">
              <Link href="/" aria-label="Utsava — home">
                {/* Same white knockout the header uses over the hero. The mark is dark brown
                  and gold on transparent, so on ink-900 the wordmark would all but vanish
                  while the lotus survived. One asset, two appearances - no second file to
                  keep in sync. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no next/image */}
                <img
                  src="/logo.webp"
                  alt="Utsava"
                  width={623}
                  height={576}
                  className="h-40 w-auto [filter:brightness(0)_invert(1)]"
                />
              </Link>
              <p className="text-ink-300 mt-3 max-w-xs text-sm leading-relaxed">
                Discovery and booking for weddings, celebrations and corporate events across India.
              </p>
            </div>

            {/* ── Right: company ───────────────────────────────────────── */}
            {/* The block still sits at the right edge, but its text reads left-aligned like
              every other list on the page. Right-aligning a ragged list of links makes
              each one start in a different place, so the eye has no column to run down. */}
            <div className="order-3 text-center lg:justify-self-end lg:text-left">
              <h2 className="text-accent-300 text-xs font-semibold uppercase tracking-[0.14em]">
                Company
              </h2>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <Link href="/partner" className="text-ink-200 text-sm hover:text-white">
                    List your business
                  </Link>
                </li>
                <li>
                  <Link href="/p/privacy" className="text-ink-200 text-sm hover:text-white">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/p/terms" className="text-ink-200 text-sm hover:text-white">
                    Terms
                  </Link>
                </li>
                {/* Plan §11/§12: the channel-conflict disclosure is a published policy,
                  linked from the footer of every page — not buried in an FAQ. */}
                <li>
                  <Link
                    href="/p/anchor-studio-policy"
                    className="text-ink-200 text-sm hover:text-white"
                  >
                    Our studio on Utsava
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="text-ink-300 mt-6 flex flex-col-reverse items-center gap-4 border-t border-white/15 pt-4 text-xs sm:flex-row sm:justify-between">
            <p>
              © {new Date().getFullYear()} Utsava. Working title. Prices shown are vendor-declared
              bands.
            </p>

            {/* Hidden on phones, where the same two pages are already one tap away in the
                Company column directly above - repeating them in the bottom bar just adds
                a row to scroll past. From sm the bar has a spare half to itself and they
                sit there rather than nowhere. */}
            <nav
              aria-label="Legal"
              className="hidden flex-wrap justify-center gap-x-5 gap-y-2 sm:flex"
            >
              <Link href="/p/privacy" className="hover:text-white">
                Privacy policy
              </Link>
              <Link href="/p/terms" className="hover:text-white">
                Terms &amp; conditions
              </Link>
            </nav>
          </div>
        </Container>
      </div>
    </footer>
  )
}

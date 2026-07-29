import Link from 'next/link'

import { Container } from '@utsava/ui'

import { getCategories, getLaunchedCities } from '@/lib/queries'

/**
 * Footer. Categories left, the mark centred, company right.
 *
 * The city list used to be a fourth column. It moved into the bottom bar rather than being
 * deleted: plan §12 runs on internal linking, and /[city]/photography for every launched
 * city is one of the highest-value links on the site to have on every page. A row of two
 * or three city names reads fine down there; a column of them would have unbalanced a
 * layout whose whole point is symmetry around the mark.
 *
 * Symmetry is also why the outer grid is three equal columns rather than `justify-between`:
 * the two link lists are different lengths, so anything that packs them would push the
 * logo off centre.
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
    <footer className="mt-20">
      {/*
        A line-art frieze sitting flush on top of the dark band - baraat, mandap, the
        couple, the whole procession read left to right.

        It lives inside <footer> rather than in the page, so it is attached to the footer
        on every route and no page has to remember to put it there. It carries its own
        white ground because the section above it differs per page; without that it would
        sit on cream here and white there.

        The art is black line work on transparent, so it stays on a light ground rather
        than being knocked out onto ink-900 - inverted, fine strokes this thin turn to
        mush. `block` on the image kills the inline-element baseline gap that would
        otherwise leave a white hairline between the frieze and the dark band below it.

        Source is 984px wide, so on a large monitor it is drawn above 1:1. Acceptable for
        flat line work; a wider export is the fix if it ever looks soft, not CSS.
      */}
      <div className="bg-surface-raised">
        {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no next/image */}
        <img
          src="/footer-frieze.webp"
          alt=""
          aria-hidden="true"
          width={984}
          height={177}
          loading="lazy"
          decoding="async"
          className="block w-full"
        />
      </div>

      <div className="bg-ink-900">
        <Container className="py-14">
          <div className="grid gap-12 text-center sm:text-left lg:grid-cols-3 lg:items-start">
            {/* ── Left: categories ─────────────────────────────────────── */}
            <div className="lg:justify-self-start">
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

              {/* The city links used to be their own column, then the bottom bar; the bar
                now carries the legal links instead. They live here rather than nowhere
                because plan §12 runs on internal linking and this is the only place
                /delhi-ncr is reachable from - drop it and that city is orphaned on every
                page of the site. */}
              <h2 className="text-accent-300 mt-8 text-xs font-semibold uppercase tracking-[0.14em]">
                Cities
              </h2>
              <ul className="mt-4 space-y-2.5">
                {cities.map((city) => (
                  <li key={city.slug}>
                    <Link
                      href={`/${city.slug}/photography`}
                      className="text-ink-200 text-sm hover:text-white"
                    >
                      {city.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Centre: the mark ─────────────────────────────────────── */}
            <div className="flex flex-col items-center text-center lg:order-none">
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
                  className="h-48 w-auto [filter:brightness(0)_invert(1)]"
                />
              </Link>
              <p className="text-ink-300 mt-4 max-w-xs text-sm leading-relaxed">
                Discovery and booking for weddings, celebrations and corporate events across India.
              </p>
            </div>

            {/* ── Right: company ───────────────────────────────────────── */}
            {/* The block still sits at the right edge, but its text reads left-aligned like
              every other list on the page. Right-aligning a ragged list of links makes
              each one start in a different place, so the eye has no column to run down. */}
            <div className="lg:justify-self-end lg:text-left">
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

          <div className="text-ink-300 mt-12 flex flex-col-reverse items-center gap-4 border-t border-white/15 pt-6 text-xs sm:flex-row sm:justify-between">
            <p>
              © {new Date().getFullYear()} Utsava. Working title. Prices shown are vendor-declared
              bands.
            </p>

            <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
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

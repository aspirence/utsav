import { Brand } from '@/components/brand'
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
        A line-art frieze across the top of the footer. It lives inside <footer> rather than
        in any page, so every route gets it without having to remember.

        THE ARTWORK IS footer99, from 2026-08-01, and the change is not only decorative. The
        frieze before it was a baraat: horse, band, mandap, the couple. Fremmo is an
        all-events marketplace and photography is only the wedge (plan §11), so a wedding
        procession across the bottom of every page quietly said the opposite. This one runs
        wedding, engagement, anniversary, birthday, corporate — the categories the catalogue
        actually sells, read left to right.

        THE MASTER IS TRIMMED AND FLATTENED, both for reasons the previous frieze taught:

          · 48px of empty pixels sat above the artwork in the source. That is not layout, so
            padding it away in CSS would only move the problem to whatever width the frieze
            is next rendered at. Trimmed on alpha; the bottom needed nothing, the baseline
            rule already runs to the edge, which is what lets it meet the dark band with no
            seam.
          · The alpha channel is gone. A strip that spans the full width always covers what
            is behind it, so an alpha channel buys nothing and costs a partial-alpha region
            for lossy WebP to smear — the exact fault that made an earlier attempt read as a
            near-black rectangle. Flattened onto #ffffff, which is surface-raised exactly, so
            no visible pixel moved.

        2134 × 327 after trimming, or 6.53:1 — considerably wider than the 4:1 it replaces,
        so the strip is shorter and the scenes are smaller at any given width.

        THREE WIDTHS, and the descriptors are the files' real pixel widths rather than the
        sizes they were asked for. The export uses withoutEnlargement, so a nominal 1920 that
        had only rendered at 1600 would make the browser pick the wrong candidate and land
        the artwork soft.

        `block` kills the inline-element baseline gap — as an inline image it would leave a
        few pixels of dark under the white frieze.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no next/image */}
      <img
        src="/footer99-1920.webp"
        srcSet="/footer99-768.webp 768w, /footer99-1280.webp 1280w, /footer99-1920.webp 1920w"
        sizes="100vw"
        alt=""
        aria-hidden="true"
        width={1920}
        height={294}
        loading="lazy"
        decoding="async"
        // On a phone the whole strip squeezed into 375px lands at about 57px tall, which is
        // five scenes none of which can be made out. So below `sm` it is given a real height
        // and cropped to the centre instead: two scenes at a size you can actually read, at
        // the cost of the ones at the ends. From `sm` up there is width enough for all five.
        className="block h-[120px] w-full object-cover object-center sm:h-auto sm:object-fill"
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
              <Link href="/" aria-label="Fremmo — home">
                {/* Same white knockout the header uses over the hero. The mark is dark brown
                  and gold on transparent, so on ink-900 the wordmark would all but vanish
                  while the lotus survived. One asset, two appearances - no second file to
                  keep in sync. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no next/image */}
                <Brand
                  className="flex-col gap-4"
                  markClassName="h-24 w-auto [filter:brightness(0)_invert(1)]"
                  wordClassName="text-5xl text-white"
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
                    Our studio on Fremmo
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="text-ink-300 mt-6 flex flex-col-reverse items-center gap-4 border-t border-white/15 pt-4 text-xs sm:flex-row sm:justify-between">
            <p>
              © {new Date().getFullYear()} Fremmo. Working title. Prices shown are vendor-declared
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

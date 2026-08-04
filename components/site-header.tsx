import { Brand } from '@/components/brand'
import Link from 'next/link'

import { HeaderAccountLink } from '@/components/header-account-link'
import { SiteHeaderShell } from '@/components/site-header-shell'
import { SiteNavMobile } from '@/components/site-nav-mobile'
import { getSessionUser } from '@/lib/auth'
import { getCategories, getLaunchedCities } from '@/lib/queries'

/**
 * Site header. Still a Server Component - the category and city reads stay on the server
 * (plan §4) - with only the transparent-over-hero behaviour delegated to SiteHeaderShell.
 *
 * LAYOUT. Logo hard left, nav centred, actions hard right. Two things make that work:
 *
 *  · **No Container.** Every other band on the site is centred in a max-w-7xl column, but
 *    a header asked to sit "in the corner" has to run to the viewport edge, so this uses
 *    its own padding instead. That is the one place the page grid is deliberately broken.
 *
 *  · **The nav is absolutely centred, not a flex child.** `justify-between` would centre
 *    the nav between the logo and the buttons, and those two are nowhere near the same
 *    width - "Fremmo" against a link plus a button - so the nav would sit visibly right of
 *    centre. Pinning it to left-1/2 with a -50% translate centres it on the *viewport*,
 *    which is what reads as centred. It is `pointer-events-none` on the wrapper and
 *    `pointer-events-auto` on the nav so the overlay strip cannot swallow clicks meant for
 *    the logo or the buttons underneath it.
 *
 * COLOUR. Two states, and they are opposites: ink on white once the page has scrolled, white
 * over the homepage hero photograph at the top. The bar used to be ink-900 in both, which meant
 * one set of light type served both — that is gone with the white chrome, so every child that
 * paints ink carries a `group-data-[transparent]:` variant. The shell sets that attribute; see
 * components/site-header-shell.tsx.
 *
 * ANYTHING NEW ADDED TO THIS BAR NEEDS BOTH. A link with only the ink colour is invisible
 * against the hero, and one with only the white is invisible against the white — and both bugs
 * only show up on one route, at one scroll position.
 */

/** The category links are all the same control; the classes live here rather than five times. */
const NAV_LINK =
  'rounded-full px-4 py-2 text-sm font-semibold transition-colors ' +
  'text-ink-700 hover:bg-ink-100 hover:text-ink-900 ' +
  'group-data-[transparent]:text-white group-data-[transparent]:hover:bg-white/10'

export async function SiteHeader() {
  const [cities, categories, user] = await Promise.all([
    getLaunchedCities(),
    getCategories(),
    getSessionUser(),
  ])
  const defaultCity = cities[0]?.slug ?? 'lucknow'
  const signedIn = Boolean(user)

  return (
    <SiteHeaderShell>
      <div className="relative flex h-20 items-center justify-between gap-4 px-4 sm:px-8 lg:px-14">
        <Link href="/" className="relative z-10 shrink-0" aria-label="Fremmo — home">
          {/*
            One mark, two appearances. On the white bar the iris keeps its marigold-to-terracotta
            gradient, which is what it was drawn to be. Over the hero it is crushed to a flat
            white knockout instead.

            THE KNOCKOUT IS BECAUSE THE HERO ROTATES, and that is the whole argument — see
            components/hero-background.tsx, which cycles three photographs. Keeping the gradient
            was tried and looked good over the lavender sunset frame, where marigold is close to
            the complement of the background. It falls apart on the amber frame: warm gold on
            warm gold, with a string of lights running right through it. A mark that is legible
            on one slide of three is not legible. White is the one value that survives all of
            them, so the mark gives up its colour for the eighty pixels it spends over a photo.

            Do not re-litigate this against a single screenshot. Check all three frames.

            The drop-shadow is the same idea as the text-shadow on the nav links: the hero
            deliberately has no scrim, so anything sitting on it has to carry its own separation.

            This is also the one place that still knocks out with a filter rather than
            <Brand mono>. The footer and the console rail are always dark, so they can pass the
            prop; here the treatment depends on `data-transparent`, and a CSS variant is the only
            thing that can switch on a state the parent sets at runtime.

            h-9 in a h-20 row: 36px of mark in 80px of header. The row was h-28 with an h-20
            mark, and 112px of chrome is a lot to give a bar that holds five links — on a 667px
            phone viewport it was a sixth of the screen before any content started. Keep the mark
            at roughly 45% of the row and it reads as set in rather than wedged in.
          */}
          <Brand
            markClassName="h-9 w-auto group-data-[transparent]:[filter:brightness(0)_invert(1)_drop-shadow(0_1px_6px_rgb(15_12_11_/_0.7))]"
            wordClassName="text-ink-900 text-2xl group-data-[transparent]:text-white group-data-[transparent]:[text-shadow:0_1px_6px_rgb(15_12_11_/_0.7)]"
          />
        </Link>

        <div className="pointer-events-none absolute inset-x-0 hidden justify-center md:flex">
          <nav aria-label="Categories" className="pointer-events-auto flex items-center gap-1">
            {categories.slice(0, 5).map((category) => (
              <Link
                key={category.slug}
                href={`/${defaultCity}/${category.slug}`}
                className={NAV_LINK}
              >
                {category.pluralName}
              </Link>
            ))}
          </nav>
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-2">
          {/* From md up this sits in the bar. Below that it moves into the panel behind the
              hamburger — see SiteNavMobile — because a 375px bar cannot hold the mark and a
              link without one of them losing. */}
          <div className="hidden items-center md:flex">
            <HeaderAccountLink signedIn={signedIn} initial={initialFrom(user)} />
          </div>

          <SiteNavMobile categories={categories} defaultCity={defaultCity} signedIn={signedIn} />
        </div>
      </div>
    </SiteHeaderShell>
  )
}

/**
 * One letter for the header avatar.
 *
 * Falls through name → email → phone, because an account created by the first OTP has no name at
 * all and an empty circle reads as a broken avatar rather than as missing data.
 *
 * ONE LETTER, NOT THE ADDRESS. The comment that used to sit on `signedIn` said the header takes
 * "only whether, never who", so that a user's phone number never lands in the markup of a cached
 * page. An initial keeps that promise — it is not an identifier, and it is the smallest thing
 * that answers "whose session is this" on a shared laptop.
 */
function initialFrom(user: { email: string | null; phone: string | null } | null): string | null {
  if (!user) return null
  const source = user.email?.trim() || user.phone?.trim() || ''
  const letter = source.replace(/[^A-Za-z0-9]/g, '').charAt(0)
  return letter ? letter.toUpperCase() : null
}

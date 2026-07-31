import Link from 'next/link'

import { LinkButton } from '@/components/ui'

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
 *    width - "Utsava" against a link plus a button - so the nav would sit visibly right of
 *    centre. Pinning it to left-1/2 with a -50% translate centres it on the *viewport*,
 *    which is what reads as centred. It is `pointer-events-none` on the wrapper and
 *    `pointer-events-auto` on the nav so the overlay strip cannot swallow clicks meant for
 *    the logo or the buttons underneath it.
 *
 * COLOUR. One palette, both states. The bar is ink-900 when solid and transparent over the
 * hero, and light type works on either - so there are no per-state colour variants to keep
 * in sync any more. The shell still sets `data-transparent`, but only to switch on the
 * text-shadow the type needs when there is a photograph behind it instead of a background.
 */
export async function SiteHeader() {
  const [cities, categories, user] = await Promise.all([
    getLaunchedCities(),
    getCategories(),
    getSessionUser(),
  ])
  const defaultCity = cities[0]?.slug ?? 'lucknow'
  // Only whether, never who. The header does not need the identity, and reading it here
  // would put a user's phone number in the markup of every cached page on the site.
  const signedIn = Boolean(user)

  return (
    <SiteHeaderShell>
      <div className="relative flex h-28 items-center justify-between gap-4 px-4 sm:px-8 lg:px-14">
        <Link href="/" className="relative z-10 shrink-0" aria-label="Utsava — home">
          {/*
            One asset, two appearances. Over the homepage hero the mark would be dark brown
            and gold on a photograph, so `brightness(0) invert(1)` crushes it to a flat
            white knockout - the standard treatment, and it needs no second file to keep in
            sync with the first. The drop-shadow is the same idea as the text-shadow on the
            nav links: the hero deliberately has no scrim, so anything sitting on it has to
            carry its own separation.

            The source is a 500px square with ~85px of transparent margin on every side;
            it is trimmed to its alpha bounding box and exported at 576px tall - 3x the
            192px the *footer* renders it at, which is the larger of the two uses, so one
            file serves both sharply. `design/source-images/logo-source.png` is the master;
            re-export from there if either size grows.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no next/image */}
          <img
            src="/logo.webp"
            alt="Utsava"
            width={623}
            height={576}
            className="h-24 w-auto [filter:brightness(0)_invert(1)] group-data-[transparent]:[filter:brightness(0)_invert(1)_drop-shadow(0_1px_6px_rgb(15_12_11_/_0.7))]"
          />
        </Link>

        <div className="pointer-events-none absolute inset-x-0 hidden justify-center md:flex">
          <nav aria-label="Categories" className="pointer-events-auto flex items-center gap-1">
            {categories.slice(0, 5).map((category) => (
              <Link
                key={category.slug}
                href={`/${defaultCity}/${category.slug}`}
                className="rounded-md px-3 py-2 text-sm font-medium text-ink-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                {category.pluralName}
              </Link>
            ))}
          </nav>
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-2">
          {/* From md up these sit in the bar. Below that they move into the panel behind
              the hamburger - see SiteNavMobile - because a 375px bar cannot hold the mark,
              a link and a button without one of them losing. */}
          <div className="hidden items-center gap-2 md:flex">
            {/* Plan §1: "Supply tooling before demand product" — the vendor entry point
                ships seven months before customers arrive, so it is never buried. */}
            <Link
              href="/partner"
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-200 transition-colors hover:bg-white/10 hover:text-white"
            >
              List your business
            </Link>

            {/* Plan §3 has no signup step - the first OTP creates the account - so the
                anonymous label is "Login" and never "Sign up". Offering both would imply
                a second path that does not exist. */}
            <Link
              href={signedIn ? '/account' : '/login'}
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-200 transition-colors hover:bg-white/10 hover:text-white"
            >
              {signedIn ? 'Your account' : 'Login'}
            </Link>

            {/* Carries its own solid background, so it needs no transparent-state variant. */}
            <LinkButton href={`/${defaultCity}/photography`} size="sm">
              Find vendors
            </LinkButton>
          </div>

          <SiteNavMobile
            categories={categories}
            defaultCity={defaultCity}
            signedIn={signedIn}
          />
        </div>
      </div>
    </SiteHeaderShell>
  )
}

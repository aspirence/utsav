import { BottomNav, type BottomNavItem } from '@/components/bottom-nav'
import {
  IconCard,
  IconGrid,
  IconStore,
  IconUser,
  IconFlow,
} from '@/components/console-sidebar'

import { getSessionUser } from '@/lib/auth'
import { getLaunchedCities } from '@/lib/queries'

/**
 * The public site's phone tab bar.
 *
 * A Server Component, because the items depend on two things only the server knows: which cities
 * have actually launched, and whether anybody is signed in. Doing this in the client would mean
 * shipping the city list to the browser and a flash of the wrong last tab on every first paint.
 *
 * ── WHY THE VENDORS TAB CARRIES A LIST OF CITIES ─────────────────────────────
 * Discovery lives at /[city], /[city]/[category] and /[city]/[category]/[locality]. The tab has
 * to link *somewhere*, so it links to the first launched city — but somebody browsing /delhi is
 * still on the discovery surface and the tab must stay lit. There is no way to express "any
 * first path segment that happens to be a city" as a prefix, so the launched slugs are passed in
 * explicitly. It is the only version of this that is actually correct rather than correct for
 * the default city and quietly wrong for every other one.
 *
 * ── THE LAST TAB CHANGES, THE COUNT DOES NOT ─────────────────────────────────
 * Signed out it is "Sign in"; signed in it is "Account". Same slot, same icon, so the bar does
 * not reflow the moment somebody authenticates — a tab row that changes width on sign-in makes
 * every other tab move under a thumb that was already travelling.
 *
 * Saved/shortlists is deliberately not here. It is one of five tabs on the account surface,
 * which has its own bar, and spending a public slot on a route that bounces a signed-out visitor
 * to /login is spending it badly.
 */
export async function SiteBottomNav() {
  const [cities, user] = await Promise.all([getLaunchedCities(), getSessionUser()])

  // Same fallback as SiteHeader and SiteFooter. With no database attached the site still runs
  // off fixtures, and a nav that renders `/undefined` is worse than one pointing at the city we
  // are launching in.
  const defaultCity = cities[0]?.slug ?? 'lucknow'
  const signedIn = Boolean(user)

  const items: BottomNavItem[] = [
    { href: '/', label: 'Home', icon: <IconGrid />, exact: true },
    {
      href: `/${defaultCity}`,
      label: 'Vendors',
      icon: <IconStore />,
      alsoMatch: cities.map((city) => `/${city.slug}`),
    },
    /*
     * Points at the listing, not at /invitation.
     *
     * /invitation is the full-screen animated demo — one invitation, chrome-free, outside the
     * (site) group. It is a lovely thing to land on from a "see it running" link and a poor
     * thing to land on from a tab called Cards, which is a request to browse. /invitations is
     * the catalogue.
     *
     * The demo stays in alsoMatch so the tab remains lit if somebody reaches it another way.
     */
    { href: '/invitations', label: 'Cards', icon: <IconCard />, alsoMatch: ['/invitation'] },
    { href: '/stories', label: 'Stories', icon: <IconFlow /> },
    {
      href: signedIn ? '/account' : '/login',
      label: signedIn ? 'Account' : 'Sign in',
      icon: <IconUser />,
    },
  ]

  return <BottomNav items={items} hideFrom="md" label="Site" />
}

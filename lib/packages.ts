import 'server-only'

import type { PackageCard } from '@/components/package-slider'
import { PLACE_ART } from '@/lib/place-art'

/**
 * Wedding packages, Lucknow only.
 *
 * Deliberately one city. The reference this follows listed several, but Fremmo has no
 * supply outside its launch cities, and a card for a city where nobody can be booked is a
 * dead end with a price on it. Each entry here is a *place within Lucknow* instead, which
 * is the real choice a couple makes once they have picked the city.
 *
 * Prices are integer paise (plan §5) - never rupees, never a float. `formatPaise` renders
 * them, so the ₹ sign and the Indian digit grouping come from one place.
 *
 * Every card links into discovery with a query rather than to a bespoke package page. The
 * package pages are a later build; until then the honest destination is the vendor list
 * for that area, which is what a couple actually needs.
 */
export function getWeddingPackages(): PackageCard[] {
  const find = (q: string) => `/lucknow/photography?q=${encodeURIComponent(q)}`

  /**
   * The same photographs the explore panel uses, keyed on the same slugs - see
   * lib/place-art.ts. Faizabad Road has no image yet and simply falls through to the
   * placeholder rather than borrowing a neighbouring area's building.
   */
  const art = (slug: string) => PLACE_ART[slug] ?? {}

  return [
    {
      slug: 'gomti-nagar',
      place: 'Gomti Nagar, Lucknow',
      startsAtPaise: 50_000_000,
      href: find('gomti nagar'),
      ...art('gomti-nagar'),
    },
    {
      slug: 'hazratganj',
      place: 'Hazratganj, Lucknow',
      startsAtPaise: 80_000_000,
      href: find('hazratganj'),
      ...art('hazratganj'),
    },
    {
      slug: 'sushant-golf-city',
      place: 'Sushant Golf City, Lucknow',
      startsAtPaise: 80_000_000,
      href: find('sushant golf city'),
      ...art('sushant-golf-city'),
    },
    {
      slug: 'faizabad-road',
      place: 'Faizabad Road, Lucknow',
      startsAtPaise: 35_000_000,
      href: find('faizabad road'),
      // No photograph for this one yet - placeholder rather than a stand-in.
      ...art('faizabad-road'),
    },
    {
      slug: 'kanpur-road',
      place: 'Kanpur Road, Lucknow',
      startsAtPaise: 40_000_000,
      href: find('kanpur road'),
      ...art('kanpur-road'),
    },
    {
      slug: 'aliganj',
      place: 'Aliganj, Lucknow',
      startsAtPaise: 30_000_000,
      href: find('aliganj'),
      ...art('aliganj'),
    },
  ]
}

'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Chrome for the site header: transparent over the homepage hero, solid once you scroll.
 *
 * Only the presentation lives on the client. SiteHeader stays a Server Component and does
 * its category and city reads there, then hands the finished markup down as children -
 * plan §4 wants reads server-side by default, and turning the whole header into a client
 * component to watch a scroll position would have moved two RLS-scoped queries into the
 * browser for no reason.
 *
 * Two separate things are going on, and keeping them apart is what stops the bar jumping:
 *
 *  · **Overlay** - whether the header sits *on top of* the page rather than above it. It
 *    is a `-mb-20` that pulls the content up under the sticky bar by exactly its own
 *    height, so the hero photograph starts at the very top of the viewport. This depends
 *    only on the route and never changes while you scroll. If it toggled, the whole page
 *    would shift 80px the moment you moved.
 *
 *    KEEP IN SYNC: that -mb-20 has to match the `h-20` row inside SiteHeader. A mismatch
 *    does not error - it just leaves a strip of page background above the hero, or crops
 *    the top off it.
 *
 *  · **Transparent** - whether the bar paints a background. This is the part that
 *    responds to scrolling, and it only ever changes colours, so it can transition.
 *
 * Both are gated on being the homepage. This header renders on every public page from
 * (site)/layout.tsx and the homepage is the only one with a full-bleed image behind it;
 * floating a transparent bar over a vendor profile would leave white-on-white nav links.
 *
 * `scroll` is passive and does nothing but compare a number. The initial read happens on
 * mount so a restored scroll position, or a deep link that lands mid-page, starts in the
 * right state instead of flashing transparent.
 *
 * COLOUR. The solid state is white — the same surface the discovery wall sits on, so the bar
 * reads as the top of the page rather than as a dark lid on it. It was ink-900, matching the
 * footer, on the argument that the page should be bracketed by the same band top and bottom;
 * the redesign wants a light chrome and a photograph doing the shouting instead.
 *
 * THAT COSTS THE THING THE DARK BAR BOUGHT, and it is worth being explicit about. With both
 * states dark, the type was light in both and needed one colour. Now the two states are
 * opposites: dark type on white when scrolled, white type over the hero photograph at the top.
 * So `data-transparent` is load-bearing again — every child that paints ink or a logo has a
 * `group-data-[transparent]:` variant, and a new one added without it will be white-on-white at
 * the top of the homepage. See components/site-header.tsx.
 *
 * The text-shadow is still only for the transparent state. The hero has no scrim by design, so
 * the shadow is the only thing separating the nav from the photograph.
 */

const SHADOW = '0 1px 12px rgb(15 12 11 / 0.75), 0 1px 2px rgb(15 12 11 / 0.6)'

export function SiteHeaderShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [atTop, setAtTop] = useState(true)

  useEffect(() => {
    const read = () => setAtTop(window.scrollY < 24)
    read()
    window.addEventListener('scroll', read, { passive: true })
    return () => window.removeEventListener('scroll', read)
  }, [])

  const overlay = pathname === '/'
  const transparent = overlay && atTop

  return (
    <header
      data-transparent={transparent ? '' : undefined}
      className={
        // Every fragment ends in a space. It used to be `overlay ? '-mb-20' : ''` with none,
        // which welded the two fragments into `-mb-20border-transparent` — one class that does
        // not exist, in place of two that do. Both were lost, and the visible half of that was
        // the overlay: with no -mb-20 the bar stopped sitting on the hero and painted the page's
        // cream surface instead, while data-transparent went on knocking the type white. White
        // on cream, at the top of the homepage only, which is the one place the bar is meant to
        // disappear. Keep the trailing spaces.
        'group sticky top-0 z-40 border-b transition-colors duration-300 ' +
        (overlay ? '-mb-20 ' : '') +
        (transparent
          ? 'border-transparent bg-transparent'
          : 'border-ink-100 bg-surface-raised/95 backdrop-blur')
      }
      style={transparent ? { textShadow: SHADOW } : undefined}
    >
      {children}
    </header>
  )
}

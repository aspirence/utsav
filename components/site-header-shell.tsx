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
 *    is a `-mb-28` that pulls the content up under the sticky bar by exactly its own
 *    height, so the hero photograph starts at the very top of the viewport. This depends
 *    only on the route and never changes while you scroll. If it toggled, the whole page
 *    would shift 112px the moment you moved.
 *
 *    KEEP IN SYNC: that -mb-28 has to match the `h-28` row inside SiteHeader. A mismatch
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
 * COLOUR. The solid state is ink-900, matching the footer, so the page is bracketed by the
 * same dark band top and bottom. That simplified the header rather than complicating it:
 * both states are now dark behind light type, so the links no longer need one colour for
 * the scrolled state and another for the transparent one.
 *
 * `data-transparent` survives for exactly one thing - the text-shadow. Over the hero there
 * is no background behind the type at all, and the hero has no scrim by design, so the
 * shadow is the only thing separating the nav from the photograph.
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
        'group sticky top-0 z-40 border-b transition-colors duration-300 ' +
        (overlay ? '-mb-28 ' : '') +
        (transparent
          ? 'border-transparent bg-transparent'
          : 'border-white/10 bg-ink-900/95 backdrop-blur')
      }
      style={transparent ? { textShadow: SHADOW } : undefined}
    >
      {children}
    </header>
  )
}

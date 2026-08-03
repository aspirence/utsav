'use client'

import { Brand } from '@/components/brand'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * The phone navigation: a hamburger, and a full-screen panel behind it.
 *
 * Below `md` the header had room for the mark and one button, so the categories were
 * simply not there - five of the site's most important routes reachable on a desktop and
 * nowhere at all on a phone. They live here now, alongside the account link.
 *
 * The "Find vendors" and "List your business" entries that used to sit under them are gone,
 * removed from the bar and from this panel in the same change so the two do not disagree about
 * what the header offers.
 *
 * Full screen rather than a dropdown. A panel hanging off a 112px header leaves the page
 * showing underneath it, and on a dark translucent bar that reads as a rendering fault.
 *
 * It slides in from the right, out of the corner the button sits in, and carries the mark
 * at the top with everything centred beneath it. The panel covers the header while it is
 * open, so it needs its own close control - the hamburger underneath cannot be reached.
 *
 * THE OPENING IS STAGGERED. The panel itself takes 600ms on an expo-out curve, and its
 * contents follow one after another rather than arriving with it. A menu that snaps in
 * fully formed gives you nothing to follow; letting the mark land, then the list unfold a
 * row at a time, is what makes it read as opening. Closing runs with no delays at all -
 * you have already decided, and staggering an exit only makes it feel slow.
 *
 * THE PANEL IS PORTALLED TO THE BODY, and it has to be. The header carries `backdrop-blur`
 * in its solid state, and `backdrop-filter` makes an element a containing block for any
 * `position: fixed` descendant. Left inside the header, the panel's `inset-0` resolved
 * against the 112px bar instead of the viewport - it rendered as a black strip across the
 * top with the links clipped out of existence. Nothing about the CSS looked wrong; the
 * ancestor was.
 *
 * Four more things a menu has to get right, none of which are free:
 *
 *  · **Escape closes it.** Anything modal that traps you is broken.
 *  · **The page behind does not scroll.** Locking `overflow` on the body is what stops the
 *    scroll chaining through to the page under the overlay.
 *  · **It closes on navigation.** Next.js does client-side transitions, so nothing unmounts
 *    on its own - without this the panel would still be open on the page you just opened.
 *  · **It is a real <button> with aria-expanded**, so a screen reader is told there is a
 *    menu and whether it is open, rather than meeting an unlabelled icon.
 */
export function SiteNavMobile({
  categories,
  defaultCity,
  signedIn = false,
}: {
  categories: { slug: string; pluralName: string }[]
  defaultCity: string
  signedIn?: boolean
}) {
  const [open, setOpen] = useState(false)
  // Portals need a DOM, so nothing renders on the server pass.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const pathname = usePathname()

  // Close on navigation. Next keeps this component mounted across a client-side route
  // change, so nothing else would.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /** Fade-and-rise for a panel child, held back by `ms` while opening. */
  const step = (ms: number) => ({
    opacity: open ? 1 : 0,
    transform: open ? 'none' : 'translateY(14px)',
    transition: 'opacity 420ms ease-out, transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
    transitionDelay: open ? `${ms}ms` : '0ms',
  })

  return (
    <div className="md:hidden">
      {/* Stays a hamburger in both states. The panel covers it when open and carries its
          own close control, so animating this one into an X would be animating something
          nobody can see.

          THIS BUTTON IS IN THE HEADER BAR, so it needs the bar's two colour states — ink on the
          white chrome, white over the homepage hero. Everything below it is inside the slide-in
          panel, which is dark in both cases and does not. The bars are `bg-current`, so setting
          the text colour is enough for the icon as well. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label="Open menu"
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-ink-100 group-data-[transparent]:text-white group-data-[transparent]:hover:bg-white/10"
      >
        <span className="relative block h-4 w-6" aria-hidden="true">
          <span className="absolute left-0 top-0 block h-0.5 w-6 bg-current" />
          <span className="absolute bottom-0 left-0 block h-0.5 w-6 bg-current" />
        </span>
      </button>

      {mounted &&
        createPortal(
          <div
            id="site-menu"
            // Kept in the DOM and hidden rather than unmounted, so it can transition out
            // instead of vanishing. `invisible` takes it out of the tab order while closed.
            //
            // Slides in from the top-right, where the button is - anchoring the motion to
            // the control that caused it is what makes the panel feel opened rather than
            // dropped on the page.
            className={
              'bg-ink-900 fixed inset-0 z-[60] flex origin-top-right flex-col ' +
              'transition-[transform,opacity,visibility] ' +
              // Expo-out: most of the travel happens early and it settles for a long
              // while, which is what reads as "arriving" rather than "snapping".
              'duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ' +
              (open
                ? 'visible translate-x-0 opacity-100'
                : 'invisible translate-x-full opacity-0')
            }
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              tabIndex={open ? undefined : -1}
              aria-label="Close menu"
              style={step(120)}
              className="absolute right-4 top-6 flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-white/10"
            >
              <span className="relative block h-6 w-6" aria-hidden="true">
                <span className="absolute left-0 top-1/2 block h-0.5 w-6 -translate-y-1/2 rotate-45 bg-current" />
                <span className="absolute left-0 top-1/2 block h-0.5 w-6 -translate-y-1/2 -rotate-45 bg-current" />
              </span>
            </button>

            {/*
              `scrollbar-none` for the same reason the console rail carries it: this panel is a
              dark full-screen surface, and the system scrollbar paints light over it as a pale
              stripe down the right edge. Still scrolls — a long category list on a small phone
              in landscape needs to.
            */}
            <nav
              aria-label="Main"
              className="scrollbar-none flex flex-1 flex-col items-center overflow-y-auto px-6 pb-10 pt-16 text-center"
            >
              <Link
                href="/"
                tabIndex={open ? undefined : -1}
                aria-label="Fremmo — home"
                style={step(140)}
              >
                {/* Same knockout the header and footer use - the mark is dark brown and
                    gold on transparent, and would all but vanish on ink-900. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no next/image */}
                <Brand
                  className="flex-col gap-3"
                  markClassName="h-20 w-auto [filter:brightness(0)_invert(1)]"
                  wordClassName="text-4xl text-white"
                />
              </Link>

              <p
                style={step(240)}
                className="text-accent-300 mt-8 text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Browse
              </p>

              {/* w-full on the list, not the items: the rules under each link should run
                  the width of the panel, while the labels stay centred on it. */}
              <ul className="mt-4 w-full max-w-xs">
                {categories.map((c, i) => (
                  <li key={c.slug} style={step(300 + i * 70)}>
                    <Link
                      href={`/${defaultCity}/${c.slug}`}
                      tabIndex={open ? undefined : -1}
                      className="font-display block border-b border-white/10 py-4 text-2xl text-white"
                    >
                      {c.pluralName}
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-8 w-full max-w-xs space-y-3">
                <Link
                  // /dashboard, not /account: it resolves to whichever surface this
                  // person's memberships give them. See lib/viewer.ts.
                  href={signedIn ? '/dashboard' : '/login'}
                  tabIndex={open ? undefined : -1}
                  style={step(300 + categories.length * 70)}
                  className="text-ink-100 block rounded-md border border-white/25 px-5 py-3.5 text-center font-medium"
                >
                  {signedIn ? 'Your account' : 'Login'}
                </Link>
              </div>
            </nav>
          </div>,
          document.body,
        )}
    </div>
  )
}

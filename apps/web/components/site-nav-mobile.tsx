'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * The phone navigation: a hamburger, and a full-screen panel behind it.
 *
 * Below `md` the header had room for the mark and one button, so the categories were
 * simply not there - five of the site's most important routes reachable on a desktop and
 * nowhere at all on a phone. They live here now, and the "Find vendors" button comes with
 * them rather than sitting in the bar competing with the logo.
 *
 * Full screen rather than a dropdown. A panel hanging off a 112px header leaves the page
 * showing underneath it, and on a dark translucent bar that reads as a rendering fault.
 *
 * Four things a menu has to get right, none of which are free:
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
}: {
  categories: { slug: string; pluralName: string }[]
  defaultCity: string
}) {
  const [open, setOpen] = useState(false)
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

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="relative z-50 flex h-11 w-11 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10"
      >
        {/* Two bars that cross into an X - one element, both states, so there is nothing
            to swap and nothing to keep in sync. */}
        <span className="relative block h-4 w-6" aria-hidden="true">
          <span
            className={
              'absolute left-0 block h-0.5 w-6 bg-current transition-all duration-300 ' +
              (open ? 'top-1/2 -translate-y-1/2 rotate-45' : 'top-0')
            }
          />
          <span
            className={
              'absolute left-0 block h-0.5 w-6 bg-current transition-all duration-300 ' +
              (open ? 'top-1/2 -translate-y-1/2 -rotate-45' : 'bottom-0')
            }
          />
        </span>
      </button>

      <div
        id="site-menu"
        // Kept in the DOM and hidden, rather than unmounted, so the panel can transition
        // out instead of vanishing. `invisible` takes it out of the tab order while closed.
        className={
          'fixed inset-0 z-40 flex flex-col bg-ink-900 transition-opacity duration-300 ' +
          (open ? 'visible opacity-100' : 'invisible opacity-0')
        }
      >
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-6 pb-8 pt-28">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-300">
            Browse
          </p>
          <ul className="mt-5 space-y-1">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/${defaultCity}/${c.slug}`}
                  tabIndex={open ? undefined : -1}
                  className="block border-b border-white/10 py-4 font-display text-2xl text-white"
                >
                  {c.pluralName}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-8 space-y-3">
            {/* The button that used to sit in the bar. Plan §1 keeps the vendor entry
                point unburied, so it comes along too rather than being desktop-only. */}
            <Link
              href={`/${defaultCity}/photography`}
              tabIndex={open ? undefined : -1}
              className="block rounded-md bg-primary-600 px-5 py-3.5 text-center font-medium text-white"
            >
              Find vendors
            </Link>
            <Link
              href="/partner"
              tabIndex={open ? undefined : -1}
              className="block rounded-md border border-white/25 px-5 py-3.5 text-center font-medium text-ink-100"
            >
              List your business
            </Link>
          </div>
        </nav>
      </div>
    </div>
  )
}

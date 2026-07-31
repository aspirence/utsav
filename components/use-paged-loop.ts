'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A slider that pages rather than scrolls, and wraps forever.
 *
 * Two sliders on the homepage need exactly this and the mechanism is fiddly enough that a
 * second copy of it would be a second set of bugs, so it lives here.
 *
 * The loop is seamless because the caller renders a clone of page one on the end of the
 * track. Advancing off the last real page animates onto the clone - pixel-identical to
 * page one - and a timer then drops the transition and resets the index to 0. The reset is
 * invisible because nothing moves. Going backwards off page one does the same in reverse:
 * hop to the clone with animation off, then animate to the last real page.
 *
 * Details that are load-bearing:
 *
 *  · **Two requestAnimationFrames, not one.** React can batch the class change and the
 *    transform into a single commit, and the browser then animates the jump we were
 *    trying to hide.
 *
 *  · **A timer, not onTransitionEnd.** transitionend bubbles, so a card's own hover-zoom
 *    would fire the handler. Timing off the known duration is the reliable read.
 *
 *  · **No side effects inside a state updater.** Updaters must be pure - React calls them
 *    twice in StrictMode - so `prev` reads the current index from a ref instead.
 *
 * Autoplay stops on hover, on focus-within and while the tab is hidden, and never starts
 * under prefers-reduced-motion. A card sliding out from under someone reading it is worse
 * than no animation.
 */
export function usePagedLoop(count: number, intervalMs = 5200, durationMs = 700) {
  const [index, setIndex] = useState(0)
  const [animate, setAnimate] = useState(true)
  const [rewinding, setRewinding] = useState(false)
  const [paused, setPaused] = useState(false)

  const idx = useRef(0)
  useEffect(() => {
    idx.current = index
  }, [index])

  // Page count changes when the viewport crosses a breakpoint and useResponsivePerPage
  // re-paginates. Going back to the start is not cosmetic: the old index can be past the
  // end of the new track, which would translate the whole thing off screen.
  useEffect(() => {
    setIndex(0)
    setRewinding(false)
    setAnimate(false)
  }, [count])

  const next = useCallback(() => setIndex((i) => (i >= count ? 1 : i + 1)), [count])

  const prev = useCallback(() => {
    if (idx.current > 0) {
      setIndex(idx.current - 1)
      return
    }
    setAnimate(false)
    setIndex(count)
    setRewinding(true)
  }, [count])

  // Restore the transition on the frame after a no-animation move has committed.
  useEffect(() => {
    if (animate) return
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setAnimate(true)
        if (rewinding) {
          setIndex(count - 1)
          setRewinding(false)
        }
      }),
    )
    return () => cancelAnimationFrame(id)
  }, [animate, rewinding, count])

  // Sitting on the clone means we are visually at page one - take the index there.
  useEffect(() => {
    if (index !== count || rewinding) return
    const id = window.setTimeout(() => {
      setAnimate(false)
      setIndex(0)
    }, durationMs + 40)
    return () => window.clearTimeout(id)
  }, [index, count, rewinding, durationMs])

  useEffect(() => {
    if (paused || count < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const id = window.setInterval(() => {
      if (!document.hidden) next()
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [paused, count, next, intervalMs])

  return {
    index,
    /** Which real page is on screen - the clone reads as page one. */
    page: count > 0 ? index % count : 0,
    animate,
    next,
    prev,
    /** Spread onto the outer element so autoplay yields to whoever is reading. */
    pauseProps: {
      onMouseEnter: () => setPaused(true),
      onMouseLeave: () => setPaused(false),
      onFocusCapture: () => setPaused(true),
      onBlurCapture: () => setPaused(false),
    },
  }
}

/** Split a list into pages of `size`. A short tail simply renders a shorter last page. */
export function paginate<T>(items: T[], size: number): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}

/**
 * How many cards belong on one page at the current viewport width.
 *
 * A page is a slide, so this has to be a real number and not just a CSS column count.
 * Laying three cards out as `grid-cols-1 sm:grid-cols-3` looks right on a desktop and
 * wrong on a phone: the page still holds three cards, they just stack, so one "slide" is a
 * tall column of three and the slider stops looking like a slider.
 *
 * Breakpoints match Tailwind's `sm` and `lg` so the count and the grid never disagree.
 *
 * The initial state is the widest value on purpose. The server has no viewport to measure,
 * so it renders the desktop layout; a phone corrects itself on mount. Starting at the
 * mobile count instead would make every desktop load reflow, which is the far more common
 * case.
 */
export function useResponsivePerPage(base: number, sm: number, lg: number) {
  const [perPage, setPerPage] = useState(lg)

  useEffect(() => {
    const mSm = window.matchMedia('(min-width: 640px)')
    const mLg = window.matchMedia('(min-width: 1024px)')

    const read = () => setPerPage(mLg.matches ? lg : mSm.matches ? sm : base)
    read()

    mSm.addEventListener('change', read)
    mLg.addEventListener('change', read)
    return () => {
      mSm.removeEventListener('change', read)
      mLg.removeEventListener('change', read)
    }
  }, [base, sm, lg])

  return perPage
}

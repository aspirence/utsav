'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { formatPaise } from '@/lib/db'

import { TemplatePhone, type PhonePreview } from '@/components/template-phone'
import { useResponsivePerPage } from '@/components/use-paged-loop'

/**
 * Curated Collections — four phones at a time, rotating one at a time, forever.
 *
 * ── WHY EXACTLY FOUR, NEVER A SLIVER ─────────────────────────────────────────
 * This was a scroll-snap row, which left a fifth card sliced down the middle at the right
 * edge. A half-visible phone reads as a rendering bug rather than as "there is more" — the
 * arrows are what say there is more. So the viewport is measured and the track is laid out to
 * exactly `perView` cards plus their gaps, and `overflow-hidden` clips at a card boundary.
 *
 * ── WHY THE TRACK IS DOUBLED ─────────────────────────────────────────────────
 * One card leaves on the left and a new one arrives on the right, endlessly. That needs a card
 * to *exist* on the right before it slides in, so the track renders the list twice: translating
 * from index 0 to index `count` always has `perView` real cards on screen. On reaching `count`
 * the transform snaps back to 0 with the transition switched off — the pixels are identical, so
 * the jump is invisible.
 *
 * Three correctness notes, learned the hard way in use-paged-loop.ts and repeated here because
 * they are easy to undo:
 *
 *   · Two requestAnimationFrames before re-enabling the transition. React batches state, and
 *     one frame is not always enough for the browser to have committed the transform-less
 *     paint — with one, the snap-back animates and the row visibly rewinds.
 *   · A timer matched to the CSS duration, not onTransitionEnd. That event bubbles, and the
 *     card's price face has its own transition, so a mouse passing over the row would fire it.
 *   · No side effects inside a state updater. StrictMode calls updaters twice.
 */

export interface TemplateCard extends PhonePreview {
  slug: string
  tags: string[]
  pricePaise: number
}

/** Matched to the CSS below. Both have to change together. */
const SLIDE_MS = 620
const HOLD_MS = 2600

/**
 * How far a finger has to travel before it counts as a swipe rather than a tap that wandered.
 *
 * 40px, not a fraction of the card. A percentage threshold means the gesture needs a longer
 * push on a big phone than a small one for the same intent, which is backwards — the finger is
 * the same size either way.
 */
const SWIPE_MIN_PX = 40

/** Below this the drag has no committed direction yet. Stops a 2px jitter picking an axis. */
const AXIS_LOCK_PX = 6

export function TemplateCollections({ items }: { items: TemplateCard[] }) {
  /*
   * Two on a phone, not one.
   *
   * A single 200px phone on a 390px screen left half the row empty and made the section read as
   * one enormous product rather than a collection. At two the cards come out ~170px wide, which
   * still carries the device frame legibly — the frame is this section's signature, and the
   * heading above promises "see it running on a phone".
   */
  const perView = useResponsivePerPage(2, 2, 4)
  const count = items.length

  const [index, setIndex] = useState(0)
  const [animate, setAnimate] = useState(true)
  const [paused, setPaused] = useState(false)

  /*
   * Live drag offset, in pixels.
   *
   * The track follows the finger while it is down rather than jumping at the end. That is the
   * difference between a carousel that feels like a native pager and one that feels like a
   * button being pressed at a distance — the content should be attached to the thumb.
   */
  const [drag, setDrag] = useState(0)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<'undecided' | 'x' | 'y'>('undecided')

  // Enough cards to fill the window after the last one, or the track runs out mid-slide.
  const enoughToLoop = count > perView

  const advance = useCallback(
    (dir: 1 | -1) => {
      if (!enoughToLoop) return
      setIndex((i) => i + dir)
    },
    [enoughToLoop],
  )

  /**
   * The snap-back.
   *
   * Reaching `count` means the doubled track has scrolled a full list-length, which looks
   * identical to being at 0. Jump there with the transition off, then turn it back on.
   * Symmetrically for a backwards step past 0.
   */
  useEffect(() => {
    if (!enoughToLoop) return
    if (index !== count && index !== -1) return

    const target = index === count ? 0 : count - 1
    setAnimate(false)
    setIndex(target)

    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setAnimate(true))
    })

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [index, count, enoughToLoop])

  /** Autoplay. Stops while a pointer is over the row or focus is inside it. */
  useEffect(() => {
    if (!enoughToLoop || paused || !animate) return
    const t = setTimeout(() => advance(1), HOLD_MS + SLIDE_MS)
    return () => clearTimeout(t)
  }, [enoughToLoop, paused, animate, index, advance])

  // A changed count invalidates the position — a filtered or reloaded list would otherwise
  // resume mid-track and show a gap.
  useEffect(() => {
    setIndex(0)
    setAnimate(false)
    const raf = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(raf)
  }, [count, perView])

  if (count === 0) return null

  const track = enoughToLoop ? [...items, ...items] : items

  /**
   * Swipe.
   *
   * THERE WAS NO WAY TO ADVANCE THIS ON A PHONE. The arrows are `hidden sm:flex`, so below 640px
   * the row autoplayed and accepted no input at all — you waited, or you left. That is the single
   * biggest thing separating this from an app, and two cards per row makes it worse rather than
   * better, because now there is visibly more to reach.
   *
   * `touch-pan-y` on the track is what makes this cooperate with the page instead of fighting it:
   * the browser keeps vertical scrolling for itself and hands us horizontal movement, so no
   * preventDefault is needed and the page never feels sticky under a thumb travelling down it.
   * The axis lock below is the JavaScript half of the same idea — a diagonal drag that is mostly
   * vertical is somebody scrolling past, not somebody browsing templates.
   */
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    if (!touch) return
    touchStart.current = { x: touch.clientX, y: touch.clientY }
    axis.current = 'undecided'
    setPaused(true)
  }

  const onTouchMove = (event: React.TouchEvent) => {
    const origin = touchStart.current
    const touch = event.touches[0]
    if (!origin || !touch) return

    const dx = touch.clientX - origin.x
    const dy = touch.clientY - origin.y

    if (axis.current === 'undecided') {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (axis.current !== 'x') return

    // Nothing to slide to when the list fits. Rubber-banding a track that cannot move reads as
    // broken, so the finger simply does nothing.
    if (!enoughToLoop) return
    setDrag(dx)
  }

  const onTouchEnd = () => {
    const travelled = drag

    touchStart.current = null
    axis.current = 'undecided'
    setDrag(0)
    setPaused(false)

    // Batched with setDrag(0) above, so the transform moves to the new index *with* the
    // transition restored rather than snapping back first and animating second.
    if (Math.abs(travelled) > SWIPE_MIN_PX) advance(travelled < 0 ? 1 : -1)
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/*
        The width maths, in CSS rather than JavaScript.

        --gap is the space between cards. Each card is (100% - (perView-1) gaps) / perView, so
        `perView` cards plus their gaps come to exactly 100% of this box — which is why nothing
        is ever half-visible. Reading it off the DOM instead would mean a resize listener and a
        frame of wrong layout on every breakpoint change.
      */}
      {/*
        `-my-5 py-5` is the fix for the shadow clip, not decoration.

        The clipping box has to hide the cards sliding in and out sideways, but `overflow-hidden`
        clips vertically too, and the phone's drop shadow spills past the frame on every edge —
        without the padding it is sheared off square against the top of the row. The padding gives
        20px of room inside the clip box and the negative margin takes the same 20px back out of
        the layout, so nothing below moves.
      */}
      {/*
        --gap moved out of the inline style and into a class so it can change at a breakpoint.
        An inline custom property beats any class that sets the same one, so these cannot both
        exist — 1.5rem between two ~170px cards on a phone is a tenth of the row spent on
        nothing.
      */}
      <div
        className="-my-5 overflow-hidden py-5 [--gap:0.75rem] sm:[--gap:1.5rem]"
        style={
          {
            '--per': String(perView),
            '--card': 'calc((100% - (var(--per) - 1) * var(--gap)) / var(--per))',
          } as React.CSSProperties
        }
      >
        <div
          className="flex touch-pan-y"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          style={{
            gap: 'var(--gap)',
            // One step is a card plus a gap, plus however far the finger has dragged.
            transform: `translate3d(calc(${-index} * (var(--card) + var(--gap)) + ${drag}px), 0, 0)`,
            /*
             * No transition while a finger is down. A transition during a drag makes the track
             * lag behind the thumb by its own duration, which reads as the page being slow
             * rather than as the content being held.
             */
            transition:
              animate && drag === 0
                ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
                : 'none',
          }}
        >
          {track.map((item, i) => {
            // The second copy is the same content twice over. Hiding it from assistive tech and
            // from the tab order stops a screen reader reading eight templates as sixteen, and
            // stops Tab walking into links that are only there to be slid into view.
            const isClone = enoughToLoop && i >= count
            return (
              <div
                key={`${item.slug}-${i}`}
                className="shrink-0"
                style={{ width: 'var(--card)' }}
                aria-hidden={isClone || undefined}
                inert={isClone}
              >
                <TemplateFigure item={item} />
              </div>
            )
          })}
        </div>
      </div>

      {/*
        Position dots — phones only, where the arrows are not rendered.

        `sm:hidden` mirrors the arrows' `hidden sm:flex` exactly: above 640px the arrows say
        there is more and the dots would be a second, quieter copy of the same message.

        One dot per card rather than per page, because the track advances one card at a time —
        four dots against an eight-card list that steps singly would sit still for half its
        moves and look broken.

        Decorative, and marked so. Every template is reachable by swiping or by the arrows, and
        a screen reader has the full list in the track itself; announcing eight unlabelled dots
        adds nothing it cannot already reach.
      */}
      {enoughToLoop && (
        <ul
          aria-hidden="true"
          className="mt-6 flex items-center justify-center gap-1.5 sm:hidden"
        >
          {items.map((item, i) => (
            <li
              key={item.slug}
              className={
                'h-1.5 rounded-full transition-all duration-300 ' +
                // The live card is wider rather than merely darker: at 6px a colour change
                // alone is close to invisible, and this stays legible for anyone who cannot
                // separate the two tones.
                (i === (((index % count) + count) % count)
                  ? 'w-4 bg-primary-600'
                  : 'w-1.5 bg-ink-300')
              }
            />
          ))}
        </ul>
      )}

      {enoughToLoop && (
        <>
          <button
            type="button"
            onClick={() => advance(-1)}
            aria-label="Previous template"
            className="absolute -left-4 top-[36%] hidden h-11 w-11 items-center justify-center rounded-full bg-white text-lg text-ink-800 ring-1 ring-ink-200/70 transition-colors hover:text-ink-950 sm:flex"
          >
            <span aria-hidden="true">&#8249;</span>
          </button>
          <button
            type="button"
            onClick={() => advance(1)}
            aria-label="Next template"
            className="absolute -right-4 top-[36%] hidden h-11 w-11 items-center justify-center rounded-full bg-white text-lg text-ink-800 ring-1 ring-ink-200/70 transition-colors hover:text-ink-950 sm:flex"
          >
            <span aria-hidden="true">&#8250;</span>
          </button>
        </>
      )}
    </div>
  )
}

function TemplateFigure({ item }: { item: TemplateCard }) {
  const href = `/invitations/${item.slug}`

  return (
    <figure className="group">
      {/* The whole phone is the link, not just the button. Somebody who wants to see a template
          taps its picture — making them find a 40px button under it is a worse version of the
          same journey. */}
      <Link href={href} aria-label={`${item.name}, ${formatPaise(item.pricePaise)}`}>
        {/*
          Capped width, so the height is capped with it.
          The card is a quarter of the row — around 280px on a wide screen — and at the iPhone's
          1:2.174 that made a 600px-tall phone that dominated the section. 200px brings it to
          ~435px, which reads as a phone rather than as a pillar. Centred in the card so the
          four stay evenly spaced.
        */}
        <TemplatePhone item={item} className="mx-auto w-full max-w-[200px]" />
      </Link>

      {/*
        The caption is set for a ~280px desktop card. At ~170px on a phone the tracking alone
        pushed a three-tag row onto three lines, so both the size and the letter-spacing step
        down — tracking is a proportion of the type size and does not survive being shrunk
        without being retuned.
      */}
      <figcaption className="mt-3 text-center sm:mt-5">
        {item.tags.length > 0 && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-700/80 sm:text-[11px] sm:tracking-[0.16em]">
            {item.tags.map((tag, i) => (
              <span key={tag}>
                {i > 0 && <span aria-hidden="true"> &middot; </span>}
                {tag}
              </span>
            ))}
          </p>
        )}

        {/*
          The reserved height keeps the four price rows on one line as the names wrap to
          different depths. It has to shrink with the type or it reserves space for a third line
          that can no longer occur.
        */}
        <h3 className="mt-1.5 line-clamp-2 min-h-[2.75rem] font-display text-base leading-snug text-ink-900 sm:mt-2 sm:min-h-[3.5rem] sm:text-xl">
          {item.name}
        </h3>

        <PriceFlip item={item} href={href} />
      </figcaption>
    </figure>
  )
}

/**
 * The price, which turns into the order button.
 *
 * Both faces are absolutely positioned in a fixed-height box, so the flip cannot change the
 * card's height — a row of four cards that each grow on hover is a row that reflows under the
 * cursor.
 *
 * `group-focus-within` alongside `group-hover` is what makes this keyboard-reachable: tab to the
 * link and the face it lives on is the one showing. And because both faces stay in the layout,
 * a touchscreen — where there is no hover at all — can still reach the button. A button that
 * only materialises on hover is a button phones cannot press.
 *
 * No demo button. It was here and it is gone: the phone above is already the demo, and the card
 * had two competing calls to action for one decision.
 */
function PriceFlip({ item, href }: { item: TemplateCard; href: string }) {
  return (
    <div className="relative mt-3 h-11 [perspective:800px]">
      <div className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] group-hover:[transform:rotateX(180deg)] group-focus-within:[transform:rotateX(180deg)]">
        <p className="absolute inset-0 flex items-center justify-center text-lg tabular-nums text-ink-800 [backface-visibility:hidden]">
          {formatPaise(item.pricePaise)}
        </p>

        {/* Pre-rotated, so it reads the right way up once the parent turns over. */}
        <div className="absolute inset-0 flex items-center justify-center [backface-visibility:hidden] [transform:rotateX(180deg)]">
          <Link
            href={href}
            className="inline-flex h-10 items-center rounded-full bg-primary-600 px-6 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Order now
          </Link>
        </div>
      </div>
    </div>
  )
}

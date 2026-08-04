'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Hero background: a rota of photographs, swapped a tile at a time.
 *
 * Add or remove entries in FRAMES and everything else follows - the cycle is modular over
 * the list length and only ever warms the one frame it is about to need.
 *
 * Plan §13 gates launch on "LCP < 2.5 s on 4G mid-range Android", and on this page the
 * hero image *is* the LCP element - so how the first one loads matters more than how the
 * swap looks. That constraint shapes the whole component:
 *
 *  1. **The first frame is a plain, eager <img>.** Three WebP variants and `sizes="100vw"`
 *     so a phone downloads 60 KB, not 2.5 MB, and `fetchPriority="high"` so the preload
 *     scanner starts it immediately. A CSS background would be invisible to that scanner
 *     and cost most of the LCP win. This is *not* next/image: plan §12 turns the Vercel
 *     optimizer off (`images.unoptimized`), so variants are pre-built at commit time -
 *     `pnpm images`.
 *
 *  2. **Only the first photograph is in the first paint.** The rest are not fetched until
 *     WARM_AFTER_MS after mount - one ahead at a time, never the whole rota - and the tile
 *     overlay only exists during a swap, so the initial render is byte-for-byte what it
 *     was when this was a single static image. The first swap waits longer than the ones
 *     after it for the same reason: swapping into a frame that has not arrived would show
 *     tiles of nothing.
 *
 *  3. **An inlined 24px blur underneath.** ~100 bytes, so it costs nothing, and it means
 *     the headline never renders over bare paper on a slow connection.
 *
 * The swap: the incoming photograph is drawn as a grid of tiles stacked over the outgoing
 * one, and each tile fades in on a delay set by `col + row`, so the change runs as a
 * diagonal wave from the top left rather than all at once. The delay comes from the tile's
 * position, never from a random number - a random stagger would differ between the server
 * and client renders and trip hydration.
 *
 * Each tile is a window onto a full-size copy of the image: the inner <img> is sized to the
 * whole hero (COLS x 100% by ROWS x 100% of its tile) and shifted into place, so every tile
 * shows exactly the slice `object-cover` would have put there. Percentage
 * `background-position` cannot express that - it stretches rather than covers - which is
 * why these are real elements and not background images. All eighteen point at one URL, so
 * it stays one network request.
 *
 * There is no scrim. The two gradients that used to sit here were removed on request, so
 * the photographs render at full strength and the copy over them carries its own shadow -
 * see the hero section in app/(site)/(marketing)/page.tsx.
 */

const COLS = 6
const ROWS = 3

/** Held on screen between swaps. */
const HOLD_MS = 3000
/** One tile's fade. */
const FADE_MS = 450
/** Added per step of `col + row`. */
const STAGGER_MS = 45
/** Quiet period before the second photograph is requested, so it never races the LCP. */
const WARM_AFTER_MS = 1200

const SWEEP_MS = FADE_MS + (COLS - 1 + ROWS - 1) * STAGGER_MS

type Frame = {
  base: string
  /** Real width of `<base>-1920.webp`. optimize-images.mjs never upscales, so a 1672px
      source yields a 1672px file however the filename reads. */
  wide: number
  /** 24px inlined placeholder, from `pnpm images`. */
  blur: string
}

const FRAMES: Frame[] = [
  {
    base: 'hero-section',
    wide: 1717,
    blur: 'data:image/webp;base64,UklGRmQAAABXRUJQVlA4IFgAAACwAwCdASoYAA0APu1kq04ppaQiMAgBMB2JaACdMoACWqsOANdNAAD+vxSceLbbPG3xCfDuUCh8XyOmwUuPVl4riJ4d/Gd9r6b5g7uiQ8Xbtl4QWZM2YAAA',
  },
  {
    base: 'herosection2',
    wide: 1672,
    blur: 'data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAADwAwCdASoYAA4APu1kq04ppaQiMAgBMB2JQBOmUABp1fkaoyjd7O4AAP7xB3uA4JRYHUHwtkSJVX2wf82eLKhfz2Culg3QEAA=',
  },
  {
    base: 'herosection3',
    wide: 1860,
    blur: 'data:image/webp;base64,UklGRmwAAABXRUJQVlA4IGAAAABQBACdASoYAAsAPu1iqU2ppaOiMAgBMB2JbACdMoR3ACGBpA6/AERQfjQAAP6BISv12LV9BBm8ytfLbruUkiOC9S2VYYfQ0H+BZz6NNNkZ/DE2m2IlTFslhPfmcxK7AAA=',
  },
]

const srcSetFor = (f: Frame) =>
  `/${f.base}-768.webp 768w, /${f.base}-1280.webp 1280w, /${f.base}-1920.webp ${f.wide}w`

export function HeroBackground() {
  const [current, setCurrent] = useState(0)
  const [incoming, setIncoming] = useState<number | null>(null)
  const [warm, setWarm] = useState(false)

  // The cycle schedules itself, so it reads the live index through a ref rather than
  // re-subscribing on every swap and restarting the timer mid-sweep.
  const currentRef = useRef(0)
  currentRef.current = current

  useEffect(() => {
    if (FRAMES.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const warmId = window.setTimeout(() => setWarm(true), WARM_AFTER_MS)

    let hold: number | undefined
    let settle: number | undefined

    const schedule = (delay: number) => {
      hold = window.setTimeout(() => {
        const nextFrame = (currentRef.current + 1) % FRAMES.length
        setIncoming(nextFrame)

        settle = window.setTimeout(() => {
          setCurrent(nextFrame)
          setIncoming(null)
          schedule(HOLD_MS)
        }, SWEEP_MS + 60)
      }, delay)
    }

    schedule(WARM_AFTER_MS + HOLD_MS)

    return () => {
      window.clearTimeout(warmId)
      window.clearTimeout(hold)
      window.clearTimeout(settle)
    }
  }, [])

  const frame = FRAMES[current]!
  const nextFrame = FRAMES[(current + 1) % FRAMES.length]!

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Blurred placeholder, visible only until the real image paints over it. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${frame.blur}")` }}
      />

      <img
        src={`/${frame.base}-1280.webp`}
        srcSet={srcSetFor(frame)}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Mounted late so the next photograph downloads well after the LCP has settled. */}
      {warm && incoming === null && (
        <img
          src={`/${nextFrame.base}-1280.webp`}
          srcSet={srcSetFor(nextFrame)}
          sizes="100vw"
          alt=""
          fetchPriority="low"
          decoding="async"
          className="absolute top-0 left-0 h-px w-px opacity-0"
        />
      )}

      {incoming !== null && <TileSweep frame={FRAMES[incoming]!} />}
    </div>
  )
}

function TileSweep({ frame }: { frame: Frame }) {
  // Mounted at opacity 0 and flipped on the frame after commit. A tile that renders at its
  // final opacity has nothing to transition from and would simply appear.
  const [lit, setLit] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setLit(true)))
    return () => cancelAnimationFrame(id)
  }, [])

  const tiles = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      tiles.push(
        <div
          key={`${row}-${col}`}
          className="absolute overflow-hidden transition-opacity ease-out"
          style={{
            left: `${(col * 100) / COLS}%`,
            top: `${(row * 100) / ROWS}%`,
            width: `${100 / COLS}%`,
            height: `${100 / ROWS}%`,
            opacity: lit ? 1 : 0,
            transitionDuration: `${FADE_MS}ms`,
            transitionDelay: `${(col + row) * STAGGER_MS}ms`,
          }}
        >
          <img
            src={`/${frame.base}-1280.webp`}
            srcSet={srcSetFor(frame)}
            sizes="100vw"
            alt=""
            decoding="async"
            className="absolute max-w-none object-cover object-center"
            style={{
              width: `${COLS * 100}%`,
              height: `${ROWS * 100}%`,
              left: `${-col * 100}%`,
              top: `${-row * 100}%`,
            }}
          />
        </div>,
      )
    }
  }

  return <div className="absolute inset-0">{tiles}</div>
}

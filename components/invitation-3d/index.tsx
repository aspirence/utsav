'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'

import { DEMO_CARD_CONTENT, linesFor, type InvitationCardContent } from './content'

/**
 * The invitation experience: the three.js scene, plus the wording as real DOM over it.
 *
 * three.js is roughly 150 KB gzipped, which is why this whole thing lives on its own route
 * and is loaded with `dynamic(..., { ssr: false })`. Nothing here reaches any other page -
 * plan §13 gates launch on LCP over 4G, and a marketing page has no business paying for a
 * WebGL renderer it never mounts.
 *
 * The wording is DOM rather than a canvas texture on purpose. Text drawn into a texture is
 * resolution-locked and resampled by the GPU, so it goes soft at exactly the size someone
 * reads it - and on a wedding invitation the names are the one thing that has to be sharp.
 * It also means the card is selectable, searchable, and legible to a screen reader.
 */
const Scene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#2a1f16]" aria-hidden="true" />,
})

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * `content` defaults to the demo wording so /invitation — the public showcase, which has no order
 * behind it — keeps working untouched. A real invitation passes its own.
 */
export function Invitation3D({
  content = DEMO_CARD_CONTENT,
}: {
  content?: InvitationCardContent
} = {}) {
  const [t, setT] = useState(0)

  /*
   * Read once, on mount, from the URL this page was opened with.
   *
   * useState's initialiser rather than an effect: an effect would render one frame with the
   * wrong value and restart the scene when it corrected itself, which on a WebGL scene means
   * building the whole thing twice. There is no SSR pass to disagree with — the scene is
   * dynamic(ssr: false), so this only ever runs in a browser.
   */
  const [loop] = useState(
    () => typeof window !== 'undefined' && /[?&]loop=(1|true)/.test(window.location.search),
  )

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#2a1f16]">
      <Scene onTime={setT} loop={loop} />
      <Wording t={t} content={content} />
      <Music />
    </div>
  )
}

/**
 * The score, lifted off the reference film's own audio track so the card sounds like the
 * thing it was drawn for.
 *
 * Browsers refuse to start audio without a gesture, and rightly - a page that plays music
 * at you unannounced is a page people close. So this asks once, quietly, and if the
 * browser says no it waits: the first pointer or key event anywhere on the page starts it,
 * which is a gesture by any definition. The button is always there either way, so someone
 * who wants silence has somewhere to click that is not the back arrow.
 *
 * `preload="auto"` is deliberate at 157 KB - the whole point is that it starts with the
 * animation rather than a second into it. It only ever loads on this route.
 */
function Music() {
  const el = useRef<HTMLAudioElement>(null)
  const cleanup = useRef<(() => void) | null>(null)
  const [on, setOn] = useState(false)

  const start = useCallback(async () => {
    const a = el.current
    if (!a) return false
    try {
      await a.play()
      setOn(true)
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (await start()) return
      if (cancelled) return
      // Blocked. Wait for any gesture, then try once more and stop listening.
      const go = () => {
        void start()
        off()
      }
      const off = () => {
        document.removeEventListener('pointerdown', go)
        document.removeEventListener('keydown', go)
      }
      document.addEventListener('pointerdown', go, { once: true })
      document.addEventListener('keydown', go, { once: true })
      cleanup.current = off
    })()

    return () => {
      cancelled = true
      cleanup.current?.()
    }
  }, [start])

  function toggle() {
    const a = el.current
    if (!a) return
    if (a.paused) void start()
    else {
      a.pause()
      setOn(false)
    }
  }

  return (
    <>
      <audio ref={el} src="/inv/music.mp3" loop preload="auto" />

      {/* Only shown while the music is not playing - which, on a browser that blocked
          autoplay, is the difference between a page with a silent icon in the corner and
          a page someone knows has a soundtrack. It disappears the moment it starts. */}
      {!on && (
        <span className="pointer-events-none absolute top-4 right-16 z-10 rounded-full bg-[#2a1f16]/70 px-3 py-2 text-xs text-white/85 backdrop-blur-sm">
          Tap for music
        </span>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label={on ? 'Turn the music off' : 'Turn the music on'}
        aria-pressed={on}
        className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#2a1f16]/70 text-white/90 backdrop-blur-sm transition-colors hover:bg-[#2a1f16] hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          {on ? (
            <path
              d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M16.5 9.5l5 5m0-5l-5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>
    </>
  )
}

/**
 * The wording, written on one line at a time.
 *
 * Each line is wiped in left to right with `clip-path: inset()` rather than faded. A fade
 * puts the whole line there at once at low opacity, which reads as a slide appearing; a
 * wipe reads as something being written, which is what an invitation should look like
 * arriving. Sizes are `vh` because the card is framed to height - tie them to width and
 * the type drifts off the leaf the moment the window stops being portrait.
 *
 * Every line is real text in document order, so a screen reader gets the invitation in the
 * order it is meant to be read, and the clip is purely visual.
 */
/**
 * The Ganesha comes first and leaves before the wording starts - invoked, then out of the
 * way. Overlapping the two would put a large gold motif behind the first lines, which is
 * exactly where the eye needs to be.
 */
const GANESHA = { in: 6.0, hold: 2.4, out: 0.8 }
const START = GANESHA.in + GANESHA.hold + GANESHA.out + 0.3
const GAP = 0.34
const WIPE = 0.55

function Wording({ t, content }: { t: number; content: InvitationCardContent }) {
  const lines = linesFor(content)

  // In, hold, out - a single value so the motif never sits behind the wording.
  const gIn = clamp01((t - GANESHA.in) / 1.1)
  const gOut = clamp01((t - (GANESHA.in + GANESHA.hold)) / GANESHA.out)
  const ganesha = gIn * (1 - gOut)

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no next/image */}
      <img
        src="/inv/ganesha.webp"
        alt=""
        aria-hidden="true"
        width={400}
        height={400}
        className="absolute h-[26vh] w-auto"
        style={{
          opacity: ganesha,
          // Rises a little on the way in and settles - it should arrive, not switch on.
          transform: `translateY(${(1 - gIn) * 3}vh) scale(${0.94 + gIn * 0.06})`,
          marginTop: '-14vh',
          visibility: ganesha > 0.002 ? 'visible' : 'hidden',
        }}
      />

      <div className="w-[min(46vh,20rem)] text-center text-[#3a2f24]" style={{ marginTop: '2vh' }}>
        {lines.map((line, i) => {
          const p = clamp01((t - (START + i * GAP)) / WIPE)
          return (
            <p
              key={line.t}
              {...(line.hidden ? { 'aria-hidden': 'true' as const } : {})}
              className={line.cls ?? 'text-[1.55vh] leading-[1.9]'}
              style={{
                marginTop: line.gap ? `${line.gap}vh` : undefined,
                // The line is fully opaque from the first frame it is visible at all -
                // the reveal is the clip, not the alpha, or it looks like it is fading in
                // through the paper.
                clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
                opacity: p > 0 ? 1 : 0,
              }}
            >
              {line.t}
            </p>
          )
        })}
      </div>
    </div>
  )
}

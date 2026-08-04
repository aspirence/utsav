'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Wedding invitations: illustration left, the argument right.
 *
 * THE PLAYER. The button opens the film centred on screen, inside a phone mockup - the
 * source is a YouTube Short, which is shot 9:16 for a phone, so showing it in a 16:9 box
 * would letterbox it into a stripe down the middle of a black rectangle. The frame is the
 * honest presentation of the material, not decoration.
 *
 * A native <dialog> does the centring, the backdrop, Escape-to-close, the focus trap and
 * making the page behind inert - all of which a div with a z-index has to reimplement, and
 * usually gets wrong. The only thing it needs help with is `m-auto`, because Tailwind's
 * preflight resets the margin the UA stylesheet uses to centre it.
 *
 * The iframe is mounted only while the dialog is open. That matters twice: nothing is
 * requested from YouTube until someone asks for the video, so the page costs nothing to
 * people who scroll past; and unmounting on close is what actually stops playback, since
 * there is no way to pause a cross-origin iframe from here.
 *
 * youtube-nocookie.com rather than youtube.com - it is the same player without the
 * tracking cookie on first load.
 *
 * The stat is a service promise, not a track record. Fremmo has no years of history to
 * claim yet, and plan §2 stakes the product on claims being verifiable, so a "15+ years"
 * badge here would undercut the thing that makes the reviews worth reading.
 *
 * Artwork is a placeholder until it is supplied - pass `imageUrl`.
 */

const VIDEO_ID = 'izdaynHU4w0'
const EMBED = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&playsinline=1&rel=0&modestbranding=1`

export function InvitationFeature({ imageUrl }: { imageUrl?: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  /*
    The mockup is only worth drawing on a desktop. On anything handheld the device *is*
    the frame, and a picture of a phone inside a phone spends most of the screen on bezel.

    The threshold is 1024px, not 640. At 640 a large phone in landscape and every tablet
    got the mockup, which is exactly where it is least wanted - the video ends up a
    postage stamp in the middle of a drawing of a handset. Below `lg` the player goes edge
    to edge.

    Defaults to framed because the server has no viewport to measure. The dialog is closed
    at that point, so the correction on mount is never visible.
  */
  const [framed, setFramed] = useState(true)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)')
    const read = () => setFramed(m.matches)
    read()
    m.addEventListener('change', read)
    return () => m.removeEventListener('change', read)
  }, [])

  // `close` fires for every route out of the dialog - Escape, the backdrop, the button -
  // so this is the one place that has to unmount the iframe.
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    const onClose = () => setOpen(false)
    el.addEventListener('close', onClose)
    return () => el.removeEventListener('close', onClose)
  }, [])

  const openPlayer = useCallback(() => {
    setOpen(true)
    dialog.current?.showModal()
  }, [])

  const player = open ? (
    <iframe
      src={EMBED}
      title="How an invitation is made"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      className="h-full w-full border-0"
    />
  ) : null

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      {/*
        ── Left: the illustration ──────────────────────────────────────

        A three.js version of the reference film briefly lived here - doors on hinges, a
        camera push, the card rising through the arch. The mechanics worked; the surfaces
        did not. Every texture was generated with Canvas2D, and procedural ornament next to
        hand-drawn Mughal illustration reads as flat blocks of colour, which is worse than
        the still it replaced. It is at commit fb990eb if it is ever worth revisiting with
        real texture artwork behind it.

        object-contain, not cover. The artwork is a transparent-background illustration
        trimmed to its alpha bounding box, so it has no bleed to crop into - cover would
        slice the edges off it. It sits on the page background rather than in a card for
        the same reason.

        The source is only 500px square, which is smaller than the slot renders at on a
        desktop, so it is drawn a little above 1:1. Fine for flat illustration; if it ever
        looks soft, the fix is a larger export, not a CSS change.
      */}
      <div className="relative h-[360px] sm:h-[480px] lg:h-[600px]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- plan §12: Storage CDN
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="u-media-fallback h-full w-full rounded-2xl" aria-hidden="true" />
        )}
      </div>

      {/* ── Right: the copy ────────────────────────────────────────────── */}
      <div>
        <h2 className="text-ink-900 text-3xl leading-[1.15] sm:text-4xl lg:text-5xl">
          The invitation is the first thing anyone sees of your wedding
        </h2>

        <p className="text-ink-700 mt-6 leading-relaxed">
          Before the mandap, before the menu, before a single guest arrives — there is a card in
          someone&rsquo;s hands. It sets the colour, the formality and the feeling of everything
          that follows, and it is the one part of the wedding every single person on your list will
          actually hold.
        </p>

        <p className="text-ink-700 mt-4 leading-relaxed">
          Screen-printed and foiled cards, hand-painted Awadhi motifs, matching e-invites for the
          cousins abroad, and the whole set proofed before anything goes to press. Tell us the
          tradition and the date, and we will find the designers who have set that script before.
        </p>

        <div className="border-ink-200 mt-10 border-t pt-8">
          <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
            <div>
              <p className="font-display text-ink-900 text-4xl leading-none">48 hrs</p>
              <p className="text-ink-600 mt-2 text-sm leading-snug">
                First proofs
                <br />
                back in your inbox
              </p>
            </div>

            <button
              type="button"
              onClick={openPlayer}
              className="group focus-visible:outline-primary-600 flex items-center gap-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <span className="border-ink-300 text-ink-900 group-hover:border-ink-900 group-hover:bg-ink-900 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border transition-colors group-hover:text-white">
                <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span>
                <span className="font-display text-ink-900 block text-xl">Watch how</span>
                <span className="text-ink-600 mt-0.5 block text-sm">
                  From first sketch to the printed card
                </span>
              </span>
            </button>
          </div>

          {/* Its own route, not embedded here. The invitation is a full-screen piece with
              a WebGL renderer behind it - opening it on demand keeps three.js off this
              page entirely (plan §13). */}
          <Link
            href="/invitation"
            className="border-ink-300 text-ink-900 hover:border-ink-900 mt-8 inline-flex items-center gap-2 border-b pb-1 text-sm font-semibold transition-colors"
          >
            Open a live invitation
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>

      {/*
        m-auto: <dialog> centres itself with `margin: auto` in the UA stylesheet, and
        Tailwind's preflight zeroes that out. Without it the modal pins to the top.

        overflow-hidden: the UA stylesheet also gives <dialog> `overflow: auto`, and the
        phone's ring plus its side buttons stick a few pixels outside the content box - so
        the dialog decided it had something to scroll and drew a scrollbar across the
        bottom of the handset. Nothing here can ever need scrolling; the frame is already
        capped to the viewport height.
      */}
      <dialog
        ref={dialog}
        className={
          'backdrop:bg-ink-950/80 overflow-hidden backdrop:backdrop-blur-sm ' +
          (framed
            ? 'm-auto bg-transparent p-0'
            : // Edge to edge.
              //
              // `fixed inset-0` rather than relying on the UA's own absolute placement -
              // a top-layer <dialog> is positioned by the browser and the rules vary, so
              // this states it outright.
              //
              // max-w/max-h-none override the UA stylesheet's `calc(100% - 6px - 2em)`
              // caps, which otherwise leave a hairline gutter down every edge.
              //
              // 100dvh, not 100vh: on a phone 100vh is the viewport with the address bar
              // hidden, so the bottom of the video sits under the browser chrome until
              // you scroll - and there is nothing to scroll.
              'bg-ink-950 fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none p-0')
        }
        aria-label="How an invitation is made"
      >
        {framed ? (
          // px-1: the side buttons sit 3px outside the handset, so the wrapper leaves
          // them room rather than letting overflow-hidden shave them off.
          <div className="flex flex-col items-center gap-4 px-1">
            <PhoneFrame>{player}</PhoneFrame>

            <form method="dialog">
              <button className="bg-surface-raised text-ink-900 rounded-full px-5 py-2 text-sm font-medium hover:bg-white">
                Close
              </button>
            </form>
          </div>
        ) : (
          <div className="relative h-full w-full">
            {player}

            {/* Floated over the player rather than below it - there is no "below" when
                the video owns the whole screen. */}
            <form method="dialog" className="absolute top-3 right-3">
              <button
                aria-label="Close video"
                className="bg-ink-950/60 flex h-10 w-10 items-center justify-center rounded-full text-lg text-white backdrop-blur-sm"
              >
                &times;
              </button>
            </form>
          </div>
        )}
      </dialog>
    </div>
  )
}

/**
 * A phone, drawn in CSS.
 *
 * Sized off the viewport height rather than a fixed pixel height, so the whole handset
 * plus the close button still fit on a laptop in a short window - a mockup that needs
 * scrolling defeats the point of centring it. Width follows from the 9:19.5 aspect, which
 * is roughly a current phone.
 *
 * The notch is drawn over the screen and marked aria-hidden; it is scenery, and a screen
 * reader announcing it would be noise between the dialog label and the player.
 */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {/* Body: the dark bezel. */}
      <div className="bg-ink-950 relative aspect-[9/19.5] h-[min(76vh,680px)] rounded-[2.5rem] p-2.5 shadow-[0_28px_60px_-24px_rgba(24,17,12,0.5)] ring-1 ring-white/15">
        {/* Screen. */}
        <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-black">
          {children}
        </div>

        {/* Notch. */}
        <div
          aria-hidden="true"
          className="bg-ink-950 absolute top-2.5 left-1/2 h-6 w-24 -translate-x-1/2 rounded-b-2xl"
        />
      </div>

      {/* Side buttons. */}
      <span
        aria-hidden="true"
        className="bg-ink-800 absolute top-[22%] -left-[3px] h-10 w-[3px] rounded-l"
      />
      <span
        aria-hidden="true"
        className="bg-ink-800 absolute top-[33%] -left-[3px] h-16 w-[3px] rounded-l"
      />
      <span
        aria-hidden="true"
        className="bg-ink-800 absolute top-[28%] -right-[3px] h-20 w-[3px] rounded-r"
      />
    </div>
  )
}

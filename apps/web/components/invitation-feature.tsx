'use client'

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
 * The stat is a service promise, not a track record. Utsava has no years of history to
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

  // The mockup is only worth drawing on a desktop. On a phone the device *is* the frame,
  // and a picture of a phone inside a phone wastes most of the screen showing bezel - so
  // below `sm` the player goes edge to edge instead.
  //
  // Defaults to the framed version because the server has no viewport to measure; the
  // dialog is closed at that point, so the correction on mount is never visible.
  const [framed, setFramed] = useState(true)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 640px)')
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
        <h2 className="text-3xl leading-[1.15] text-ink-900 sm:text-4xl lg:text-5xl">
          The invitation is the first thing anyone sees of your wedding
        </h2>

        <p className="mt-6 leading-relaxed text-ink-700">
          Before the mandap, before the menu, before a single guest arrives — there is a
          card in someone&rsquo;s hands. It sets the colour, the formality and the feeling
          of everything that follows, and it is the one part of the wedding every single
          person on your list will actually hold.
        </p>

        <p className="mt-4 leading-relaxed text-ink-700">
          Screen-printed and foiled cards, hand-painted Awadhi motifs, matching e-invites
          for the cousins abroad, and the whole set proofed before anything goes to press.
          Tell us the tradition and the date, and we will find the designers who have set
          that script before.
        </p>

        <div className="mt-10 border-t border-ink-200 pt-8">
          <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
            <div>
              <p className="font-display text-4xl leading-none text-ink-900">48 hrs</p>
              <p className="mt-2 text-sm leading-snug text-ink-600">
                First proofs
                <br />
                back in your inbox
              </p>
            </div>

            <button
              type="button"
              onClick={openPlayer}
              className="group flex items-center gap-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-ink-300 text-ink-900 transition-colors group-hover:border-ink-900 group-hover:bg-ink-900 group-hover:text-white">
                <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span>
                <span className="block font-display text-xl text-ink-900">Watch how</span>
                <span className="mt-0.5 block text-sm text-ink-600">
                  From first sketch to the printed card
                </span>
              </span>
            </button>
          </div>
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
          'overflow-hidden backdrop:bg-ink-950/80 backdrop:backdrop-blur-sm ' +
          (framed
            ? 'm-auto bg-transparent p-0'
            : // Edge to edge. max-w/max-h-none override the UA stylesheet's
              // `calc(100% - 6px - 2em)` caps, which otherwise leave a hairline gutter.
              'm-0 h-[100dvh] max-h-none w-screen max-w-none bg-ink-950 p-0')
        }
        aria-label="How an invitation is made"
      >
        {framed ? (
          // px-1: the side buttons sit 3px outside the handset, so the wrapper leaves
          // them room rather than letting overflow-hidden shave them off.
          <div className="flex flex-col items-center gap-4 px-1">
            <PhoneFrame>{player}</PhoneFrame>

            <form method="dialog">
              <button className="rounded-full bg-surface-raised px-5 py-2 text-sm font-medium text-ink-900 hover:bg-white">
                Close
              </button>
            </form>
          </div>
        ) : (
          <div className="relative h-full w-full">
            {player}

            {/* Floated over the player rather than below it - there is no "below" when
                the video owns the whole screen. */}
            <form method="dialog" className="absolute right-3 top-3">
              <button
                aria-label="Close video"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-950/60 text-lg text-white backdrop-blur-sm"
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
      <div className="relative h-[min(76vh,680px)] aspect-[9/19.5] rounded-[2.5rem] bg-ink-950 p-2.5 shadow-2xl ring-1 ring-white/15">
        {/* Screen. */}
        <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-black">
          {children}
        </div>

        {/* Notch. */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-2.5 h-6 w-24 -translate-x-1/2 rounded-b-2xl bg-ink-950"
        />
      </div>

      {/* Side buttons. */}
      <span
        aria-hidden="true"
        className="absolute -left-[3px] top-[22%] h-10 w-[3px] rounded-l bg-ink-800"
      />
      <span
        aria-hidden="true"
        className="absolute -left-[3px] top-[33%] h-16 w-[3px] rounded-l bg-ink-800"
      />
      <span
        aria-hidden="true"
        className="absolute -right-[3px] top-[28%] h-20 w-[3px] rounded-r bg-ink-800"
      />
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { formatPaise } from '@utsava/db'

/**
 * Curated Collections — a row of phones, each playing its own invitation.
 *
 * A client component, and the reasons are all real state: the previews only play while they
 * are on screen, the price card flips under the cursor, and the row pages left and right.
 *
 * ── Why the videos are lazy ──────────────────────────────────────────────────
 * Five autoplaying videos above the fold is a broken page, not a rich one. Plan §13 sets an
 * LCP gate and §12 makes media cost an explicit worry at SEO scale, so:
 *
 *   · `preload="none"` — nothing downloads until we ask
 *   · an IntersectionObserver plays what is visible and pauses what is not
 *   · the poster shows until the first frame is decoded, so there is no empty rectangle
 *   · iframe embeds only get a `src` once seen — an iframe with a src is a page load, and five
 *     YouTube players cost more than the rest of the home page put together
 *
 * ── Why the price flips rather than a button appearing ───────────────────────
 * A button that materialises on hover cannot be reached on a touchscreen, where there is no
 * hover at all. This flips one face to the other with a CSS transform, and both faces stay in
 * the layout — so on a phone the "Order now" face is simply always the second thing, reachable
 * by tapping the card. Nothing is hover-only.
 */

export interface TemplateCard {
  slug: string
  name: string
  tags: string[]
  pricePaise: number
  posterUrl: string | null
  orderUrl: string | null
  demoUrl: string | null
  /** 'video' → a direct file, 'embed' → an iframe, 'none' → poster only. */
  preview: 'video' | 'embed' | 'none'
  videoUrl: string | null
  embedUrl: string | null
}

export function TemplateCollections({ items }: { items: TemplateCard[] }) {
  const track = useRef<HTMLDivElement>(null)

  /**
   * Paging by measuring a real card rather than assuming a width.
   *
   * The row is a scroll-snap list, so "next page" is "scroll by one card plus its gap". Reading
   * that from the first child means the arrows keep working at every breakpoint without a
   * second copy of the responsive widths living in JavaScript.
   */
  const page = (dir: -1 | 1) => {
    const el = track.current
    if (!el) return
    const card = el.firstElementChild as HTMLElement | null
    const step = card ? card.offsetWidth + 24 : el.clientWidth * 0.8
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  if (items.length === 0) return null

  return (
    <div className="relative">
      <div
        ref={track}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth px-1 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <TemplateFigure key={item.slug} item={item} />
        ))}
      </div>

      {/* Arrows sit outside the phones on a wide screen and are hidden on a phone, where the
          row is swiped. Rendering them on touch would put two controls on one gesture. */}
      <button
        type="button"
        onClick={() => page(-1)}
        aria-label="Previous templates"
        className="absolute -left-3 top-[38%] hidden h-11 w-11 items-center justify-center rounded-full bg-white text-ink-800 shadow-lg ring-1 ring-ink-200/70 transition-colors hover:text-ink-950 sm:flex"
      >
        <span aria-hidden="true">&#8249;</span>
      </button>
      <button
        type="button"
        onClick={() => page(1)}
        aria-label="More templates"
        className="absolute -right-3 top-[38%] hidden h-11 w-11 items-center justify-center rounded-full bg-white text-ink-800 shadow-lg ring-1 ring-ink-200/70 transition-colors hover:text-ink-950 sm:flex"
      >
        <span aria-hidden="true">&#8250;</span>
      </button>
    </div>
  )
}

function TemplateFigure({ item }: { item: TemplateCard }) {
  return (
    <figure className="group w-[232px] shrink-0 snap-start sm:w-[248px]">
      <Phone item={item} />

      <figcaption className="mt-5 text-center">
        {item.tags.length > 0 && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-700/80">
            {/* A middot separator as its own element, so a screen reader reads the tags as a
                list rather than as one hyphenated word. */}
            {item.tags.map((tag, i) => (
              <span key={tag}>
                {i > 0 && <span aria-hidden="true"> &middot; </span>}
                {tag}
              </span>
            ))}
          </p>
        )}

        <h3 className="mt-2 font-display text-xl leading-snug text-ink-900">{item.name}</h3>

        <PriceFlip item={item} />
      </figcaption>
    </figure>
  )
}

/**
 * The price, which turns into the order button.
 *
 * Both faces are absolutely positioned inside a fixed-height box so the flip cannot change the
 * card's height — a row of five cards that each grow 8px on hover is a row that reflows under
 * the cursor.
 *
 * `group-hover` AND `group-focus-within`: the second is what makes this keyboard-reachable.
 * Tab to the link and the face it lives on is showing, which a hover-only rule would not do.
 */
function PriceFlip({ item }: { item: TemplateCard }) {
  const href = item.orderUrl ?? `/enquire?template=${encodeURIComponent(item.slug)}`

  return (
    <div className="relative mt-3 h-11 [perspective:800px]">
      <div className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] group-hover:[transform:rotateX(180deg)] group-focus-within:[transform:rotateX(180deg)]">
        {/* Front: the price. */}
        <p className="absolute inset-0 flex items-center justify-center text-lg tabular-nums text-ink-800 [backface-visibility:hidden]">
          {formatPaise(item.pricePaise)}
        </p>

        {/* Back: pre-rotated so it reads the right way up once the parent turns over. */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 [backface-visibility:hidden] [transform:rotateX(180deg)]">
          <Link
            href={href}
            className="inline-flex h-10 items-center rounded-full bg-primary-600 px-5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Order now
          </Link>
          {item.demoUrl && (
            <Link
              href={item.demoUrl}
              className="inline-flex h-10 items-center rounded-full border border-ink-300 px-4 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
            >
              Demo
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The phone. A rounded shell, a notch, and the preview clipped inside it.
 *
 * 9:19.5 rather than 9:16 — that is the aspect of the phones the invitations are actually
 * viewed on, and a 16:9-shaped "phone" reads as a tablet.
 */
function Phone({ item }: { item: TemplateCard }) {
  const { ref, seen } = useOnScreen<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className="relative mx-auto w-full overflow-hidden rounded-[2rem] bg-ink-950 p-[6px] shadow-[0_18px_40px_-16px_rgba(24,17,12,0.5)] ring-1 ring-ink-900/10 transition-transform duration-500 group-hover:-translate-y-1.5"
    >
      <div className="relative aspect-[9/19.5] overflow-hidden rounded-[1.7rem] bg-ink-900">
        <Preview item={item} active={seen} />

        {/* Notch. Inside the screen, above the media, so it reads as part of the device. */}
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-2 z-10 h-[18px] w-[74px] -translate-x-1/2 rounded-full bg-ink-950"
        >
          <span className="absolute right-3 top-1/2 block h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-ink-800" />
        </span>
      </div>
    </div>
  )
}

function Preview({ item, active }: { item: TemplateCard; active: boolean }) {
  const video = useRef<HTMLVideoElement>(null)

  /**
   * Play what is visible, pause what is not.
   *
   * `play()` returns a promise that rejects when the browser refuses — a tab in the background,
   * or a policy we tripped. The catch is required: an unhandled rejection here is a console
   * error on the home page for something the user cannot see.
   */
  useEffect(() => {
    const el = video.current
    if (!el) return
    if (active) void el.play().catch(() => {})
    else el.pause()
  }, [active])

  if (item.preview === 'video' && item.videoUrl) {
    return (
      <video
        ref={video}
        src={item.videoUrl}
        {...(item.posterUrl ? { poster: item.posterUrl } : {})}
        muted
        loop
        playsInline
        // No autoPlay attribute: the observer above decides. autoPlay would start every video
        // on mount, which is the thing preload="none" is there to prevent.
        preload="none"
        aria-label={`${item.name} preview`}
        className="h-full w-full object-cover"
      />
    )
  }

  if (item.preview === 'embed' && item.embedUrl) {
    // src only once seen. An iframe with a src is a full page load, and five of them at once
    // costs more than everything else on this page combined.
    return active ? (
      <iframe
        src={item.embedUrl}
        title={`${item.name} preview`}
        loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full border-0"
      />
    ) : (
      <Poster item={item} />
    )
  }

  return <Poster item={item} />
}

/**
 * Poster, or an honest empty state.
 *
 * A plain <img>: these are CDN or local files, and plan §12 routes media through
 * storageImageUrl rather than next/image. The empty state says what is missing instead of
 * showing a grey box, because the person most likely to see it is whoever has to fix it.
 */
function Poster({ item }: { item: TemplateCard }) {
  if (item.posterUrl) {
    return (
      <img
        src={item.posterUrl}
        alt={`${item.name} invitation preview`}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-4 text-center">
      <p className="text-xs leading-relaxed text-ink-400">
        No preview yet — add a video link in the console.
      </p>
    </div>
  )
}

/**
 * True once the element has been on screen, and while it stays there.
 *
 * `rootMargin` starts the video slightly before it arrives so it is already moving by the time
 * it is looked at. No IntersectionObserver (old Safari, some in-app webviews) reports visible
 * immediately — the degradation for a missing API should be a working page, not a blank one.
 */
function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setSeen(entry.isIntersecting)
      },
      { rootMargin: '200px', threshold: 0.15 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, seen }
}

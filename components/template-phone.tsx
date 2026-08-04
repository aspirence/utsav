'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/components/ui'

/**
 * A phone with an invitation running in it.
 *
 * Shared by the home-page slider and the product page so there is one implementation of the
 * lazy-play rules rather than two that drift. The product page renders one large phone; the
 * slider renders four small ones. Same component, different `className`.
 *
 * WHY THE PREVIEWS ARE LAZY. Six autoplaying videos above the fold is a broken page, not a rich
 * one — plan §13 sets an LCP gate and §12 makes media cost explicit. So `preload="none"`, no
 * `autoPlay` attribute, and an IntersectionObserver that plays what is on screen and pauses what
 * is not. Stills and GIFs are fetched only once the card has been seen, and then kept.
 *
 * A PREVIEW IS ALWAYS MEDIA — a video, an image or a GIF. It was once possible for it to be an
 * <iframe> around a live page, and that is gone: see the note on PreviewKind in
 * lib/invitation-templates.ts for what it looked like when a phone mockup framed our own header
 * and back button.
 */

export interface PhonePreview {
  name: string
  /** 'video' → a direct file, 'image' → a still or GIF, 'none' → poster only. */
  preview: 'video' | 'image' | 'none'
  videoUrl: string | null
  /** For 'image': a direct image/GIF, or a thumbnail derived from a link. */
  imageUrl: string | null
  posterUrl: string | null
}

export function TemplatePhone({
  item,
  className,
  showIsland = true,
  compact = false,
  eager = false,
}: {
  item: PhonePreview
  className?: string
  /** The Dynamic Island. Off only where the frame is too narrow to carry one legibly. */
  showIsland?: boolean
  /**
   * For frames around 120px wide or less.
   *
   * The corner radius has to scale with the frame or the proportions break: 2.1rem is 34px, which
   * is a reasonable 12% of a 280px phone and an absurd 37% of a 92px one — the small phone in the
   * booking page's sidebar was coming out as a rounded blob rather than a device. Padding thins
   * with it, because a 3px bezel on a 110px frame is proportionally three times too thick.
   */
  compact?: boolean
  /**
   * This phone is its page's LCP element, so its still is fetched with the document rather than
   * waited for.
   *
   * The lazy machinery exists so six previews do not all fetch at once, and the one the page is
   * measured on was never the problem it was written for: the hero image was rendering
   * `loading="lazy"` behind an IntersectionObserver that cannot fire until the client bundle
   * hydrates. Plan §13 gates launch on LCP, so the browser being told to deprioritise that one
   * element is the expensive default.
   *
   * IT DOES NOT TOUCH PLAY/PAUSE. Only the `mounted` latch and the loading hints. Forcing
   * `active` true as well would mean a video preview that never pauses when it scrolls away,
   * which is the opposite of what the observer is for. Exactly one phone per page should set this.
   */
  eager?: boolean
}) {
  const { ref, seen, everSeen } = useOnScreen<HTMLDivElement>()

  const r = compact
    ? {
        outer: 'rounded-[1.05rem]',
        mid: 'rounded-[0.95rem]',
        screen: 'rounded-[0.8rem]',
        pad: 'p-[1.5px]',
      }
    : {
        outer: 'rounded-[2.1rem]',
        mid: 'rounded-[1.95rem]',
        screen: 'rounded-[1.75rem]',
        pad: 'p-[3px]',
      }

  return (
    /*
     * An iPhone 17 Pro.
     *
     * `aspect-[1206/2622]` is the device's real pixel ratio — 6.3", 2622 × 1206 — rather than a
     * rounded 9:19.5. It works out at 1:2.174, so the frame's height follows from whatever width
     * the caller gives it and the proportions are right at any size.
     *
     * The two rings are the two edges a Pro actually has: an outer aluminium band and the inner
     * black bezel the glass sits in. One ring reads as a flat rectangle with a border.
     */
    <div
      ref={ref}
      /*
       * cn(), not string concatenation.
       *
       * THIS WAS BROKEN AND IT WAS INVISIBLE. The shadow ternary and the caller's `className`
       * were joined with `+` and no separator, so the two welded into one class:
       *
       *     shadow-[0_16px_34px_-14px_rgba(24,17,12,0.45)]mx-auto
       *
       * which matches nothing. Both halves were lost — every phone on the site rendered with no
       * drop shadow, and TemplateGrid's `mx-auto` never applied, so each phone sat flush against
       * the left edge of its cell while the name and price under it were centred. The cards read
       * as subtly crooked and nothing in the markup said why.
       *
       * cn() is clsx + twMerge: it joins with spaces and it resolves genuine conflicts by letting
       * the caller win. Concatenation cannot do either, and this is the second time in this
       * codebase that a `+` between two class strings has silently deleted both.
       */
      className={cn(
        'relative from-ink-700 via-ink-900 to-ink-800 bg-gradient-to-b',
        r.outer,
        r.pad,
        compact
          ? 'shadow-[0_6px_16px_-8px_rgba(24,17,12,0.4)]'
          : 'shadow-[0_16px_34px_-14px_rgba(24,17,12,0.45)]',
        className,
      )}
    >
      <div className={`relative overflow-hidden ${r.mid} ${r.pad} bg-ink-950`}>
        <div className={`relative aspect-[1206/2622] overflow-hidden ${r.screen} bg-ink-900`}>
          <Preview item={item} active={seen} mounted={everSeen || eager} eager={eager} />

          {showIsland && (
            /*
             * The Dynamic Island, not a notch. A notch is what a 14-and-earlier iPhone has; on a
             * 17 Pro it is a free-floating pill below the top edge, which is why this is inset
             * rather than clipped into the bezel.
             */
            <span
              aria-hidden="true"
              className="absolute top-[1.6%] left-1/2 z-10 h-[3.1%] w-[30%] -translate-x-1/2 rounded-full bg-black"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Preview({
  item,
  active,
  mounted,
  eager = false,
}: {
  item: PhonePreview
  /** On screen right now. Drives play/pause. */
  active: boolean
  /** Has been on screen at least once. Latched, so media is fetched once and then kept. */
  mounted: boolean
  /** The LCP still — fetch it with the document instead of deferring it. */
  eager?: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)

  /**
   * Play what is visible, pause what is not.
   *
   * play() returns a promise that rejects when the browser refuses — a backgrounded tab, or a
   * policy we tripped. The catch is required: an unhandled rejection here is a console error on
   * the home page for something nobody can see.
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
        preload="none"
        aria-label={`${item.name} preview`}
        className="h-full w-full object-cover"
      />
    )
  }

  /*
   * A still or a GIF.
   *
   * `mounted` rather than `active`, so it is fetched once when the card first comes into view
   * and then left alone — the same latch the video path relies on. An <img> that unmounted every
   * time the row scrolled off would re-request on every pass; a GIF would also restart from
   * frame one, which looks like a stutter rather than a loop.
   *
   * Native `loading="lazy"` is not enough on its own here: it defers the fetch but the element
   * still mounts, and the latch is what keeps the decode from being thrown away and redone.
   */
  if (item.preview === 'image' && item.imageUrl) {
    return mounted ? (
      <img
        src={item.imageUrl}
        alt={`${item.name} invitation preview`}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
        className="h-full w-full object-cover"
      />
    ) : (
      <Poster item={item} eager={eager} />
    )
  }

  return <Poster item={item} eager={eager} />
}

/**
 * Poster, or an honest empty state.
 *
 * A plain <img>: these are CDN or local files, and plan §12 routes media through
 * storageImageUrl rather than next/image. The empty state names what is missing instead of
 * showing a grey box, because the person most likely to see it is whoever has to fix it.
 */
function Poster({ item, eager = false }: { item: PhonePreview; eager?: boolean }) {
  if (item.posterUrl) {
    return (
      <img
        src={item.posterUrl}
        alt={`${item.name} invitation preview`}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
        className="h-full w-full object-cover"
      />
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-4 text-center">
      <p className="text-ink-400 text-xs leading-relaxed">
        No preview yet — add a video, image or GIF link in the console.
      </p>
    </div>
  )
}

/**
 * True while the element is on screen.
 *
 * rootMargin starts the video slightly before it arrives so it is already moving by the time it
 * is looked at. No IntersectionObserver (old Safari, some in-app webviews) reports visible
 * immediately — the degradation for a missing API should be a working page, not a blank one.
 */
function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  const [everSeen, setEverSeen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      setEverSeen(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setSeen(entry.isIntersecting)
          if (entry.isIntersecting) setEverSeen(true)
        }
      },
      { rootMargin: '200px', threshold: 0.1 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, seen, everSeen }
}

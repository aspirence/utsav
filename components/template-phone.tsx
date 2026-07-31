'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A phone with an invitation running in it.
 *
 * Shared by the home-page slider and the product page so there is one implementation of the
 * lazy-play rules rather than two that drift. The product page renders one large phone; the
 * slider renders four small ones. Same component, different `className`.
 *
 * WHY THE PREVIEWS ARE LAZY. Four autoplaying videos above the fold is a broken page, not a
 * rich one — plan §13 sets an LCP gate and §12 makes media cost explicit. So `preload="none"`,
 * no `autoPlay` attribute, and an IntersectionObserver that plays what is on screen and pauses
 * what is not. Iframes get a `src` only once seen: an iframe with a src is a full page load,
 * and four YouTube players cost more than the rest of the home page together.
 */

export interface PhonePreview {
  name: string
  /** 'video' → a direct file, 'embed' → an iframe, 'none' → poster only. */
  preview: 'video' | 'embed' | 'none'
  videoUrl: string | null
  embedUrl: string | null
  posterUrl: string | null
}

export function TemplatePhone({
  item,
  className,
  showIsland = true,
  compact = false,
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
}) {
  const { ref, seen } = useOnScreen<HTMLDivElement>()

  const r = compact
    ? { outer: 'rounded-[1.05rem]', mid: 'rounded-[0.95rem]', screen: 'rounded-[0.8rem]', pad: 'p-[1.5px]' }
    : { outer: 'rounded-[2.1rem]', mid: 'rounded-[1.95rem]', screen: 'rounded-[1.75rem]', pad: 'p-[3px]' }

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
      className={
        `relative ${r.outer} ${r.pad} bg-gradient-to-b from-ink-700 via-ink-900 to-ink-800 ` +
        (compact
          ? 'shadow-[0_6px_16px_-8px_rgba(24,17,12,0.4)] '
          : 'shadow-[0_16px_34px_-14px_rgba(24,17,12,0.45)] ') +
        (className ?? '')
      }
    >
      <div className={`relative overflow-hidden ${r.mid} ${r.pad} bg-ink-950`}>
        <div
          className={`relative aspect-[1206/2622] overflow-hidden ${r.screen} bg-ink-900`}
        >
          <Preview item={item} active={seen} />

          {showIsland && (
            /*
             * The Dynamic Island, not a notch. A notch is what a 14-and-earlier iPhone has; on a
             * 17 Pro it is a free-floating pill below the top edge, which is why this is inset
             * rather than clipped into the bezel.
             */
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-[1.6%] z-10 h-[3.1%] w-[30%] -translate-x-1/2 rounded-full bg-black"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Preview({ item, active }: { item: PhonePreview; active: boolean }) {
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

  if (item.preview === 'embed' && item.embedUrl) {
    return active ? (
      <EmbedPreview name={item.name} url={item.embedUrl} />
    ) : (
      <Poster item={item} />
    )
  }

  return <Poster item={item} />
}

/**
 * An embedded page in the phone.
 *
 * OUR OWN PAGES ARE ASKED TO LOOP, with ?loop=1 appended. The invitation honours it by
 * replaying its film from the top; a page that does not understand the parameter ignores an
 * unknown query string, which is the right outcome for anything else we might embed here.
 *
 * AN EARLIER VERSION LOOPED BY REMOUNTING THIS IFRAME ON A TIMER, and it was wrong twice
 * over. It reloaded the page rather than replaying the animation — a fresh document, a fresh
 * WebGL context, a visible blank. And the interval was nine seconds, taken from the opening
 * phase table in invitation-3d/scene.tsx, against a film whose DUR is 17.5: it cut the thing
 * off before half of it had played and the wording was never reached at all. A loop belongs
 * where the clock is, which is inside the page.
 *
 * YouTube and Vimeo embeds are left exactly as they came. They already repeat through their
 * own URL parameters, and classifyPreview() has built those in.
 */
function EmbedPreview({ name, url }: { name: string; url: string }) {
  const isOwnPage = url.startsWith('/') && !url.startsWith('//')
  const src = isOwnPage ? `${url}${url.includes('?') ? '&' : '?'}loop=1` : url

  return (
    <iframe
      src={src}
      title={`${name} preview`}
      loading="lazy"
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      className="h-full w-full border-0"
    />
  )
}

/**
 * Poster, or an honest empty state.
 *
 * A plain <img>: these are CDN or local files, and plan §12 routes media through
 * storageImageUrl rather than next/image. The empty state names what is missing instead of
 * showing a grey box, because the person most likely to see it is whoever has to fix it.
 */
function Poster({ item }: { item: PhonePreview }) {
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
 * True while the element is on screen.
 *
 * rootMargin starts the video slightly before it arrives so it is already moving by the time it
 * is looked at. No IntersectionObserver (old Safari, some in-app webviews) reports visible
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
      { rootMargin: '200px', threshold: 0.1 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, seen }
}

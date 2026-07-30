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
  /** Off for the slider, where the notch would crowd a 232px-wide frame. */
  showNotch = true,
}: {
  item: PhonePreview
  className?: string
  showNotch?: boolean
}) {
  const { ref, seen } = useOnScreen<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className={
        'relative overflow-hidden rounded-[2rem] bg-ink-950 p-[5px] shadow-[0_18px_40px_-16px_rgba(24,17,12,0.5)] ring-1 ring-ink-900/10 ' +
        (className ?? '')
      }
    >
      {/* 9:19.5, the aspect of the phones invitations are actually read on. A 16:9 "phone"
          reads as a tablet. */}
      <div className="relative aspect-[9/19.5] overflow-hidden rounded-[1.75rem] bg-ink-900">
        <Preview item={item} active={seen} />

        {showNotch && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-2 z-10 h-[18px] w-[78px] -translate-x-1/2 rounded-full bg-ink-950"
          >
            <span className="absolute right-3 top-1/2 block h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-ink-800" />
          </span>
        )}
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

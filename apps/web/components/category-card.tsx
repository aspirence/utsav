import Link from 'next/link'

import { Badge } from '@utsava/ui'

/**
 * Horizontal category card: copy on the left, imagery on the right, separated by a
 * convex curve rather than a straight edge.
 *
 * The curve is three plain divs, not an SVG or a clip-path:
 *   · a panel that fills the left portion in surface-raised,
 *   · an oversized ellipse sitting on the boundary, same colour, taller than the card
 *     so only the middle of its arc is ever visible,
 *   · the image area behind both.
 *
 * That matters because it stays crisp at any size and reflows with the container — a
 * clip-path with fixed coordinates would break the moment the card changes height, and
 * plan §13 measures this page on a mid-range Android where the cards stack narrow.
 *
 * The image area is deliberately left empty. It carries the design system's warm
 * placeholder gradient so it reads as "a photograph belongs here" rather than as a
 * broken image; drop a real one in by passing `imageUrl`.
 */
export interface CategoryCardProps {
  href: string
  title: string
  description: string
  cta: string
  /** Small taxonomy hints, e.g. Candid · Traditional · Cinematic. */
  tags?: string[]
  badge?: string
  imageUrl?: string | null
  imageAlt?: string
}

export function CategoryCard({
  href,
  title,
  description,
  cta,
  tags = [],
  badge,
  imageUrl = null,
  imageAlt = '',
}: CategoryCardProps) {
  return (
    <article className="group relative min-h-[188px] overflow-hidden rounded-xl border border-ink-100 bg-surface-raised shadow-sm transition-shadow hover:shadow-lg">
      {/*
        Image area — fills the right, sits behind the white panel and its curve.

        The split is responsive: on a narrow phone the copy panel takes 68% because a
        four-line description inside 200px reads terribly, and the image is decoration
        here rather than information. It relaxes to 58/46 once there is room.
      */}
      <div className="absolute inset-y-0 right-0 w-[38%] overflow-hidden sm:w-[46%]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- plan §12: Storage CDN, not next/image
          <img
            src={imageUrl}
            alt={imageAlt}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="u-media-fallback h-full w-full" aria-hidden="true" />
        )}
      </div>

      {/* White panel + the ellipse that turns its right edge into a curve. Both are
          aria-hidden decoration; the ellipse is inset vertically beyond the card so its
          flat top and bottom never show. */}
      <div
        className="absolute inset-y-0 left-0 w-[68%] bg-surface-raised sm:w-[58%]"
        aria-hidden="true"
      />
      <div
        className="absolute -inset-y-10 left-[calc(68%-3.25rem)] w-[6.5rem] rounded-[50%] bg-surface-raised sm:left-[calc(58%-3.25rem)]"
        aria-hidden="true"
      />

      <div className="relative flex h-full min-h-[188px] w-[68%] flex-col justify-center p-5 sm:w-[58%] sm:p-6">
        <div className="flex items-start gap-2.5">
          <h3 className="font-display text-xl leading-tight text-ink-900 sm:text-2xl">
            {/* The whole card is the hit target — the pseudo-element stretches this
                anchor over it, so the curve and the image are clickable too. */}
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {title}
            </Link>
          </h3>
          {badge && (
            <Badge tone="primary" className="mt-1 shrink-0">
              {badge}
            </Badge>
          )}
        </div>

        <p className="mt-2 text-sm leading-relaxed text-ink-600">{description}</p>

        {tags.length > 0 && (
          <p className="mt-2 text-xs text-ink-500">{tags.slice(0, 4).join(' · ')}</p>
        )}

        <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 transition-colors group-hover:text-primary-800">
          {cta}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </span>
      </div>
    </article>
  )
}

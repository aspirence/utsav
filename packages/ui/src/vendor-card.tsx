/**
 * VendorCard — the unit of discovery. Plan §2 Must-tier: "portfolio-first vendor
 * profiles with style taxonomy … package cards normalised to per-day pricing".
 *
 * Three plan requirements are visible on this one card:
 *   · the cover photograph leads and everything else is secondary (§2 portfolio-first)
 *   · price bands and per-day normalisation are shown, not hidden behind an enquiry (§2)
 *   · the anchor studio carries a disclosure badge wherever it appears (§11/§12)
 */

import { cn } from './cn'
import { Badge, MediaFrame, Rating } from './primitives'

export interface VendorCardData {
  slug: string
  displayName: string
  localityName?: string | null
  cityName?: string | null
  coverUrl: string | null
  styleTags?: string[]
  ratingAvg?: number | null
  ratingCount?: number
  priceBandLabel?: string
  perDayLabel?: string | null
  isAnchorStudio?: boolean
  respondsInLabel?: string | null
  availableOnLabel?: string | null
}

export function VendorCard({
  vendor,
  href,
  priority,
  className,
}: {
  vendor: VendorCardData
  href: string
  priority?: boolean
  className?: string
}) {
  const {
    displayName,
    localityName,
    cityName,
    coverUrl,
    styleTags = [],
    ratingAvg,
    ratingCount,
    priceBandLabel,
    perDayLabel,
    isAnchorStudio,
    respondsInLabel,
    availableOnLabel,
  } = vendor

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl border border-ink-100 bg-surface-raised',
        'shadow-sm transition-shadow hover:shadow-lg',
        className,
      )}
    >
      <div className="relative">
        <MediaFrame
          src={coverUrl}
          alt={`Portfolio work by ${displayName}`}
          aspect="4/3"
          priority={priority}
          sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 92vw"
          className="rounded-none"
        />

        {/* Plan §2: "free on my date" is the filter customers actually use, so when it
            is applied the answer belongs on the card, not one click deeper. */}
        {availableOnLabel && (
          <span className="absolute left-3 top-3 rounded-full bg-success-600/95 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            {availableOnLabel}
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg leading-tight text-ink-900">
            <a href={href} className="after:absolute after:inset-0 after:content-['']">
              {displayName}
            </a>
          </h3>
          <Rating value={ratingAvg} count={ratingCount} size="sm" className="shrink-0 pt-0.5" />
        </div>

        {(localityName || cityName) && (
          <p className="mt-1 text-sm text-ink-500">
            {[localityName, cityName].filter(Boolean).join(', ')}
          </p>
        )}

        {styleTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {styleTags.slice(0, 3).map((tag) => (
              <Badge key={tag} tone="neutral" className="capitalize">
                {tag.replace(/-/g, ' ')}
              </Badge>
            ))}
            {styleTags.length > 3 && (
              <Badge tone="neutral">+{styleTags.length - 3}</Badge>
            )}
          </div>
        )}

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-ink-100 pt-3">
          <div>
            {priceBandLabel && (
              <p className="text-sm font-semibold text-ink-900">{priceBandLabel}</p>
            )}
            {/* Plan §2: the per-day figure is what makes two packages comparable. */}
            {perDayLabel && <p className="text-xs text-ink-500">{perDayLabel}</p>}
          </div>

          {respondsInLabel && (
            <span className="shrink-0 text-xs font-medium text-success-700">
              {respondsInLabel}
            </span>
          )}
        </div>

        {/* Plan §11/§12: the channel-conflict mitigation. Wherever the founder's studio
            appears, it says so — and links to the published policy. */}
        {isAnchorStudio && (
          <a
            href="/p/anchor-studio-policy"
            className="relative z-10 mt-3 flex items-center gap-1.5 text-xs text-ink-500 underline decoration-ink-300 underline-offset-2 hover:text-ink-700"
          >
            <svg className="h-3.5 w-3.5 fill-accent-500" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.9 12H9.1v-1.8h1.8V14zm0-3.2H9.1V6h1.8v4.8z" />
            </svg>
            Utsava-owned studio · ranked with no preference
          </a>
        )}
      </div>
    </article>
  )
}

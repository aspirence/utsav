import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/components/ui'

/**
 * The brand lockup: the aperture mark, then the name set in type.
 *
 * ── WHY THE NAME IS TEXT AND NOT PART OF THE IMAGE ───────────────────────────
 * The old asset was a single lockup — mark, "utsava" wordmark and a "celebrate every moment"
 * tagline, all baked into one webp. At the rebrand that made the file the one place the old name
 * survived every rename in the codebase: every `alt` said Fremmo while every pixel said Utsava.
 *
 * Splitting it means the name now lives in exactly one string, in this file. It also fixes three
 * things the image was quietly costing:
 *
 *   · It is selectable, searchable and translatable, and a screen reader gets it from the DOM
 *     rather than from an alt attribute that has to be kept in step by hand.
 *   · It stays sharp at every size. The lockup was 623×576 scaled down to 44px in the console
 *     rail, which is where its tagline turned into three grey smudges.
 *   · The name can be restyled — weight, tracking, colour — without a new asset.
 *
 * ── THE MARK IS DECORATIVE, DELIBERATELY ─────────────────────────────────────
 * `alt=""` and aria-hidden. The accessible name comes from the text beside it, so labelling the
 * image too would have every screen reader announce "Fremmo Fremmo" at the top of every page.
 * That is the standard failure of an icon-plus-wordmark lockup and it is entirely silent to
 * anyone not using one.
 *
 * ── THE MARK IS NOW DRAWN, NOT LOADED ───────────────────────────────────────
 * It used to be `<img src="/logo-mark.webp">` and dark surfaces knocked it white with
 * `[filter:brightness(0)_invert(1)]`, because a raster file cannot be recoloured any other way.
 * <BrandMark> is inline SVG, so the same job is a `mono` prop and an ordinary text colour — no
 * filter buffer, no second asset, and it stays sharp at the 20px favicon as well as the 96px
 * footer. The filter still works if a caller needs it: the header uses it because its knockout
 * is conditional on the transparent-hero state and a CSS variant is the only thing that can
 * switch on that.
 */
export function Brand({
  className,
  markClassName = 'h-8 w-auto',
  wordClassName = 'text-2xl',
  mono = false,
}: {
  className?: string
  /** Sizing for the mark. Callers on dark surfaces usually pass `mono` instead of a filter. */
  markClassName?: string
  /** Sizing for the name. Colour is inherited, so it follows the surface. */
  wordClassName?: string
  /**
   * Paint the mark in the inherited text colour rather than the marigold gradient. For dark
   * surfaces, where the whole lockup is one flat knockout.
   */
  mono?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark mono={mono} className={markClassName} />
      <span className={cn('font-display leading-none font-bold tracking-tight', wordClassName)}>
        Fremmo
      </span>
    </span>
  )
}

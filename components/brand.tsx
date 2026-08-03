import { cn } from '@/components/ui'

/**
 * The brand lockup: the lotus mark, then the name set in type.
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
 * The mark is gold on transparent, so on a dark surface callers invert it —
 * `[filter:brightness(0)_invert(1)]` — exactly as they did with the old lockup.
 */
export function Brand({
  className,
  markClassName = 'h-8 w-auto',
  wordClassName = 'text-2xl',
}: {
  className?: string
  /** Sizing and any filter for the lotus. Callers on dark surfaces pass the invert filter. */
  markClassName?: string
  /** Sizing for the name. Colour is inherited, so it follows the surface. */
  wordClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- plan §12: no next/image */}
      <img
        src="/logo-mark.webp"
        alt=""
        aria-hidden="true"
        width={193}
        height={144}
        className={cn('shrink-0', markClassName)}
      />
      <span className={cn('font-display font-bold leading-none tracking-tight', wordClassName)}>
        Fremmo
      </span>
    </span>
  )
}

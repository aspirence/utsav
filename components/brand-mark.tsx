import { cn } from '@/components/ui'

/**
 * The Fremmo mark: a six-blade camera iris whose blades are marigold petals.
 *
 * ── WHAT IT IS AND WHY IT IS THIS ────────────────────────────────────────────
 * The old mark was a line-drawn lotus inherited from Utsava. It said "Indian, tasteful,
 * ceremonial" and nothing else — the same lotus sits on a yoga studio, a spa and half the
 * wedding-planner logos in the country, and it said nothing about what this product does.
 *
 * This one is built on the actual geometry of a camera aperture, which is the one thing the
 * plan puts first (§11: photography-first). Six leading edges, each tangent to the circle of
 * the opening and rotated 60° apart, bound the hexagon of light in the middle; each blade is
 * what stays visible of the disc between its own edge and the previous blade's. That lean is
 * what makes an iris read as an iris rather than as a segmented ring.
 *
 * The outer edge of each blade is then bowed out to a soft point. That single change is what
 * makes it also read as a marigold — the flower on every mandap, gate and garland in the
 * country — so the mark says "photography" and "celebration" at once instead of picking one.
 * It is a genuine hexagonal rosette either way, which is the same family as a rangoli.
 *
 * ── WHY INLINE SVG AND NOT A FILE ────────────────────────────────────────────
 * The same three reasons <Brand> gives for setting the name in type rather than baking it into
 * artwork. It is sharp at 20px and at 512px from one source; it takes CSS, so a knockout is a
 * class and not a second asset; and there is no file to keep in step with the code.
 *
 * The old lotus was a 193×144 webp scaled to 32px in the console rail, which is where its
 * hairline strokes turned to mush. This has no strokes thinner than a whole blade, so it
 * survives the favicon — the size the lotus never survived.
 *
 * ── THE GRADIENT ID IS FIXED, ON PURPOSE ─────────────────────────────────────
 * A page can render two marks (header and footer), so the id appears twice and duplicate ids
 * are formally invalid. It is deliberate rather than overlooked: `useId()` needs a client
 * component, and a counter would not survive hydration. Because every definition is
 * byte-identical, the browser's first-definition-wins resolution produces exactly the right
 * paint from either copy — the duplicate is inert. Callers that would rather not carry it can
 * pass `mono`, which drops the <defs> entirely.
 */
const GRADIENT_ID = 'fremmo-mark-gradient'

export function BrandMark({
  className,
  mono = false,
}: {
  className?: string
  /**
   * Paint the mark in `currentColor` instead of the marigold-to-terracotta gradient, for dark
   * surfaces where the gradient would sink into the background. The caller sets the colour with
   * a normal text utility — `text-white` on ink-900 — so there is no filter and no second file.
   */
  mono?: boolean
}) {
  const paint = mono ? 'currentColor' : `url(#${GRADIENT_ID})`

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role="presentation"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      {!mono && (
        <defs>
          {/*
            Marigold at the top-left falling to terracotta at the bottom-right: accent-300 →
            accent-500 → primary-600, straight off the palette in components/ui/styles.css. It
            runs across the whole mark rather than per blade, so the blades read as one object
            catching one light rather than as six separately coloured shapes.
          */}
          <linearGradient
            id={GRADIENT_ID}
            x1="10"
            y1="4"
            x2="54"
            y2="60"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#f5c455" />
            <stop offset="0.45" stopColor="#de8a21" />
            <stop offset="1" stopColor="#b3402b" />
          </linearGradient>
        </defs>
      )}

      {/*
        Filled and stroked in the same paint, with a round join: the stroke is not an outline,
        it is how the blades get their soft corners. A 1.6 stroke grows each blade by 0.8 on
        every side, which the geometry already accounts for — the tips reach 30 of the 32 half-
        width, so the mark sits 1.2 inside its own box and never clips.
      */}
      <g fill={paint} stroke={paint} strokeWidth="1.6" strokeLinejoin="round">
        <path d="M 27.27 19 L 55.66 19 C 54.24 14.36 51.83 10.28 48.8 7.14 C 44.75 5.5 40.07 4.79 35.24 5.19 Z" />
        <path d="M 40.89 21.4 L 55.09 45.99 C 58.39 42.44 60.72 38.31 61.93 34.12 C 61.32 29.8 59.6 25.38 56.83 21.4 Z" />
        <path d="M 45.63 34.4 L 31.43 58.99 C 36.15 60.08 40.89 60.03 45.13 58.98 C 48.57 56.29 51.53 52.59 53.6 48.21 Z" />
        <path d="M 36.73 45 L 8.34 45 C 9.76 49.64 12.17 53.72 15.2 56.86 C 19.25 58.5 23.93 59.21 28.76 58.81 Z" />
        <path d="M 23.11 42.6 L 8.91 18.01 C 5.61 21.56 3.28 25.69 2.07 29.88 C 2.68 34.2 4.4 38.62 7.17 42.6 Z" />
        <path d="M 18.37 29.6 L 32.57 5.01 C 27.85 3.92 23.11 3.97 18.87 5.02 C 15.43 7.71 12.47 11.41 10.4 15.79 Z" />
      </g>
    </svg>
  )
}

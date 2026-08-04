import type { ReactNode } from 'react'

/**
 * Two charts, drawn as inline SVG.
 *
 * No charting library. Recharts or Chart.js is 50–150 KB to draw a bar chart, and the console
 * is behind an IP allowlist for a handful of staff - the whole page is smaller than the
 * library would be. Server Components too, so nothing hydrates.
 *
 * THE PALETTE WAS VALIDATED, NOT CHOSEN BY EYE. Run against the panel surface (#ffffff):
 *
 *   #3a7c37 routed · #d99b1c awaiting OTP · #dc3545 spam   → all checks pass
 *   worst adjacent CVD ΔE 14.6 (deutan), normal-vision 22.3
 *
 * With one warning: #d99b1c sits at 2.43:1 against white, under the 3:1 bar. The obligation
 * that comes with that is visible labels, and the share bar carries a direct label on every
 * segment plus a legend - so hue never carries meaning alone.
 *
 * The obvious fix - darken the amber - was tried and rejected by measurement: #a8730f clears
 * 3:1 but collapses to ΔE 3.1 against the red under deuteranopia. A colourblind reader could
 * not tell "awaiting OTP" from "spam", which is far worse than a contrast warning on a
 * labelled segment.
 *
 * Axis and tick ink is ink-500 (#736758, 5.51:1), not the lighter muted gray - 12px text
 * needs 4.5:1 and the lighter step measures 3.59.
 */

export interface Slice {
  label: string
  value: number
  /** Validated hex. See the note above before changing one. */
  color: string
}

/**
 * Part-to-whole, as a horizontal stacked bar.
 *
 * Not a donut, even though that is what a dashboard usually reaches for. Part-to-whole reads
 * off a stacked bar and does not off a ring: comparing two arcs means comparing angles, which
 * people do badly, and the labels have to go outside it with leader lines. Horizontal because
 * "Awaiting OTP" does not fit under a vertical segment.
 *
 * Segments are separated by a 2px surface-coloured gap rather than a stroke, so the boundary
 * reads at any size and no segment borrows a neighbour's colour.
 */
export function ShareBar({
  slices,
  total,
  caption,
}: {
  slices: Slice[]
  total: number
  caption?: string
}) {
  const sum = total || slices.reduce((a, s) => a + s.value, 0) || 1
  const shown = slices.filter((s) => s.value > 0)

  return (
    <div>
      <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-md" role="presentation">
        {shown.map((s) => {
          const pct = (s.value / sum) * 100
          return (
            <div
              key={s.label}
              className="flex items-center justify-center"
              style={{ width: `${pct}%`, backgroundColor: s.color }}
              // The bar is decorative; the table below it is the accessible reading.
              aria-hidden="true"
            >
              {/* Only labelled in place when the segment is wide enough to hold it. A number
                  clipped to "1" is worse than no number - the legend has it either way. */}
              {pct >= 12 && (
                <span className="px-1 text-xs font-semibold text-white tabular-nums">
                  {Math.round(pct)}%
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend doubles as the table view. Every row states its colour, its label and its
          number, so the chart is never the only way to read the data. */}
      <dl className="mt-4 space-y-2">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <dt className="text-ink-700">{s.label}</dt>
            <dd className="text-ink-900 ml-auto font-medium tabular-nums">{s.value}</dd>
            <dd className="text-ink-500 w-12 shrink-0 text-right tabular-nums">
              {Math.round((s.value / sum) * 100)}%
            </dd>
          </div>
        ))}
      </dl>

      {caption && <p className="text-ink-500 mt-3 text-xs leading-relaxed">{caption}</p>}
    </div>
  )
}

export interface Column {
  label: string
  value: number
}

/**
 * Magnitude over time, one series.
 *
 * No legend: the title names the series, and a legend box for one thing is noise. Sequential
 * colour - a single hue - because the job is magnitude, not identity.
 *
 * Bars are 4px-rounded at the data end only and square at the baseline, so the rounding never
 * reads as part of the value. The tallest bar is labelled and the rest are not: a number on
 * every bar competes with the shape that is doing the work.
 */
export function ColumnChart({
  data,
  hue = '#b3402b',
  height = 140,
}: {
  data: Column[]
  hue?: string
  height?: number
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]!)

  return (
    <div>
      <div
        className="flex items-end gap-2"
        style={{ height }}
        role="img"
        aria-label={`${data.length} periods, peak ${peak.value} in ${peak.label}`}
      >
        {data.map((d) => {
          const h = Math.max(2, (d.value / max) * 100)
          const isPeak = d.label === peak.label
          return (
            <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-1">
              {isPeak && (
                <span className="text-ink-800 text-xs font-semibold tabular-nums">{d.value}</span>
              )}
              <div
                className="w-full rounded-t"
                style={{
                  height: `${h}%`,
                  backgroundColor: hue,
                  // The lighter wash on non-peak bars is the same hue, not a second colour -
                  // emphasis, which is the right form when one bar is the point.
                  opacity: isPeak ? 1 : 0.55,
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Baseline, then ticks. A hairline rule rather than a drawn axis - the bars sit on it
          and that is all an axis has to do here. */}
      <div className="border-ink-200 mt-1.5 border-t" />
      <div className="mt-1.5 flex gap-2">
        {data.map((d) => (
          <span key={d.label} className="text-ink-500 flex-1 text-center text-[11px]">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * A KPI tile. Value, label, and optionally what it is against.
 *
 * A tile, not a one-bar chart - a single current number reads better as type than as a shape.
 * The delta is text plus an arrow, never colour alone.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'neutral' | 'good' | 'warning' | 'critical'
  icon?: ReactNode
}) {
  const ring = {
    neutral: 'border-ink-200',
    good: 'border-success-500/40',
    warning: 'border-warning-500/50',
    critical: 'border-danger-500/40',
  }[tone]

  const wash = {
    neutral: 'bg-ink-100 text-ink-600',
    good: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    critical: 'bg-danger-50 text-danger-700',
  }[tone]

  return (
    <div className={`rounded-lg border bg-white p-4 ${ring}`}>
      <div className="flex items-start gap-3">
        {icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${wash}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-ink-500 text-xs font-semibold tracking-[0.12em] uppercase">{label}</p>
          <p className="font-display text-ink-900 mt-1 text-2xl leading-none">
            {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
          </p>
          {hint && <p className="text-ink-500 mt-1.5 text-xs leading-snug">{hint}</p>}
        </div>
      </div>
    </div>
  )
}

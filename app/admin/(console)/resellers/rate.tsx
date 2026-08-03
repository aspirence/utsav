import { formatBps } from '@/lib/db'

/**
 * A commission rate, rendered.
 *
 * WHY THIS IS A FILE AND NOT THREE COPIES OF A ONE-LINER. Four screens show a rate — the index
 * table, the detail header, the ledger, and the two forms that edit one — and every place it is
 * shown has to say the same two things: the percentage a person thinks in, and the basis points
 * the database stores. Neither actions.ts (`'use server'`, every export must be an async action)
 * nor the form components (`'use client'`, a Server Component cannot call into one) can hold a
 * plain component, so it lives in its own module with no directive and both sides import it.
 *
 * THE PERCENTAGE ITSELF IS formatBps IN @/lib/db, not a helper here. The reseller portal at
 * app/(site)/reseller/dashboard renders the same rate and cannot import from an /admin route —
 * the console is a separate deploy (plan §3) — so a copy of the transform in this folder is a copy
 * that drifts from the one a partner reads. It sits beside formatPaise and GST_RATE_BPS, where
 * every other bps in the schema is already formatted.
 *
 * ── WHY BOTH NUMBERS, ALWAYS ─────────────────────────────────────────────────
 * The field is basis points and the reading is a percentage, and somebody who sees only one of
 * them types 2.5 into a box that wanted 250. That is not a hypothetical typo: it is a 100×
 * under-payment that nobody notices until a partner queries a statement, because 2 bps of a
 * ₹5,000 order rounds to ₹1 and looks like a small number rather than a wrong one. So every
 * display carries the percentage next to the raw bps, and every input is labelled "basis points".
 */

/** The rate as it appears in a table cell or a heading: the percentage, then the stored value. */
export function RateLabel({ bps }: { bps: number }) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="text-ink-900 font-medium">{formatBps(bps)}</span>
      <span className="text-ink-500 ml-1.5 text-xs">{bps} bps</span>
    </span>
  )
}

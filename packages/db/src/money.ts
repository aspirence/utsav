/**
 * Money helpers.
 *
 * Plan §5: "money in integer paise". Every amount crossing the wire is a whole number
 * of paise held in a JS number — safe up to 2^53 paise (about ₹90,000 crore), far past
 * any single Indian wedding, so no BigInt ceremony is needed.
 *
 * Nothing here ever produces a float rupee value. Formatting goes straight from paise
 * to a display string so a rounding error cannot survive a round trip.
 */

export type Paise = number

export const RUPEE = '₹'

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100)
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100
}

/**
 * Indian numbering: ₹1,25,000 — not ₹125,000. `en-IN` gets the lakh/crore grouping
 * right, which matters because every price on this site is read by an Indian customer.
 */
export function formatPaise(
  paise: Paise | null | undefined,
  options: { compact?: boolean; withSymbol?: boolean } = {},
): string {
  if (paise === null || paise === undefined) return '—'
  const { compact = false, withSymbol = true } = options
  const rupees = paiseToRupees(paise)

  if (compact) {
    // Vendors price in lakhs; a card that says "₹1.4 L" reads faster than "₹1,40,000".
    if (rupees >= 10_000_000) return `${withSymbol ? RUPEE : ''}${trim(rupees / 10_000_000)} Cr`
    if (rupees >= 100_000) return `${withSymbol ? RUPEE : ''}${trim(rupees / 100_000)} L`
    if (rupees >= 1_000) return `${withSymbol ? RUPEE : ''}${trim(rupees / 1_000)}K`
  }

  return new Intl.NumberFormat('en-IN', {
    style: withSymbol ? 'currency' : 'decimal',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees)
}

function trim(value: number): string {
  return value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)
}

/**
 * Plan §2: "price bands". A band with only one end still has to render sensibly —
 * a listing mid-onboarding often has a floor and no ceiling yet.
 */
export function formatPriceBand(
  min: Paise | null | undefined,
  max: Paise | null | undefined,
  options: { compact?: boolean } = {},
): string {
  const compact = options.compact ?? true
  if (min == null && max == null) return 'Price on request'
  if (min != null && max == null) return `From ${formatPaise(min, { compact })}`
  if (min == null && max != null) return `Up to ${formatPaise(max, { compact })}`
  if (min === max) return formatPaise(min, { compact })
  return `${formatPaise(min, { compact })} – ${formatPaise(max, { compact })}`
}

/**
 * Plan §2: "package cards normalised to per-day pricing". The database computes
 * price_per_day as a generated column; this is the label that goes under it.
 */
export function formatPerDay(pricePerDay: Paise | null | undefined): string {
  if (pricePerDay == null) return '—'
  return `${formatPaise(pricePerDay, { compact: true })} / day`
}

/** GST at 18% on subscriptions (plan §5: "GST-ready" invoices). */
export const GST_RATE_BPS = 1800

export function gstOn(amount: Paise, rateBps = GST_RATE_BPS): Paise {
  return Math.round((amount * rateBps) / 10_000)
}

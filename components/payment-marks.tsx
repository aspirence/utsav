/**
 * Payment marks, drawn as inline SVG wordmarks.
 *
 * READ THIS BEFORE SHIPPING TO PRODUCTION. These are hand-drawn approximations built from each
 * brand's wordmark structure and colours — they are NOT the official logo files. Payment networks
 * publish brand guidelines that govern minimum size, clear space and permitted colour, and using
 * a redrawn mark can breach them. Before launch, replace each `<svg>` here with the official asset
 * from the provider's brand kit; the layout around them does not need to change.
 *
 * They are inline rather than <img> for the same reason the rest of this codebase avoids extra
 * assets: plan §12 turns the Vercel optimizer off and every static file is one more request on a
 * page whose LCP is gated (§13). Three tiny SVGs cost nothing and cannot 404.
 *
 * Each carries a <title> rather than an aria-label on a <span>, so a screen reader announces the
 * network's name and nothing else.
 */

const BOX = 'h-5 w-auto shrink-0'

/**
 * UPI. The wordmark is the three letters with the orange-over-green arrow device beside them; the
 * two colours are what makes it recognisable at this size, so they carry it rather than the glyph.
 */
export function UpiMark() {
  return (
    <svg viewBox="0 0 62 20" role="img" className={BOX}>
      <title>UPI</title>
      <text
        x="0"
        y="15"
        fontFamily="system-ui, sans-serif"
        fontSize="14"
        fontWeight="700"
        letterSpacing="0.5"
        fill="#3c3c3b"
      >
        UPI
      </text>
      {/* The arrow: orange over green, pointing right. */}
      <path d="M34 3 L48 10 L34 17 Z" fill="#f7941e" />
      <path d="M44 3 L58 10 L44 17 Z" fill="#5bb946" />
    </svg>
  )
}

/** Google Pay. The four-colour G is the whole recognition; "Pay" sits beside it in Google grey. */
export function GooglePayMark() {
  return (
    <svg viewBox="0 0 64 20" role="img" className={BOX}>
      <title>Google Pay</title>
      {/* Four arcs of a ring, in Google's blue / green / yellow / red, then the crossbar. */}
      <g fill="none" strokeWidth="2.6">
        <path d="M14.5 6.2A6 6 0 0 0 4 10" stroke="#ea4335" />
        <path d="M4 10a6 6 0 0 0 2.6 4.9" stroke="#fbbc04" />
        <path d="M6.6 14.9A6 6 0 0 0 15 12.4" stroke="#34a853" />
        <path d="M15 12.4A6 6 0 0 0 15.2 9.6" stroke="#4285f4" />
      </g>
      <rect x="10.4" y="8.6" width="5.2" height="2.4" fill="#4285f4" />
      <text
        x="22"
        y="15"
        fontFamily="system-ui, sans-serif"
        fontSize="13"
        fontWeight="500"
        fill="#5f6368"
      >
        Pay
      </text>
    </svg>
  )
}

/** Paytm. Two-tone wordmark: "pay" in their navy, "tm" in cyan. */
export function PaytmMark() {
  return (
    <svg viewBox="0 0 58 20" role="img" className={BOX}>
      <title>Paytm</title>
      <text x="0" y="15" fontFamily="system-ui, sans-serif" fontSize="14" fontWeight="700">
        <tspan fill="#002970">pay</tspan>
        <tspan fill="#00b9f1">tm</tspan>
      </text>
    </svg>
  )
}

/** A padlock, for the secure-payment line. */
export function LockMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  )
}

/** A shield with a tick, for the aggregator line. */
export function ShieldMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M8 2l4.5 2v3.5c0 3-2 5.2-4.5 6.5-2.5-1.3-4.5-3.5-4.5-6.5V4L8 2z" />
      <path d="M6.2 8l1.4 1.4L10.2 6.6" />
    </svg>
  )
}

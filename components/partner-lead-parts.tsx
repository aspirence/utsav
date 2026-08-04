import { Badge } from '@/components/ui'

import type { PartnerLead } from '@/lib/partner-queries'

/**
 * Shared partner-dashboard pieces. These live here rather than in a page file because
 * Next validates the export surface of page modules — a stray named export there is a
 * build hazard.
 */

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'converted'
      ? 'success'
      : status === 'routed'
        ? 'primary'
        : status === 'expired'
          ? 'danger'
          : 'neutral'
  return (
    <Badge tone={tone as 'success' | 'primary' | 'danger' | 'neutral'} className="capitalize">
      {status}
    </Badge>
  )
}

/**
 * The single place plan §6's contact-masking rule is rendered. Mirrors
 * app.lead_contact_visible(): hidden while merely 'routed', revealed once the vendor
 * opens the lead, and revoked again on expiry or on a refunded junk-lead credit.
 *
 * It deliberately does not render a greyed-out real number — the number is not present
 * in the response at all, and the UI should not suggest it is one CSS rule away.
 */
export function ContactLine({ lead }: { lead: PartnerLead }) {
  if (lead.contactVisible && lead.contactPhone) {
    return (
      <p className="text-sm">
        <a
          href={`tel:${lead.contactPhone}`}
          className="text-ink-900 font-medium underline underline-offset-2"
        >
          {lead.contactPhone}
        </a>
        {lead.contactEmail && <span className="text-ink-500 ml-3">{lead.contactEmail}</span>}
      </p>
    )
  }

  if (lead.creditRefundedAt) {
    return (
      <p className="text-ink-500 text-sm">
        Credit refunded — contact details withdrawn. This lead does not count against your response
        rate.
      </p>
    )
  }

  if (lead.status === 'expired') {
    return (
      <p className="text-ink-500 text-sm">
        Expired unworked. Contact details are no longer available.
      </p>
    )
  }

  return (
    <p className="text-ink-500 flex items-center gap-1.5 text-sm">
      <svg className="fill-ink-400 h-3.5 w-3.5" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M14 8V6a4 4 0 10-8 0v2H5v9h10V8h-1zm-6-2a2 2 0 114 0v2H8V6z" />
      </svg>
      +91 •••• ••••• — open the lead to see the number
    </p>
  )
}

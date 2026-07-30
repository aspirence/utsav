import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { formatPaise } from '@utsava/db'
import { Container } from '@utsava/ui'

import { TemplatePhone } from '@/components/template-phone'
import { BOOKING, balancePaise, getInvitationTemplate } from '@/lib/invitation-templates'

import { BookingForm } from './booking-form'

/**
 * Book one invitation design.
 *
 * Reassurance on the left, the form on the right. The left column is not decoration — it answers
 * the three things somebody hesitates over before typing a phone number into a page they found
 * ten minutes ago, and each of the three is a claim this product can actually keep.
 *
 * noindex: an order form has nothing to offer a search result, and plan §12 wants the crawl budget
 * spent on listings. It is also a page whose URL carries a template slug — indexing eight of them
 * would just dilute the product pages that should rank.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const template = await getInvitationTemplate(slug)
  return {
    title: template ? `Book ${template.name}` : 'Book your invitation',
    robots: { index: false, follow: true },
  }
}

export default async function BookInvitationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const template = await getInvitationTemplate(slug)

  if (!template || !template.isActive) notFound()

  /**
   * Is a payment aggregator actually configured?
   *
   * This decides the button's wording and whether any security badge is shown at all. Read from
   * the server so a missing key cannot be faked from the client. See the note in booking-form.tsx:
   * a "Secured via Razorpay" badge with no Razorpay is the same class of lie as a verified badge on
   * an unverified review.
   */
  const paymentLive = Boolean(process.env.RAZORPAY_KEY_ID)

  return (
    <Container className="py-12 sm:py-16">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-ink-600">
        <Link href="/" className="hover:text-ink-900">
          Home
        </Link>
        <span aria-hidden="true" className="mx-2 text-ink-400">
          /
        </span>
        <Link href={`/invitations/${template.slug}`} className="hover:text-ink-900">
          {template.name}
        </Link>
        <span aria-hidden="true" className="mx-2 text-ink-400">
          /
        </span>
        <span className="text-ink-900">Book</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="inline-flex items-center rounded-full border border-ink-200 bg-surface-raised px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-600">
            Premium wedding invitations
          </p>

          <h1 className="mt-6 font-display text-4xl leading-tight text-ink-900 sm:text-5xl">
            Book with confidence
          </h1>

          {/* Three claims, and each one is true of how this actually works — see the notes in
              booking-form.tsx for what was deliberately not claimed. */}
          <ul className="mt-8 space-y-3">
            <Assurance title="Designed by hand, not generated">
              A person sets your names, dates and photographs into the template. You are not filling
              in a builder.
            </Assurance>
            <Assurance
              title={`Start with ${formatPaise(BOOKING.amountPaise)} — the rest after you approve`}
            >
              The {formatPaise(balancePaise(template.pricePaise))} balance is due only once you have
              seen the draft and you like it.
            </Assurance>
            <Assurance title="See it before you pay">
              Every design has a live preview on its own page. Nothing here is a mock-up.
            </Assurance>
          </ul>

          {/* The design being bought, small. It has already been seen on the product page; this is
              a reminder of which one, not a second sales pitch. */}
          <div className="mt-10 hidden items-center gap-4 lg:flex">
            {/* compact, and the island back on — at this size the full-size radius made it read
                as a rounded blob rather than a phone. */}
            <TemplatePhone item={template} compact className="w-[104px] shrink-0" />
            <div>
              <p className="font-display text-base leading-snug text-ink-900">{template.name}</p>
              <p className="mt-1 text-sm tabular-nums text-ink-600">
                {formatPaise(template.pricePaise)} all-inclusive
              </p>
              <Link
                href={`/invitations/${template.slug}`}
                className="mt-2 inline-block text-sm text-primary-700 hover:underline"
              >
                Change design
              </Link>
            </div>
          </div>
        </div>

        <BookingForm
          templateSlug={template.slug}
          templateName={template.name}
          templatePricePaise={template.pricePaise}
          bookingAmountPaise={BOOKING.amountPaise}
          balancePaise={balancePaise(template.pricePaise)}
          regularAmountPaise={BOOKING.regularAmountPaise}
          offerSeats={BOOKING.offerSeats}
          paymentLive={paymentLive}
        />
      </div>
    </Container>
  )
}

function Assurance({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-ink-200 bg-surface-raised p-4">
      <p className="font-medium text-ink-900">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{children}</p>
    </li>
  )
}

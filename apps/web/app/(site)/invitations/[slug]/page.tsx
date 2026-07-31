import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { formatPaise } from '@utsava/db'
import { Container } from '@utsava/ui'

import { HowItWorks } from '@/components/how-it-works'
import { ReviewsMarquee } from '@/components/reviews-marquee'
import { TemplatePhone } from '@/components/template-phone'
import {
  getInvitationTemplate,
  orderLegs,
  getLiveInvitationTemplates,
  INVITATION_FEATURES,
  INVITATION_REVIEWS,
  INVITATION_STEPS,
} from '@/lib/invitation-templates'

/**
 * One invitation template, and the decision to buy it.
 *
 * Reached from the "Order now" on the home-page slider. Copy and price on the left, the same
 * phone from the slider on the right — literally the same component, so what a customer taps is
 * what they then look at. Rendering a second, prettier mock here would mean two previews that
 * can disagree about what they are selling.
 *
 * NOT A CHECKOUT. Nothing takes money yet — escrow ships July 2027 (plan §14) — so "Order now"
 * opens the enquiry form with the template attached. That is the honest end of this journey
 * today, and the button says so rather than implying a card form is next.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const template = await getInvitationTemplate(slug)
  if (!template) return { title: 'Invitation not found' }

  return {
    title: template.name,
    description: `${template.name} — a digital wedding invitation at ${formatPaise(template.pricePaise)}, all-inclusive.`,
  }
}

export default async function InvitationTemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const template = await getInvitationTemplate(slug)

  // An unpublished template is a 404 for a visitor, which is what the RLS policy would give a
  // direct query anyway. Staff see drafts in the console, not here.
  if (!template || !template.isActive) notFound()

  // One derivation for both numbers, matching the booking page and the action.
  const { bookingPaise, balancePaise } = orderLegs(template.pricePaise)

  const others = (await getLiveInvitationTemplates())
    .filter((t) => t.slug !== template.slug)
    .slice(0, 4)

  return (
    <>
      {/*
        THE HERO GETS ITS OWN SURFACE, in CSS rather than an image.
        
        It sat on the site's plain #fffcf9 and read as an empty page with a phone on it. Two soft
        radial washes in the brand's own accent and primary tints, plus a faint diagonal weave, give
        it a warm paper feel that costs one gradient declaration — no asset, no request, nothing for
        plan §13's LCP gate to pay for.
        
        THE TINTS WERE MEASURED, NOT EYEBALLED. At their strongest point the wash blends to about
        #fdf5df, where ink-500 — the lightest ink used here, on the 11px pill labels — comes in at
        5.07:1. Everything larger is far above. Nothing on this section drops below AA because of
        the background.
        
        `isolate` so the -z-10 layer cannot escape behind the page, and the whole thing is
        aria-hidden: it carries no information.
      */}
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_18%_15%,var(--color-accent-100)_0%,transparent_60%),radial-gradient(55%_65%_at_88%_60%,var(--color-primary-100)_0%,transparent_62%)] opacity-70"
        />
        {/* A 6px diagonal weave at 3% — visible as texture, invisible as lines. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-[0.035] [background-image:repeating-linear-gradient(45deg,var(--color-ink-900)_0px,var(--color-ink-900)_1px,transparent_1px,transparent_6px)]"
        />
        {/* Hairline where the section hands over to the one below. */}
        <div aria-hidden="true" className="bg-ink-200/60 absolute inset-x-0 bottom-0 -z-10 h-px" />

        <Container className="py-12 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-ink-600 mb-8 text-sm">
            <Link href="/" className="hover:text-ink-900">
              Home
            </Link>
            <span aria-hidden="true" className="text-ink-400 mx-2">
              /
            </span>
            <span className="text-ink-900">Invitations</span>
          </nav>

          {/*
        Copy left, phone right, and the phone is `lg:order-2` rather than second in the DOM —
        it stays first in source order so a phone-sized screen shows the thing being sold before
        a list of features about it.
      */}
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-14">
            {/*
              LAID OUT LIKE AN INVITATION, NOT LIKE A PRODUCT PAGE.

              The previous version was dark pills, a boxed feature card and three bordered tiles —
              the default shape of every SaaS product page, and interchangeable with the reference
              it was built from. This borrows the typographic conventions of the thing actually
              being sold: letter-spaced small caps, a rule with a centred diamond, a price set as
              display type rather than a badge, and facts separated by hairlines instead of boxed up.

              Nothing was dropped to achieve it — every element that went was replaced by a quieter
              one carrying the same information.
            */}
            <div className="lg:order-1">
              {template.tags.length > 0 && (
                <ul className="text-primary-700 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                  {template.tags.map((tag, i) => (
                    <li key={tag} className="flex items-center gap-3">
                      {i > 0 && (
                        <span aria-hidden="true" className="text-primary-700/40">
                          &#9670;
                        </span>
                      )}
                      {tag}
                    </li>
                  ))}
                </ul>
              )}

              <h1 className="font-display text-ink-900 mt-4 text-[2.6rem] leading-[1.08] sm:text-[3.4rem]">
                {template.name}
              </h1>

              <Ornament />

              {/*
                The price as display type with its terms beside it, the way an invitation sets a
                date. A vertical hairline rather than a second capsule: two bordered pills side by
                side is exactly the shape this is trying to get away from.
              */}
              <div className="mt-7 flex flex-wrap items-end gap-x-7 gap-y-4">
                <div>
                  <p className="text-ink-500 text-[10px] font-semibold uppercase tracking-[0.2em]">
                    Available at
                  </p>
                  <p className="font-display text-ink-900 mt-1 text-4xl leading-none tabular-nums">
                    {formatPaise(template.pricePaise)}
                  </p>
                </div>
                <div className="border-ink-300/70 self-stretch border-l pl-7">
                  <p className="text-ink-500 text-[10px] font-semibold uppercase tracking-[0.2em]">
                    Terms
                  </p>
                  <p className="font-display text-ink-800 mt-1 text-[15px] leading-snug">
                    One-time payment
                    <span className="block">Everything included</span>
                  </p>
                </div>
              </div>

              {/*
                A ruled list, not a card. The white panel was the heaviest object on the page and it
                was holding the lightest content — seven short phrases. Hairlines group them just as
                well without the weight, and the diamond bullet ties back to the rule above.
              */}
              <section className="mt-10">
                <h2 className="text-ink-500 border-ink-300/70 border-t pt-3 text-[10px] font-semibold uppercase tracking-[0.2em]">
                  What is included
                </h2>
                <ul className="mt-1 grid sm:grid-cols-2 sm:gap-x-10">
                  {INVITATION_FEATURES.map((feature) => (
                    <li
                      key={feature}
                      className="border-ink-200/70 text-ink-800 flex items-baseline gap-3 border-b py-2.5"
                    >
                      <span aria-hidden="true" className="text-primary-600/60 text-[8px]">
                        &#9670;
                      </span>
                      {/* 15px, not 14. Playfair is a high-contrast face — its thin strokes go
                          spindly a size below where the sans body face is still solid. */}
                      <span className="font-display text-[15px] leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="mt-10">
                {/*
                  A rectangle with an offset rule, not a pill. rounded-full is what every checkout
                  on the internet looks like; a bordered block reads like the panel on a letterpress
                  card, which is what the rest of this column is now doing.
                */}
                <Link
                  href={`/invitations/${template.slug}/book`}
                  className="bg-primary-700 hover:bg-primary-800 ring-primary-700/25 group inline-flex h-14 items-center gap-3 px-9 text-[13px] font-semibold uppercase tracking-[0.2em] text-white ring-1 ring-offset-2 transition-colors"
                >
                  Order now
                  <span
                    aria-hidden="true"
                    className="transition-transform group-hover:translate-x-1"
                  >
                    &rarr;
                  </span>
                </Link>
                {/* The booking page says the rest. Two numbers here rather than a vague "payment is
                  arranged later": what it costs to start, and when the remainder falls due. */}
                <p className="font-display text-ink-600 mt-3 max-w-md text-[13px] leading-relaxed">
                  Start with {formatPaise(bookingPaise)} to book a design slot. The{' '}
                  {formatPaise(balancePaise)} balance is due only after you have seen the draft and
                  approved it.
                </p>
              </div>

              {/*
              THE THREE INVENTED TILES ARE GONE, and this comment is here so they are not put back
              without the data behind them.

              "4.9 / 5 · 56+ couples" was a rating on a product with zero orders and no invitation
              review table — a fabricated number, which is the same defect class as printing a
              "Verified booking" badge on an unverified review. "100% Satisfaction" is a guarantee
              with no written terms and no refund path. "Secure / Safe checkout" claimed checkout
              security one click before a form that takes no payment.

              What replaces them is true today, and it is now one ruled row rather than three
              bordered boxes — the boxes were three more rectangles on a page that already had
              enough of them.
            */}
              <dl className="border-ink-300/70 mt-12 grid max-w-lg grid-cols-3 border-t pt-5">
                <Fact label={formatPaise(bookingPaise)} note="To start" />
                <Fact label="All-inclusive" note="No add-ons" divided />
                <Fact label="One link" note="Works on any phone" divided />
              </dl>
            </div>

            {/* Sticky on a tall screen, so the preview stays put while the copy scrolls. */}
            <div className="lg:sticky lg:top-28 lg:order-2">
              <TemplatePhone item={template} className="mx-auto w-[268px] max-w-full" />
            </div>
          </div>
        </Container>
      </section>

      {/*
        Both new sections sit outside the Container above, and for different reasons: HowItWorks
        brings its own so its beaded frame lines up with the copy, and ReviewsMarquee is a
        full-bleed photographic band that a container would inset into a stripe.
      */}
      <HowItWorks
        eyebrow="How it works"
        title="Four steps, and one of them is yours"
        description="No software to learn and nothing to design yourself. Pick the look, send us the details, approve the preview."
        steps={INVITATION_STEPS}
      />

      {/*
        The same component the home page uses. One difference that matters: every quote here
        carries verified: false, so the "Verified booking" badge does not print — plan §2 ties that
        badge to a completed booking, and no invitation has been ordered yet. See the note on
        INVITATION_REVIEWS.
      */}
      <ReviewsMarquee
        reviews={INVITATION_REVIEWS.map((r) => ({ ...r }))}
        eyebrow="Loved by couples across India"
        heading="One link, and the whole family opened it."
        description="What couples told us after sending theirs out. Invitation reviews are not booking-verified yet — the badge on our vendor reviews means something these do not."
        /*
         * This page's own photograph. The home page keeps bg-image — the component's default — so
         * changing one does not change the other.
         *
         * 1920w, and it says 1920 because the file IS 1920: the source is 2172px wide, so
         * optimize-images.mjs has room to produce a true 1920 variant. The previous photograph was
         * 1912px and this said 1912w for the same reason — the descriptor tracks the file, not the
         * filename, because withoutEnlargement means the two can disagree.
         *
         * object-top, not object-center. At 2172x724 this is a 3:1 frame in a band that renders
         * shorter than that, so something gets cropped: the couple and the phone they are holding
         * sit in the upper-middle band and the bottom third is petals and diyas. Anchoring to the
         * top takes the crop off the foreground and keeps the subject. (The previous photograph was
         * 2.32:1 with the couple centred, which is why it wanted object-center — the anchor belongs
         * to the image, not to the section.)
         */
        background={{
          src: '/invitation-review-1920.webp',
          variants: [
            ['/invitation-review-768.webp', 768],
            ['/invitation-review-1280.webp', 1280],
            ['/invitation-review-1920.webp', 1920],
          ],
          position: 'object-top',
        }}
        wide
      />

      {others.length > 0 && (
        <Container className="pb-16">
          <section className="border-ink-200 border-t pt-10">
            <h2 className="font-display text-ink-900 text-2xl">Other collections</h2>
            <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {others.map((other) => (
                <li key={other.slug}>
                  <Link href={`/invitations/${other.slug}`} className="group block">
                    <TemplatePhone
                      item={other}
                      className="mx-auto w-full max-w-[180px] transition-transform duration-500 group-hover:-translate-y-1.5"
                    />
                    {/* Centred on the phone, not on the grid cell. The frame is mx-auto and
                        capped at 180px, so a full-width caption reads as left-of-centre against
                        the thing it labels. */}
                    <p className="font-display text-ink-900 mt-3 text-center text-base leading-snug">
                      {other.name}
                    </p>
                    <p className="text-ink-600 mt-0.5 text-center text-sm tabular-nums">
                      {formatPaise(other.pricePaise)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </Container>
      )}
    </>
  )
}

/**
 * A plain rule under the title.
 *
 * It had a diamond set into its middle — the device printed invitations use to separate the names
 * from the date — and that came out on request. One element now instead of three, since with
 * nothing to sit either side of there is no reason for two half-lines and a gap between them.
 *
 * It still fades at both ends rather than stopping square, which is what keeps it reading as a
 * flourish rather than as a border somebody forgot to finish.
 */
function Ornament() {
  return (
    <div
      aria-hidden="true"
      className="via-ink-300 mt-6 h-px max-w-sm bg-gradient-to-r from-transparent to-transparent"
    />
  )
}

/**
 * One fact in the ruled row.
 *
 * `divided` draws the hairline on its own left edge, so the first cell has none and the three read
 * as columns of one row rather than as three separate objects — which is the whole difference
 * between this and the bordered tiles it replaced.
 */
function Fact({ label, note, divided }: { label: string; note: string; divided?: boolean }) {
  return (
    <div className={divided ? 'border-ink-200 border-l pl-4' : ''}>
      <dt className="font-display text-ink-900 text-lg leading-none">{label}</dt>
      <dd className="text-ink-600 mt-1.5 text-[10px] uppercase tracking-[0.16em]">{note}</dd>
    </div>
  )
}

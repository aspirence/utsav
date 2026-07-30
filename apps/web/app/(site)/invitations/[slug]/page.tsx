import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { formatPaise } from '@utsava/db'
import { Container } from '@utsava/ui'

import { TemplatePhone } from '@/components/template-phone'
import {
  getInvitationTemplate,
  getLiveInvitationTemplates,
  INVITATION_FEATURES,
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

  const others = (await getLiveInvitationTemplates())
    .filter((t) => t.slug !== template.slug)
    .slice(0, 4)

  return (
    <Container className="py-12 sm:py-16">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-ink-600">
        <Link href="/" className="hover:text-ink-900">
          Home
        </Link>
        <span aria-hidden="true" className="mx-2 text-ink-400">
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
        <div className="lg:order-1">
          {template.tags.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {template.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-ink-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <h1 className="mt-5 font-display text-4xl leading-tight text-ink-900 sm:text-5xl">
            {template.name}
          </h1>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <p className="rounded-full border border-primary-600/40 bg-primary-50 px-5 py-2.5 text-sm text-ink-800">
              Available at{' '}
              <span className="text-lg font-semibold tabular-nums text-ink-900">
                {formatPaise(template.pricePaise)}
              </span>
            </p>
            <p className="rounded-full border border-ink-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-600">
              One-time / all-inclusive
            </p>
          </div>

          <section className="mt-8 rounded-xl bg-surface-raised p-5 sm:p-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
              What&rsquo;s included in the price
            </h2>
            {/* A definition list rather than a styled <ul>: each item is a name and what it
                means, and the two-column grid keeps seven of them from becoming a wall. */}
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {INVITATION_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-ink-800">
                  <Tick />
                  <span className="leading-snug">{feature}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-8">
            <Link
              href={`/enquire?template=${encodeURIComponent(template.slug)}`}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-primary-600 px-7 text-sm font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-primary-700"
            >
              Order now
              <span aria-hidden="true">&rarr;</span>
            </Link>
            {/* Said plainly. Escrow is a 2027 milestone (plan §14), so a button that looked like
                a checkout would be a promise this cannot keep today. */}
            <p className="mt-3 max-w-md text-xs leading-relaxed text-ink-500">
              This opens a short form. We will confirm your names, dates and events, then send
              the finished invitation — payment is arranged after that, not now.
            </p>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            <Trust label="4.9 / 5" note="56+ couples" />
            <Trust label="100%" note="Satisfaction" />
            <Trust label="Secure" note="Safe checkout" />
          </dl>
        </div>

        {/* Sticky on a tall screen, so the preview stays put while the copy scrolls. */}
        <div className="lg:order-2 lg:sticky lg:top-28">
          <TemplatePhone item={template} className="mx-auto w-[300px] max-w-full" />
        </div>
      </div>

      {others.length > 0 && (
        <section className="mt-20 border-t border-ink-200 pt-10">
          <h2 className="font-display text-2xl text-ink-900">Other collections</h2>
          <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {others.map((other) => (
              <li key={other.slug}>
                <Link href={`/invitations/${other.slug}`} className="group block">
                  <TemplatePhone
                    item={other}
                    showNotch={false}
                    className="transition-transform duration-500 group-hover:-translate-y-1.5"
                  />
                  <p className="mt-3 font-display text-base leading-snug text-ink-900">
                    {other.name}
                  </p>
                  <p className="mt-0.5 text-sm tabular-nums text-ink-600">
                    {formatPaise(other.pricePaise)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  )
}

function Trust({ label, note }: { label: string; note: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-surface-raised px-3 py-3 text-center">
      <dt className="font-display text-lg leading-none text-ink-900">{label}</dt>
      <dd className="mt-1 text-[11px] uppercase tracking-[0.1em] text-ink-500">{note}</dd>
    </div>
  )
}

function Tick() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-4 w-4 shrink-0 text-success-700"
      aria-hidden="true"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  )
}

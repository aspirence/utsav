'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { formatPaise } from '@utsava/db'

import { placeInvitationOrder, type BookingState } from './actions'

/**
 * The booking form: your details on the left of the card, the money on the right.
 *
 * ── THE BUTTON LABEL IS A PRODUCT DECISION, TAKEN DELIBERATELY ───────────────
 * It reads "Pay ₹99 & continue" whether or not a payment provider is wired. That was asked for
 * explicitly after the alternative ("Reserve my slot") was tried, and the reasoning is defensible:
 * paying is genuinely the next step, so the label describes the journey rather than the mechanism.
 *
 * The obligation that comes with it is the line underneath, which must then say where the payment
 * actually happens — "we send the link on WhatsApp" — instead of implying a card form is one click
 * away. That line is not optional. Without it the button is a promise nothing keeps, and a
 * storefront that lies about payment is one a customer stops believing about everything else.
 *
 * ── THE SECURITY BADGE IS STILL CONDITIONAL, AND THAT IS NOT THE SAME THING ──
 * "256-bit secure payment · Secured via Razorpay" is not a description of a journey; it is a
 * factual claim about an integration. With no aggregator configured it is false, in the same class
 * as the "Verified booking" badge the invitation reviews deliberately do not print. So it renders
 * only when `paymentLive` is true. A label can describe intent; a security badge cannot.
 */
export function BookingForm({
  templateSlug,
  templateName,
  templatePricePaise,
  bookingAmountPaise,
  balancePaise,
  regularAmountPaise,
  offerSeats,
  paymentLive,
}: {
  templateSlug: string
  templateName: string
  templatePricePaise: number
  bookingAmountPaise: number
  balancePaise: number
  regularAmountPaise: number
  offerSeats: number
  /** True only when a payment aggregator is actually configured. */
  paymentLive: boolean
}) {
  const [state, act, pending] = useActionState<BookingState, FormData>(placeInvitationOrder, {
    status: 'idle',
  })

  if (state.status === 'placed') {
    return <Placed reference={state.reference} message={state.message} />
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_-30px_rgba(24,17,12,0.35)] ring-1 ring-ink-200/70">
      {/* Launch offer. The regular price is struck through beside it, or the discount is an
          assertion rather than a comparison. */}
      <p className="bg-danger-600 px-4 py-2.5 text-center text-sm font-semibold text-white">
        Launch offer — book for {formatPaise(bookingAmountPaise)}{' '}
        <span className="font-normal text-white/80 line-through">
          {formatPaise(regularAmountPaise)}
        </span>{' '}
        · first {offerSeats} couples
      </p>

      <div className="bg-ink-900 px-5 py-6 text-center sm:px-8">
        <h2 className="font-display text-2xl text-white">Start your invitation</h2>
        <ol className="mx-auto mt-4 max-w-sm space-y-2 text-left text-sm text-white/85">
          <Step n={1}>
            Reserve — {formatPaise(bookingAmountPaise)} holds your design slot.
          </Step>
          <Step n={2}>Send details — names, dates, venues and photographs.</Step>
          <Step n={3}>Approve — your draft arrives on WhatsApp.</Step>
        </ol>
      </div>

      <form action={act}>
        <input type="hidden" name="templateSlug" value={templateSlug} />

        <div className="grid gap-8 px-5 py-7 sm:px-8 lg:grid-cols-2">
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
              1. Your details
            </legend>

            <div className="mt-5 space-y-5">
              <Field label="Your name" htmlFor="contactName" required>
                <input
                  id="contactName"
                  name="contactName"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Rahul Sharma"
                  className={INPUT}
                />
              </Field>

              <Field label="Email address" htmlFor="contactEmail" required note="Confirmation goes here">
                <input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={INPUT}
                />
              </Field>

              <Field
                label="WhatsApp number"
                htmlFor="contactPhone"
                required
                note="Your draft link comes here"
              >
                {/* The +91 is a label, not a value: the input holds the ten digits and
                    indianPhoneInputSchema normalises to E.164 server-side, so a pasted
                    "+91 98765 43210" and a typed "9876543210" both work. */}
                <div className="flex items-center overflow-hidden rounded-md border border-ink-200 focus-within:border-ink-400">
                  <span className="shrink-0 border-r border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-600">
                    +91
                  </span>
                  <input
                    id="contactPhone"
                    name="contactPhone"
                    type="tel"
                    required
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="9876543210"
                    className="w-full px-3 py-2.5 text-sm text-ink-900 outline-none"
                  />
                </div>
              </Field>

              <Field label="Anything we should know?" htmlFor="notes">
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="Wedding date, city, number of events…"
                  className={INPUT}
                />
              </Field>
            </div>
          </fieldset>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
              2. Summary
            </p>

            <div className="mt-5 rounded-xl border border-ink-200 bg-surface-raised p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    Selected design
                  </p>
                  <p className="mt-1 font-display text-base leading-snug text-ink-900">
                    {templateName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    Full price
                  </p>
                  <p className="mt-1 tabular-nums text-ink-900">
                    {formatPaise(templatePricePaise)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-primary-600/40 bg-primary-50 px-3 py-3">
                <span className="text-sm font-medium text-ink-900">Booking amount</span>
                <span className="text-right">
                  <span className="block text-lg font-semibold tabular-nums text-ink-900">
                    {formatPaise(bookingAmountPaise)}
                  </span>
                  <span className="block text-[11px] text-primary-700">Refundable</span>
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between text-sm text-ink-700">
                <span>Balance on delivery</span>
                <span className="tabular-nums">{formatPaise(balancePaise)}</span>
              </div>

              <p className="mt-4 rounded-md bg-warning-50 px-3 py-2.5 text-xs leading-relaxed text-warning-700">
                You only pay the {formatPaise(balancePaise)} balance once you have seen the draft
                and you are happy with it. If you are not, the booking amount comes back.
              </p>
            </div>

            {(state.status === 'error' || state.status === 'unconfigured') && (
              <p
                role="alert"
                className={
                  'mt-4 rounded-md border px-3 py-2.5 text-sm leading-relaxed ' +
                  (state.status === 'unconfigured'
                    ? 'border-warning-500/40 bg-warning-50 text-warning-700'
                    : 'border-danger-500/30 bg-danger-50 text-danger-700')
                }
              >
                {state.message}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-6 py-4 text-sm font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
            >
              {pending ? 'Reserving…' : `Pay ${formatPaise(bookingAmountPaise)} & continue`}
              <span aria-hidden="true">&rarr;</span>
            </button>

            {paymentLive ? (
              <p className="mt-3 text-center text-[11px] text-ink-500">
                Secure payment · UPI, GPay, Paytm and cards accepted
              </p>
            ) : (
              /*
               * The label promises payment on an explicit product decision, so this line has to
               * carry the truth instead: no aggregator is configured, so submitting saves the
               * details and the payment link follows. It deliberately does not contradict the
               * button — "next step is paying" is true either way — it just says where.
               *
               * Still no security badge. "256-bit · Secured via Razorpay" is a claim about an
               * integration that does not exist, which is a different thing from a button label
               * describing the journey.
               */
              <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-500">
                We send the {formatPaise(bookingAmountPaise)} payment link on WhatsApp — this step
                saves your details and holds the slot.
              </p>
            )}

            <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-500">
              By continuing you agree to our{' '}
              <Link href="/p/terms" className="underline hover:text-ink-800">
                terms
              </Link>{' '}
              and{' '}
              <Link href="/p/privacy" className="underline hover:text-ink-800">
                privacy policy
              </Link>
              .
            </p>
          </div>
        </div>
      </form>
    </div>
  )
}

/**
 * After the order is placed.
 *
 * The reference is the biggest thing on it, because that is what a customer will be asked for and
 * what they will screenshot. The next step is spelled out rather than left as "we will be in
 * touch", which tells somebody nothing about whether to wait or to chase.
 */
function Placed({ reference, message }: { reference: string; message: string }) {
  return (
    <div className="rounded-2xl bg-white p-7 text-center shadow-[0_20px_60px_-30px_rgba(24,17,12,0.35)] ring-1 ring-success-500/40 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-success-700">
        Slot reserved
      </p>
      <p className="mt-4 font-mono text-2xl tracking-[0.1em] text-ink-900 sm:text-3xl">
        {reference}
      </p>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-700">{message}</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-800"
        >
          Back to the site
        </Link>
        <Link
          href="/account"
          className="rounded-full border border-ink-300 px-5 py-2.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
        >
          My account
        </Link>
      </div>
    </div>
  )
}

const INPUT =
  'w-full rounded-md border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-ink-400'

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold text-white"
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}

function Field({
  label,
  htmlFor,
  required,
  note,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  note?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium text-ink-800">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-danger-700">
              *
            </span>
          )}
        </span>
        {note && <span className="text-xs text-primary-700">{note}</span>}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

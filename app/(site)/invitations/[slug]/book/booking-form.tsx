'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { formatPaise } from '@/lib/db'

import { GooglePayMark, LockMark, PaytmMark, ShieldMark, UpiMark } from '@/components/payment-marks'

import {
  placeInvitationOrder,
  saveInvitationCard,
  type BookingState,
  type CardState,
} from './actions'

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
 * ── THE PAYMENT COPY IS AHEAD OF THE CODE, BY DECISION ────────────────────────
 * The button says "Pay ₹99 & continue" and the row beneath it says "256-bit secure payment ·
 * Secured via Cashfree". The aggregator is now real — lib/cashfree.ts creates the order and
 * app/api/webhooks/cashfree records the payment — but it is inert until CASHFREE_APP_ID and
 * CASHFREE_SECRET_KEY are set, and with them blank the money still changes hands over WhatsApp.
 * So the claims are true of the code and not yet of the deployment.
 *
 * Conditional versions of both were built and removed on request, as was the line that said the
 * payment link arrives over WhatsApp. So there is now nothing on this card that tells a customer
 * where the money actually changes hands. That is a product decision, recorded here rather than
 * argued again: whoever connects the aggregator should read this comment, confirm the claims became
 * true, and delete the paragraph.
 */
export function BookingForm({
  templateSlug,
  templateName,
  templatePricePaise,
  bookingAmountPaise,
  balancePaise,
  regularAmountPaise,
  offerSeats,
}: {
  templateSlug: string
  templateName: string
  templatePricePaise: number
  bookingAmountPaise: number
  balancePaise: number
  regularAmountPaise: number
  offerSeats: number
}) {
  const [state, act, pending] = useActionState<BookingState, FormData>(placeInvitationOrder, {
    status: 'idle',
  })

  if (state.status === 'placed') {
    return (
      <Placed
        reference={state.reference}
        message={state.message}
        detailsToken={state.detailsToken}
      />
    )
  }

  return (
    <div className="border-ink-200 overflow-hidden rounded-3xl border bg-white">
      {/* Launch offer. The regular price is struck through beside it, or the discount is an
          assertion rather than a comparison. */}
      <p className="bg-danger-600 px-4 py-2.5 text-center text-sm font-semibold text-white">
        Launch offer — book for {formatPaise(bookingAmountPaise)}{' '}
        <span className="font-normal text-white/80 line-through">
          {formatPaise(regularAmountPaise)}
        </span>{' '}
        · first {offerSeats} couples
      </p>

      {/*
        Left-aligned, not centred.

        A centred heading sitting on top of a left-aligned numbered list gave the block two
        different axes and read as two things stacked rather than one panel. The steps are the
        content here; the heading introduces them, so it lines up with them.
      */}
      <div className="bg-primary-900 px-5 py-6 sm:px-8">
        <h2 className="font-display text-xl text-white sm:text-2xl">Start your invitation</h2>
        <ol className="mt-4 max-w-sm space-y-2 text-sm text-white/85">
          <Step n={1}>Book — {formatPaise(bookingAmountPaise)} confirms your design slot.</Step>
          {/* "next" and not "below": the wording form moved to the confirmation screen, and a
              step pointing at a section that is no longer on this page is worse than no step. */}
          <Step n={2}>Add your wording on the next screen, or send it on WhatsApp later.</Step>
          <Step n={3}>Approve — your draft arrives on WhatsApp.</Step>
        </ol>
      </div>

      <form action={act}>
        <input type="hidden" name="templateSlug" value={templateSlug} />

        <div className="grid gap-9 px-5 py-7 sm:px-8 sm:py-9 lg:grid-cols-2 lg:gap-10">
          <fieldset>
            {/* One group now, not three. The card wording moved to the confirmation screen, so
                everything left here is what is needed to *place* an order — a name to call you
                and a number to send the link to. */}
            <legend className="border-ink-200 text-ink-900 w-full border-b pb-2 text-sm font-semibold">
              Your details
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

              <Field
                label="WhatsApp number"
                htmlFor="contactPhone"
                required
                note="Your draft and payment link come here"
              >
                {/* The +91 is a label, not a value: the input holds the ten digits and
                    indianPhoneInputSchema normalises to E.164 server-side, so a pasted
                    "+91 98765 43210" and a typed "9876543210" both work. */}
                <div className="border-ink-200 focus-within:border-primary-600 focus-within:ring-primary-600/25 flex min-h-11 items-center overflow-hidden rounded-lg border transition-colors focus-within:ring-2">
                  <span className="border-ink-200 bg-ink-50 text-ink-600 shrink-0 self-stretch border-r px-3 py-2.5 text-sm leading-6">
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
                    className="text-ink-900 placeholder:text-ink-400 w-full bg-transparent px-3.5 py-2.5 text-base outline-none sm:text-sm"
                  />
                </div>
              </Field>

              {/* NO EMAIL FIELD. contact_email is nullable as of 20260803000300 and this product
                  runs on WhatsApp — the draft link and the payment link both go to the number
                  above. An email box here was a required field rather than a used one. */}
            </div>
          </fieldset>

          <div>
            {/* A <p>, not a <legend> — this block is not a fieldset, and a legend outside one is
                invalid. Styled to match the two above so the three still read as one sequence. */}
            <p className="border-ink-200 text-ink-900 w-full border-b pb-2 text-sm font-semibold">
              <span className="text-primary-700">3.</span> Summary
            </p>

            <div className="border-ink-200 bg-surface-raised mt-5 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-ink-500 text-[11px] font-semibold tracking-[0.12em] uppercase">
                    Selected design
                  </p>
                  <p className="font-display text-ink-900 mt-1 text-base leading-snug">
                    {templateName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-ink-500 text-[11px] font-semibold tracking-[0.12em] uppercase">
                    Full price
                  </p>
                  <p className="text-ink-900 mt-1 tabular-nums">
                    {formatPaise(templatePricePaise)}
                  </p>
                </div>
              </div>

              <div className="border-primary-600/40 bg-primary-50 mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
                <span className="text-ink-900 text-sm font-medium">Booking amount</span>
                <span className="text-right">
                  <span className="text-ink-900 block text-lg font-semibold tabular-nums">
                    {formatPaise(bookingAmountPaise)}
                  </span>
                  <span className="text-primary-700 block text-[11px]">Refundable</span>
                </span>
              </div>

              <div className="text-ink-700 mt-3 flex items-center justify-between text-sm">
                <span>Balance on delivery</span>
                <span className="tabular-nums">{formatPaise(balancePaise)}</span>
              </div>

              <p className="bg-warning-50 text-warning-700 mt-4 rounded-md px-3 py-2.5 text-xs leading-relaxed">
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
              className="bg-primary-900 hover:bg-primary-800 mt-5 flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-sm font-semibold tracking-[0.08em] text-white uppercase shadow-[0_10px_24px_-12px_rgba(103,41,33,0.7)] transition-colors disabled:opacity-60"
            >
              {pending ? 'Reserving…' : `Pay ${formatPaise(bookingAmountPaise)} & continue`}
              <span aria-hidden="true">&rarr;</span>
            </button>

            {/*
              The trust row, as asked for.

              These two are claims about a payment integration, and they are rendered whether or
              not one is configured — an explicit product decision, taken after the conditional
              version was built and overruled twice. They become true the day CASHFREE_APP_ID and
              CASHFREE_SECRET_KEY are set; until then they are ahead of the code, and whoever
              wires payment should check this block still reads correctly rather than assuming it
              was always accurate.

              The aggregator named here changed on 2026-07-31 from Razorpay to Cashfree — plan §4
              left the choice to "evaluate at build". If it ever changes again, this string and
              lib/cashfree.ts move together: a badge naming a company we do not use is worse than
              no badge, because it is checkable.
            */}
            <div className="border-ink-100 text-ink-600 mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t pt-4 text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <LockMark />
                256-bit secure payment
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldMark />
                Secured via Cashfree
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <span className="text-ink-600 text-[11px] font-medium">Instant payment options</span>
              {/* Redrawn wordmarks, not the official brand assets — see the note in
                  components/payment-marks.tsx before launch. */}
              <span className="flex items-center gap-3.5">
                <UpiMark />
                <GooglePayMark />
                <PaytmMark />
              </span>
            </div>
          </div>
        </div>

        {/*
          Outside the two-column grid, so "centred" means centred in the card.
          Inside the right-hand column it was centred on that column, which on a wide card put it
          visibly right of the middle — the kind of near-miss that reads as a mistake rather than as
          alignment.
        */}
        <p className="border-ink-100 text-ink-500 border-t px-5 pt-4 pb-6 text-center text-[11px] leading-relaxed sm:px-8">
          By paying, you agree to our{' '}
          <Link href="/p/terms" className="hover:text-ink-800 underline">
            terms of service
          </Link>{' '}
          and{' '}
          <Link href="/p/privacy" className="hover:text-ink-800 underline">
            privacy policy
          </Link>
          .
        </p>
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
function Placed({
  reference,
  message,
  detailsToken,
}: {
  reference: string
  message: string
  detailsToken: string
}) {
  return (
    <div className="space-y-6">
      <div className="border-success-500/40 rounded-3xl border bg-white p-7 text-center sm:p-10">
        {/* "Order received", not "slot reserved" — the row is awaiting_payment, and /admin/orders
            says in as many words that nothing is reserved until the money lands. */}
        <p className="text-success-700 text-xs font-semibold tracking-[0.14em] uppercase">
          Order received
        </p>
        <p className="text-ink-900 mt-4 font-mono text-2xl tracking-[0.1em] sm:text-3xl">
          {reference}
        </p>
        <p className="text-ink-700 mx-auto mt-4 max-w-md text-sm leading-relaxed">{message}</p>
      </div>

      {/*
        STEP TWO, AND THIS IS WHY THE FORM ABOVE IS TWO FIELDS.

        The wording used to be collected before the order existed — eight fields about the card
        standing between somebody and a purchase they had not made yet. It is asked for here
        instead, once there is an order to attach it to and the commitment is already made.

        Optional even now. Somebody who has not settled on the names can close this page: the
        order is placed, the reference is above, and the confirmation says the wording can come
        over WhatsApp. What this screen removes is the *requirement*, not the option.
      */}
      <CardDetailsForm detailsToken={detailsToken} />

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="bg-ink-900 hover:bg-ink-800 rounded-full px-5 py-2.5 text-sm font-medium text-white"
        >
          Back to the site
        </Link>
        <Link
          href="/account"
          className="border-ink-300 text-ink-800 hover:bg-ink-50 rounded-full border px-5 py-2.5 text-sm font-medium"
        >
          My account
        </Link>
      </div>
    </div>
  )
}

/**
 * The card wording, asked for after checkout.
 *
 * Its own useActionState rather than a second branch of the booking form's: the two have
 * different states, different validation and different failure copy, and merging them would mean
 * one reducer where a card error could clear an order confirmation off the screen.
 *
 * The token travels in a hidden input. It is the authorisation for the write — see
 * saveInvitationCard() and 20260803000300 for why it is not the reference — and it never leaves
 * this screen: no URL carries it, so it cannot be pasted, bookmarked or shared by accident.
 */
function CardDetailsForm({ detailsToken }: { detailsToken: string }) {
  const [state, act, pending] = useActionState<CardState, FormData>(saveInvitationCard, {
    status: 'idle',
  })

  if (state.status === 'saved') {
    return (
      <div className="border-success-500/40 rounded-3xl border bg-white p-7 text-center sm:p-10">
        <p className="text-success-700 text-xs font-semibold tracking-[0.14em] uppercase">
          Your card is live
        </p>
        <p className="text-ink-700 mx-auto mt-3 max-w-md text-sm leading-relaxed">
          {state.message}
        </p>
        {/* The link itself, not a "View card" button — this is the string that gets pasted into
            WhatsApp, so it has to be selectable and readable. */}
        <Link
          href={`/invite/${state.cardSlug}`}
          className="text-primary-700 hover:text-primary-800 mt-4 inline-block font-medium break-all underline underline-offset-4"
        >
          /invite/{state.cardSlug}
        </Link>
      </div>
    )
  }

  return (
    <div className="border-ink-200 overflow-hidden rounded-3xl border bg-white">
      <div className="border-ink-100 border-b px-5 py-5 sm:px-8">
        <h2 className="font-display text-ink-900 text-lg">Now, the wording</h2>
        <p className="text-ink-600 mt-1 text-sm leading-relaxed">
          Fill this in and your card goes live straight away — you will get a link you can open and
          check. Or skip it and we will collect the details on WhatsApp.
        </p>
      </div>

      <form action={act} className="px-5 py-6 sm:px-8">
        <input type="hidden" name="detailsToken" value={detailsToken} />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Hosts" htmlFor="hosts" note="Whoever is inviting">
            <input
              id="hosts"
              name="hosts"
              type="text"
              placeholder="Mr & Mrs Sharma"
              className={INPUT}
            />
          </Field>

          <Field label="Venue" htmlFor="venue" note="Commas become line breaks">
            <input
              id="venue"
              name="venue"
              type="text"
              placeholder="SMC Party Plot, Surat"
              className={INPUT}
            />
          </Field>

          <Field label="Groom's name" htmlFor="groomName">
            <input
              id="groomName"
              name="groomName"
              type="text"
              placeholder="Dhanesh"
              className={INPUT}
            />
          </Field>

          <Field label="Bride's name" htmlFor="brideName">
            <input
              id="brideName"
              name="brideName"
              type="text"
              placeholder="Radha"
              className={INPUT}
            />
          </Field>

          <Field label="Groom's parents" htmlFor="groomParents" note="Optional">
            <input id="groomParents" name="groomParents" type="text" className={INPUT} />
          </Field>

          <Field label="Bride's parents" htmlFor="brideParents" note="Optional">
            <input id="brideParents" name="brideParents" type="text" className={INPUT} />
          </Field>

          <Field label="Date, as it should read" htmlFor="cardDate">
            <input
              id="cardDate"
              name="cardDate"
              type="text"
              placeholder="Monday, 1st May"
              className={INPUT}
            />
          </Field>

          <Field label="Time" htmlFor="cardTime">
            <input
              id="cardTime"
              name="cardTime"
              type="text"
              placeholder="9:00 p.m. onwards"
              className={INPUT}
            />
          </Field>
        </div>

        {state.status === 'error' && (
          <p
            role="alert"
            className="border-danger-500/30 bg-danger-50 text-danger-700 mt-5 rounded-md border px-3 py-2.5 text-sm leading-relaxed"
          >
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="bg-primary-700 hover:bg-primary-800 mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white transition-colors disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {pending ? 'Saving…' : 'Save and publish my card'}
        </button>
      </form>
    </div>
  )
}

/**
 * One control style, and three things in it are load-bearing rather than decoration.
 *
 * `min-h-11` is 44px. The old `py-2.5` with 14px text came out around 38px, which is under both
 * Apple's 44px and Material's 48px minimum — on a form with eleven fields that is eleven chances
 * to miss, on the surface where most of these get filled in.
 *
 * `text-base sm:text-sm` looks backwards and is not. iOS Safari zooms the viewport whenever a
 * focused input's text is under 16px, and it does not zoom back out on blur — so a 14px field
 * leaves somebody scrolling a form that is suddenly wider than their screen. 16px on phones
 * costs nothing and stops that entirely; the denser 14px returns from `sm` up.
 *
 * A REAL FOCUS RING, not a border colour change. `focus:border-ink-400` moved the border from
 * ink-200 to ink-400 — a contrast step invisible to most people and worth nothing to anyone
 * navigating by keyboard. The ring is drawn in the primary colour with an offset so it reads
 * against both the white field and the card behind it.
 */
const INPUT =
  'w-full min-h-11 rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-base text-ink-900 ' +
  'outline-none transition-colors placeholder:text-ink-400 ' +
  'focus:border-primary-600 focus:ring-2 focus:ring-primary-600/25 ' +
  'sm:text-sm'

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold text-white"
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
        <span className="text-ink-800 font-medium">
          {label}
          {required && (
            <span aria-hidden="true" className="text-danger-700 ml-0.5">
              *
            </span>
          )}
        </span>
        {/*
          The hint is ink-500, not primary-700.

          In the accent colour it looked like a link sitting inside the label — several of these
          read as actions ("Whoever is inviting", "Commas become line breaks") and a couple of
          people will click one before deciding it is not clickable. A hint is quieter than the
          label it hangs off, never louder.
        */}
        {note && <span className="text-ink-500 text-xs">{note}</span>}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

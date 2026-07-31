'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Badge, Button, Card, CardBody, LinkButton } from '@/components/ui'

import {
  resendEnquiryOtp,
  verifyEnquiryOtp,
  type OtpState,
  type ResendState,
  type RoutedVendor,
} from './otp-actions'

/**
 * Code-entry step. Plan §2 Must-tier: "enquiry flow with OTP + budget/date verification".
 *
 * Rendered only after submitEnquiry() has created the enquiry in `pending_otp` and
 * Supabase has sent the SMS, so both the enquiry id and the E.164 number are already
 * known — this component never guesses either.
 *
 * The copy is doing real work here. Plan §1 argues the OTP gate is what makes vendors
 * respond, so the screen says why the wait exists rather than treating the code as
 * friction to apologise for.
 */

/** Mirrors RESEND_COOLDOWN_MS in ./otp-actions.ts. The server is the authority; this
 *  only stops the button being pressed into a refusal. */
const RESEND_COOLDOWN_SECONDS = 30

/** public.leads.expires_at defaults to now() + 7 days (migration 000600). */
const LEAD_EXPIRY_DAYS = 7

export function OtpStep({
  enquiryId,
  phone,
  message,
  continueHref = '/',
}: {
  enquiryId: string
  phone: string
  message?: string
  continueHref?: string
}) {
  const [state, formAction] = useActionState<OtpState, FormData>(verifyEnquiryOtp, {
    status: 'idle',
  })
  const [resendState, resendAction] = useActionState<ResendState, FormData>(resendEnquiryOtp, {
    status: 'idle',
  })

  // The first code went out a second ago, in submitEnquiry — so the countdown starts
  // full rather than at zero.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  useEffect(() => {
    if (resendState.status === 'resent') setCooldown(resendState.retryAfterSeconds)
    else if (resendState.status === 'error' && resendState.retryAfterSeconds) {
      setCooldown(resendState.retryAfterSeconds)
    }
  }, [resendState])

  if (state.status === 'verified') {
    return <VerifiedPanel state={state} continueHref={continueHref} />
  }

  return (
    <Card>
      <CardBody className="p-8">
        <Badge tone="accent" className="mb-4">
          One last step
        </Badge>
        <h2 className="font-display text-2xl text-ink-900">Verify your number</h2>
        <p className="mt-2 text-ink-600">{message ?? `We sent a 6-digit code to ${phone}.`}</p>
        <p className="mt-4 rounded-lg bg-surface-sunken p-4 text-sm text-ink-600">
          Until you enter this code your enquiry stays unverified and is not sent to any
          vendor. That is deliberate — it is what keeps the vendors on Utsava responsive.
        </p>

        <form action={formAction} className="mt-5">
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <input type="hidden" name="phone" value={phone} />

          <label className="block">
            <span className="sr-only">6-digit verification code</span>
            <input
              name="token"
              className="w-full rounded-lg border border-ink-200 bg-surface-raised px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-ink-900 placeholder:text-ink-300 focus:border-primary-500 focus:outline-none"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              placeholder="······"
              aria-label="6-digit verification code"
            />
          </label>

          {state.status === 'error' && state.fieldErrors?.token && (
            <p className="mt-2 text-sm text-danger-700">{state.fieldErrors.token[0]}</p>
          )}
          {state.status === 'error' && (
            <p className="mt-3 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
              {state.message}
            </p>
          )}
          {state.status === 'unconfigured' && (
            <p className="mt-3 rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700">
              {state.message}
            </p>
          )}

          <VerifyButton />
        </form>

        <form action={resendAction} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <input type="hidden" name="phone" value={phone} />
          <ResendButton cooldown={cooldown} />
          {resendState.status !== 'idle' && (
            <span
              className={
                resendState.status === 'resent'
                  ? 'text-sm text-success-700'
                  : 'text-sm text-ink-500'
              }
            >
              {resendState.message}
            </span>
          )}
        </form>
      </CardBody>
    </Card>
  )
}

/**
 * What happens next, stated concretely. The vendor names come back from
 * app.route_enquiry() itself, so this is the actual routing result rather than a
 * promise about one.
 */
function VerifiedPanel({
  state,
  continueHref,
}: {
  state: Extract<OtpState, { status: 'verified' }>
  continueHref: string
}) {
  return (
    <Card>
      <CardBody className="p-8">
        <Badge tone="success" className="mb-4">
          Verified
        </Badge>
        <h2 className="font-display text-2xl text-ink-900">
          {state.vendorCount > 0 ? 'Your enquiry is with the vendors' : 'Your enquiry is verified'}
        </h2>
        <p className="mt-2 text-ink-600">{state.message}</p>

        {!state.routed && (
          <p className="mt-4 rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700">
            Nothing further is needed from you. Your enquiry is saved and verified; the
            matching run will retry on its own.
          </p>
        )}

        {state.vendors.length > 0 && (
          <>
            <ol className="mt-5 space-y-2">
              {state.vendors.map((vendor, index) => (
                <VendorRow key={vendor.slug} vendor={vendor} position={index + 1} />
              ))}
            </ol>
            <p className="mt-4 text-sm text-ink-600">
              They see your enquiry now and most call back the same day. Each of them has{' '}
              {LEAD_EXPIRY_DAYS} days to respond before the enquiry lapses on their side, so
              you are not left waiting indefinitely.
            </p>
          </>
        )}

        <p className="mt-4 rounded-lg bg-surface-sunken p-4 text-sm text-ink-600">
          At most five vendors will ever see this enquiry. Your number is shared only with
          them, only so they can respond to it, and never resold.
        </p>

        <LinkButton href={continueHref} variant="outline" size="lg" fullWidth className="mt-5">
          Keep browsing
        </LinkButton>
      </CardBody>
    </Card>
  )
}

function VendorRow({ vendor, position }: { vendor: RoutedVendor; position: number }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-ink-100 px-4 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-700">
        {position}
      </span>
      <a href={`/vendor/${vendor.slug}`} className="text-ink-900 hover:text-primary-700">
        {vendor.name}
      </a>
    </li>
  )
}

function VerifyButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending} className="mt-4">
      {pending ? 'Verifying…' : 'Verify and send to vendors'}
    </Button>
  )
}

function ResendButton({ cooldown }: { cooldown: number }) {
  const { pending } = useFormStatus()
  const waiting = cooldown > 0

  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending || waiting}>
      {pending ? 'Sending…' : waiting ? `Send the code again in ${cooldown}s` : 'Send the code again'}
    </Button>
  )
}

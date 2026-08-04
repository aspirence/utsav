import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { paiseToRupees } from '@/lib/db'

/**
 * Cashfree Payment Gateway.
 *
 * Plan §4 left the aggregator to "evaluate at build" between Razorpay Route and Cashfree
 * Easy Split; Cashfree was chosen on 2026-07-31. public.payments.aggregator already
 * admitted both values, so the database did not move.
 *
 * WHY THIS IS SERVER-ONLY. The secret key both authenticates order creation and keys the
 * webhook signature. It never belongs in a bundle, and the `server-only` import above turns
 * a refactor that drags it clientward into a build error rather than a leak.
 *
 * WHAT IT DOES NOT DO. There is no escrow here — plan §14 puts that in July 2027, and Easy
 * Split is a separate product with its own onboarding. This covers the one money path that
 * exists today: the invitation booking amount, taken up front, recorded against an order.
 *
 * UNCONFIGURED IS A SUPPORTED STATE, not an error. With no keys set, isCashfreeConfigured()
 * is false and the booking flow behaves exactly as it did before any of this existed: the
 * order is written `awaiting_payment` and a person follows it up. That is the difference
 * between a payment page that is honest about being manual and one that pretends.
 */

export interface CashfreeConfig {
  appId: string
  secretKey: string
  webhookSecret: string
  baseUrl: string
  env: 'sandbox' | 'production'
}

/**
 * Cashfree pins behaviour to a date-versioned API rather than a path segment, so this
 * travels as a header on every call. Bumping it is a deliberate act with a changelog to
 * read, which is why it is a constant here and not an environment variable somebody could
 * change without noticing what moved.
 */
const API_VERSION = '2026-01-01'

export function cashfreeConfig(): CashfreeConfig | null {
  const appId = process.env.CASHFREE_APP_ID?.trim()
  const secretKey = process.env.CASHFREE_SECRET_KEY?.trim()
  if (!appId || !secretKey) return null

  const env = process.env.CASHFREE_ENV?.trim() === 'production' ? 'production' : 'sandbox'

  return {
    appId,
    secretKey,
    // Cashfree issues no separate webhook secret; the signature is keyed on the same secret
    // key. The override exists so a rotation can be staged — point this at the old secret
    // while the new one goes live for API calls, then clear it.
    webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET?.trim() || secretKey,
    baseUrl: env === 'production' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com',
    env,
  }
}

export function isCashfreeConfigured(): boolean {
  return cashfreeConfig() !== null
}

// ---------------------------------------------------------------------------
// Creating an order
// ---------------------------------------------------------------------------

export interface CreateOrderInput {
  /** Our own reference, e.g. FRM-INV-A1B2C3. Becomes Cashfree's order_id. */
  reference: string
  amountPaise: number
  customer: {
    /** Stable per person, so Cashfree can group a repeat buyer's attempts. */
    id: string
    name: string
    email: string
    /** E.164, as stored. */
    phone: string
  }
  /** Where the customer lands after paying. */
  returnUrl: string
  /** Where Cashfree posts the signed webhook. */
  notifyUrl: string
}

export interface CreateOrderResult {
  orderId: string
  cfOrderId: string
  /** Handed to Cashfree's checkout to start the transaction. */
  paymentSessionId: string
}

export class CashfreeError extends Error {
  // Declared as fields and assigned in the body rather than as constructor parameter
  // properties: those are one of the few TypeScript constructs that cannot be stripped
  // without a full compile, so they break `node --experimental-strip-types` and anything
  // else that erases types rather than transpiling them.
  readonly status: number
  readonly body: string

  constructor(message: string, status: number, body: string) {
    super(message)
    this.name = 'CashfreeError'
    this.status = status
    this.body = body
  }
}

/**
 * Create a payment order and return the session the checkout needs.
 *
 * MONEY CROSSES A UNIT BOUNDARY HERE, which is the one thing in this file worth reading
 * twice. Everything inside Fremmo is integer paise (plan §5); Cashfree's `order_amount` is
 * rupees as a decimal number. paiseToRupees does that conversion in one place, and the
 * amount is asserted to survive the round trip — a float that arrives back as 149899.99999
 * paise is a reconciliation ticket months later, and it is cheaper to refuse to send it.
 */
export async function createCashfreeOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const config = cashfreeConfig()
  if (!config) throw new Error('Cashfree is not configured.')

  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) {
    // Their minimum order_amount is 1 rupee. Below that the API rejects it with a message
    // about the amount, which is a confusing thing to surface from a form.
    throw new Error(
      `Amount must be a whole number of paise, at least 100. Got ${input.amountPaise}.`,
    )
  }

  const orderAmount = paiseToRupees(input.amountPaise)
  if (Math.round(orderAmount * 100) !== input.amountPaise) {
    throw new Error(`Amount ${input.amountPaise} paise does not survive conversion to rupees.`)
  }

  const response = await fetch(`${config.baseUrl}/pg/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': API_VERSION,
      'x-client-id': config.appId,
      'x-client-secret': config.secretKey,
      // Cashfree dedupes on this, so a retried server action cannot create a second order
      // for the same booking. Our reference is already unique per order.
      'x-idempotency-key': input.reference,
    },
    body: JSON.stringify({
      order_id: input.reference,
      order_amount: orderAmount,
      order_currency: 'INR',
      customer_details: {
        customer_id: input.customer.id,
        customer_name: input.customer.name,
        customer_email: input.customer.email,
        customer_phone: input.customer.phone,
      },
      order_meta: {
        return_url: input.returnUrl,
        notify_url: input.notifyUrl,
      },
    }),
    // A payment call that hangs must not hold a server action open indefinitely.
    signal: AbortSignal.timeout(15_000),
  })

  const text = await response.text()

  if (!response.ok) {
    throw new CashfreeError(
      `Cashfree refused the order (${response.status}).`,
      response.status,
      text,
    )
  }

  let body: { order_id?: string; cf_order_id?: string; payment_session_id?: string }
  try {
    body = JSON.parse(text)
  } catch {
    throw new CashfreeError('Cashfree returned a non-JSON body.', response.status, text)
  }

  if (!body.payment_session_id || !body.order_id) {
    throw new CashfreeError('Cashfree returned no payment session.', response.status, text)
  }

  return {
    orderId: body.order_id,
    cfOrderId: body.cf_order_id ?? '',
    paymentSessionId: body.payment_session_id,
  }
}

// ---------------------------------------------------------------------------
// Verifying a webhook
// ---------------------------------------------------------------------------

/**
 * Is this webhook really from Cashfree?
 *
 * THE RAW BODY IS THE POINT. The signature covers the bytes that arrived, so anything that
 * re-serialises the payload first — JSON.parse then JSON.stringify, a body parser, a
 * framework convenience — changes key order or whitespace and every legitimate webhook then
 * fails to verify. The caller must pass request.text() and must not have touched it.
 *
 * The signed string is the timestamp header concatenated directly with that body, HMAC-SHA256
 * with the secret key, base64.
 *
 * THE TIMESTAMP IS CHECKED TOO, and that is not decoration. Without it a valid
 * signature/body pair captured once stays valid forever, so anyone who can replay a request
 * — a proxy log, a misconfigured mirror — can re-fire a payment notification at will. Five
 * minutes is Cashfree's own recommended window.
 *
 * Comparison is constant-time. A byte-by-byte early exit leaks how much of a forged
 * signature was right, which is enough to construct one given patience.
 */
export function verifyCashfreeWebhook(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  opts: { toleranceSeconds?: number; now?: number } = {},
): { ok: true } | { ok: false; reason: string } {
  const config = cashfreeConfig()
  if (!config) return { ok: false, reason: 'Cashfree is not configured.' }
  if (!signature) return { ok: false, reason: 'Missing x-webhook-signature.' }
  if (!timestamp) return { ok: false, reason: 'Missing x-webhook-timestamp.' }

  const tolerance = opts.toleranceSeconds ?? 300
  const now = opts.now ?? Date.now()

  // Cashfree sends epoch seconds. Reject anything unparseable rather than treating it as 0,
  // which would land far outside the window and read as a stale request instead of a
  // malformed one.
  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt)) return { ok: false, reason: 'Unparseable timestamp.' }

  const driftSeconds = Math.abs(now / 1000 - sentAt)
  if (driftSeconds > tolerance) {
    return { ok: false, reason: `Timestamp is ${Math.round(driftSeconds)}s outside the window.` }
  }

  const expected = createHmac('sha256', config.webhookSecret)
    .update(timestamp + rawBody)
    .digest('base64')

  if (!constantTimeEqual(signature, expected)) {
    return { ok: false, reason: 'Signature does not match.' }
  }

  return { ok: true }
}

/**
 * timingSafeEqual throws on a length mismatch, and the throw is itself a timing signal, so
 * both sides are hashed to a fixed width first. The comparison key is a constant: this is
 * about equal-length inputs, not about secrecy.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'fremmo-compare').update(a).digest()
  const hb = createHmac('sha256', 'fremmo-compare').update(b).digest()
  return timingSafeEqual(ha, hb)
}

// ---------------------------------------------------------------------------
// The webhook payload
// ---------------------------------------------------------------------------

export type CashfreeWebhookType =
  'PAYMENT_SUCCESS_WEBHOOK' | 'PAYMENT_FAILED_WEBHOOK' | 'PAYMENT_USER_DROPPED_WEBHOOK'

export interface CashfreePaymentEvent {
  type: CashfreeWebhookType
  orderId: string
  /** Rupees, as Cashfree sends it. Converted at the point of comparison, never stored raw. */
  orderAmount: number
  paymentId: string
  paymentStatus: string
  paymentAmount: number
  paymentTime: string | null
  method: string | null
  /** Only on PAYMENT_FAILED_WEBHOOK. Cashfree's own description, kept verbatim. */
  failureReason: string | null
}

/**
 * Pull the fields we act on out of a webhook body.
 *
 * Deliberately tolerant of everything else: Cashfree adds fields to these payloads, and a
 * strict schema over a third party's growing object turns their next release into our
 * outage. Tolerant of extra keys, strict about the six that decide what happens.
 */
export function parseCashfreeEvent(body: unknown): CashfreePaymentEvent | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>

  const type = b.type
  if (
    type !== 'PAYMENT_SUCCESS_WEBHOOK' &&
    type !== 'PAYMENT_FAILED_WEBHOOK' &&
    type !== 'PAYMENT_USER_DROPPED_WEBHOOK'
  ) {
    return null
  }

  const data = b.data as Record<string, unknown> | undefined
  const order = data?.order as Record<string, unknown> | undefined
  const payment = data?.payment as Record<string, unknown> | undefined

  const orderId = typeof order?.order_id === 'string' ? order.order_id : null
  const paymentId =
    typeof payment?.cf_payment_id === 'string'
      ? payment.cf_payment_id
      : typeof payment?.cf_payment_id === 'number'
        ? String(payment.cf_payment_id)
        : null

  if (!orderId || !paymentId) return null

  // payment_method is an object keyed by instrument ('upi', 'card', …). The key is the
  // useful part; the nested detail is card networks and masked numbers we have no use for.
  const methodObj = payment?.payment_method
  const method =
    typeof methodObj === 'object' && methodObj !== null
      ? (Object.keys(methodObj)[0] ?? null)
      : typeof methodObj === 'string'
        ? methodObj
        : null

  return {
    type,
    orderId,
    orderAmount: Number(order?.order_amount ?? 0),
    paymentId,
    paymentStatus: typeof payment?.payment_status === 'string' ? payment.payment_status : '',
    paymentAmount: Number(payment?.payment_amount ?? 0),
    paymentTime: typeof payment?.payment_time === 'string' ? payment.payment_time : null,
    method,
    failureReason: readFailureReason(data?.error_details ?? payment?.error_details),
  }
}

/**
 * Cashfree puts the reason under error_details on a failure, and has moved it between the
 * data and payment objects across API versions — so both are tried. The description is what
 * a person needs ("insufficient funds"); the codes beside it survive in webhook_payload.
 */
function readFailureReason(details: unknown): string | null {
  if (typeof details === 'string') return details || null
  if (typeof details !== 'object' || details === null) return null

  const d = details as Record<string, unknown>
  for (const key of ['error_description', 'error_reason', 'error_code']) {
    const v = d[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

import { createAdminClient, hasSupabaseEnv, rupeesToPaise } from '@/lib/db'
import {
  isCashfreeConfigured,
  parseCashfreeEvent,
  verifyCashfreeWebhook,
} from '@/lib/cashfree'

/**
 * Cashfree's payment webhook. The only thing in this application that may declare a payment
 * received.
 *
 * ── Why the webhook and not the browser ───────────────────────────────────────
 *
 * The customer also comes back to a return_url after paying, and it is tempting to mark the
 * order paid there — it is the moment the person is looking at the screen. It is also a URL
 * the customer controls. Anyone can open it, and a payment page that trusts a redirect is a
 * payment page that hands out free orders to anyone who reads the address bar.
 *
 * So the return page only ever *reads* status, and this route — a signed server-to-server
 * POST — is what writes it. Plan §6 says the same thing in the abstract: "money paths only
 * in Edge Functions / route handlers with signature verification".
 *
 * ── The order of operations is the security ───────────────────────────────────
 *
 *   1. Read the RAW body. Not request.json(). The signature covers the bytes that arrived,
 *      and parsing then re-serialising changes key order and whitespace, so every real
 *      webhook would fail to verify while a forged one would be no worse off.
 *   2. Verify the signature and the timestamp BEFORE looking at the payload. Nothing below
 *      may depend on a field read out of an unverified body.
 *   3. Only then parse, and act.
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────
 *
 * Cashfree retries until it gets a 2xx, and it will happily deliver the same event twice
 * even after one succeeded. app.record_invitation_payment() is written for that: it updates
 * only `where paid_at is null`, and raises no_data_found when there is nothing to update.
 * That exception means "already handled", not "failed" — its own comment says so — so this
 * route answers 200 to it. Returning 500 would put Cashfree into a retry loop over an order
 * that was settled correctly the first time.
 *
 * ── What a non-2xx means ──────────────────────────────────────────────────────
 *
 * A retry is only useful for something that might succeed later. So:
 *
 *   · bad signature, malformed body, unknown event  → 4xx, never retried, nothing happened
 *   · database unreachable, RPC failed              → 5xx, retry please
 *
 * Answering 200 to a bad signature would hide an attack; answering 500 to one would invite
 * an attacker to hammer the endpoint for free retries.
 */

// The raw body must survive intact, and a payment notification must never be served from a
// cache.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  if (!isCashfreeConfigured()) {
    // No keys: this endpoint cannot verify anything, so it must not pretend to. 503 rather
    // than 404 — the route exists and is expected to work once configured.
    return json(503, { error: 'Cashfree is not configured.' })
  }
  if (!hasSupabaseEnv()) {
    return json(503, { error: 'No database configured.' })
  }

  // Step 1. Raw bytes, untouched.
  const rawBody = await request.text()

  // Step 2. Verify before reading anything out of it.
  const verdict = verifyCashfreeWebhook(
    rawBody,
    request.headers.get('x-webhook-signature'),
    request.headers.get('x-webhook-timestamp'),
  )
  if (!verdict.ok) {
    // The reason is deliberately not echoed to the caller. "Signature does not match" versus
    // "timestamp outside the window" tells someone probing the endpoint which half of the
    // forgery to fix.
    console.warn('[cashfree] rejected webhook:', verdict.reason)
    return json(401, { error: 'Invalid signature.' })
  }

  // Step 3. Now it is safe to look.
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return json(400, { error: 'Malformed JSON.' })
  }

  const event = parseCashfreeEvent(body)
  if (!event) {
    // A shape we do not recognise. 200, not 4xx: the signature was valid, so this is a
    // Cashfree event type we simply do not act on, and asking them to retry it forever
    // helps nobody.
    return json(200, { ignored: true })
  }

  if (event.type !== 'PAYMENT_SUCCESS_WEBHOOK') {
    // Failures and drop-offs leave the order awaiting_payment, which is already true. There
    // is nothing to write, and writing a failure reason onto the order would need a column
    // that does not exist yet.
    return json(200, { ignored: true, type: event.type })
  }

  const supabase = createAdminClient()

  /*
   * THE AMOUNT IS CHECKED AGAINST THE ORDER BEFORE IT IS MARKED PAID.
   *
   * A valid signature proves Cashfree sent this, not that it says what we expect. Orders can
   * be created with the wrong amount, partial captures exist, and an order_id could in
   * principle be reused across environments. Marking a ₹99 booking paid on the strength of a
   * ₹1 payment is the kind of thing nobody finds until reconciliation.
   *
   * booking_amount is integer paise; Cashfree sends rupees. rupeesToPaise rounds rather than
   * truncating, for the reason spelled out where it is defined.
   */
  const { data: order, error: readError } = await supabase
    .from('invitation_orders')
    .select('reference, booking_amount, paid_at')
    .eq('reference', event.orderId)
    .maybeSingle()

  if (readError) {
    console.error('[cashfree] could not read the order:', readError.message)
    return json(500, { error: 'Could not read the order.' })
  }
  if (!order) {
    // Signed by Cashfree but for a reference we have never issued — a different project on
    // the same merchant account, most likely. Not retryable.
    console.warn('[cashfree] no such order:', event.orderId)
    return json(404, { error: 'Unknown order.' })
  }

  const paidPaise = rupeesToPaise(event.paymentAmount)
  if (paidPaise !== order.booking_amount) {
    console.error(
      `[cashfree] amount mismatch on ${event.orderId}: paid ${paidPaise}, expected ${order.booking_amount}`,
    )
    // 200 on purpose. The webhook was delivered correctly and retrying changes nothing; the
    // discrepancy is for a person to settle, and it is now in the log with both figures.
    return json(200, { ignored: true, reason: 'amount-mismatch' })
  }

  const { error: rpcError } = await supabase.rpc('record_invitation_payment', {
    p_reference: event.orderId,
    p_payment_ref: event.paymentId,
    p_paid_at: event.paymentTime ?? new Date().toISOString(),
  })

  if (rpcError) {
    // no_data_found is the RPC's way of saying the order was already paid — a replayed
    // webhook, which is normal and must read as success. Anything else is a real failure
    // and should be retried.
    if (rpcError.code === 'P0002' || /No unpaid order found/i.test(rpcError.message)) {
      return json(200, { alreadyRecorded: true })
    }
    console.error('[cashfree] record_invitation_payment failed:', rpcError.message)
    return json(500, { error: 'Could not record the payment.' })
  }

  return json(200, { recorded: true })
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

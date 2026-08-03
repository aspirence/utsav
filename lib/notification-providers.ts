/**
 * Notification providers — the transport half of the plan §S7 outbox
 * ("WhatsApp/SMS/FCM via outbox + pgmq").
 *
 * `public.notifications` is the ledger; this file is the set of wires that leave the
 * building. Keeping them apart matters: the drain (app/api/workers/notifications/route.ts)
 * owns claiming, retrying and bookkeeping, and never needs to know that WhatsApp wants a
 * template name without dots while FCM wants a registration token.
 *
 * Every provider degrades to a simulated success when its credentials are absent, so a
 * developer with only `pnpm db:start` running can watch the whole funnel — enquiry → OTP →
 * route_enquiry() → outbox → "sent" — without a Meta business account. The simulated flag
 * is carried back to the caller so a simulated send is never mistaken for a real one in
 * the logs.
 *
 * Nothing here is imported by a client component. It reads server-only secrets
 * (WHATSAPP_API_TOKEN, SMS_PROVIDER_API_KEY, FCM_SERVER_KEY) and is only ever reached
 * from the worker route handler, which runs on the Node runtime.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** Mirrors public.notification_channel (migration 000200). */
export type NotificationChannel = 'whatsapp' | 'sms' | 'push' | 'email'

export interface OutboundMessage {
  /** notifications.id — echoed into provider metadata so support can trace one message. */
  id: string
  channel: NotificationChannel
  /** notifications.template, e.g. 'lead.new'. */
  template: string
  /** E.164 phone, FCM registration token, or email address — depending on channel. */
  to: string
  /** notifications.payload, already narrowed to an object. */
  payload: Record<string, unknown>
  title: string
  body: string
}

/**
 * `permanent` is the important field. A malformed phone number or an unknown template
 * will fail identically on every retry, so the drain marks those `failed` immediately
 * rather than burning five attempts and six hours before admitting it.
 */
export type DispatchResult =
  | { ok: true; providerMessageId: string; simulated: boolean }
  | { ok: false; error: string; permanent: boolean }

const REQUEST_TIMEOUT_MS = 10_000

/** Meta pins the Cloud API by version in the path; bump deliberately, not automatically. */
const WHATSAPP_GRAPH_VERSION = 'v21.0'

// ---------------------------------------------------------------------------
// Copy
//
// Plan §7: the templates are business-initiated messages, so on WhatsApp they must map to
// a template approved by Meta. The rendered `body` below is what SMS and push send
// verbatim, and what fills the single {{1}} body variable of the approved WhatsApp
// template. Keep it short — an SMS segment is 160 GSM-7 characters.
// ---------------------------------------------------------------------------

export function renderNotification(
  template: string,
  payload: Record<string, unknown>,
): { title: string; body: string } {
  const site = siteUrl()

  switch (template) {
    case 'lead.new': {
      const on = formatEventDate(payload.event_date)
      return {
        title: 'New enquiry on Fremmo',
        body:
          `New Fremmo enquiry${on ? ` for ${on}` : ''}. ` +
          `Open your partner dashboard to read the brief and reply: ${site}/partner/dashboard/leads`,
      }
    }

    case 'review.request': {
      // Plan §2: reviews are booking-gated, so the link is per-booking rather than a
      // generic "leave a review" page. app.transition_booking() puts booking_id in the
      // payload for exactly this.
      const bookingId = text(payload.booking_id)
      return {
        title: 'How did it go?',
        body:
          'Your Fremmo booking is complete. A short review helps the next couple choose ' +
          `well: ${site}${bookingId ? `/review/${bookingId}` : ''}`,
      }
    }

    case 'booking.initiated': {
      const reference = text(payload.reference)
      return {
        title: 'Booking initiated',
        body:
          `A customer has accepted your quote on Fremmo${reference ? ` (${reference})` : ''}. ` +
          `The advance is held in escrow until the shoot. Details: ${site}/partner/dashboard/quotes`,
      }
    }

    default: {
      // An unknown template is a deploy-order problem (the database enqueued something
      // this build has no copy for), not a customer's problem. Send something honest
      // rather than a raw template key.
      return {
        title: 'Update from Fremmo',
        body: `You have an update on Fremmo: ${site}`,
      }
    }
  }
}

/**
 * WhatsApp template names are lowercase, alphanumeric and underscores only — dots are
 * rejected at upload time — so 'lead.new' is registered with Meta as 'lead_new'.
 */
export function whatsappTemplateName(template: string): string {
  return template.replace(/[^a-z0-9_]+/gi, '_').toLowerCase()
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Single entry point for the drain. Routes by channel; never throws. */
export async function dispatchNotification(message: OutboundMessage): Promise<DispatchResult> {
  if (!message.to.trim()) {
    return {
      ok: false,
      permanent: true,
      error: `No destination address for a ${message.channel} notification.`,
    }
  }

  switch (message.channel) {
    case 'whatsapp':
      return sendWhatsApp(message)
    case 'sms':
      return sendSms(message)
    case 'push':
      return sendPush(message)
    case 'email':
      return sendEmail(message)
    default:
      return {
        ok: false,
        permanent: true,
        error: `Unsupported channel '${String(message.channel)}'.`,
      }
  }
}

/**
 * WhatsApp Cloud API. Plan §7 makes WhatsApp the primary vendor channel because that is
 * where Indian vendors actually read messages.
 *
 * Business-initiated messages outside the 24-hour service window must be `type: 'template'`
 * against a template Meta has approved, which is why this cannot simply post free text.
 */
export async function sendWhatsApp(message: OutboundMessage): Promise<DispatchResult> {
  const token = process.env.WHATSAPP_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    return simulate('whatsapp', message, 'WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID')
  }

  const to = digitsOnly(message.to)
  if (to.length < 8) {
    return { ok: false, permanent: true, error: `'${message.to}' is not a usable phone number.` }
  }

  return postJson(
    `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`,
    { Authorization: `Bearer ${token}` },
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      // The Cloud API wants the number without a leading '+'.
      to,
      type: 'template',
      template: {
        name: whatsappTemplateName(message.template),
        language: { code: 'en' },
        // Fremmo's approved templates take one body variable, so the whole rendered
        // sentence goes in as {{1}} and the copy above stays the single source of truth.
        components: [{ type: 'body', parameters: [{ type: 'text', text: message.body }] }],
      },
    },
    (json) => {
      const messages = (json as { messages?: { id?: string }[] }).messages
      const first = Array.isArray(messages) ? messages[0] : undefined
      return first?.id ?? null
    },
  )
}

/**
 * SMS. Deliberately provider-agnostic: the aggregator is not chosen yet, and every Indian
 * gateway (MSG91, Kaleyra, Gupshup, Twilio) accepts a JSON POST that differs only in field
 * names. SMS_PROVIDER_URL is what pins it down at deploy time.
 *
 * SMS_DLT_TEMPLATE_ID is not optional in production — TRAI's DLT registry rejects
 * transactional SMS whose body does not match a registered template — but it is left
 * unset locally so the simulated path still works.
 */
export async function sendSms(message: OutboundMessage): Promise<DispatchResult> {
  const apiKey = process.env.SMS_PROVIDER_API_KEY
  const endpoint = process.env.SMS_PROVIDER_URL

  if (!apiKey || !endpoint) {
    return simulate('sms', message, 'SMS_PROVIDER_API_KEY / SMS_PROVIDER_URL')
  }

  const to = message.to.trim()
  if (!/^\+[1-9]\d{7,14}$/.test(to)) {
    return { ok: false, permanent: true, error: `'${to}' is not an E.164 phone number.` }
  }

  const dltTemplateId = process.env.SMS_DLT_TEMPLATE_ID
  const senderId = process.env.SMS_SENDER_ID ?? 'FREMMO'

  return postJson(
    endpoint,
    { Authorization: `Bearer ${apiKey}` },
    {
      to,
      sender: senderId,
      message: message.body,
      // Idempotency at the gateway as well as in our own outbox: a retry that we believe
      // failed but the gateway believes succeeded must not become two SMS.
      client_reference: message.id,
      ...(dltTemplateId ? { dlt_template_id: dltTemplateId } : {}),
    },
    (json) => {
      const body = json as { message_id?: string; id?: string; messageId?: string }
      return body.message_id ?? body.messageId ?? body.id ?? null
    },
  )
}

/**
 * FCM push, for the Expo vendor app (plan §S8). Uses the legacy server-key endpoint
 * because FCM_SERVER_KEY is what the environment carries; moving to the HTTP v1 API means
 * a service-account JSON and an OAuth token exchange, which is a separate change.
 *
 * There is no device-token table yet, so `to` can only come from
 * notifications.to_push_token. A row without one fails permanently rather than retrying.
 */
export async function sendPush(message: OutboundMessage): Promise<DispatchResult> {
  const serverKey = process.env.FCM_SERVER_KEY
  if (!serverKey) return simulate('push', message, 'FCM_SERVER_KEY')

  return postJson(
    'https://fcm.googleapis.com/fcm/send',
    { Authorization: `key=${serverKey}` },
    {
      to: message.to,
      notification: { title: message.title, body: message.body },
      // The app routes on `template`; payload values are stringified because FCM data
      // fields must be strings.
      data: {
        template: message.template,
        notification_id: message.id,
        ...stringifyValues(message.payload),
      },
    },
    (json) => {
      const body = json as { message_id?: string; results?: { message_id?: string }[] }
      const first = Array.isArray(body.results) ? body.results[0] : undefined
      return body.message_id ?? first?.message_id ?? null
    },
  )
}

/**
 * Email is the lowest-priority channel — no enqueue site writes one today — and no
 * provider has been chosen. It stays simulated until EMAIL_API_URL/EMAIL_API_KEY exist,
 * which keeps a stray email row from wedging the drain.
 */
export async function sendEmail(message: OutboundMessage): Promise<DispatchResult> {
  const apiKey = process.env.EMAIL_API_KEY
  const endpoint = process.env.EMAIL_API_URL

  if (!apiKey || !endpoint) {
    return simulate('email', message, 'EMAIL_API_KEY / EMAIL_API_URL')
  }

  return postJson(
    endpoint,
    { Authorization: `Bearer ${apiKey}` },
    {
      to: message.to,
      from: process.env.EMAIL_FROM ?? 'no-reply@fremmo.in',
      subject: message.title,
      text: message.body,
      client_reference: message.id,
    },
    (json) => {
      const body = json as { id?: string; message_id?: string }
      return body.id ?? body.message_id ?? null
    },
  )
}

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

/**
 * One HTTP shape for every provider, because the retry decision is the same for all of
 * them: 4xx means the request itself is wrong and will stay wrong; 408, 429 and 5xx mean
 * try again later; a thrown error means the network, which is always worth retrying.
 */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  readMessageId: (json: unknown) => string | null,
): Promise<DispatchResult> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, permanent: false, error: `Network error: ${describe(error)}` }
  }

  const raw = await response.text().catch(() => '')

  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500
    return {
      ok: false,
      permanent: !retryable,
      error: `HTTP ${response.status}: ${raw.slice(0, 500) || response.statusText}`,
    }
  }

  let parsed: unknown = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }

  // A 2xx with an unreadable body is still a send. Record the acknowledgement rather than
  // retrying and risking a duplicate message the customer can see.
  return { ok: true, providerMessageId: readMessageId(parsed) ?? `ack:${Date.now()}`, simulated: false }
}

/**
 * The no-credentials path. Logs exactly what would have gone out so a local run is
 * inspectable, and returns a `simulated:` id that is obviously not a provider id.
 */
function simulate(
  channel: NotificationChannel,
  message: OutboundMessage,
  missingEnv: string,
): DispatchResult {
  console.info(
    `[notifications] ${channel} simulated (${missingEnv} unset) → ${message.to}: ${message.body}`,
  )
  return { ok: true, providerMessageId: `simulated:${channel}:${message.id}`, simulated: true }
}

/** The site the deep links point at. Matches .env.example's local default. */
function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

function formatEventDate(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null

  // A date column arrives as midnight UTC. Formatting in IST keeps "12 Feb 2027" from
  // sliding to the 11th on a server running in UTC-something.
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(parsed)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '')
}

function stringifyValues(payload: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue
    out[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  return out
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * drain-notifications — the scheduled mirror of apps/web/app/api/workers/notifications.
 * Plan §S7: "WhatsApp/SMS/FCM via outbox + pgmq".
 *
 * ── Why an outbox at all ───────────────────────────────────────────────────────
 *
 * app.route_enquiry() and app.transition_booking() never call a messaging provider. They
 * INSERT into public.notifications inside the same transaction as the business change
 * (app.enqueue_notification, migration 001500). That single commit is the whole point:
 *
 *   · Sending before the commit would WhatsApp a vendor about a lead that then rolled
 *     back, and there is no way to un-send a message.
 *   · Sending after the commit would, on a crash in between, leave a lead that exists,
 *     is billed against the vendor's credits, and that nobody is ever told about. Vendors
 *     renew on whether leads arrive, so that is the most expensive bug this system has.
 *
 * With the outbox, either the lead and its notification both exist or neither does.
 * `notifications.dedupe_key` is UNIQUE and app.enqueue_notification() does
 * `on conflict do nothing`, so a retried action, a replayed webhook or a double submit all
 * collapse onto the one row — at-least-once at the transport, exactly-once in the ledger.
 *
 * ── Why this exists as well as the Next.js route ───────────────────────────────
 *
 * The route handler is convenient for local runs and for Vercel Cron. This function is the
 * deployment that does not depend on the web app being up: it runs on Supabase's schedule,
 * next to the database, and keeps draining if a Vercel deploy is mid-rollback. The logic
 * is deliberately duplicated rather than shared — apps/web is a Node/Next workspace and
 * this is Deno, and a shared package between them would drag Next's module graph into the
 * edge runtime.
 *
 * Deploy:
 *   supabase functions deploy drain-notifications
 *   supabase secrets set WORKER_SECRET=... WHATSAPP_API_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=...
 *
 * Schedule (every minute) with pg_cron in a migration owned by the schema agent:
 *   select cron.schedule('drain-notifications', '* * * * *', $$
 *     select net.http_post(
 *       url     := 'https://<ref>.supabase.co/functions/v1/drain-notifications',
 *       headers := jsonb_build_object('x-utsava-worker-secret', '<WORKER_SECRET>')
 *     );
 *   $$);
 *
 * SUPABASE_SERVICE_ROLE_KEY is injected by the platform. public.notifications has no
 * client write policy at all, so nothing less than the service role can claim a row.
 */

const MAX_BATCH = 50
const CONCURRENCY = 8
const STALE_SENDING_MS = 5 * 60 * 1000
const BACKOFF_BASE_SECONDS = 60
const BACKOFF_MAX_SECONDS = 6 * 60 * 60
const REQUEST_TIMEOUT_MS = 10_000
const WHATSAPP_GRAPH_VERSION = 'v21.0'
const HEADER_NAME = 'x-utsava-worker-secret'

const NOTIFICATION_COLUMNS =
  'id, channel, template, payload, recipient_id, vendor_id, to_phone, to_email, ' +
  'to_push_token, attempts, max_attempts'

type Channel = 'whatsapp' | 'sms' | 'push' | 'email'

interface NotificationRow {
  id: string
  channel: Channel
  template: string
  payload: Record<string, unknown> | null
  recipient_id: string | null
  vendor_id: string | null
  to_phone: string | null
  to_email: string | null
  to_push_token: string | null
  attempts: number
  max_attempts: number
}

type DispatchResult =
  | { ok: true; providerMessageId: string; simulated: boolean }
  | { ok: false; error: string; permanent: boolean }

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('WORKER_SECRET')
  if (!secret) {
    // Fail closed. This function sends real messages under the service-role key.
    return json(
      {
        status: 'unconfigured',
        message: 'WORKER_SECRET is not set, so the drain refuses every request.',
        claimed: 0,
        sent: 0,
        failed: 0,
      },
      503,
    )
  }

  if (!(await isAuthorized(request, secret))) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    return json(
      {
        status: 'unconfigured',
        message: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing.',
        claimed: 0,
        sent: 0,
        failed: 0,
      },
      503,
    )
  }

  const limit = clampLimit(await readLimit(request))
  const supabase: any = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Recover rows a previous invocation claimed and then died holding.
  const requeued = await requeueStaleSending(supabase)

  // 2. Claim. The SELECT only nominates candidates; the UPDATE's `.eq('status','queued')`
  //    is what makes the claim atomic. Under READ COMMITTED, Postgres re-checks that
  //    predicate after locking the row, so a concurrent invocation's UPDATE matches
  //    nothing and `returning` hands each worker only the rows it actually flipped.
  const nowIso = new Date().toISOString()
  const { data: due, error: dueError } = await supabase
    .from('notifications')
    .select('id')
    .eq('status', 'queued')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (dueError) {
    return json({ status: 'error', message: dueError.message, claimed: 0, sent: 0, failed: 0 }, 200)
  }

  const ids: string[] = (due ?? []).map((row: { id: string }) => row.id)
  if (ids.length === 0) {
    return json({ status: 'ok', claimed: 0, sent: 0, failed: 0, retrying: 0, requeued, simulated: 0 }, 200)
  }

  const { data: claimed, error: claimError } = await supabase
    .from('notifications')
    .update({ status: 'sending' })
    .in('id', ids)
    .eq('status', 'queued')
    .select(NOTIFICATION_COLUMNS)

  if (claimError) {
    return json({ status: 'error', message: claimError.message, claimed: 0, sent: 0, failed: 0 }, 200)
  }

  const rows: NotificationRow[] = claimed ?? []

  // 3. Resolve destinations in bulk. app.enqueue_notification() usually leaves to_phone
  //    null and records who the message is for, so the address is looked up at send time
  //    against the vendor's or customer's current number.
  const book = await resolveAddresses(supabase, rows)

  let sent = 0
  let failed = 0
  let retrying = 0
  let simulated = 0

  for (const chunk of chunks(rows, CONCURRENCY)) {
    const outcomes = await Promise.all(
      chunk.map(async (row) => ({ row, result: await send(row, book) })),
    )

    for (const { row, result } of outcomes) {
      if (result.ok) {
        sent += 1
        if (result.simulated) simulated += 1
        await supabase
          .from('notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: result.providerMessageId,
            attempts: row.attempts + 1,
            last_error: null,
          })
          .eq('id', row.id)
        continue
      }

      const attempts = row.attempts + 1
      if (result.permanent || attempts >= row.max_attempts) {
        failed += 1
        await supabase
          .from('notifications')
          .update({
            status: 'failed',
            attempts,
            failed_at: new Date().toISOString(),
            last_error: result.error.slice(0, 1000),
          })
          .eq('id', row.id)
      } else {
        retrying += 1
        await supabase
          .from('notifications')
          .update({
            status: 'queued',
            attempts,
            last_error: result.error.slice(0, 1000),
            scheduled_for: nextAttemptAt(attempts),
          })
          .eq('id', row.id)
      }
    }
  }

  return json({ status: 'ok', claimed: rows.length, sent, failed, retrying, requeued, simulated }, 200)
})

// ---------------------------------------------------------------------------
// Claiming helpers
// ---------------------------------------------------------------------------

/**
 * A row stuck in 'sending' means a worker died between claiming it and writing down what
 * happened. Five minutes, not seconds: a slow provider must not be mistaken for a corpse.
 */
async function requeueStaleSending(supabase: any): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SENDING_MS).toISOString()
  const { data, error } = await supabase
    .from('notifications')
    .update({ status: 'queued', last_error: 'Requeued after a worker stalled mid-send.' })
    .eq('status', 'sending')
    .lt('updated_at', cutoff)
    .select('id')

  if (error) {
    console.error('[drain] could not requeue stalled rows:', error.message)
    return 0
  }
  return (data ?? []).length
}

interface AddressBook {
  vendors: Map<string, { whatsapp_phone: string | null; contact_phone: string | null; contact_email: string | null }>
  profiles: Map<string, { phone: string | null; email: string | null }>
}

async function resolveAddresses(supabase: any, rows: NotificationRow[]): Promise<AddressBook> {
  const vendorIds = unique(rows.map((r) => r.vendor_id))
  const profileIds = unique(rows.map((r) => r.recipient_id))

  const vendors: AddressBook['vendors'] = new Map()
  const profiles: AddressBook['profiles'] = new Map()

  if (vendorIds.length > 0) {
    const { data, error } = await supabase
      .from('vendor_private')
      .select('vendor_id, contact_phone, whatsapp_phone, contact_email')
      .in('vendor_id', vendorIds)
    if (error) console.error('[drain] vendor contact lookup failed:', error.message)
    for (const row of data ?? []) vendors.set(row.vendor_id, row)
  }

  if (profileIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, phone, email')
      .in('id', profileIds)
    if (error) console.error('[drain] profile contact lookup failed:', error.message)
    for (const row of data ?? []) profiles.set(row.id, row)
  }

  return { vendors, profiles }
}

function addressFor(row: NotificationRow, book: AddressBook): string {
  const vendor = row.vendor_id ? book.vendors.get(row.vendor_id) : undefined
  const profile = row.recipient_id ? book.profiles.get(row.recipient_id) : undefined

  switch (row.channel) {
    case 'whatsapp':
      // A vendor's WhatsApp number is often not the number they answer calls on.
      return row.to_phone ?? vendor?.whatsapp_phone ?? vendor?.contact_phone ?? profile?.phone ?? ''
    case 'sms':
      return row.to_phone ?? vendor?.contact_phone ?? profile?.phone ?? ''
    case 'email':
      return row.to_email ?? vendor?.contact_email ?? profile?.email ?? ''
    case 'push':
      // No device-token table exists yet; the row must carry the token.
      return row.to_push_token ?? ''
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Copy and providers — the mirror of apps/web/lib/notification-providers.ts
// ---------------------------------------------------------------------------

function renderNotification(
  template: string,
  payload: Record<string, unknown>,
): { title: string; body: string } {
  // Same link target as apps/web/lib/notification-providers.ts. NEXT_PUBLIC_SITE_URL is
  // accepted as well so one `supabase secrets set --env-file .env` feeds both mirrors.
  const site = (
    Deno.env.get('SITE_URL') ??
    Deno.env.get('NEXT_PUBLIC_SITE_URL') ??
    'https://utsava.in'
  ).replace(/\/+$/, '')

  switch (template) {
    case 'lead.new': {
      const on = formatEventDate(payload.event_date)
      return {
        title: 'New enquiry on Utsava',
        body:
          `New Utsava enquiry${on ? ` for ${on}` : ''}. ` +
          `Open your partner dashboard to read the brief and reply: ${site}/partner/dashboard/leads`,
      }
    }
    case 'review.request': {
      // Plan §2: reviews are booking-gated, so the link is per-booking. Not a generic
      // page — app.transition_booking() puts booking_id in the payload for this.
      const bookingId = typeof payload.booking_id === 'string' ? payload.booking_id : null
      return {
        title: 'How did it go?',
        body:
          'Your Utsava booking is complete. A short review helps the next couple choose ' +
          `well: ${site}${bookingId ? `/review/${bookingId}` : ''}`,
      }
    }
    case 'booking.initiated': {
      const reference = typeof payload.reference === 'string' ? payload.reference : null
      return {
        title: 'Booking initiated',
        body:
          `A customer has accepted your quote on Utsava${reference ? ` (${reference})` : ''}. ` +
          `The advance is held in escrow until the shoot. Details: ${site}/partner/dashboard/quotes`,
      }
    }
    default:
      return { title: 'Update from Utsava', body: `You have an update on Utsava: ${site}` }
  }
}

async function send(row: NotificationRow, book: AddressBook): Promise<DispatchResult> {
  const to = addressFor(row, book)
  if (!to) {
    // No retry can conjure a phone number, so this is terminal by construction.
    return {
      ok: false,
      permanent: true,
      error: `No ${row.channel} address for ${row.vendor_id ?? row.recipient_id ?? 'unknown recipient'}.`,
    }
  }

  const payload: Record<string, unknown> =
    row.payload && typeof row.payload === 'object' ? row.payload : {}
  const { title, body } = renderNotification(row.template, payload)

  try {
    switch (row.channel) {
      case 'whatsapp':
        return await sendWhatsApp(row, to, body)
      case 'sms':
        return await sendSms(row, to, body)
      case 'push':
        return await sendPush(row, to, title, body, payload)
      case 'email':
        return await sendEmail(row, to, title, body)
      default:
        return { ok: false, permanent: true, error: `Unsupported channel '${row.channel}'.` }
    }
  } catch (error) {
    return { ok: false, permanent: false, error: describe(error) }
  }
}

/**
 * WhatsApp Cloud API. Business-initiated messages must be `type: 'template'` against a
 * template Meta has approved, which is why free text is not an option. Template names
 * cannot contain dots, so 'lead.new' is registered as 'lead_new'.
 */
async function sendWhatsApp(row: NotificationRow, to: string, body: string): Promise<DispatchResult> {
  const token = Deno.env.get('WHATSAPP_API_TOKEN')
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  if (!token || !phoneNumberId) {
    return simulate('whatsapp', row, to, body, 'WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID')
  }

  const digits = to.replace(/\D+/g, '')
  if (digits.length < 8) {
    return { ok: false, permanent: true, error: `'${to}' is not a usable phone number.` }
  }

  return postJson(
    `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`,
    { Authorization: `Bearer ${token}` },
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'template',
      template: {
        name: row.template.replace(/[^a-z0-9_]+/gi, '_').toLowerCase(),
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: body }] }],
      },
    },
    (json) => (json as any)?.messages?.[0]?.id ?? null,
  )
}

/**
 * SMS. Provider-agnostic on purpose — the aggregator is not chosen yet and every Indian
 * gateway takes a JSON POST differing only in field names. SMS_DLT_TEMPLATE_ID is
 * mandatory in production: TRAI's DLT registry rejects transactional SMS that does not
 * match a registered template.
 */
async function sendSms(row: NotificationRow, to: string, body: string): Promise<DispatchResult> {
  const apiKey = Deno.env.get('SMS_PROVIDER_API_KEY')
  const endpoint = Deno.env.get('SMS_PROVIDER_URL')
  if (!apiKey || !endpoint) {
    return simulate('sms', row, to, body, 'SMS_PROVIDER_API_KEY / SMS_PROVIDER_URL')
  }

  if (!/^\+[1-9]\d{7,14}$/.test(to)) {
    return { ok: false, permanent: true, error: `'${to}' is not an E.164 phone number.` }
  }

  const dltTemplateId = Deno.env.get('SMS_DLT_TEMPLATE_ID')

  return postJson(
    endpoint,
    { Authorization: `Bearer ${apiKey}` },
    {
      to,
      sender: Deno.env.get('SMS_SENDER_ID') ?? 'UTSAVA',
      message: body,
      // Gateway-side idempotency, so a retry we think failed cannot become two SMS.
      client_reference: row.id,
      ...(dltTemplateId ? { dlt_template_id: dltTemplateId } : {}),
    },
    (json) => (json as any)?.message_id ?? (json as any)?.messageId ?? (json as any)?.id ?? null,
  )
}

/**
 * FCM push for the Expo vendor app (plan §S8). Legacy server-key endpoint, because
 * FCM_SERVER_KEY is what the environment carries; HTTP v1 needs a service account and an
 * OAuth exchange, which is a separate change.
 */
async function sendPush(
  row: NotificationRow,
  to: string,
  title: string,
  body: string,
  payload: Record<string, unknown>,
): Promise<DispatchResult> {
  const serverKey = Deno.env.get('FCM_SERVER_KEY')
  if (!serverKey) return simulate('push', row, to, body, 'FCM_SERVER_KEY')

  const data: Record<string, string> = { template: row.template, notification_id: row.id }
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue
    data[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }

  return postJson(
    'https://fcm.googleapis.com/fcm/send',
    { Authorization: `key=${serverKey}` },
    { to, notification: { title, body }, data },
    (json) => (json as any)?.message_id ?? (json as any)?.results?.[0]?.message_id ?? null,
  )
}

/** No email provider is chosen yet, so this stays simulated rather than wedging the drain. */
async function sendEmail(
  row: NotificationRow,
  to: string,
  title: string,
  body: string,
): Promise<DispatchResult> {
  const apiKey = Deno.env.get('EMAIL_API_KEY')
  const endpoint = Deno.env.get('EMAIL_API_URL')
  if (!apiKey || !endpoint) return simulate('email', row, to, body, 'EMAIL_API_KEY / EMAIL_API_URL')

  return postJson(
    endpoint,
    { Authorization: `Bearer ${apiKey}` },
    {
      to,
      from: Deno.env.get('EMAIL_FROM') ?? 'no-reply@utsava.in',
      subject: title,
      text: body,
      client_reference: row.id,
    },
    (json) => (json as any)?.id ?? (json as any)?.message_id ?? null,
  )
}

/**
 * One HTTP shape for every provider, because the retry decision is identical: 4xx means
 * the request is wrong and will stay wrong; 408, 429 and 5xx mean try again; a thrown
 * error means the network, which is always worth retrying.
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
  // retrying and risking a duplicate the vendor can see.
  return { ok: true, providerMessageId: readMessageId(parsed) ?? `ack:${Date.now()}`, simulated: false }
}

/** No credentials: log exactly what would have gone out and return an obviously fake id. */
function simulate(
  channel: Channel,
  row: NotificationRow,
  to: string,
  body: string,
  missingEnv: string,
): DispatchResult {
  console.info(`[drain] ${channel} simulated (${missingEnv} unset) → ${to}: ${body}`)
  return { ok: true, providerMessageId: `simulated:${channel}:${row.id}`, simulated: true }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison over SHA-256 digests. Hashing is not for secrecy — it is how
 * both sides reach a fixed 32 bytes, so the comparison cannot leak the secret's length.
 */
async function isAuthorized(request: Request, secret: string): Promise<boolean> {
  const header = request.headers.get(HEADER_NAME)
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const presented = header ?? bearer ?? ''
  if (!presented) return false

  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(presented)),
    crypto.subtle.digest('SHA-256', encoder.encode(secret)),
  ])

  const left = new Uint8Array(a)
  const right = new Uint8Array(b)
  let diff = left.length ^ right.length
  for (let i = 0; i < left.length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}

async function readLimit(request: Request): Promise<unknown> {
  try {
    const raw = await request.text()
    if (raw.trim() === '') return undefined
    return (JSON.parse(raw) as { limit?: unknown }).limit
  } catch {
    // A cron ping with no body. Defaults are exactly right.
    return undefined
  }
}

function clampLimit(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return MAX_BATCH
  return Math.min(MAX_BATCH, Math.max(1, Math.floor(n)))
}

/**
 * 60s · 2^(attempts-1), capped at six hours, with up to 10% jitter. Without the jitter,
 * every row queued during a provider outage retries in the same second and knocks the
 * provider over again.
 */
function nextAttemptAt(attempts: number): string {
  const base = Math.min(BACKOFF_BASE_SECONDS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_SECONDS)
  return new Date(Date.now() + base * (1 + Math.random() * 0.1) * 1000).toISOString()
}

function formatEventDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  // A date column arrives as midnight UTC; formatting in IST keeps "12 Feb 2027" from
  // sliding to the 11th on a UTC host.
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(parsed)
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v !== ''))]
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

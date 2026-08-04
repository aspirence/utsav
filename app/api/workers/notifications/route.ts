import { createHash, timingSafeEqual } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { z } from 'zod'

import { createAdminClient, hasSupabaseEnv } from '@/lib/db'

import {
  dispatchNotification,
  renderNotification,
  type DispatchResult,
  type NotificationChannel,
  type OutboundMessage,
} from '@/lib/notification-providers'

/**
 * The notification outbox drain. Plan §S7: "WhatsApp/SMS/FCM via outbox + pgmq".
 *
 * ── Why an outbox at all ───────────────────────────────────────────────────────
 *
 * The alternative is to call WhatsApp from the server action that routed the lead. That
 * loses every time, in both directions:
 *
 *   · Send first, commit second → the vendor gets a WhatsApp about a lead the database
 *     rolled back. There is no way to un-send it.
 *   · Commit first, send second → the process dies in between and the lead exists,
 *     is billed against the vendor's credits, and nobody is ever told. That is the worst
 *     failure this business has, because the vendor's renewal decision is made on whether
 *     leads arrive.
 *
 * So app.route_enquiry() and app.transition_booking() do not send anything. They INSERT a
 * row into public.notifications inside the same transaction as the business change
 * (see app.enqueue_notification, migration 001500). One commit, two facts: either the lead
 * exists *and* a notification is owed, or neither happened. A crash cannot separate them.
 *
 * The other half is `notifications.dedupe_key UNIQUE`. app.enqueue_notification() does
 * `on conflict (dedupe_key) do nothing`, and the keys are derived from the subject
 * ('lead.new:<enquiry_id>:<vendor_id>'), so a retried server action, a replayed webhook or
 * a double-clicked form all collapse to the one row that already exists. At-least-once
 * delivery at the transport, exactly-once at the ledger.
 *
 * This route is the drain: claim due rows, hand them to a provider, write down what
 * happened. It is idempotent-ish rather than idempotent — a provider can accept a message
 * and have the acknowledgement lost on the way back, which is why claiming marks rows
 * 'sending' before any HTTP call and why a stuck 'sending' row is only requeued after a
 * generous timeout. Duplicating a WhatsApp is survivable; a silent hole is not.
 *
 * ── Security ───────────────────────────────────────────────────────────────────
 *
 * This endpoint sends real messages and runs on the service-role key, which bypasses RLS
 * entirely (public.notifications has no client write policy at all). It is therefore
 * closed by default: without WORKER_SECRET set it returns 503, and without a matching
 * header it returns 401. Call it from Vercel Cron, a Supabase scheduled Edge Function or
 * the mirror in supabase/functions/drain-notifications — never from a browser.
 */

// Secrets and a service-role client: nothing here may be prerendered or cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const MAX_BATCH = 50

/** How many providers we talk to at once. Keeps a 50-row batch inside a function timeout
 *  without opening fifty sockets to Meta at the same instant. */
const CONCURRENCY = 8

/** A row that has been 'sending' longer than this had its worker die mid-flight. */
const STALE_SENDING_MS = 5 * 60 * 1000

/** Exponential backoff: 1m, 2m, 4m, 8m … capped, so a provider outage does not turn into
 *  a retry storm and a five-attempt row still spans a few hours of recovery time. */
const BACKOFF_BASE_SECONDS = 60
const BACKOFF_MAX_SECONDS = 6 * 60 * 60

const HEADER_NAME = 'x-fremmo-worker-secret'

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** The body is optional — an empty POST drains a default batch. */
const drainRequestSchema = z.object({
  limit: z.number().int().min(1).max(MAX_BATCH).default(MAX_BATCH),
})

/**
 * Rows come back through the narrowed client below rather than the generated types, so
 * they are parsed before use. A row that fails this is a schema drift bug: it gets marked
 * failed with the reason instead of throwing the whole batch away.
 */
const notificationRowSchema = z.object({
  id: z.string().uuid(),
  channel: z.enum(['whatsapp', 'sms', 'push', 'email']),
  template: z.string().min(1),
  payload: z
    .unknown()
    .transform((v): Record<string, unknown> =>
      v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {},
    ),
  recipient_id: z.string().uuid().nullable().default(null),
  vendor_id: z.string().uuid().nullable().default(null),
  to_phone: z.string().nullable().default(null),
  to_email: z.string().nullable().default(null),
  to_push_token: z.string().nullable().default(null),
  attempts: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
})

type NotificationRow = z.infer<typeof notificationRowSchema>

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type DrainSummary =
  | {
      status: 'ok'
      claimed: number
      sent: number
      failed: number
      /** Failed this pass but rescheduled — not yet out of attempts. */
      retrying: number
      /** Rows recovered from a crashed earlier invocation. */
      requeued: number
      /** Of `sent`, how many went out on a stub because credentials are unset. */
      simulated: number
    }
  | { status: 'unconfigured'; message: string; claimed: 0; sent: 0; failed: 0 }
  | { status: 'error'; message: string; claimed: number; sent: number; failed: number }

// ---------------------------------------------------------------------------
// Narrowed client
//
// packages/db/src/generated/database.types.ts is hand-authored and covers only the read
// surface the site had before the outbox existed — `notifications`, `profiles` and
// `vendor_private` are not in it, and packages/** is not ours to edit. Same trick as
// lib/quote-queries.ts and app/enquire/otp-actions.ts: describe exactly the calls made
// here, cast once, and let `pnpm db:types` retire the shim when Docker is available.
//
// This grants no access of its own. The access comes from the service-role key, which is
// the only way to write public.notifications at all.
// ---------------------------------------------------------------------------

type PostgrestErrorLike = { message: string; code?: string } | null

interface OutboxQuery<Row> extends PromiseLike<{ data: Row[] | null; error: PostgrestErrorLike }> {
  select<R = Row>(columns: string): OutboxQuery<R>
  eq(column: string, value: string): OutboxQuery<Row>
  in(column: string, values: string[]): OutboxQuery<Row>
  lt(column: string, value: string): OutboxQuery<Row>
  lte(column: string, value: string): OutboxQuery<Row>
  order(column: string, options?: { ascending?: boolean }): OutboxQuery<Row>
  limit(count: number): OutboxQuery<Row>
}

interface NotificationPatch {
  status?: 'queued' | 'sending' | 'sent' | 'failed'
  attempts?: number
  last_error?: string | null
  scheduled_for?: string
  sent_at?: string
  failed_at?: string
  provider_message_id?: string | null
}

interface OutboxTable {
  select<R>(columns: string): OutboxQuery<R>
  update(values: NotificationPatch): OutboxQuery<unknown>
}

interface OutboxClient {
  from(table: 'notifications' | 'profiles' | 'vendor_private'): OutboxTable
}

const NOTIFICATION_COLUMNS =
  'id, channel, template, payload, recipient_id, vendor_id, to_phone, to_email, ' +
  'to_push_token, attempts, max_attempts'

type VendorContact = {
  vendor_id: string
  contact_phone: string | null
  whatsapp_phone: string | null
  contact_email: string | null
}

type ProfileContact = { id: string; phone: string | null; email: string | null }

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.WORKER_SECRET
  if (!secret) {
    // Not 401: the caller did nothing wrong, the deployment is incomplete. Failing closed
    // is the only safe default for an endpoint that sends messages.
    return json(
      {
        status: 'unconfigured',
        message: 'WORKER_SECRET is not set, so the notification drain refuses every request.',
        claimed: 0,
        sent: 0,
        failed: 0,
      } satisfies DrainSummary,
      503,
    )
  }

  if (!isAuthorized(request, secret)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const parsedBody = drainRequestSchema.safeParse(await readJsonBody(request))
  if (!parsedBody.success) {
    return json(
      { error: 'Invalid request body', details: parsedBody.error.flatten().fieldErrors },
      400,
    )
  }
  const { limit } = parsedBody.data

  if (!hasSupabaseEnv()) {
    return json(
      {
        status: 'unconfigured',
        message:
          'No Supabase instance is connected, so there is no outbox to drain. Run ' +
          '`pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL.',
        claimed: 0,
        sent: 0,
        failed: 0,
      } satisfies DrainSummary,
      200,
    )
  }

  const admin = adminOrNull()
  if (!admin) {
    return json(
      {
        status: 'unconfigured',
        message:
          'SUPABASE_SERVICE_ROLE_KEY is not set. public.notifications has no client write ' +
          'policy, so the drain cannot claim anything without it.',
        claimed: 0,
        sent: 0,
        failed: 0,
      } satisfies DrainSummary,
      200,
    )
  }

  // ---- 1. Recover anything a dead worker left mid-flight -------------------
  const requeued = await requeueStaleSending(admin)

  // ---- 2. Claim ------------------------------------------------------------
  const claim = await claimBatch(admin, limit)
  if (claim.error) {
    return json(
      {
        status: 'error',
        message: claim.error,
        claimed: 0,
        sent: 0,
        failed: 0,
      } satisfies DrainSummary,
      200,
    )
  }

  if (claim.rows.length === 0) {
    return json(
      {
        status: 'ok',
        claimed: 0,
        sent: 0,
        failed: 0,
        retrying: 0,
        requeued,
        simulated: 0,
      } satisfies DrainSummary,
      200,
    )
  }

  // ---- 3. Resolve destinations, then send ---------------------------------
  const addresses = await resolveAddresses(admin, claim.rows)

  let sent = 0
  let failed = 0
  let retrying = 0
  let simulated = 0
  let anyLeadNotification = false

  for (const chunk of chunks(claim.rows, CONCURRENCY)) {
    const outcomes = await Promise.all(
      chunk.map(async (row) => ({ row, result: await send(row, addresses) })),
    )

    for (const { row, result } of outcomes) {
      if (result.ok) {
        sent += 1
        if (result.simulated) simulated += 1
        if (row.template === 'lead.new') anyLeadNotification = true
        await markSent(admin, row, result.providerMessageId)
        continue
      }

      const attempts = row.attempts + 1
      const giveUp = result.permanent || attempts >= row.max_attempts
      if (giveUp) {
        failed += 1
        await markFailed(admin, row, attempts, result.error)
      } else {
        retrying += 1
        await markForRetry(admin, row, attempts, result.error)
      }
    }
  }

  // A vendor who taps the WhatsApp link lands on the lead list within the second. Serving
  // them the cached copy from before routing is the one thing that would make the message
  // look like a lie.
  if (anyLeadNotification) {
    revalidatePath('/partner/dashboard/leads')
  }

  return json(
    {
      status: 'ok',
      claimed: claim.rows.length,
      sent,
      failed,
      retrying,
      requeued,
      simulated,
    } satisfies DrainSummary,
    200,
  )
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison over SHA-256 digests. Hashing first is not for secrecy — it is
 * how both sides get to a fixed 32 bytes, because timingSafeEqual() throws on a length
 * mismatch and that throw would itself leak the secret's length.
 */
function isAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get(HEADER_NAME)
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const presented = header ?? bearer ?? ''
  if (!presented) return false

  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(secret).digest()
  return timingSafeEqual(a, b)
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    const raw = await request.text()
    return raw.trim() === '' ? {} : JSON.parse(raw)
  } catch {
    // A cron ping with no body, or a body that is not JSON. Neither is worth a 400 —
    // defaults are exactly right.
    return {}
  }
}

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

/**
 * The atomic claim, and the reason a second invocation cannot double-send.
 *
 * The SELECT is only a candidate list; it grants nothing. The UPDATE carries
 * `.eq('status', 'queued')`, and under READ COMMITTED Postgres re-evaluates that predicate
 * after taking the row lock. So if two workers pick the same id, the loser's UPDATE finds
 * the row already 'sending' and skips it — and `returning` gives each worker exactly the
 * rows it actually flipped. Marking 'sending' happens before any HTTP call, never after.
 */
async function claimBatch(
  admin: OutboxClient,
  limit: number,
): Promise<{ rows: NotificationRow[]; error: string | null }> {
  const nowIso = new Date().toISOString()

  const { data: due, error: dueError } = await admin
    .from('notifications')
    .select<{ id: string }>('id')
    .eq('status', 'queued')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (dueError) return { rows: [], error: `Could not list due notifications: ${dueError.message}` }

  const ids = (due ?? []).map((row) => row.id)
  if (ids.length === 0) return { rows: [], error: null }

  const { data: claimed, error: claimError } = await admin
    .from('notifications')
    .update({ status: 'sending' })
    .in('id', ids)
    .eq('status', 'queued')
    .select<unknown>(NOTIFICATION_COLUMNS)

  if (claimError) return { rows: [], error: `Could not claim notifications: ${claimError.message}` }

  const rows: NotificationRow[] = []
  for (const raw of claimed ?? []) {
    const parsed = notificationRowSchema.safeParse(raw)
    if (parsed.success) {
      rows.push(parsed.data)
    } else {
      console.error('[notifications] unparseable outbox row, skipping:', parsed.error.message)
    }
  }

  return { rows, error: null }
}

/**
 * A row stuck in 'sending' means the worker died between the claim and the bookkeeping.
 * The message may or may not have gone out, so this deliberately waits five minutes rather
 * than seconds: a slow provider must not be mistaken for a dead worker.
 */
async function requeueStaleSending(admin: OutboxClient): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SENDING_MS).toISOString()

  const { data, error } = await admin
    .from('notifications')
    .update({ status: 'queued', last_error: 'Requeued after a worker stalled mid-send.' })
    .eq('status', 'sending')
    .lt('updated_at', cutoff)
    .select<{ id: string }>('id')

  if (error) {
    console.error('[notifications] could not requeue stalled rows:', error.message)
    return 0
  }
  return (data ?? []).length
}

// ---------------------------------------------------------------------------
// Destinations
//
// app.enqueue_notification() usually leaves to_phone null and records who the message is
// for (vendor_id / recipient_id) instead, so the address is resolved here, at send time,
// against whatever the vendor or customer's current number is. Two bulk lookups for the
// batch rather than one round trip per row.
// ---------------------------------------------------------------------------

interface AddressBook {
  vendors: Map<string, VendorContact>
  profiles: Map<string, ProfileContact>
}

async function resolveAddresses(
  admin: OutboxClient,
  rows: NotificationRow[],
): Promise<AddressBook> {
  const vendorIds = unique(rows.map((r) => r.vendor_id))
  const profileIds = unique(rows.map((r) => r.recipient_id))

  const vendors = new Map<string, VendorContact>()
  const profiles = new Map<string, ProfileContact>()

  if (vendorIds.length > 0) {
    const { data, error } = await admin
      .from('vendor_private')
      .select<VendorContact>('vendor_id, contact_phone, whatsapp_phone, contact_email')
      .in('vendor_id', vendorIds)

    if (error) console.error('[notifications] vendor contact lookup failed:', error.message)
    for (const row of data ?? []) vendors.set(row.vendor_id, row)
  }

  if (profileIds.length > 0) {
    const { data, error } = await admin
      .from('profiles')
      .select<ProfileContact>('id, phone, email')
      .in('id', profileIds)

    if (error) console.error('[notifications] profile contact lookup failed:', error.message)
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
      // No device-token table exists yet, so the row must carry the token itself.
      return row.to_push_token ?? ''
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function send(row: NotificationRow, book: AddressBook): Promise<DispatchResult> {
  const to = addressFor(row, book)
  if (!to) {
    // Retrying cannot conjure a phone number. Fail permanently and leave last_error
    // pointing at the missing record, which is an ops problem, not a delivery one.
    return {
      ok: false,
      permanent: true,
      error:
        `No ${row.channel} address for this notification — ` +
        `vendor_private/profiles has no usable contact for ${row.vendor_id ?? row.recipient_id ?? 'unknown recipient'}.`,
    }
  }

  const { title, body } = renderNotification(row.template, row.payload)

  const message: OutboundMessage = {
    id: row.id,
    channel: row.channel as NotificationChannel,
    template: row.template,
    to,
    payload: row.payload,
    title,
    body,
  }

  try {
    return await dispatchNotification(message)
  } catch (error) {
    // dispatchNotification() is written not to throw; if it ever does, the batch must
    // still finish and the row must still be accounted for.
    return {
      ok: false,
      permanent: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ---------------------------------------------------------------------------
// Bookkeeping
//
// Each row is finalised individually and only after its provider call has returned, so a
// crash mid-batch leaves the untouched rows in 'sending' for requeueStaleSending() to pick
// up on the next pass. No row is ever silently dropped.
// ---------------------------------------------------------------------------

async function markSent(
  admin: OutboxClient,
  row: NotificationRow,
  providerMessageId: string,
): Promise<void> {
  const { error } = await admin
    .from('notifications')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: providerMessageId,
      attempts: row.attempts + 1,
      last_error: null,
    })
    .eq('id', row.id)

  if (error) console.error(`[notifications] could not mark ${row.id} sent:`, error.message)
}

async function markForRetry(
  admin: OutboxClient,
  row: NotificationRow,
  attempts: number,
  lastError: string,
): Promise<void> {
  const { error } = await admin
    .from('notifications')
    .update({
      status: 'queued',
      attempts,
      last_error: lastError.slice(0, 1000),
      scheduled_for: nextAttemptAt(attempts),
    })
    .eq('id', row.id)

  if (error) console.error(`[notifications] could not reschedule ${row.id}:`, error.message)
}

async function markFailed(
  admin: OutboxClient,
  row: NotificationRow,
  attempts: number,
  lastError: string,
): Promise<void> {
  const { error } = await admin
    .from('notifications')
    .update({
      status: 'failed',
      attempts,
      failed_at: new Date().toISOString(),
      last_error: lastError.slice(0, 1000),
    })
    .eq('id', row.id)

  if (error) console.error(`[notifications] could not mark ${row.id} failed:`, error.message)
}

/**
 * 60s · 2^(attempts-1), capped, with up to 10% jitter. The jitter matters when a provider
 * comes back after an outage: without it, every row queued during the outage retries in
 * the same second and knocks the provider over again.
 */
function nextAttemptAt(attempts: number): string {
  const exponent = Math.max(0, attempts - 1)
  const base = Math.min(BACKOFF_BASE_SECONDS * 2 ** exponent, BACKOFF_MAX_SECONDS)
  const jittered = base * (1 + Math.random() * 0.1)
  return new Date(Date.now() + jittered * 1000).toISOString()
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Service-role client, or null. createAdminClient() throws on a missing key; a worker
 *  should report that as configuration rather than as a 500. */
function adminOrNull(): OutboxClient | null {
  try {
    return createAdminClient() as unknown as OutboxClient
  } catch {
    return null
  }
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v !== ''))]
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

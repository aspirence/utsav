'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { UtsavaClient } from '@utsava/db'

import { getBlockedDates } from '@/lib/partner-queries'
import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/supabase'

/**
 * Availability writes. Plan §S8 ships the vendor calendar; plan §2 makes it load-bearing.
 *
 * A row in public.vendor_availability is not decoration — app.route_enquiry() reads it
 * directly (migration 001500) and skips the vendor for that day, and search_vendors()
 * uses the same table for the customer's "free on my date" filter. Blocking a date here
 * genuinely removes the vendor from that day's routing, which is why every write below
 * is narrow and explicit.
 *
 * Two rules the UI must never be able to talk its way past:
 *
 *   1. A row carrying `booking_id` was written by app.transition_booking() when the
 *      booking reached `confirmed`. The vendor cannot delete it. Cancelling or refunding
 *      the booking is what releases the date — the same function deletes the row on
 *      'cancelled' / 'refunded'. If the vendor could unblock it by hand, the calendar
 *      would disagree with the booking, and the customer-facing "free on your date"
 *      badge would start lying.
 *
 *   2. Past dates are not togglable. There is nothing to route to a day that has gone,
 *      and editing history only makes the response metrics harder to read.
 *
 * Authorization is RLS (plan §6): `vendor_availability_manage` requires
 * app.is_vendor_member(vendor_id, 'responder'). The vendor id resolved here is only
 * used to address the row — a wrong id is rejected by the policy, not by this file.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mirrors the CHECK constraint on public.vendor_availability.reason (migration 000500). */
export type AvailabilityReason = 'booked' | 'held' | 'personal' | 'travel'

export interface AvailabilityDay {
  /** `YYYY-MM-DD`, the shape of the `date` column. */
  date: string
  reason: AvailabilityReason
  /** True when the block came from a confirmed booking. The vendor cannot release it. */
  fromBooking: boolean
}

export interface AvailabilitySnapshot {
  /** Today in Asia/Kolkata, computed once on the server so the grid cannot drift. */
  today: string
  days: AvailabilityDay[]
  /** False when we could not resolve a vendor for the caller — the grid goes read-only. */
  canManage: boolean
  notice: string | null
}

export type CalendarState =
  | { status: 'idle' }
  | { status: 'ok'; message: string; days: AvailabilityDay[] }
  | { status: 'locked'; message: string }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const REASONS = ['booked', 'held', 'personal', 'travel'] as const

const reasonSchema = z.enum(REASONS).default('personal')

/** `z.string().date()` accepts exactly `YYYY-MM-DD`, which is what Postgres `date` wants. */
const isoDateSchema = z.string().date('Use a real calendar date')

const toggleInputSchema = z.object({
  date: isoDateSchema,
  reason: reasonSchema,
})

const rangeInputSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    reason: reasonSchema,
  })
  .refine((v) => v.from <= v.to, {
    message: 'The last date cannot be before the first one',
    path: ['to'],
  })

/**
 * One quarter at a time. Not a database limit — it keeps a slipped keystroke in the date
 * field from blanking a vendor out of routing for years.
 */
const MAX_RANGE_DAYS = 120

const CALENDAR_PATH = '/partner/dashboard/calendar'

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Block a free date, or release one the vendor blocked themselves.
 *
 * `reason` is only read when blocking; unblocking deletes the row outright, because
 * absence of a row is what "available" means (migration 000500).
 */
export async function toggleBlockedDate(
  dateIso: string,
  reason?: string,
): Promise<CalendarState> {
  const parsed = toggleInputSchema.safeParse({ date: dateIso, reason })
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error) }
  }

  const { date, reason: why } = parsed.data

  if (date < todayInIndia()) {
    return {
      status: 'error',
      message: `${formatDay(date)} has already passed. You can only change today and the days ahead.`,
    }
  }

  const session = await requireVendorSession()
  if (!session.ok) return session.state
  const { supabase, vendorId } = session

  const { data: existing, error: readError } = await supabase
    .from('vendor_availability')
    .select('id, booking_id')
    .eq('vendor_id', vendorId)
    .eq('blocked_on', date)
    .maybeSingle()

  if (readError) {
    return { status: 'error', message: `Could not read your calendar: ${readError.message}` }
  }

  // Rule 1. The booking owns this date, not the calendar.
  if (existing?.booking_id) {
    return {
      status: 'locked',
      message:
        `${formatDay(date)} is held by a confirmed booking, so it cannot be opened from ` +
        'here. Cancelling that booking releases the date automatically.',
    }
  }

  if (existing) {
    const { error } = await supabase.from('vendor_availability').delete().eq('id', existing.id)
    if (error) {
      return { status: 'error', message: `Could not open up ${formatDay(date)}: ${error.message}` }
    }
  } else {
    const { error } = await supabase
      .from('vendor_availability')
      .insert({ vendor_id: vendorId, blocked_on: date, reason: why })
    if (error) {
      return { status: 'error', message: `Could not block ${formatDay(date)}: ${error.message}` }
    }
  }

  const days = await readDays(supabase, vendorId)
  revalidatePath(CALENDAR_PATH)

  return {
    status: 'ok',
    days,
    message: existing
      ? `${formatDay(date)} is open again. Enquiries for that day can reach you.`
      : `${formatDay(date)} is blocked. We will not route enquiries for that day to you.`,
  }
}

/**
 * Block every date from `from` to `to` inclusive — the away-for-a-fortnight case.
 *
 * Only ever adds. Dates already blocked are left exactly as they are, which is what
 * keeps a range that happens to span a confirmed booking from rewriting that row.
 */
export async function blockDateRange(
  from: string,
  to: string,
  reason?: string,
): Promise<CalendarState> {
  const parsed = rangeInputSchema.safeParse({ from, to, reason })
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error) }
  }

  const { from: rawFrom, to: rawTo, reason: why } = parsed.data
  const today = todayInIndia()

  if (rawTo < today) {
    return {
      status: 'error',
      message: 'That range is entirely in the past. Pick dates from today onwards.',
    }
  }

  // A range that starts in the past is trimmed rather than rejected — the vendor meant
  // "from now until then", and saying so is friendlier than an error.
  const start = rawFrom < today ? today : rawFrom
  const dates = enumerateDates(start, rawTo)

  if (dates.length === 0) {
    return { status: 'error', message: 'That range does not contain any dates.' }
  }
  if (dates.length > MAX_RANGE_DAYS) {
    return {
      status: 'error',
      message: `You can block at most ${MAX_RANGE_DAYS} days at a time. Split it into shorter stretches.`,
    }
  }

  const session = await requireVendorSession()
  if (!session.ok) return session.state
  const { supabase, vendorId } = session

  const { data: existing, error: readError } = await supabase
    .from('vendor_availability')
    .select('blocked_on')
    .eq('vendor_id', vendorId)
    .gte('blocked_on', start)
    .lte('blocked_on', rawTo)

  if (readError) {
    return { status: 'error', message: `Could not read your calendar: ${readError.message}` }
  }

  const alreadyBlocked = new Set((existing ?? []).map((row) => row.blocked_on.slice(0, 10)))
  const fresh = dates.filter((date) => !alreadyBlocked.has(date))

  if (fresh.length === 0) {
    return {
      status: 'ok',
      days: await readDays(supabase, vendorId),
      message: `Every date from ${formatDay(start)} to ${formatDay(rawTo)} was already blocked.`,
    }
  }

  // `ignoreDuplicates` rather than a real upsert: if a booking confirms between the read
  // above and this write, its row wins and we leave it alone.
  const { error } = await supabase.from('vendor_availability').upsert(
    fresh.map((date) => ({ vendor_id: vendorId, blocked_on: date, reason: why })),
    { onConflict: 'vendor_id,blocked_on', ignoreDuplicates: true },
  )

  if (error) {
    return { status: 'error', message: `Could not block those dates: ${error.message}` }
  }

  const days = await readDays(supabase, vendorId)
  revalidatePath(CALENDAR_PATH)

  const skipped = dates.length - fresh.length

  return {
    status: 'ok',
    days,
    message:
      `Blocked ${fresh.length} ${fresh.length === 1 ? 'date' : 'dates'} between ` +
      `${formatDay(start)} and ${formatDay(rawTo)}.` +
      (skipped > 0 ? ` ${skipped} were already blocked and were left as they were.` : ''),
  }
}

/**
 * Read the vendor's own blocked dates for the next year.
 *
 * Exported from this file rather than lib/partner-queries.ts so the page and the two
 * writes above agree on one shape; it is a plain async read, which is all a 'use server'
 * module may export. It is RLS-scoped to the caller and returns nothing else.
 */
export async function loadVendorAvailability(): Promise<AvailabilitySnapshot> {
  const today = todayInIndia()

  // Demo mode. lib/partner-queries.ts already owns the deterministic fixture; a couple
  // of its dates are presented as booking-held so the locked state is visible without a
  // database. Nothing here is writable — the actions above return 'unconfigured'.
  if (!hasSupabaseEnv()) {
    const demo = await getBlockedDates()
    return {
      today,
      canManage: true,
      notice:
        'These are sample dates. You can try the calendar out — nothing is saved until a ' +
        'Supabase instance is connected.',
      days: demo.map((iso, index) => {
        const fromBooking = index % 3 === 1
        return {
          date: iso.slice(0, 10),
          reason: fromBooking ? ('booked' as const) : ('personal' as const),
          fromBooking,
        }
      }),
    }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return {
      today,
      days: [],
      canManage: false,
      notice: 'We could not reach the database, so your blocked dates are not shown here.',
    }
  }

  const vendorId = await resolveVendorId(supabase)
  if (!vendorId) {
    return {
      today,
      days: [],
      canManage: false,
      notice:
        'Sign in with the account invited to your studio to see and edit its calendar.',
    }
  }

  return { today, days: await readDays(supabase, vendorId), canManage: true, notice: null }
}

// ---------------------------------------------------------------------------
// Session + vendor resolution
// ---------------------------------------------------------------------------

type VendorSession =
  | { ok: true; supabase: UtsavaClient; vendorId: string }
  | { ok: false; state: CalendarState }

async function requireVendorSession(): Promise<VendorSession> {
  if (!hasSupabaseEnv()) {
    return {
      ok: false,
      state: {
        status: 'unconfigured',
        message:
          'Your change validated correctly, but no Supabase instance is connected yet. ' +
          'Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to save it for real.',
      },
    }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return {
      ok: false,
      state: { status: 'error', message: 'Could not reach the database. Please try again.' },
    }
  }

  const vendorId = await resolveVendorId(supabase)
  if (!vendorId) {
    return {
      ok: false,
      state: {
        status: 'error',
        message:
          'We could not confirm which studio this account belongs to. Sign in again, or ' +
          'ask the account owner to re-send your invite.',
      },
    }
  }

  return { ok: true, supabase, vendorId }
}

/**
 * The active membership for the signed-in profile.
 *
 * `vendor_members` is not in packages/db's hand-authored types yet — that file says
 * outright it "covers only the read surface apps/web uses" and is replaced by
 * `pnpm db:types` once Docker is available. Until then this one call is described by a
 * local structural type rather than widened to `any`, so nothing untyped leaves the
 * function. The filters mirror app.is_vendor_member(): active, accepted, not revoked.
 */
async function resolveVendorId(supabase: UtsavaClient): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await (supabase as unknown as MembershipLookup)
      .from('vendor_members')
      .select('vendor_id')
      .eq('profile_id', user.id)
      .is('revoked_at', null)
      .not('accepted_at', 'is', null)
      .limit(1)

    if (error || !data || data.length === 0) return null
    return data[0]?.vendor_id ?? null
  } catch {
    return null
  }
}

/** Every PostgREST filter returns the builder, and the builder is awaitable. */
type MembershipQuery = PromiseLike<{
  data: { vendor_id: string }[] | null
  error: { message: string } | null
}> & {
  eq(column: string, value: string): MembershipQuery
  is(column: string, value: null): MembershipQuery
  not(column: string, operator: 'is', value: null): MembershipQuery
  limit(count: number): MembershipQuery
}

type MembershipLookup = {
  from(table: 'vendor_members'): { select(columns: 'vendor_id'): MembershipQuery }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * A year's worth of blocks from the first of the current month, so the grid can render
 * the whole of this month — including days already past — without a second query.
 */
async function readDays(supabase: UtsavaClient, vendorId: string): Promise<AvailabilityDay[]> {
  const windowStart = `${todayInIndia().slice(0, 7)}-01`

  const { data, error } = await supabase
    .from('vendor_availability')
    .select('blocked_on, reason, booking_id')
    .eq('vendor_id', vendorId)
    .gte('blocked_on', windowStart)
    .lte('blocked_on', addMonths(windowStart, 12))
    .order('blocked_on')

  if (error || !data) return []

  return data.map((row) => ({
    date: row.blocked_on.slice(0, 10),
    reason: isReason(row.reason) ? row.reason : 'booked',
    fromBooking: row.booking_id !== null,
  }))
}

// ---------------------------------------------------------------------------
// Dates. Everything is computed in UTC off `YYYY-MM-DD` strings so a server in one
// timezone and a browser in another always agree on which day is which.
// ---------------------------------------------------------------------------

const INDIA_TZ = 'Asia/Kolkata'

/** en-CA formats as `YYYY-MM-DD`, which is exactly the shape a `date` column takes. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function enumerateDates(from: string, to: string): string[] {
  const startMs = Date.parse(`${from}T00:00:00Z`)
  const endMs = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return []

  const out: string[] = []
  // Guard the loop itself as well as the caller, so a bad parse can never spin.
  for (let ms = startMs; ms <= endMs && out.length <= MAX_RANGE_DAYS; ms += 86_400_000) {
    out.push(new Date(ms).toISOString().slice(0, 10))
  }
  return out
}

function addMonths(iso: string, months: number): string {
  const [year = '1970', month = '01', day = '01'] = iso.split('-')
  return new Date(Date.UTC(Number(year), Number(month) - 1 + months, Number(day)))
    .toISOString()
    .slice(0, 10)
}

function formatDay(iso: string): string {
  const ms = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(ms)) return iso
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isReason(value: string): value is AvailabilityReason {
  return (REASONS as readonly string[]).includes(value)
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Please check the dates you picked.'
}

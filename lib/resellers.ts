import 'server-only'

import { randomBytes } from 'node:crypto'

import { getStaffGate, type StaffIdentity } from '@/lib/admin-auth'
import { getServerClientOrNull as getConsoleClientOrNull } from '@/lib/admin-supabase'
import { getSessionUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/db'
import { getServerClientOrNull as getPortalClientOrNull } from '@/lib/supabase'

import type {
  InvitationOrderStatus,
  ResellerCommissionStatus,
  ResellerOrderRow,
  ResellerStatus,
} from '@/lib/db'

/**
 * Resellers, their customers and their commissions — the one module every reseller screen
 * reads through.
 *
 * WHY THE WRITES ARE SERVICE-ROLE AND THE READS ARE NOT. 20260803000100 gives all three reseller
 * tables SELECT policies and nothing else, and says so out loud: "Service-role write only. The
 * console writes it after requireSuper(), exactly as staff_roles are written." That is the same
 * deliberate shape lib/admin-users.ts describes, for the same reason — a policy that lets a
 * session write `resellers` is a policy that can be made to mint a reseller, and a policy that
 * lets a session write `reseller_commissions` is a policy that can be made to pay one. The ledger
 * has exactly one writer, app.accrue_reseller_commission(), and it is a trigger.
 *
 * So this module is split down the middle, exactly as admin-users.ts is. Reads go through the
 * caller's own session and are RLS-scoped; writes take the service-role key, and every one of
 * them is preceded by requireSuper() and followed by an audit row. requireSuper() is the real
 * boundary on the write half — the service-role key bypasses RLS entirely, so on that path there
 * is no policy standing behind the check.
 *
 * ── THE THIRD SURFACE, AND WHY IT READS A VIEW ───────────────────────────────
 * There are two kinds of reader here, not one. Staff read the console functions; a reseller reads
 * their own dashboard. The two use different clients — /admin is a separate deploy (plan §3) with
 * its own Supabase module — which is why the two imports above are aliased rather than merged:
 * the alias records which surface a read serves.
 *
 * A RESELLER-FACING READ NEVER TOUCHES invitation_orders. That table carries contact_name,
 * contact_email and contact_phone in the clear, and a reseller with the customer's phone number
 * can take the relationship off-platform — the disintermediation risk plan §11 exists to manage,
 * and the same mistake public.vendor_leads exists to prevent (CLAUDE.md non-negotiable 5). The
 * portal functions at the bottom of this file read public.reseller_orders, whose
 * `reseller_id = app.my_reseller_id()` clause is an authorization boundary rather than a filter,
 * and which masks the customer down to a first name. Adding a `.from('invitation_orders')` to
 * that half of the file would undo the view.
 *
 * ── MONEY ────────────────────────────────────────────────────────────────────
 * Every *Paise field is an integer, never rupees and never a float (CLAUDE.md non-negotiable 6).
 * Rates are basis points, matching bookings.commission_rate_bps: 250 is 2.5%. Nothing here
 * recomputes a commission from a live rate — the ledger froze both the rate and the base it was
 * applied to at accrual, and reading them back is the only way a historic statement reconciles.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResellerSummary {
  id: string
  profileId: string
  displayName: string
  /** FRM-RS-XXXXXX. Quotable on a statement, the job invitation_orders.reference does. */
  code: string
  /** Basis points. The rate that applies to *new* orders; past ones froze their own. */
  commissionBps: number
  status: ResellerStatus
  contactEmail: string | null
  contactPhone: string | null
  /** Accounts this reseller owns *right now*. A released assignment is history, not ownership. */
  customerCount: number
  /** Every attributed order, paid or not — the reach. Compare against earnedPaise, not to it. */
  orderCount: number
  /** Every commission not reversed, which is pending + payable + paid. */
  earnedPaise: number
  pendingPaise: number
  payablePaise: number
  paidPaise: number
  createdAt: string
}

export interface ResellerCustomerLink {
  id: string
  customerId: string
  fullName: string | null
  email: string | null
  phone: string | null
  assignedAt: string
  /** Non-null means the link is history: past orders still pay, future ones do not. */
  releasedAt: string | null
}

export interface ResellerCommissionEntry {
  id: string
  orderId: string
  orderReference: string
  templateName: string
  /** Frozen at accrual. Not the reseller's current rate. */
  rateBps: number
  /** What the rate was applied to, also frozen. See the migration's note on base_amount. */
  basePaise: number
  amountPaise: number
  status: ResellerCommissionStatus
  earnedAt: string
  paidAt: string | null
  settlementRef: string | null
}

export interface ResellerDetail {
  reseller: ResellerSummary
  customers: ResellerCustomerLink[]
  commissions: ResellerCommissionEntry[]
}

export interface ResellerAnalytics {
  resellerCount: number
  activeCount: number
  /** Orders carrying a reseller_id, whatever became of them. */
  attributedOrders: number
  /**
   * The full order value of the attributed orders whose payment landed and which were not
   * refunded or cancelled.
   *
   * DELIBERATELY NARROWER THAN attributedOrders, and the two are not a ratio. An order sitting
   * at awaiting_payment is attributed and has brought in nothing; counting its price as revenue
   * would put money on the screen that nobody paid.
   *
   * Full template price rather than the booking leg, because that is what commission is computed
   * against — reseller_commissions.base_amount is invitation_orders.template_price. The two
   * numbers have to be over the same base for netRetainedPaise to mean anything.
   */
  attributedRevenuePaise: number
  commissionEarnedPaise: number
  commissionPendingPaise: number
  commissionPayablePaise: number
  commissionPaidPaise: number
  /**
   * What stayed with Fremmo: attributedRevenuePaise − commissionEarnedPaise.
   *
   * One edge case makes this understate slightly. A commission already settled survives a later
   * refund on purpose (the trigger excludes 'paid' from reversal — flipping it would make the
   * ledger disagree with a bank transfer that really happened), so such an order drops out of
   * revenue while its commission stays in earned. The error is always in the direction of
   * claiming *less* was retained, which is the safe way to be wrong about money.
   */
  netRetainedPaise: number
  topResellers: Array<{
    id: string
    displayName: string
    code: string
    earnedPaise: number
    orderCount: number
  }>
  /**
   * Last 12 months, oldest first, 'YYYY-MM'. Months with nothing in them are still present, so a
   * quiet month draws as a gap rather than closing it up.
   *
   * Empty only on the no-Supabase path, and that is the difference worth keeping: twelve zeroed
   * buckets say "we looked and nothing happened", which is a claim this module cannot make when it
   * never got to look. The caller renders an explicit empty state instead of a headless chart.
   */
  monthly: Array<{ month: string; orders: number; revenuePaise: number; commissionPaise: number }>
}

export interface AssignableAccount {
  profileId: string
  fullName: string | null
  email: string | null
  phone: string | null
  /**
   * The reseller who owns this account today, if anybody does.
   *
   * Surfaced so the screen can say why an assignment will be refused rather than letting somebody
   * discover it by pressing the button. The refusal itself is the partial unique index
   * reseller_customers_one_live_owner, not this field — see assignCustomer().
   */
  currentResellerName: string | null
}

// ---------------------------------------------------------------------------
// Reads — the caller's own session, RLS-scoped.
//
// These throw on a query error and fall back only when there is no Supabase at all. That
// asymmetry is lib/invitation-orders.ts's, and it is about money: a console that answers a
// failed read with zeroes is a console that reports a reseller earned nothing.
// ---------------------------------------------------------------------------

type ConsoleClient = NonNullable<Awaited<ReturnType<typeof getConsoleClientOrNull>>>

/** One attributed order, as the console needs it. Deliberately no contact columns. */
interface AttributedOrder {
  id: string
  resellerId: string
  templatePricePaise: number
  status: InvitationOrderStatus
  paidAt: string | null
  createdAt: string
}

interface LedgerEntry {
  id: string
  resellerId: string
  orderId: string
  rateBps: number
  basePaise: number
  amountPaise: number
  status: ResellerCommissionStatus
  earnedAt: string
  paidAt: string | null
  settlementRef: string | null
}

/**
 * The page size, matched to PostgREST's ceiling.
 *
 * `supabase/config.toml` sets `max_rows = 1000` and hosted Supabase defaults to the same. That
 * is a *server-side* cap: it is applied whether or not the client asks for a limit, and no
 * client-side option can exceed it.
 *
 * AN EARLIER VERSION OF THIS FILE OMITTED PAGING ON PURPOSE, with a comment arguing that a
 * `.limit()` on a query whose sums are shown as money would silently understate them. The
 * instinct was exactly right and the conclusion was backwards: omitting the limit does not
 * remove the cap, it only removes our knowledge of it. At 1001 attributed orders PostgREST
 * returned 1000 rows, no error and no signal, and every total on the console — attributed
 * revenue, net retained, each reseller's earnings, the 12-month trend — was quietly short.
 */
const PAGE_SIZE = 1000

/**
 * Read a whole table's worth of rows, a page at a time, and refuse to guess.
 *
 * TWO THINGS MAKE THIS CORRECT RATHER THAN JUST LONGER.
 *
 * Every caller must supply a TOTAL order. Paging with `.range()` over a non-unique sort is not
 * stable: rows that tie can land in a different relative position on each request, so a tied row
 * can be returned twice and another skipped entirely. On a money query that is the same bug as
 * truncation wearing a different hat, and harder to spot because the row count looks right. Each
 * caller below therefore ends its ordering with `id`, which is unique.
 *
 * The page cap throws rather than returning what it has. A statement that is short by a page is
 * indistinguishable from a small reseller, so the only safe failure here is a loud one — the
 * same reasoning the module header gives for throwing on a failed read instead of returning
 * zeroes.
 */
async function readAllPages<T>(
  label: string,
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const MAX_PAGES = 200 // 200k rows. Past this, the console needs a SQL aggregate, not a loop.
  const rows: T[] = []

  for (let index = 0; index < MAX_PAGES; index += 1) {
    const from = index * PAGE_SIZE
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)

    const batch = data ?? []
    rows.push(...batch)
    // A short page is the end of the set. A full one might be, but asking once more is cheap
    // and guessing is not.
    if (batch.length < PAGE_SIZE) return rows
  }

  throw new Error(
    `${label}: more than ${MAX_PAGES * PAGE_SIZE} rows. Refusing to show a total that would ` +
      `be short — this screen needs a SQL aggregate now, not a longer loop.`,
  )
}

/** Every invitation order attributed to a reseller. Paged — see readAllPages. */
async function readAttributedOrders(supabase: ConsoleClient): Promise<AttributedOrder[]> {
  const data = await readAllPages('Could not read attributed orders', (from, to) =>
    supabase
      .from('invitation_orders')
      .select('id, reseller_id, template_price, status, paid_at, created_at')
      .not('reseller_id', 'is', null)
      // created_at is not unique; `id` is the tiebreaker that makes the paging stable.
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  )

  const rows: AttributedOrder[] = []
  for (const o of data) {
    // The `.not(is null)` above already did this; the guard is what makes the type honest.
    if (!o.reseller_id) continue
    rows.push({
      id: o.id,
      resellerId: o.reseller_id,
      templatePricePaise: o.template_price,
      status: o.status,
      paidAt: o.paid_at,
      createdAt: o.created_at,
    })
  }
  return rows
}

/** The commission ledger, whole. Paged — see readAllPages. */
async function readLedger(supabase: ConsoleClient, resellerId?: string): Promise<LedgerEntry[]> {
  const data = await readAllPages('Could not read the commission ledger', (from, to) => {
    let query = supabase
      .from('reseller_commissions')
      .select(
        'id, reseller_id, order_id, rate_bps, base_amount, amount, status, earned_at, paid_at, settlement_ref',
      )
      // Two commissions accrued in the same statement share an earned_at down to the
      // microsecond, so this sort is not unique on its own and paging over it would repeat one
      // row and drop another. `id` breaks the tie.
      .order('earned_at', { ascending: false })
      .order('id', { ascending: true })

    if (resellerId) query = query.eq('reseller_id', resellerId)

    return query.range(from, to)
  })

  return data.map((c) => ({
    id: c.id,
    resellerId: c.reseller_id,
    orderId: c.order_id,
    rateBps: c.rate_bps,
    basePaise: c.base_amount,
    amountPaise: c.amount,
    status: c.status,
    earnedAt: c.earned_at,
    paidAt: c.paid_at,
    settlementRef: c.settlement_ref,
  }))
}

interface Totals {
  earnedPaise: number
  pendingPaise: number
  payablePaise: number
  paidPaise: number
}

function emptyTotals(): Totals {
  return { earnedPaise: 0, pendingPaise: 0, payablePaise: 0, paidPaise: 0 }
}

/**
 * Fold one commission into a running total.
 *
 * Reversed rows add nothing anywhere, including to `earned`. They are kept in the table because a
 * reseller disputing a statement needs to see that a commission existed and then did not — but a
 * total that includes them is a total that claims money nobody is owed.
 */
function addToTotals(
  totals: Totals,
  entry: { status: ResellerCommissionStatus; amountPaise: number },
): void {
  if (entry.status === 'reversed') return
  totals.earnedPaise += entry.amountPaise
  if (entry.status === 'pending') totals.pendingPaise += entry.amountPaise
  else if (entry.status === 'payable') totals.payablePaise += entry.amountPaise
  else if (entry.status === 'paid') totals.paidPaise += entry.amountPaise
}

/** The revenue an attributed order can honestly be said to have brought in. */
function countsAsRevenue(order: AttributedOrder): boolean {
  return order.paidAt != null && order.status !== 'refunded' && order.status !== 'cancelled'
}

export async function listResellers(): Promise<ResellerSummary[]> {
  const supabase = await getConsoleClientOrNull()
  if (!supabase) return []

  const { data: rows, error } = await supabase
    .from('resellers')
    .select(
      'id, profile_id, display_name, code, commission_bps, status, contact_email, contact_phone, created_at',
    )
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Could not read resellers: ${error.message}`)
  if (!rows?.length) return []

  const [links, ledger, orders] = await Promise.all([
    supabase.from('reseller_customers').select('reseller_id').is('released_at', null),
    readLedger(supabase),
    readAttributedOrders(supabase),
  ])

  if (links.error) throw new Error(`Could not read reseller customers: ${links.error.message}`)

  const customers = new Map<string, number>()
  for (const l of links.data ?? [])
    customers.set(l.reseller_id, (customers.get(l.reseller_id) ?? 0) + 1)

  const orderCounts = new Map<string, number>()
  for (const o of orders) orderCounts.set(o.resellerId, (orderCounts.get(o.resellerId) ?? 0) + 1)

  const totals = new Map<string, Totals>()
  for (const c of ledger) {
    const t = totals.get(c.resellerId) ?? emptyTotals()
    addToTotals(t, c)
    totals.set(c.resellerId, t)
  }

  return rows.map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    displayName: r.display_name,
    code: r.code,
    commissionBps: r.commission_bps,
    status: r.status,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    customerCount: customers.get(r.id) ?? 0,
    orderCount: orderCounts.get(r.id) ?? 0,
    ...(totals.get(r.id) ?? emptyTotals()),
    createdAt: r.created_at,
  }))
}

/**
 * One reseller, with everybody they own and everything they have earned.
 *
 * THE MASKING ON THIS PATH IS RLS'S, NOT THIS FUNCTION'S. It reads on the caller's session, so a
 * reseller who somehow reached it would get their own record (resellers_select_self), their own
 * assignments — and nothing from profiles or invitation_orders, because neither has a policy that
 * admits them. The customer names below would come back null rather than leaking. That is the
 * safety net, not the design: the reseller portal is getMyResellerDashboard(), which reads the
 * masked view.
 */
export async function getResellerDetail(resellerId: string): Promise<ResellerDetail | null> {
  const supabase = await getConsoleClientOrNull()
  if (!supabase) return null

  const { data: row, error } = await supabase
    .from('resellers')
    .select(
      'id, profile_id, display_name, code, commission_bps, status, contact_email, contact_phone, created_at',
    )
    .eq('id', resellerId)
    .maybeSingle()

  if (error) throw new Error(`Could not read that reseller: ${error.message}`)
  if (!row) return null

  const [linkRes, ledger, orderRes] = await Promise.all([
    supabase
      .from('reseller_customers')
      .select('id, customer_id, assigned_at, released_at')
      .eq('reseller_id', resellerId)
      .order('assigned_at', { ascending: false }),
    readLedger(supabase, resellerId),
    // A head count rather than readAttributedOrders(): the only thing this screen wants from the
    // attributed orders is how many there are, and the ledger already carries the money.
    supabase
      .from('invitation_orders')
      .select('id', { count: 'exact', head: true })
      .eq('reseller_id', resellerId),
  ])

  if (linkRes.error) throw new Error(`Could not read reseller customers: ${linkRes.error.message}`)
  const linkRows = linkRes.data ?? []

  /*
   * Profiles in a second query rather than a postgrest embed.
   *
   * database.types.ts is hand-authored with `Relationships: []`, so a nested select types as a
   * SelectQueryError — the same reason every other join in this codebase is flat.
   */
  const customerIds = [...new Set(linkRows.map((l) => l.customer_id))]
  const profiles = new Map<
    string,
    { full_name: string | null; email: string | null; phone: string | null }
  >()
  if (customerIds.length) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .in('id', customerIds)
    for (const p of data ?? [])
      profiles.set(p.id, { full_name: p.full_name, email: p.email, phone: p.phone })
  }

  /*
   * The reference and template behind each ledger row, so a commission can be quoted against the
   * order it came from. readAttributedOrders() deliberately selects neither — it is the shape the
   * analytics fold needs, and widening it would pull order labels into every aggregate — so this
   * is a separate, narrow read over exactly the ledger's order ids.
   */
  const labels = new Map<string, { reference: string; templateName: string }>()
  const labelIds = [...new Set(ledger.map((c) => c.orderId))]
  if (labelIds.length) {
    const { data } = await supabase
      .from('invitation_orders')
      .select('id, reference, template_name')
      .in('id', labelIds)
    for (const o of data ?? []) {
      labels.set(o.id, { reference: o.reference, templateName: o.template_name })
    }
  }

  const totals = emptyTotals()
  for (const c of ledger) addToTotals(totals, c)

  return {
    reseller: {
      id: row.id,
      profileId: row.profile_id,
      displayName: row.display_name,
      code: row.code,
      commissionBps: row.commission_bps,
      status: row.status,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      customerCount: linkRows.filter((l) => l.released_at == null).length,
      orderCount: orderRes.count ?? 0,
      ...totals,
      createdAt: row.created_at,
    },
    customers: linkRows.map((l) => {
      const p = profiles.get(l.customer_id)
      return {
        id: l.id,
        customerId: l.customer_id,
        fullName: p?.full_name ?? null,
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        assignedAt: l.assigned_at,
        releasedAt: l.released_at,
      }
    }),
    commissions: ledger.map((c) => {
      const label = labels.get(c.orderId)
      return {
        id: c.id,
        orderId: c.orderId,
        // An em dash rather than a blank when the order is unreadable. Only a non-staff caller
        // can land there, and losing the label must not lose the amount beside it.
        orderReference: label?.reference ?? '—',
        templateName: label?.templateName ?? '—',
        rateBps: c.rateBps,
        basePaise: c.basePaise,
        amountPaise: c.amountPaise,
        status: c.status,
        earnedAt: c.earnedAt,
        paidAt: c.paidAt,
        settlementRef: c.settlementRef,
      }
    }),
  }
}

const MONTHS_SHOWN = 12

/**
 * Month buckets in UTC, not in the server's local zone.
 *
 * PostgREST hands back timestamptz as an instant. Bucketing on local time would move an order
 * placed at 01:00 IST on the first of the month into the previous month, and would do it
 * differently depending on where the page was rendered — a total that changes with the
 * renderer's TZ is not a total.
 */
function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthWindow(now: Date, count: number): string[] {
  const keys: string[] = []
  for (let back = count - 1; back >= 0; back -= 1) {
    // Date.UTC rolls a negative month back into the previous year on its own.
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

const EMPTY_ANALYTICS: ResellerAnalytics = {
  resellerCount: 0,
  activeCount: 0,
  attributedOrders: 0,
  attributedRevenuePaise: 0,
  commissionEarnedPaise: 0,
  commissionPendingPaise: 0,
  commissionPayablePaise: 0,
  commissionPaidPaise: 0,
  netRetainedPaise: 0,
  topResellers: [],
  monthly: [],
}

/**
 * The programme as a whole.
 *
 * Aggregated in TypeScript over rows this process already had to fetch, rather than in SQL.
 * There is no RPC for it and adding one is a migration; at the volumes a reseller programme
 * starts at, one pass over a few thousand rows is not the thing worth a new definer function.
 */
export async function getResellerAnalytics(): Promise<ResellerAnalytics> {
  const supabase = await getConsoleClientOrNull()
  if (!supabase) return EMPTY_ANALYTICS

  const { data: rows, error } = await supabase
    .from('resellers')
    .select('id, display_name, code, status')

  if (error) throw new Error(`Could not read resellers: ${error.message}`)

  const [ledger, orders] = await Promise.all([readLedger(supabase), readAttributedOrders(supabase)])

  const totals = emptyTotals()
  for (const c of ledger) addToTotals(totals, c)

  const attributedRevenuePaise = orders
    .filter(countsAsRevenue)
    .reduce((sum, o) => sum + o.templatePricePaise, 0)

  // Per-reseller, for the leaderboard.
  const perReseller = new Map<string, Totals>()
  for (const c of ledger) {
    const t = perReseller.get(c.resellerId) ?? emptyTotals()
    addToTotals(t, c)
    perReseller.set(c.resellerId, t)
  }
  const orderCounts = new Map<string, number>()
  for (const o of orders) orderCounts.set(o.resellerId, (orderCounts.get(o.resellerId) ?? 0) + 1)

  const topResellers = (rows ?? [])
    .map((r) => ({
      id: r.id,
      displayName: r.display_name,
      code: r.code,
      earnedPaise: perReseller.get(r.id)?.earnedPaise ?? 0,
      orderCount: orderCounts.get(r.id) ?? 0,
    }))
    .filter((r) => r.earnedPaise > 0 || r.orderCount > 0)
    .sort((a, b) => b.earnedPaise - a.earnedPaise || b.orderCount - a.orderCount)
    .slice(0, 5)

  /*
   * Orders and revenue bucket on when the order was placed; commission buckets on when it was
   * earned. In practice those are the same month — the booking leg is paid at checkout, and
   * accrual hangs off paid_at — but each number is bucketed by its own timestamp rather than by
   * a shared one, so neither is a guess about the other.
   */
  const buckets = new Map<
    string,
    { orders: number; revenuePaise: number; commissionPaise: number }
  >()
  for (const key of monthWindow(new Date(), MONTHS_SHOWN)) {
    buckets.set(key, { orders: 0, revenuePaise: 0, commissionPaise: 0 })
  }
  for (const o of orders) {
    const bucket = buckets.get(monthKey(o.createdAt))
    if (!bucket) continue
    bucket.orders += 1
    if (countsAsRevenue(o)) bucket.revenuePaise += o.templatePricePaise
  }
  for (const c of ledger) {
    if (c.status === 'reversed') continue
    const bucket = buckets.get(monthKey(c.earnedAt))
    if (!bucket) continue
    bucket.commissionPaise += c.amountPaise
  }

  return {
    resellerCount: rows?.length ?? 0,
    activeCount: (rows ?? []).filter((r) => r.status === 'active').length,
    attributedOrders: orders.length,
    attributedRevenuePaise,
    commissionEarnedPaise: totals.earnedPaise,
    commissionPendingPaise: totals.pendingPaise,
    commissionPayablePaise: totals.payablePaise,
    commissionPaidPaise: totals.paidPaise,
    netRetainedPaise: attributedRevenuePaise - totals.earnedPaise,
    topResellers,
    monthly: [...buckets.entries()].map(([month, b]) => ({ month, ...b })),
  }
}

/**
 * Find an account to assign to a reseller, by email, phone or name.
 *
 * A SEARCH RATHER THAN A LIST OF EVERY CUSTOMER, for the reason lib/admin-users.ts gives at
 * findAccounts(): `profiles_select_own` lets any staff member read every profile, so listing them
 * all would put the phone number of every customer on the marketplace onto one screen behind one
 * session. Somebody assigning a customer already knows who they mean.
 */
export async function findAssignableAccounts(query: string): Promise<AssignableAccount[]> {
  const term = query.trim()
  if (term.length < 3) return []

  const supabase = await getConsoleClientOrNull()
  if (!supabase) return []

  // Escape the PostgREST filter metacharacters before interpolating. A comma would otherwise end
  // the `or()` term and let the rest of the string be read as another filter.
  const safe = term.replace(/[,()*]/g, ' ')

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .or(`email.ilike.%${safe}%,phone.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .is('deleted_at', null)
    .limit(10)

  const accounts = data ?? []
  if (!accounts.length) return []

  const { data: links } = await supabase
    .from('reseller_customers')
    .select('customer_id, reseller_id')
    .in(
      'customer_id',
      accounts.map((p) => p.id),
    )
    .is('released_at', null)

  const ownerNames = new Map<string, string>()
  const resellerIds = [...new Set((links ?? []).map((l) => l.reseller_id))]
  if (resellerIds.length) {
    const { data: owners } = await supabase
      .from('resellers')
      .select('id, display_name')
      .in('id', resellerIds)
    const byId = new Map((owners ?? []).map((r) => [r.id, r.display_name]))
    for (const l of links ?? []) {
      const name = byId.get(l.reseller_id)
      if (name) ownerNames.set(l.customer_id, name)
    }
  }

  return accounts.map((p) => ({
    profileId: p.id,
    fullName: p.full_name,
    email: p.email,
    phone: p.phone,
    currentResellerName: ownerNames.get(p.id) ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Writes — service-role, gated, audited.
// ---------------------------------------------------------------------------

export class NotSuperAdmin extends Error {
  constructor() {
    super('Only a super admin may change resellers, assignments or commissions.')
    this.name = 'NotSuperAdmin'
  }
}

/**
 * A refusal the caller can act on: a duplicate reseller, a customer somebody else already owns,
 * a commission that is not in a state to be settled.
 *
 * Carries a sentence rather than a constraint name. `reseller_customers_one_live_owner` is the
 * thing that actually refuses the write, and it is exactly the wrong thing to show a person who
 * needs to be told to release the customer from their current reseller first.
 */
export class ResellerConflict extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResellerConflict'
  }
}

/**
 * The gate for every write below. Throws rather than returning a flag, so a caller cannot forget
 * to check the result — the one failure mode that matters on a path that then picks up a key
 * which ignores RLS.
 *
 * The local-credential session is refused, as it is in lib/admin-users.ts. It has no auth.users
 * row, so there is no honest actor_id for the audit row, and an unattributable change to who gets
 * paid is worse than a refused one.
 */
async function requireSuper(): Promise<StaffIdentity> {
  const gate = await getStaffGate()
  if (gate.state !== 'staff') throw new NotSuperAdmin()
  if (!gate.identity.roles.includes('super')) throw new NotSuperAdmin()
  if (gate.identity.isLocal) throw new NotSuperAdmin()
  return gate.identity
}

/**
 * The audit row behind every write here.
 *
 * The insert's own error is deliberately not checked, matching lib/admin-users.ts. By the time
 * this runs the change has already landed; throwing now would report a failure for a write that
 * succeeded, which is a worse lie than a missing audit row.
 */
async function writeAudit(
  actor: StaffIdentity,
  entry: {
    action: string
    subjectType: 'reseller' | 'reseller_customer' | 'reseller_commission'
    subjectId: string
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    reason?: string | null
  },
): Promise<void> {
  const admin = createAdminClient()
  await admin.from('audit_log').insert({
    actor_id: actor.id,
    actor_role: actor.role,
    action: entry.action,
    subject_type: entry.subjectType,
    subject_id: entry.subjectId,
    before_state: entry.before ?? null,
    after_state: entry.after ?? null,
    reason: entry.reason ?? null,
  })
}

/**
 * FRM-RS-XXXXXX, matching the resellers_code_format check.
 *
 * The same alphabet and construction as orderReference() in the booking action: Crockford-ish,
 * with I, O, 1 and 0 removed because this gets read down a phone. Random rather than sequential —
 * a sequential code tells every partner how many others there are.
 *
 * Six characters from a 32-symbol alphabet is ~1e9 combinations. The unique index is what
 * actually guarantees no collision; the retry loop in createReseller() is what turns one into a
 * second attempt rather than an error the operator has to understand.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_ATTEMPTS = 5

function resellerCode(): string {
  const bytes = randomBytes(6)
  let out = ''
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  return `FRM-RS-${out}`
}

/**
 * A rate is basis points, and the check constraint is the real boundary.
 *
 * This exists so a mistyped rate is a sentence rather than "new row for relation resellers
 * violates check constraint resellers_commission_bps_check".
 */
function assertBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new ResellerConflict(
      'A commission rate is a whole number of basis points between 0 and 10000 — 250 is 2.5%.',
    )
  }
}

function explainWrite(error: { code?: string; message: string }, fallback: string): Error {
  if (error.code === '42501' || error.message.includes('row-level security')) {
    // Reaching this means the service-role key was not configured and the anon key was used
    // instead. Say that, rather than letting it read as a validation failure.
    return new Error('That write was refused by the database. Check the service-role key.')
  }
  if (error.message.includes('resellers_display_name_present')) {
    return new ResellerConflict('A reseller needs a name.')
  }
  if (error.message.includes('resellers_email_shape')) {
    return new ResellerConflict('That email address does not look right.')
  }
  if (error.message.includes('resellers_phone_format')) {
    return new ResellerConflict('That phone number needs to be in +91… international form.')
  }
  return new Error(`${fallback}: ${error.message}`)
}

export async function createReseller(input: {
  profileId: string
  displayName: string
  commissionBps: number
  contactEmail?: string | null
  contactPhone?: string | null
  notes?: string | null
}): Promise<{ id: string; code: string }> {
  const actor = await requireSuper()
  assertBps(input.commissionBps)

  const displayName = input.displayName.trim()
  if (!displayName) throw new ResellerConflict('A reseller needs a name.')

  const admin = createAdminClient()

  for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
    const code = resellerCode()

    const { data, error } = await admin
      .from('resellers')
      .insert({
        profile_id: input.profileId,
        display_name: displayName,
        code,
        commission_bps: input.commissionBps,
        contact_email: input.contactEmail ?? null,
        contact_phone: input.contactPhone ?? null,
        notes: input.notes ?? null,
        created_by: actor.id,
      })
      .select('id, code')
      .single()

    if (error) {
      // Two different unique constraints answer with 23505. Only one of them is worth retrying.
      if (error.code === '23505' && error.message.includes('resellers_code')) continue
      if (error.code === '23505') {
        throw new ResellerConflict(
          'That account is already a reseller. One login owns one reseller record.',
        )
      }
      throw explainWrite(error, 'Could not create the reseller')
    }
    if (!data) throw new Error('The reseller was created but could not be read back.')

    await writeAudit(actor, {
      action: 'reseller.created',
      subjectType: 'reseller',
      subjectId: data.id,
      before: null,
      after: {
        profile_id: input.profileId,
        display_name: displayName,
        code: data.code,
        commission_bps: input.commissionBps,
      },
      reason: null,
    })

    return { id: data.id, code: data.code }
  }

  throw new ResellerConflict(
    `Could not mint an unused reseller code in ${CODE_ATTEMPTS} tries. Try again.`,
  )
}

/**
 * Change what a reseller earns from here on.
 *
 * IT CHANGES NOTHING ALREADY PLACED, and the database is what guarantees that rather than this
 * function being careful. invitation_orders froze the rate at insert and
 * app.guard_invitation_order_columns() refuses to let it move; reseller_commissions froze it
 * again at accrual. supabase/tests/10_reseller_commissions.sql asserts it directly.
 *
 * The before/after in the audit row is the whole point of auditing this one: a rate change is the
 * lever that decides what somebody is paid, and "who raised it, when, and why" has to survive the
 * next conversation about it.
 */
export async function updateResellerRate(input: {
  resellerId: string
  commissionBps: number
  reason?: string | null
}): Promise<void> {
  const actor = await requireSuper()
  assertBps(input.commissionBps)

  const admin = createAdminClient()

  const { data: before } = await admin
    .from('resellers')
    .select('commission_bps, display_name, code, status')
    .eq('id', input.resellerId)
    .maybeSingle()

  if (!before) throw new ResellerConflict('That reseller no longer exists.')

  const { error } = await admin
    .from('resellers')
    .update({ commission_bps: input.commissionBps })
    .eq('id', input.resellerId)

  if (error) throw explainWrite(error, 'Could not change the commission rate')

  await writeAudit(actor, {
    action: 'reseller.rate_changed',
    subjectType: 'reseller',
    subjectId: input.resellerId,
    before: { commission_bps: before.commission_bps },
    after: { commission_bps: input.commissionBps },
    reason: input.reason ?? null,
  })
}

/**
 * Suspend, reinstate, or close a reseller.
 *
 * WHAT EACH ONE DOES IS THE MIGRATION'S DEFINITION, NOT THIS FILE'S. app.my_reseller_id() and
 * app.reseller_for_customer() both filter on `status = 'active'`, so suspending someone closes
 * their dashboard and stops new attribution in one write — everywhere at once, because the check
 * is in the helper rather than at each call site. Commission already accrued is untouched and
 * stays payable, which is the difference between suspension and non-payment.
 *
 * CLOSED IS TERMINAL, and this refuses to move a reseller back out of it. The enum's own comment
 * says so, and a status whose documented meaning the application quietly contradicts is worse
 * than one that occasionally needs a new record. Reinstating a closed partner is a new reseller
 * row — which is also the honest record of what happened.
 */
export async function setResellerStatus(input: {
  resellerId: string
  status: ResellerStatus
  reason?: string | null
}): Promise<void> {
  const actor = await requireSuper()
  const admin = createAdminClient()

  const { data: before } = await admin
    .from('resellers')
    .select('status, display_name')
    .eq('id', input.resellerId)
    .maybeSingle()

  if (!before) throw new ResellerConflict('That reseller no longer exists.')
  if (before.status === 'closed' && input.status !== 'closed') {
    throw new ResellerConflict(
      `${before.display_name} is closed, and closing is final. Set up a new reseller to work with them again.`,
    )
  }
  if (before.status === input.status) return

  const { error } = await admin
    .from('resellers')
    .update({ status: input.status })
    .eq('id', input.resellerId)

  if (error) throw explainWrite(error, 'Could not change the reseller status')

  await writeAudit(actor, {
    action: 'reseller.status_changed',
    subjectType: 'reseller',
    subjectId: input.resellerId,
    before: { status: before.status },
    after: { status: input.status },
    reason: input.reason ?? null,
  })
}

/**
 * Give a reseller an account.
 *
 * ONE LIVE OWNER PER CUSTOMER IS A DATABASE CONSTRAINT — the partial unique index
 * reseller_customers_one_live_owner, which exists so that app.reseller_for_customer() is
 * deterministic and one sale cannot pay two people. This function does not re-check it before
 * inserting; it inserts and translates the refusal. A read-then-write check would be a second,
 * racier copy of a rule the database already enforces, and would still have to handle 23505.
 *
 * A non-active reseller is refused up front, and that one *is* application logic. Assigning to a
 * suspended reseller inserts a row that attributes nothing — app.reseller_for_customer() skips
 * them — so it would look like it worked and quietly pay nobody. A visible refusal beats a silent
 * no-op.
 */
export async function assignCustomer(input: {
  resellerId: string
  customerId: string
  reason?: string | null
}): Promise<void> {
  const actor = await requireSuper()
  const admin = createAdminClient()

  const { data: reseller } = await admin
    .from('resellers')
    .select('id, display_name, status')
    .eq('id', input.resellerId)
    .maybeSingle()

  if (!reseller) throw new ResellerConflict('That reseller no longer exists.')
  if (reseller.status !== 'active') {
    throw new ResellerConflict(
      `${reseller.display_name} is ${reseller.status}, so an assignment to them would attribute nothing. Make them active first.`,
    )
  }

  const { data, error } = await admin
    .from('reseller_customers')
    .insert({
      reseller_id: input.resellerId,
      customer_id: input.customerId,
      assigned_by: actor.id,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new ResellerConflict(
        'That customer already belongs to another reseller. Release them from that reseller first.',
      )
    }
    if (error.code === '23503') {
      throw new ResellerConflict('That account no longer exists.')
    }
    throw explainWrite(error, 'Could not assign that customer')
  }

  await writeAudit(actor, {
    action: 'reseller_customer.assigned',
    subjectType: 'reseller_customer',
    subjectId: data.id,
    before: null,
    after: { reseller_id: input.resellerId, customer_id: input.customerId },
    reason: input.reason ?? null,
  })
}

/**
 * End an assignment.
 *
 * A RELEASE, NOT A DELETE, and the row stays. Orders already attributed keep their reseller_id
 * and their frozen rate — releasing somebody does not retract commission they have earned, it
 * only stops the next order counting. Deleting the row would leave attributed orders pointing at
 * an ownership nobody can see the history of.
 */
export async function releaseCustomer(input: {
  assignmentId: string
  reason?: string | null
}): Promise<void> {
  const actor = await requireSuper()
  const admin = createAdminClient()

  const { data: before } = await admin
    .from('reseller_customers')
    .select('id, reseller_id, customer_id, released_at')
    .eq('id', input.assignmentId)
    .maybeSingle()

  if (!before) throw new ResellerConflict('That assignment no longer exists.')
  if (before.released_at) throw new ResellerConflict('That customer has already been released.')

  const releasedAt = new Date().toISOString()

  const { error } = await admin
    .from('reseller_customers')
    .update({ released_at: releasedAt, release_reason: input.reason ?? null })
    .eq('id', input.assignmentId)
    .is('released_at', null)

  if (error) throw explainWrite(error, 'Could not release that customer')

  await writeAudit(actor, {
    action: 'reseller_customer.released',
    subjectType: 'reseller_customer',
    subjectId: input.assignmentId,
    before: { reseller_id: before.reseller_id, customer_id: before.customer_id, released_at: null },
    after: { released_at: releasedAt },
    reason: input.reason ?? null,
  })
}

/**
 * Record that a commission was settled.
 *
 * RECORDED, NEVER INFERRED. Money leaves the company through a bank transfer somebody made out of
 * band; this row is the note that it happened, which is why a settlement reference is required
 * rather than optional — a 'paid' row nobody can reconcile against a UTR is not a record.
 *
 * ONLY 'payable' MOVES. 'pending' means the order has not been delivered and can still be
 * refunded, so settling it would pay out money that may have to come back. 'reversed' means the
 * order was refunded and there is nothing to settle. Both are refused with the reason, because
 * "it did not work" is not an answer somebody can act on.
 *
 * The `.eq('status', 'payable')` on the update is the guard that matters. The read above is for
 * the message; a delivery-to-refund transition landing between the two would otherwise let a
 * reversed commission be marked paid.
 */
export async function markCommissionPaid(input: {
  commissionId: string
  settlementRef: string
  reason?: string | null
}): Promise<void> {
  const actor = await requireSuper()

  const settlementRef = input.settlementRef.trim()
  if (!settlementRef) {
    throw new ResellerConflict(
      'A settlement needs a reference — the UTR, the bank reference or the invoice number.',
    )
  }

  const admin = createAdminClient()

  const { data: before } = await admin
    .from('reseller_commissions')
    .select('id, reseller_id, order_id, amount, status, settlement_ref')
    .eq('id', input.commissionId)
    .maybeSingle()

  if (!before) throw new ResellerConflict('That commission no longer exists.')
  if (before.status === 'pending') {
    throw new ResellerConflict(
      'That commission is still pending — the order has not been delivered yet, so it is not settleable.',
    )
  }
  if (before.status === 'reversed') {
    throw new ResellerConflict(
      'That commission was reversed when the order was refunded or cancelled. There is nothing to settle.',
    )
  }
  if (before.status === 'paid') {
    throw new ResellerConflict(
      `That commission was already settled${before.settlement_ref ? ` under ${before.settlement_ref}` : ''}.`,
    )
  }

  const paidAt = new Date().toISOString()

  const { data: moved, error } = await admin
    .from('reseller_commissions')
    .update({ status: 'paid', paid_at: paidAt, settlement_ref: settlementRef })
    .eq('id', input.commissionId)
    .eq('status', 'payable')
    .select('id')

  if (error) throw explainWrite(error, 'Could not record that settlement')
  if (!moved?.length) {
    throw new ResellerConflict(
      'That commission changed while you were looking at it. Reload the statement and try again.',
    )
  }

  await writeAudit(actor, {
    action: 'reseller_commission.paid',
    subjectType: 'reseller_commission',
    subjectId: input.commissionId,
    before: { status: before.status, amount: before.amount },
    after: { status: 'paid', paid_at: paidAt, settlement_ref: settlementRef },
    reason: input.reason ?? null,
  })
}

// ---------------------------------------------------------------------------
// The reseller's own portal.
//
// A DIFFERENT DEPLOY AND A DIFFERENT READ SURFACE. These run on the public site's session client,
// and the only order data they touch is public.reseller_orders — the masked view, whose
// `reseller_id = app.my_reseller_id()` clause is the authorization boundary and whose customer
// column is a first name and nothing else. Never add a read of invitation_orders,
// reseller_customers or profiles below this line.
// ---------------------------------------------------------------------------

export interface MyResellerDashboard {
  displayName: string
  code: string
  commissionBps: number
  status: ResellerStatus
  /**
   * Every commission not reversed. pending + payable + paid.
   *
   * The same name as ResellerSummary.earnedPaise on purpose, because it is the same fold over the
   * same rows — addToTotals()'s `earned`. The portal *labels* it "Lifetime earnings", which reads
   * better to a partner than "Earned", but a second field name for one quantity is how the console
   * and the statement end up quietly disagreeing about what somebody has made.
   */
  earnedPaise: number
  pendingPaise: number
  payablePaise: number
  paidPaise: number
  orders: ResellerOrderRow[]
}

/**
 * The signed-in reseller's own record, or null for everybody else.
 *
 * Keyed on profile_id rather than on app.my_reseller_id(), matching the resellers_select_self
 * policy: a *suspended* reseller can still read their own row and therefore still be told they
 * are suspended, instead of being shown an empty screen and left to guess.
 *
 * The `.eq('profile_id', ...)` is not the authorization — the policy is. It is there because a
 * staff member calling this would otherwise get the whole table back through
 * resellers_select_staff and be handed somebody else's record as their own.
 */
export async function getMyReseller(): Promise<{
  id: string
  displayName: string
  code: string
  commissionBps: number
  status: ResellerStatus
} | null> {
  const supabase = await getPortalClientOrNull()
  if (!supabase) return null

  const user = await getSessionUser()
  if (!user) return null

  /*
   * public.my_reseller, not public.resellers.
   *
   * The base table has no self-select policy — a reseller reading it directly gets nothing. The
   * view withholds `notes` and `created_by`, which are what staff wrote *about* this partner
   * rather than the partner's own record. Selecting five safe columns from the base table was
   * the earlier version and was not a boundary: PostgREST honours whatever column list the
   * request asks for, so the session could simply ask for `notes`.
   *
   * The view still returns a suspended reseller's row, so the `status` below is real and the
   * dashboard can say so.
   */
  /*
   * No `.eq('profile_id', …)`, and its absence is the point. The view's own WHERE clause scopes
   * it to the caller, so it returns at most one row — theirs. Re-filtering here would be a
   * second, weaker copy of the boundary in application code, which is the pattern
   * lib/account-queries.ts explicitly warns against: the copy is the one that eventually gets
   * treated as the real rule. `profile_id` is not even a column on the view.
   */
  const { data } = await supabase
    .from('my_reseller')
    .select('id, display_name, code, commission_bps, status')
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    displayName: data.display_name,
    code: data.code,
    commissionBps: data.commission_bps,
    status: data.status,
  }
}

/**
 * Everything a reseller sees of their own business.
 *
 * ONE QUERY AGAINST THE VIEW, not a join of orders and commissions here. public.reseller_orders
 * already carries both legs — the masked order and the commission attached to it — so the totals
 * below are folded from the same rows the table on screen renders. Two sources would eventually
 * disagree about what somebody is owed.
 *
 * A SUSPENDED RESELLER GETS THEIR RECORD AND NO FIGURES, and that is the lockout working rather
 * than a bug. app.my_reseller_id() filters on status, so the view returns nothing for them; they
 * still see their name, code and the word "suspended", which is what they need in order to ask
 * about it.
 */
export async function getMyResellerDashboard(): Promise<MyResellerDashboard | null> {
  const reseller = await getMyReseller()
  if (!reseller) return null

  const supabase = await getPortalClientOrNull()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('reseller_orders')
    .select('*')
    .order('created_at', { ascending: false })

  // Throws rather than showing zeroes. A statement that under-reports because a query failed is
  // the one wrong answer a partner will act on.
  if (error) throw new Error(`Could not read your orders: ${error.message}`)

  const orders = data ?? []
  const totals = emptyTotals()
  for (const o of orders) {
    if (!o.commission_status) continue
    addToTotals(totals, { status: o.commission_status, amountPaise: o.commission_amount ?? 0 })
  }

  return {
    displayName: reseller.displayName,
    code: reseller.code,
    commissionBps: reseller.commissionBps,
    status: reseller.status,
    earnedPaise: totals.earnedPaise,
    pendingPaise: totals.pendingPaise,
    payablePaise: totals.payablePaise,
    paidPaise: totals.paidPaise,
    orders,
  }
}

import 'server-only'

import type { InvitationOrderStatus } from '@/lib/db'

import { getServerClientOrNull } from '@/lib/admin-supabase'

/**
 * Invitation orders, for the console.
 *
 * Read through the staff member's own session. `invitation_orders_select_staff` is what admits
 * them, and a customer querying this table sees only their own claimed rows — plan §6 makes RLS
 * the boundary, so this file does no filtering of its own.
 *
 * Falls back to a demo set with no database attached, matching the rest of the console. The demo
 * rows carry the awkward cases on purpose: one that never paid, one refunded, one where the
 * customer never came back with their details. A screen that only shows the happy path teaches
 * nobody what to look for.
 */

export interface AdminInvitationOrder {
  id: string
  reference: string
  createdAt: string
  status: InvitationOrderStatus
  templateName: string
  templateSlug: string
  templatePricePaise: number
  bookingAmountPaise: number
  balancePaise: number
  contactName: string
  /** Null on orders placed after 20260803000300 — the booking form is name + WhatsApp only. */
  contactEmail: string | null
  contactPhone: string
  paidAt: string | null
  paymentRef: string | null
  notes: string | null
  /** True when the buyer has signed in and the order is attached to an account. */
  claimed: boolean
  isDemo: boolean
  /**
   * Every payment event the aggregator sent for this order, newest first — failures and
   * abandoned attempts included.
   *
   * The order's own paidAt/paymentRef describe the attempt that worked and nothing else,
   * which is exactly the wrong shape for the question support is actually asked: "I paid and
   * nothing happened." That is a declined card or a drop-off, and it only has an answer if
   * the attempt is on record.
   */
  payments: AdminOrderPayment[]
}

export interface AdminOrderPayment {
  id: string
  aggregator: string
  /** The aggregator's id for the payment — the key for reconciling against their dashboard. */
  paymentId: string
  amountPaise: number
  /** The aggregator's own word: SUCCESS, FAILED, USER_DROPPED. */
  status: string
  /** 'upi', 'card', 'netbanking', 'wallet' — null when the aggregator did not say. */
  method: string | null
  paidAt: string | null
  failureReason: string | null
  receivedAt: string
}

export async function getInvitationOrders(): Promise<AdminInvitationOrder[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return DEMO

  const { data, error } = await supabase
    .from('invitation_orders')
    .select(
      `id, reference, created_at, status, template_name, template_slug, template_price,
       booking_amount, balance_amount, contact_name, contact_email, contact_phone,
       paid_at, payment_ref, notes, customer_id`,
    )
    .order('created_at', { ascending: false })
    .limit(200)

  /*
   * An empty table is a real answer, and so is a failure — a console that invents orders is a
   * console that shows revenue nobody earned. `if (error) return DEMO` was exactly that: a
   * PostgREST hiccup would have substituted five fabricated orders and totalled ₹297 of
   * "Collected" on the tiles. Only a missing database falls back.
   */
  if (error) throw new Error(`Could not read invitation orders: ${error.message}`)
  if (!data) return []

  /*
   * The ledger in a second query rather than a postgrest embed.
   *
   * database.types.ts is hand-authored with `Relationships: []`, so a nested select types as
   * a SelectQueryError — the same reason every other join in this codebase is flat. Two
   * round trips for at most 200 orders is not the thing worth optimising here.
   *
   * A failure to read the ledger does NOT fail the page. The orders are the screen's job and
   * the payment detail is the annotation; losing the annotation should not take the list
   * down with it, and an order with an empty payments array reads as "no events recorded",
   * which is also true of every order placed before this table existed.
   */
  const { data: paymentRows } = await supabase
    .from('invitation_payments')
    .select(
      'id, order_id, aggregator, aggregator_payment_id, amount, status, method, paid_at, failure_reason, received_at',
    )
    .in(
      'order_id',
      data.map((o) => o.id),
    )
    .order('received_at', { ascending: false })

  const byOrder = new Map<string, AdminOrderPayment[]>()
  for (const p of paymentRows ?? []) {
    const list = byOrder.get(p.order_id) ?? []
    list.push({
      id: p.id,
      aggregator: p.aggregator,
      paymentId: p.aggregator_payment_id,
      amountPaise: p.amount,
      status: p.status,
      method: p.method,
      paidAt: p.paid_at,
      failureReason: p.failure_reason,
      receivedAt: p.received_at,
    })
    byOrder.set(p.order_id, list)
  }

  return data.map((o) => ({
    id: o.id,
    reference: o.reference,
    createdAt: o.created_at,
    status: o.status,
    templateName: o.template_name,
    templateSlug: o.template_slug,
    templatePricePaise: o.template_price,
    bookingAmountPaise: o.booking_amount,
    balancePaise: o.balance_amount,
    contactName: o.contact_name,
    contactEmail: o.contact_email,
    contactPhone: o.contact_phone,
    paidAt: o.paid_at,
    paymentRef: o.payment_ref,
    notes: o.notes,
    claimed: o.customer_id != null,
    isDemo: false,
    payments: byOrder.get(o.id) ?? [],
  }))
}

export async function getInvitationOrder(reference: string): Promise<AdminInvitationOrder | null> {
  return (await getInvitationOrders()).find((o) => o.reference === reference) ?? null
}

/** Money the console can honestly claim. Only orders whose payment actually landed. */
export function orderTotals(orders: AdminInvitationOrder[]): {
  collectedPaise: number
  outstandingPaise: number
  awaitingPayment: number
  needsAction: number
} {
  const paid = orders.filter((o) => o.paidAt != null && o.status !== 'refunded')

  return {
    // Booking amounts actually received. Not the full template price — that is a hope, not income.
    collectedPaise: paid.reduce((sum, o) => sum + o.bookingAmountPaise, 0),
    // Balances owed on orders still in flight. Delivered ones have been settled; refunded and
    // cancelled ones never will be.
    outstandingPaise: paid
      .filter((o) => !['delivered', 'cancelled', 'refunded'].includes(o.status))
      .reduce((sum, o) => sum + o.balancePaise, 0),
    awaitingPayment: orders.filter((o) => o.status === 'awaiting_payment').length,
    // What a person has to pick up today: money in, nothing done yet — or a draft waiting on us.
    needsAction: orders.filter((o) => ['booked', 'details_received'].includes(o.status)).length,
  }
}

export const ORDER_STATUS_LABEL: Record<InvitationOrderStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  booked: 'Booked',
  details_received: 'Details received',
  draft_sent: 'Draft sent',
  approved: 'Approved',
  delivered: 'Delivered',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

// ---------------------------------------------------------------------------
// Demo set
// ---------------------------------------------------------------------------

function order(
  reference: string,
  createdAt: string,
  status: InvitationOrderStatus,
  templateName: string,
  templateSlug: string,
  contact: [string, string, string],
  opts: { paidAt?: string; paymentRef?: string; notes?: string; claimed?: boolean } = {},
): AdminInvitationOrder {
  const price = 149_900
  const booking = 9_900
  return {
    id: `demo-${reference}`,
    reference,
    createdAt,
    status,
    templateName,
    templateSlug,
    templatePricePaise: price,
    bookingAmountPaise: booking,
    balancePaise: price - booking,
    contactName: contact[0],
    contactEmail: contact[1],
    contactPhone: contact[2],
    paidAt: opts.paidAt ?? null,
    paymentRef: opts.paymentRef ?? null,
    notes: opts.notes ?? null,
    claimed: opts.claimed ?? false,
    isDemo: true,
    /*
     * A paid demo order carries one payment event, so the screen's payment column has
     * something to render before a database exists. Synthesised from the same paidAt and
     * paymentRef the row already shows rather than invented separately — two demo values
     * that could disagree about whether an order was paid would be worse than none.
     */
    payments: opts.paidAt
      ? [
          {
            id: `demo-pay-${reference}`,
            aggregator: 'cashfree',
            paymentId: opts.paymentRef ?? `demo_${reference}`,
            amountPaise: booking,
            status: 'SUCCESS',
            method: 'upi',
            paidAt: opts.paidAt,
            failureReason: null,
            receivedAt: opts.paidAt,
          },
        ]
      : [],
  }
}

const DEMO: AdminInvitationOrder[] = [
  order(
    'FRM-INV-K7M2QP',
    '2026-07-30T04:20:00.000Z',
    'awaiting_payment',
    'Divine Kedarnath Elegance',
    'divine-kedarnath',
    ['Ananya Rathore', 'ananya.rathore@example.com', '+919876543210'],
    { notes: 'Wedding on 14 Feb 2027 in Dehradun. Three events.' },
  ),
  order(
    'FRM-INV-9XJ4TB',
    '2026-07-29T11:05:00.000Z',
    'booked',
    'The Modern Rajputana',
    'modern-rajputana',
    ['Kabir Sethi', 'kabir.sethi@example.com', '+919812345678'],
    { paidAt: '2026-07-29T11:07:00.000Z', paymentRef: 'pay_demo_9XJ4TB', claimed: true },
  ),
  // Paid a week ago and still has not sent anything — the row a person should be chasing.
  order(
    'FRM-INV-4FQ8HD',
    '2026-07-23T06:40:00.000Z',
    'details_received',
    'Taj Mahal Elegance',
    'taj-mahal-elegance',
    ['Sneha Iyer', 'sneha.iyer@example.com', '+919900112233'],
    {
      paidAt: '2026-07-23T06:42:00.000Z',
      paymentRef: 'pay_demo_4FQ8HD',
      notes: 'Sent photographs over WhatsApp; still waiting on the muhurat time.',
      claimed: true,
    },
  ),
  order(
    'FRM-INV-2WPL5N',
    '2026-07-20T15:15:00.000Z',
    'delivered',
    'Punjabi Phulkari',
    'punjabi-phulkari',
    ['Harleen Kaur', 'harleen.kaur@example.com', '+919845001122'],
    { paidAt: '2026-07-20T15:18:00.000Z', paymentRef: 'pay_demo_2WPL5N', claimed: true },
  ),
  // Refunded. Kept, not deleted — the record of a payment somebody made does not get removed.
  order(
    'FRM-INV-8CTR3Y',
    '2026-07-18T09:00:00.000Z',
    'refunded',
    'Vibrant Heritage',
    'vibrant-heritage',
    ['Rohan Mehta', 'rohan.mehta@example.com', '+919701234567'],
    {
      paidAt: '2026-07-18T09:03:00.000Z',
      paymentRef: 'pay_demo_8CTR3Y',
      notes: 'Changed to a printed card. Booking amount returned on 21 July.',
    },
  ),
]

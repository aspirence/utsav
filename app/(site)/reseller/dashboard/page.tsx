import type { Metadata } from 'next'

import { Badge, Card, CardBody, Container, LinkButton, cn, type BadgeTone } from '@/components/ui'

import { requireUser } from '@/lib/auth'
import { formatBps, formatPaise } from '@/lib/db'
import { getMyResellerDashboard, type MyResellerDashboard } from '@/lib/resellers'

import type {
  InvitationOrderStatus,
  ResellerCommissionStatus,
  ResellerOrderRow,
  ResellerStatus,
} from '@/lib/db'

/**
 * The reseller's own statement — the fourth surface in lib/viewer.ts.
 *
 * A sibling of the partner dashboard rather than a new design: the same tiles-then-list shape,
 * the same Card/CardBody furniture, and the same rule that governs the numbers on it. Plan §2
 * calls honest vendor dashboards core scope because renewal depends on them; a reseller reads
 * this one to decide whether the arrangement is worth their time, which is the same question.
 * So nothing here is a "dashboard metric" — every figure is the ledger's own, and the four money
 * tiles are the four states a commission can be in, each one spelled out. "Earned, but the order
 * can still be refunded" and "settled, and in your bank" are different sentences and different
 * money, and a partner who cannot tell them apart will chase us about the wrong one.
 *
 * ── THE ORDER LIST IS public.reseller_orders AND NOTHING ELSE ────────────────
 * That view masks the customer down to a first name, and its `reseller_id = app.my_reseller_id()`
 * clause is an authorization boundary rather than a filter — the same construction, for the same
 * reason, as public.vendor_leads (CLAUDE.md non-negotiable 5). Do not add a second read here that
 * re-associates a customer with their email or phone: a reseller holding the buyer's number can
 * take the relationship off-platform, and the masking is plan §11's mitigation for exactly that.
 * getMyResellerDashboard() reads the view; this file renders what it returns and looks nothing up.
 *
 * ── WHY IT WEARS THE PUBLIC SITE CHROME ──────────────────────────────────────
 * The console, the partner dashboard and /account share components/console-shell.tsx, and this
 * page deliberately does not. `BARE` in app/(site)/layout.tsx — a named list of prefixes that
 * opt out of the public header and footer — does not include /reseller/dashboard, so rendering a
 * ConsoleShell here would stack two navigations and two sign-out buttons. One route does not
 * warrant a rail. If the portal grows a second screen, the change is to add the prefix to that
 * list and give this subtree a layout, not to fight it from inside the page.
 */
export const metadata: Metadata = {
  title: 'Reseller dashboard',
  robots: { index: false, follow: false },
}

/**
 * The answer depends on the session and on rows that change under the caller — a cached copy
 * would hand one reseller's statement to the next. Same reasoning as app/(site)/dashboard.
 */
export const dynamic = 'force-dynamic'

export default async function ResellerDashboardPage() {
  /*
   * Signed out is the one state answered with a redirect, and it carries the path through as
   * `next` so signing in comes back here rather than dumping them on /account.
   *
   * It also disposes of the no-database case before anything below runs: with no Supabase
   * configured getSessionUser() returns null, so this redirects and the `dashboard === null`
   * branch further down can only ever mean "this account is not a reseller".
   */
  await requireUser('/reseller/dashboard')

  /*
   * ONE READ ANSWERS ALL THREE STATES, and it is worth writing down which, because the obvious
   * guess is wrong. getMyResellerDashboard() does *not* return null for a suspended reseller — it
   * calls getMyReseller(), which reads public.resellers keyed on profile_id under the
   * resellers_select_self policy and therefore returns the row whatever its status, and then
   * queries the view, which app.my_reseller_id() empties out for anyone who is not active.
   *
   * So: null means there is no reseller row at all. Non-null with a status other than 'active'
   * means suspended or closed, with zeroed figures that are *hidden* rather than earned-nothing.
   * A separate getMyReseller() call to tell those apart would be a second round trip answering a
   * question this one has already answered.
   */
  const dashboard = await getMyResellerDashboard()

  if (!dashboard) return <NotAReseller />
  if (dashboard.status !== 'active') return <LockedOut dashboard={dashboard} />
  return <ActiveStatement dashboard={dashboard} />
}

// ---------------------------------------------------------------------------
// Signed in, but not a reseller
// ---------------------------------------------------------------------------

/**
 * A page, not a redirect.
 *
 * Bouncing to /account would be the tidier-looking choice and it is the wrong one twice over.
 * A reseller who has signed in with the wrong one of their two logins learns nothing from being
 * moved somewhere else, and lib/viewer.ts routes people *to* this path — a redirect away from it
 * is one changed precedence rule from being a loop.
 */
function NotAReseller() {
  return (
    <Container className="py-16 sm:py-20">
      <div className="max-w-2xl">
        <h1 className="text-ink-900 text-3xl leading-tight sm:text-4xl">
          This area is for reseller partners
        </h1>
        <p className="text-ink-600 mt-5 text-lg">
          Your account is not set up as a reseller, so there is no statement to show you. A reseller
          brings customers to the Fremmo invitation storefront and earns a share of what those
          customers spend.
        </p>
        <p className="text-ink-600 mt-3">
          Reseller accounts are created by us and attached to one login. If you were expecting a
          statement, the likeliest explanation is that this is not the login we set up — sign out
          and try the other one.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href="/account" size="lg">
            Go to your account
          </LinkButton>
          <LinkButton href="/" variant="outline" size="lg">
            Back to Fremmo
          </LinkButton>
        </div>
      </div>
    </Container>
  )
}

// ---------------------------------------------------------------------------
// Suspended or closed
// ---------------------------------------------------------------------------

/**
 * The copy for the two non-active states.
 *
 * IT SAYS "HIDDEN", NOT "NOTHING". app.my_reseller_id() filters on `status = 'active'`, so the
 * view returns no rows for these two and every total folds to zero. Rendering those zeros in the
 * normal tiles would tell a partner who has earned real money that they have earned none, which
 * is the one wrong answer they would act on. The figures are withheld and this page says so.
 *
 * Keyed on the status enum minus 'active' rather than on a hand-written union, so a fourth value
 * added to public.reseller_status fails the typecheck here — at the one place where somebody has
 * to decide what to tell a partner about it — instead of quietly borrowing the closed wording.
 */
interface LockoutCopy {
  badge: string
  tone: BadgeTone
  title: string
  lede: string
  detail: string
}

const LOCKOUT_COPY: Record<Exclude<ResellerStatus, 'active'>, LockoutCopy> = {
  suspended: {
    badge: 'Suspended',
    // Amber, not red. Suspension is reversible and the money behind it is intact; the red badge
    // on this page belongs to a reversed commission, which is the thing that has actually gone.
    tone: 'warning',
    title: 'Your reseller account is suspended',
    lede:
      'While it is suspended we cannot show your orders or your balances. They are hidden, not ' +
      'zero — nothing you have already earned has been taken away.',
    detail:
      'New orders from your customers stop being attributed to you for as long as this lasts, ' +
      'and commission that had already accrued stays exactly where it was: what was payable is ' +
      'still payable, and what was settled stays settled. Quote the code above when you ask us ' +
      'about it.',
  },
  closed: {
    badge: 'Closed',
    tone: 'neutral',
    title: 'Your reseller account is closed',
    lede:
      'This arrangement has ended, so there is no statement to show. Closing is final — a ' +
      'reseller account cannot be reopened.',
    detail:
      'Orders already attributed to you keep their attribution and anything already settled ' +
      'stays settled. If there is an outstanding balance to sort out, or if you want to work ' +
      'with us again under a new account, quote the code above.',
  },
}

function LockedOut({ dashboard }: { dashboard: MyResellerDashboard }) {
  // 'active' cannot arrive here — the page sends it to the statement instead — but TypeScript does
  // not carry that narrowing across a component boundary, so the ternary re-states it.
  const copy = LOCKOUT_COPY[dashboard.status === 'suspended' ? 'suspended' : 'closed']

  return (
    <Container className="py-16 sm:py-20">
      <div className="max-w-2xl">
        <StatementIdentity
          displayName={dashboard.displayName}
          code={dashboard.code}
          badge={{ text: copy.badge, tone: copy.tone }}
        />

        <h1 className="text-ink-900 mt-6 text-3xl leading-tight sm:text-4xl">{copy.title}</h1>
        <p className="text-ink-600 mt-5 text-lg">{copy.lede}</p>
        <p className="text-ink-600 mt-3">{copy.detail}</p>

        <div className="mt-8">
          <LinkButton href="/account" variant="outline" size="lg">
            Go to your account
          </LinkButton>
        </div>
      </div>
    </Container>
  )
}

// ---------------------------------------------------------------------------
// The statement
// ---------------------------------------------------------------------------

function ActiveStatement({ dashboard }: { dashboard: MyResellerDashboard }) {
  /*
   * The four states of a commission, in the order money moves through them. Lifetime first
   * because it is the one number a partner came for; the split under it is what that number is
   * made of, and the three add up to it exactly — reversed commission is in none of them,
   * because a commission that was reversed is not money anybody is owed.
   */
  const tiles = [
    {
      // Labelled "Lifetime earnings" rather than "Earned", which is what the console calls the
      // identical number — a partner reads this once a month, a settlement clerk reads the console
      // every week, and each wants a different word for it. The field behind both is earnedPaise.
      label: 'Lifetime earnings',
      value: formatPaise(dashboard.earnedPaise),
      hint: 'Everything you have earned that was not reversed. The three below add up to this.',
    },
    {
      label: 'Pending',
      value: formatPaise(dashboard.pendingPaise),
      hint: 'Earned on an order that is paid for but not delivered yet. If that order is refunded or cancelled, this comes back off.',
    },
    {
      label: 'Payable',
      value: formatPaise(dashboard.payablePaise),
      hint: 'The order was delivered, so this is yours. It is waiting to go out in the next settlement.',
    },
    {
      label: 'Paid',
      value: formatPaise(dashboard.paidPaise),
      hint: 'Settled and sent to your bank. Each of these was paid against a reference we can quote back to you.',
    },
  ] as const

  return (
    <Container className="py-10 sm:py-14">
      <div className="space-y-10">
        <header>
          <StatementIdentity
            displayName={dashboard.displayName}
            code={dashboard.code}
            badge={{ text: 'Active', tone: 'success' }}
          />
          <p className="text-ink-600 mt-3 max-w-prose">
            You earn {formatBps(dashboard.commissionBps)} of every invitation order placed by a
            customer assigned to you.{' '}
            {/* The frozen-rate rule, said where somebody would otherwise be surprised by it. A
                rate change cannot rewrite what an old order paid — the database refuses it — and
                that protects the reseller as often as it protects us. */}
            That is the rate on new orders; each order below shows the rate it was placed under,
            which never changes afterwards.
          </p>
        </header>

        <section>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile) => (
              <Card key={tile.label}>
                <CardBody>
                  <p className="text-ink-500 text-xs tracking-wide uppercase">{tile.label}</p>
                  <p className="font-display text-ink-900 mt-1.5 text-3xl">{tile.value}</p>
                  <p className="text-ink-500 mt-1.5 text-xs leading-relaxed">{tile.hint}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-ink-900 text-xl">
            Your orders{dashboard.orders.length > 0 ? ` (${dashboard.orders.length})` : ''}
          </h2>

          {dashboard.orders.length === 0 ? (
            <p className="text-ink-600 mt-2 max-w-prose text-sm leading-relaxed">
              Nothing attributed to you yet. You do not have to claim anything — an order appears
              here on its own when a customer assigned to your account buys a card.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {dashboard.orders.map((order) => (
                <OrderRow key={order.order_id} order={order} />
              ))}
            </div>
          )}
        </section>

        {/* The partner dashboard closes on the credit-refund promise for the same reason: the
            mechanism is only worth something to the person if they know it is there. Here the
            thing worth stating is what this page will never show them, before they ask for it. */}
        <Card className="border-ink-200 bg-surface-sunken">
          <CardBody>
            <h2 className="font-display text-ink-900 text-lg">Why you only see a first name</h2>
            <p className="text-ink-600 mt-1.5 max-w-prose text-sm leading-relaxed">
              Your statement carries the order reference and the customer&rsquo;s first name, and no
              email address or phone number. That boundary is in the database rather than in this
              page — the view this list is built from cannot return a contact detail to a reseller
              at all. If you need to reach a customer about their order, tell us the reference and
              we will.
            </p>
          </CardBody>
        </Card>
      </div>
    </Container>
  )
}

function StatementIdentity({
  displayName,
  code,
  badge,
}: {
  displayName: string
  code: string
  badge: { text: string; tone: BadgeTone }
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="font-display text-ink-900 text-2xl sm:text-3xl">{displayName}</h1>
      <Badge tone={badge.tone}>{badge.text}</Badge>
      {/* Selectable monospace rather than a styled chip: this is the string we ask for when
          somebody writes in, so it has to copy cleanly. Same treatment as an order reference. */}
      <span className="text-ink-500 font-mono text-xs">{code}</span>
    </div>
  )
}

function OrderRow({ order }: { order: ResellerOrderRow }) {
  return (
    <Card>
      <CardBody className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-ink-900 font-medium">
            {order.template_name} · for {order.customer_first_name.trim() || 'a customer'}
          </p>
          <p className="text-ink-500 mt-0.5 font-mono text-xs">{order.reference}</p>
          <p className="text-ink-500 mt-1 text-sm">
            {formatDay(order.created_at)} · {ORDER_STATUS_LABEL[order.status]} · order{' '}
            {formatPaise(order.template_price)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {/* formatPaise renders null as an em dash, which is the honest answer for an order
              whose commission has not accrued yet — zero would read as "you earned nothing".

              A reversed commission keeps its amount and is struck through rather than blanked.
              The migration keeps the reversed row on purpose, because "it was this much, and then
              the order was refunded" is precisely what somebody querying a statement needs; the
              rule on this page's totals is elsewhere, which is that reversed adds to none of
              them. Both facts have to be visible or the tiles look like they lost a row. */}
          <p
            className={cn(
              'font-display text-2xl',
              order.commission_status === 'reversed' ? 'text-ink-400 line-through' : 'text-ink-900',
            )}
          >
            {formatPaise(order.commission_amount)}
          </p>
          {order.commission_status ? (
            <>
              <div className="mt-1.5 flex justify-end">
                <Badge tone={COMMISSION_TONE[order.commission_status]}>
                  {COMMISSION_LABEL[order.commission_status]}
                </Badge>
              </div>
              <p className="text-ink-500 mt-1.5 text-xs">
                {formatBps(order.commission_rate_bps)} of {formatPaise(order.template_price)}
              </p>
            </>
          ) : (
            <p className="text-ink-500 mt-1.5 max-w-[16rem] text-xs leading-relaxed">
              Nothing earned yet — commission is created when the booking payment lands.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * The order lifecycle, written out here rather than imported from lib/invitation-orders.ts.
 *
 * That module is the console's, and its first act is to reach for the admin Supabase client to
 * read invitation_orders — the table this whole surface is built to keep away from a reseller.
 * Importing it for a label map would put it in this page's module graph for no gain. The
 * duplication cannot silently drift either: `Record<InvitationOrderStatus, string>` is exhaustive,
 * so a new status added to the enum fails the typecheck here.
 */
const ORDER_STATUS_LABEL: Record<InvitationOrderStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  booked: 'Booked',
  details_received: 'Details received',
  draft_sent: 'Draft sent',
  approved: 'Approved',
  delivered: 'Delivered',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

const COMMISSION_LABEL: Record<ResellerCommissionStatus, string> = {
  pending: 'Pending',
  payable: 'Payable',
  paid: 'Paid',
  reversed: 'Reversed',
}

/**
 * Reversed is `danger`, and that is deliberate rather than a scolding. It is the one row on the
 * statement whose amount is not owed to anybody, and a partner scanning the column needs it to
 * stop the eye. Pending is a warning because it can still become that.
 */
const COMMISSION_TONE: Record<ResellerCommissionStatus, BadgeTone> = {
  pending: 'warning',
  payable: 'primary',
  paid: 'success',
  reversed: 'danger',
}

/** Same date treatment as the partner dashboard's lead rows. */
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

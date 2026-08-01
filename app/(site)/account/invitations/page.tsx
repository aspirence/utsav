import Link from 'next/link'

import { MediaFrame } from '@/components/ui'

import { getMyInvitationOrders } from '@/lib/account-queries'
import { formatPaise } from '@/lib/db'
import { BOOKING, getLiveInvitationTemplates, orderLegs } from '@/lib/invitation-templates'

/**
 * Digital invitations, inside the account: what you have ordered, and what you can order.
 *
 * WHY BOTH ON ONE PAGE. The storefront already existed at /invitations/[slug], reachable from
 * the homepage feature and from nowhere else — a customer who had bought a card had no way back
 * to it, and one who had not had no way to it at all. Plan §2 puts the invitation storefront in
 * the Must tier; a Must-tier product with no entry point from the signed-in surface is a product
 * nobody finds twice.
 *
 * ORDERS FIRST, DESIGNS SECOND. Somebody arriving here has usually come back for a card they
 * already bought — a reference to quote at support, or the balance still to pay. Putting the
 * catalogue on top would make them scroll past it every time.
 *
 * NO BUY BUTTON ON THIS PAGE, ON PURPOSE. Each design links to its own page, which is where the
 * preview, the price breakdown and the booking form live. A second checkout entry point here
 * would be a second place for the two-leg payment split to drift out of step with
 * lib/invitation-templates.ts.
 */
export const metadata = {
  title: 'Invitations',
}

export default async function AccountInvitationsPage() {
  const [orders, templates] = await Promise.all([
    getMyInvitationOrders(),
    getLiveInvitationTemplates(),
  ])

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-xl text-ink-900">Your cards</h2>

        {orders.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-600">
            Nothing ordered yet. Pick a design below — you pay{' '}
            {formatPaise(BOOKING.amountPaise)} to book it and the balance when it is ready.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {orders.map((order) => (
              <li
                key={order.reference}
                className="rounded-lg border border-ink-200 bg-white p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{order.templateName}</p>
                  {/* The reference is what support asks for, so it is selectable text in a
                      monospace face rather than a styled badge nobody can copy cleanly. */}
                  <p className="mt-0.5 font-mono text-xs text-ink-500">{order.reference}</p>
                </div>

                <div className="mt-3 flex items-center gap-4 sm:mt-0 sm:shrink-0">
                  <span className="text-sm text-ink-700">
                    {order.paidAt ? (
                      <>Balance {order.balanceLabel}</>
                    ) : (
                      <>Booking {order.bookingLabel}</>
                    )}
                  </span>
                  <span
                    className={
                      'rounded-lg px-2.5 py-1 text-xs font-semibold ' +
                      (order.paidAt
                        ? 'bg-success-50 text-success-700'
                        : 'bg-warning-50 text-warning-700')
                    }
                  >
                    {order.statusLabel}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-xl text-ink-900">Designs</h2>
          <Link
            href="/invitation"
            className="text-sm text-ink-600 underline underline-offset-2 hover:text-ink-900"
          >
            See how they work
          </Link>
        </div>

        {templates.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-600">
            No designs are live right now. They arrive in collections — check back shortly.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => {
              // Same split the booking form shows, from the same function — the two legs must
              // reconcile against `invitation_orders_amounts_reconcile` in the database.
              const legs = orderLegs(template.pricePaise)
              return (
                <li key={template.id}>
                  <Link
                    href={`/invitations/${template.slug}`}
                    className="group block overflow-hidden rounded-lg border border-ink-200 bg-white transition-colors hover:border-ink-300"
                  >
                    <MediaFrame
                      src={template.posterUrl}
                      alt={template.name}
                      aspect="3/4"
                      className="rounded-none"
                    />
                    <div className="p-4">
                      <p className="font-medium text-ink-900">{template.name}</p>
                      <p className="mt-1 text-sm text-ink-700">
                        {formatPaise(template.pricePaise)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatPaise(legs.bookingPaise)} to book, {formatPaise(legs.balancePaise)}{' '}
                        later
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

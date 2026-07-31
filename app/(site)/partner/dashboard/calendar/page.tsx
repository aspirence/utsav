import { Card, CardBody } from '@/components/ui'

import { loadVendorAvailability } from './actions'
import { CalendarGrid } from './calendar-grid'

/**
 * Availability calendar. Plan §S8 ships this alongside the vendor app.
 *
 * It is the supply side of plan §2's "'free on my date' availability filter": a blocked
 * date removes the vendor from that day's routing (app.route_enquiry skips them) and
 * from the customer-facing filter. The read stays server-side and RLS-scoped; only the
 * grid itself is a client component, because toggling has to feel instant.
 */
export default async function PartnerCalendarPage() {
  const { today, days, canManage, notice } = await loadVendorAvailability()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900">Your availability</h1>
        <p className="mt-1.5 max-w-2xl text-ink-600">
          Block the dates you are already booked or away. We stop routing enquiries to you
          for those days, and customers filtering by &ldquo;free on my date&rdquo; will not
          see you. Everything else stays open by default — you never have to confirm you
          are free.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-ink-200 bg-surface-raised" />
          Available
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded bg-ink-900" />
          Blocked
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded bg-success-600" />
          Confirmed booking
        </span>
      </div>

      <CalendarGrid
        initialDays={days}
        todayIso={today}
        canManage={canManage}
        notice={notice}
      />

      <Card className="border-ink-200 bg-surface-sunken">
        <CardBody>
          <p className="text-sm text-ink-600">
            Dates tied to a confirmed booking cannot be unblocked here — cancelling a
            booking releases the date automatically. This keeps the calendar honest, which
            is what lets customers trust the &ldquo;free on your date&rdquo; badge.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

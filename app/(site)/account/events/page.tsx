import { getMyEvents } from '@/lib/account-queries'
import { getCityOptions } from '@/lib/queries'

import { EventForm } from './event-form'

/**
 * The customer's events.
 *
 * An event is the container everything else hangs off - `enquiries.event_id`,
 * `shortlists.event_id`, `checklists.event_id` all point here - so this is the screen that
 * makes the rest of the account cohere rather than being three unrelated lists.
 *
 * Archived events are shown, quietly. `archiveEvent` is a soft delete because a real one
 * cascades a checklist and a shortlist away and orphans the enquiries that reference it, so
 * they have to remain visible or the history they carry is unreachable.
 */
export default async function EventsPage() {
  const [events, cities] = await Promise.all([getMyEvents(), getCityOptions()])

  const live = events.filter((e) => !e.isArchived)
  const archived = events.filter((e) => e.isArchived)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-prose">
          <h2 className="font-display text-ink-900 text-xl">Your events</h2>
          <p className="text-ink-700 mt-2 leading-relaxed">
            One for each celebration. Enquiries, saved vendors and your checklist all sit under
            whichever event they belong to.
          </p>
        </div>
        <EventForm cities={cities} />
      </div>

      {live.length === 0 ? (
        <p className="text-ink-600 mt-8">Nothing yet. Add the first one above.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {live.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="mt-12">
          <h3 className="text-ink-500 text-xs font-semibold tracking-[0.14em] uppercase">
            Archived
          </h3>
          <ul className="mt-4 space-y-4 opacity-60">
            {archived.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function EventRow({ event }: { event: Awaited<ReturnType<typeof getMyEvents>>[number] }) {
  const facts = [
    event.eventDate
      ? new Date(event.eventDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : event.dateFlexible
        ? 'Date not fixed'
        : null,
    event.cityName,
    event.guestCount ? `${event.guestCount} guests` : null,
    event.budgetLabel,
  ].filter(Boolean)

  return (
    <li className="border-ink-100 bg-surface-raised rounded-2xl border p-5">
      <p className="font-display text-ink-900 text-lg">{event.name}</p>
      <p className="text-ink-600 mt-1 text-sm">{facts.join(' · ') || 'No details yet'}</p>
    </li>
  )
}

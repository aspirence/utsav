import Link from 'next/link'

import { Rating } from '@/components/ui'

import { ShortlistButton } from '@/components/shortlist-button'
import { getMyShortlist } from '@/lib/account-queries'

/**
 * Saved vendors.
 *
 * The save button itself already existed - it is optimistic and keeps anonymous choices in
 * localStorage until there is a session (see components/shortlist-button.tsx). What was
 * missing was anywhere to see the result: rows were being written to `shortlists` and no
 * screen read them back, and the action was revalidating `/shortlist`, a path that was
 * never built.
 *
 * Each card carries the same button, so removing something happens where you are looking at
 * it rather than on the vendor's own page.
 */
export default async function ShortlistsPage() {
  const saved = await getMyShortlist()

  if (saved.length === 0) {
    return (
      <div className="max-w-prose">
        <h2 className="font-display text-xl text-ink-900">Nothing saved yet</h2>
        <p className="mt-3 leading-relaxed text-ink-700">
          Tap Shortlist on any vendor and they turn up here. Anything you saved before
          signing in stays on that device until you save it again.
        </p>
        <Link
          href="/lucknow/photography"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary-600 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-700"
        >
          Browse photographers
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h2 className="font-display text-xl text-ink-900">
        {saved.length} {saved.length === 1 ? 'vendor' : 'vendors'} saved
      </h2>

      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {saved.map((s) => (
          <li
            key={s.id}
            className="flex flex-col rounded-2xl border border-ink-100 bg-surface-raised p-5"
          >
            <Link
              href={`/vendor/${s.vendorSlug}`}
              className="font-display text-lg leading-tight text-ink-900 hover:text-primary-700"
            >
              {s.vendorName}
            </Link>

            <p className="mt-1 text-sm text-ink-600">
              {[s.localityName, s.cityName].filter(Boolean).join(', ') || '—'}
            </p>

            {s.ratingCount > 0 && s.ratingAvg != null && (
              <div className="mt-3">
                <Rating value={s.ratingAvg} count={s.ratingCount} />
              </div>
            )}

            <p className="mt-3 text-sm text-ink-700">{s.priceBandLabel}</p>

            {s.note && (
              <p className="mt-3 border-l-2 border-ink-200 pl-3 text-sm text-ink-600">
                {s.note}
              </p>
            )}

            {/* mt-auto so the button sits on the floor of every card whatever the copy above
                it runs to - a row of cards with the control at a different height each reads
                as broken. */}
            <div className="mt-auto pt-5">
              {/* initialSaved: this row came out of the database, so it is saved by
                  definition. Without it the button would read localStorage, find nothing on
                  a second device, and render "Shortlist" over a row that is already there. */}
              <ShortlistButton
                vendorSlug={s.vendorSlug}
                vendorName={s.vendorName}
                initialSaved
                {...(s.eventId ? { eventId: s.eventId } : {})}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

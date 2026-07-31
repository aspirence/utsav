'use client'

import { useEffect, useRef } from 'react'

import { trackDiscoverEvent, type DiscoverEventName } from '@/app/actions/analytics'

/**
 * Fire-and-forget funnel emitter for the discover stage. Plan §10.
 *
 * Renders nothing. Drop it into a page or a card and it reports one event on mount:
 *
 *   <TrackView name="listing_viewed" vendor={slug} city={citySlug} category={categorySlug} />
 *
 * Why a client component at all, when plan §4 puts reads in Server Components: the pages
 * this sits on are the static, heavily-crawled ones (plan §12, "static-first pages").
 * Emitting from the server would mean touching cookies() during render, which opts the
 * whole route out of static generation — the SEO engine paying for the analytics. A view
 * is also the one thing only the browser can attest to; a prerender is not a reading.
 *
 * Nothing here awaits, sets state, or renders — a slow or failed emit is invisible to the
 * person browsing, which is the correct priority when the alternative is a stalled page
 * on 4G (plan §13).
 */

type TrackProperties = Record<string, string | number | boolean | null>

export function TrackView({
  name,
  vendor,
  city,
  category,
  properties,
}: {
  name: DiscoverEventName
  /** Vendor slug or UUID. */
  vendor?: string
  /** City slug or UUID. */
  city?: string
  /** Category slug or UUID. */
  category?: string
  /**
   * Scalars only, snake_case keys, and no free text about the person browsing — the
   * server rejects anything else. Money, if it appears, is integer paise (`*_paise`).
   */
  properties?: TrackProperties
}) {
  // Identity of the event, not of the component. Search filters change on the same
  // mounted instance, and each distinct set of filters is a genuinely new
  // `search_performed`; a re-render that changes nothing is not.
  const key = JSON.stringify([name, vendor, city, category, properties])

  const lastFired = useRef<string | null>(null)

  useEffect(() => {
    // Also covers StrictMode's double effect in development: the ref survives the
    // simulated remount, so the second pass sees the same key and stops.
    if (lastFired.current === key) return
    lastFired.current = key

    void trackDiscoverEvent({
      name,
      vendor,
      city,
      category,
      properties,
      ...deviceIds(),
    }).catch(() => {
      // Analytics must never surface to the person browsing. The action already returns
      // a state rather than throwing; this catches the transport itself failing offline.
    })
    // `key` is the whole dependency: it is derived from every other value used here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return null
}

// ---------------------------------------------------------------------------
// First-party identifiers
// ---------------------------------------------------------------------------

const ANONYMOUS_KEY = 'utsava.aid.v1'
const SESSION_KEY = 'utsava.sid.v1'

/**
 * A guest has no profile — plan §2 puts the account behind the enquiry, not in front of
 * the catalogue — so the discover stage needs its own join key. Without one, the
 * discover → enquire ratio that gates the 10k monthly enquiries target cannot be computed
 * at all.
 *
 * Both ids are random, first-party, and meaningless off this origin: they identify a
 * browser to us and are never shared onward, which is what keeps plan §6's DPDP purpose
 * limitation honest. The anonymous id persists across visits; the session id lasts one
 * tab session, so "searches per session" stays a real number.
 */
function deviceIds(): { anonymousId?: string; sessionId?: string } {
  if (typeof window === 'undefined') return {}

  const anonymousId = readOrMint(window.localStorage, ANONYMOUS_KEY)
  const sessionId = readOrMint(window.sessionStorage, SESSION_KEY)

  // Omit rather than send an empty string — the server validates a minimum length.
  return {
    ...(anonymousId ? { anonymousId } : {}),
    ...(sessionId ? { sessionId } : {}),
  }
}

function readOrMint(store: Storage, key: string): string | null {
  try {
    const existing = store.getItem(key)
    if (existing && existing.length >= 8) return existing

    const minted = randomId()
    store.setItem(key, minted)
    return minted
  } catch {
    // Private-mode Safari throws on storage access. The event still goes out, just
    // without a join key — the same trade-off components/shortlist-button.tsx makes.
    return null
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // randomUUID needs a secure context. Fall back to something long enough to be unique
  // in practice — this is a bucket label, not a credential.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

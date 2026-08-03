'use client'

import { useEffect, useState, useTransition } from 'react'

import { cn } from '@/components/ui'

import { toggleShortlist } from '@/app/actions/shortlist'

const STORAGE_KEY = 'fremmo.shortlist.v1'

/**
 * Save-for-later on a vendor card or profile. Plan §10 counts `shortlist_added` as a
 * discover-stage funnel event.
 *
 * Optimistic and offline-tolerant on purpose: a couple comparing photographers on a
 * phone should never lose a tap to a slow 4G round trip (plan §13), and there is no
 * account yet at this point in the journey (plan §2 puts sign-up behind the enquiry).
 * localStorage is therefore the source of truth until the server reports it has
 * persisted the row.
 *
 * The server action is a true toggle, so its answer can legitimately differ from the
 * optimistic guess — the same account may have shortlisted this vendor on another
 * device. When a signed-in write comes back, the button and localStorage are reconciled
 * to what the database now holds rather than to what the tap assumed.
 */
export function ShortlistButton({
  vendorSlug,
  vendorName,
  eventId,
  initialSaved,
  className,
}: {
  /** Slug or vendor UUID — the action accepts either. */
  vendorSlug: string
  vendorName: string
  /** File the save under one of the customer's events instead of the account-wide list. */
  eventId?: string
  /**
   * What the database says, when the caller knows. Pass it wherever the page has already
   * read the shortlist server-side - the /account/shortlists list, or a vendor card rendered
   * for a signed-in user.
   *
   * When it is supplied it wins over localStorage, because it is the account's state rather
   * than this device's. Without it, a row saved on a phone rendered "Shortlist" on a laptop
   * that had never seen it, and tapping would have deleted it.
   *
   * Leave it undefined on anonymous and statically-cached pages: there is nothing to read,
   * and baking one visitor's answer into a shared cache would show it to everyone.
   */
  initialSaved?: boolean
  className?: string
}) {
  const [saved, setSaved] = useState(initialSaved ?? false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const storageKey = eventId ? `${vendorSlug}@${eventId}` : vendorSlug

  // Read after mount so the server-rendered markup and the first client render match.
  // Skipped entirely when the server already told us - the account's state beats the
  // device's, and reading anyway would flip a correctly-filled button back off.
  useEffect(() => {
    if (initialSaved !== undefined) return
    setSaved(readShortlist().includes(storageKey))
  }, [storageKey, initialSaved])

  function handleClick() {
    const optimistic = !saved
    setSaved(optimistic)
    setError(null)
    writeShortlist(optimistic, storageKey)

    startTransition(async () => {
      const result = await toggleShortlist(vendorSlug, eventId)

      if (result.status === 'error') {
        setSaved(!optimistic)
        writeShortlist(!optimistic, storageKey)
        setError(result.message)
        return
      }

      // 'local' and 'unconfigured' both mean nothing was written server-side; the
      // device copy stands and the optimistic state is already correct.
      if (result.status === 'saved' || result.status === 'removed') {
        setSaved(result.shortlisted)
        writeShortlist(result.shortlisted, storageKey)
      }
    })
  }

  return (
    <span className={cn('inline-flex flex-col items-start gap-1', className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${vendorName} from your shortlist` : `Shortlist ${vendorName}`}
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors',
          'disabled:pointer-events-none disabled:opacity-60',
          saved
            ? 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100'
            : 'border-ink-200 bg-surface-raised text-ink-800 hover:border-ink-300 hover:bg-ink-50',
        )}
      >
        <svg
          className={cn('h-4 w-4', saved ? 'fill-primary-600' : 'fill-none stroke-ink-500')}
          strokeWidth={1.6}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M10 17.2l-1.2-1.1C4.5 12.2 2 9.9 2 7.1 2 4.9 3.7 3.2 5.9 3.2c1.2 0 2.4.6 3.1 1.5l1 1.2 1-1.2c.7-.9 1.9-1.5 3.1-1.5 2.2 0 3.9 1.7 3.9 3.9 0 2.8-2.5 5.1-6.8 9z" />
        </svg>
        {saved ? 'Shortlisted' : 'Shortlist'}
      </button>
      {error && <span className="text-xs text-danger-700">{error}</span>}
    </span>
  )
}

function readShortlist(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    // Private-mode Safari throws on localStorage; the button still works, just not
    // across reloads.
    return []
  }
}

function writeShortlist(add: boolean, key: string): void {
  if (typeof window === 'undefined') return
  const current = readShortlist()
  const next = add
    ? current.includes(key)
      ? current
      : [...current, key]
    : current.filter((s) => s !== key)

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignored for the same reason as above.
  }
}

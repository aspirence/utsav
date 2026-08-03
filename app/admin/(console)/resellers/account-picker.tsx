'use client'

import { useEffect, useState, useTransition } from 'react'

import { searchAssignableAccounts } from './actions'

import type { AssignableAccount } from '@/lib/resellers'

/**
 * Pick an existing account, by email, phone or name.
 *
 * A CLIENT COMPONENT FOR THE SEARCH, and only for that — the same trade
 * app/admin/(console)/users/grant-form.tsx makes. Choosing who to make a reseller, or whose
 * orders should pay one, means typing a fragment of an address and picking from what comes back;
 * a GET form would work and would reload the page under the person's cursor between every letter.
 * What the form finally submits goes to a Server Action.
 *
 * SHARED BY THE TWO FORMS THAT NEED IT — create a reseller, and assign a customer to one. They
 * ask the same question of the same table and differ only in what they do with the answer, and a
 * second copy of the debounce-and-cancel logic below is a second place for the race in it to be
 * got wrong.
 *
 * NOTHING HERE IS A PERMISSION CHECK. It renders whatever findAssignableAccounts() returns, which
 * is RLS-scoped to the operator's own session, and the write it feeds is refused by
 * requireSuper() in lib/resellers.ts regardless of what this component posts.
 */
export function AccountPicker({
  id,
  fieldName,
  picked,
  onPick,
  label,
  hint,
  /**
   * Shown under an account that some reseller already owns.
   *
   * Only meaningful when picking somebody to *assign*: one live owner per customer is a partial
   * unique index, so assigning them would be refused. Surfacing it here means the operator reads
   * why before pressing the button rather than after. It is not the guard — see assignCustomer().
   */
  warnOnOwned = false,
}: {
  id: string
  fieldName: string
  picked: AssignableAccount | null
  onPick: (account: AssignableAccount | null) => void
  label: string
  hint?: string
  warnOnOwned?: boolean
}) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<AssignableAccount[]>([])
  const [searching, startSearch] = useTransition()

  /*
   * 250ms of quiet before asking, matching the grant form. Fast enough that it feels like it is
   * keeping up, slow enough that typing an eleven-character address is one query rather than
   * eleven.
   *
   * The cancelled flag matters more than the timer: responses can land out of order, and without
   * it a slow answer for "ra" can overwrite a fast one for "rahul@" and show the wrong list under
   * the right query.
   */
  useEffect(() => {
    if (picked || query.trim().length < 3) {
      setMatches([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      startSearch(async () => {
        const found = await searchAssignableAccounts(query)
        if (!cancelled) setMatches(found)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, picked])

  if (picked) {
    return (
      <div>
        <span className="text-ink-700 block text-xs font-semibold">{label}</span>
        <input type="hidden" name={fieldName} value={picked.profileId} />

        <div className="border-ink-200 bg-ink-50 mt-1.5 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="text-ink-900 block truncate font-medium">
              {picked.fullName ?? picked.email ?? picked.phone ?? 'No name'}
            </span>
            <span className="text-ink-500 block truncate text-xs">
              {picked.email ?? picked.phone ?? picked.profileId}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onPick(null)
              setQuery('')
            }}
            className="text-ink-600 hover:text-ink-900 shrink-0 text-xs font-medium underline underline-offset-2"
          >
            Change
          </button>
        </div>

        {warnOnOwned && picked.currentResellerName && (
          <p className="bg-warning-50 text-warning-700 mt-1.5 rounded-md px-2.5 py-2 text-xs leading-relaxed">
            {picked.currentResellerName} already owns this account. Assigning them here will be
            refused — release them from {picked.currentResellerName} first.
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <label htmlFor={id} className="text-ink-700 block text-xs font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Email, phone or name"
        className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none"
      />
      <p className="text-ink-500 mt-1.5 text-xs">
        {hint ?? 'The account has to exist already. Three characters to search.'}
      </p>

      {matches.length > 0 && (
        <ul className="divide-ink-100 border-ink-200 mt-2 divide-y rounded-md border">
          {matches.map((m) => (
            <li key={m.profileId}>
              <button
                type="button"
                onClick={() => onPick(m)}
                className="hover:bg-ink-50 flex w-full flex-col items-start px-3 py-2 text-left text-sm"
              >
                <span className="text-ink-900 font-medium">
                  {m.fullName ?? m.email ?? m.phone ?? 'No name'}
                </span>
                <span className="text-ink-500 text-xs">{m.email ?? m.phone ?? m.profileId}</span>
                {m.currentResellerName && (
                  <span className="text-warning-700 mt-0.5 text-xs">
                    Owned by {m.currentResellerName}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!searching && query.trim().length >= 3 && matches.length === 0 && (
        <p className="text-ink-500 mt-2 text-xs">No account matches that.</p>
      )}
    </div>
  )
}

/** Shared by every form in this section, so a refusal and a confirmation look the same everywhere. */
export function Note({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md px-3 py-2 text-xs leading-relaxed ${
        tone === 'error' ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700'
      }`}
    >
      {children}
    </p>
  )
}

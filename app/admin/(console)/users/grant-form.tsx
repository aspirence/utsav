'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'

import { grantStaffRole, revokeStaffRole, searchAccounts, type TeamActionState } from './actions'

import type { AccountMatch } from '@/lib/admin-users'

/**
 * The grant form, and the revoke buttons that sit in the team table.
 *
 * A CLIENT COMPONENT FOR THE SEARCH, and only for that. Picking who to grant a role to means
 * typing a fragment of an email and choosing from what comes back, which is a round trip per
 * keystroke — a GET form would work but would reload the page under the person's cursor between
 * every letter. Everything the form finally submits goes to a Server Action.
 *
 * NOTHING HERE IS A PERMISSION CHECK. The role dropdown, the buttons, all of it is markup a
 * caller can edit. `requireSuper()` in lib/admin-users.ts is what refuses, and it runs before
 * the service-role key is touched.
 */

const ROLES = [
  { value: 'moderator', label: 'Moderator', hint: 'Approves listings, media and reviews.' },
  { value: 'finance', label: 'Finance', hint: 'Payouts and refunds, four-eyes.' },
  { value: 'field_agent', label: 'Field agent', hint: 'Files and edits drafts in their cities.' },
  { value: 'super', label: 'Super admin', hint: 'Everything, including this screen.' },
] as const

export function GrantRoleForm() {
  const [state, submit, pending] = useActionState<TeamActionState, FormData>(grantStaffRole, {})

  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<AccountMatch[]>([])
  const [picked, setPicked] = useState<AccountMatch | null>(null)
  const [role, setRole] = useState<string>('moderator')
  const [searching, startSearch] = useTransition()

  /*
   * 250ms of quiet before asking. Fast enough that it feels like it is keeping up, slow enough
   * that typing an eleven-character address is one query rather than eleven.
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
        const found = await searchAccounts(query)
        if (!cancelled) setMatches(found)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, picked])

  // A successful grant clears the picked account, or the next grant silently reuses it.
  useEffect(() => {
    if (state.notice) {
      setPicked(null)
      setQuery('')
      setMatches([])
    }
  }, [state.notice])

  return (
    <form action={submit} className="space-y-4 p-4">
      {picked && <input type="hidden" name="profileId" value={picked.profileId} />}

      <div>
        <label htmlFor="account" className="text-ink-700 block text-xs font-semibold">
          Account
        </label>

        {picked ? (
          <div className="border-ink-200 bg-ink-50 mt-1.5 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="text-ink-900 block truncate font-medium">
                {picked.fullName ?? picked.email ?? picked.phone}
              </span>
              <span className="text-ink-500 block truncate text-xs">
                {picked.email ?? picked.phone}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-ink-600 hover:text-ink-900 shrink-0 text-xs font-medium underline underline-offset-2"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              id="account"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Email, phone or name"
              className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none"
            />
            <p className="text-ink-500 mt-1.5 text-xs">
              The account has to exist already — signing somebody up is not something this screen
              does. Three characters to search.
            </p>

            {matches.length > 0 && (
              <ul className="divide-ink-100 border-ink-200 mt-2 divide-y rounded-md border">
                {matches.map((m) => (
                  <li key={m.profileId}>
                    <button
                      type="button"
                      onClick={() => setPicked(m)}
                      className="hover:bg-ink-50 flex w-full flex-col items-start px-3 py-2 text-left text-sm"
                    >
                      <span className="text-ink-900 font-medium">
                        {m.fullName ?? m.email ?? m.phone}
                      </span>
                      <span className="text-ink-500 text-xs">{m.email ?? m.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!searching && query.trim().length >= 3 && matches.length === 0 && (
              <p className="text-ink-500 mt-2 text-xs">No account matches that.</p>
            )}
          </>
        )}
      </div>

      <div>
        <label htmlFor="role" className="text-ink-700 block text-xs font-semibold">
          Role
        </label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="text-ink-500 mt-1.5 text-xs">{ROLES.find((r) => r.value === role)?.hint}</p>
      </div>

      {/* Only field agents are city-scoped — plan §3 leaves the other three unscoped, and
          grantRole drops anything passed with them rather than pretending it took. */}
      {role === 'field_agent' && (
        <div>
          <label htmlFor="cityIds" className="text-ink-700 block text-xs font-semibold">
            City ids
          </label>
          <input
            id="cityIds"
            name="cityIds"
            placeholder="uuid, uuid — leave empty for every city"
            className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 font-mono text-xs outline-none"
          />
        </div>
      )}

      <div>
        <label htmlFor="reason" className="text-ink-700 block text-xs font-semibold">
          Reason <span className="text-ink-500 font-normal">(goes in the audit log)</span>
        </label>
        <input
          id="reason"
          name="reason"
          maxLength={300}
          placeholder="Joined the moderation team"
          className="border-ink-200 text-ink-900 focus:border-ink-400 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={pending || !picked}
        className="bg-ink-900 hover:bg-ink-800 w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
      >
        {pending ? 'Granting…' : 'Grant role'}
      </button>

      {state.error && <Note tone="error">{state.error}</Note>}
      {state.notice && <Note tone="ok">{state.notice}</Note>}
    </form>
  )
}

/**
 * One revoke button, per role, per person.
 *
 * A form rather than an onClick: it posts to a Server Action, so it works before hydration and
 * cannot end up holding a stale profile id in a closure.
 */
export function RevokeRoleButton({
  profileId,
  role,
  label,
}: {
  profileId: string
  role: string
  label: string
}) {
  const [state, submit, pending] = useActionState<TeamActionState, FormData>(revokeStaffRole, {})

  return (
    <form action={submit} className="inline">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="role" value={role} />
      <button
        type="submit"
        disabled={pending}
        title={state.error ?? `Revoke ${label}`}
        className={`text-xs font-medium underline underline-offset-2 disabled:opacity-50 ${
          state.error ? 'text-danger-700' : 'text-ink-600 hover:text-danger-700'
        }`}
      >
        {pending ? 'Revoking…' : state.error ? 'Refused' : 'Revoke'}
      </button>
    </form>
  )
}

function Note({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
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

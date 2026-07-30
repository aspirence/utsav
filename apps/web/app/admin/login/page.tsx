import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { hasSupabaseEnv } from '@utsava/db'

import { getStaffGate } from '@/lib/admin-auth'
import type { LocalAuthStatus } from '@/lib/admin-local-auth'

import { StaffLoginForm } from './login-form'
import { signOutStaff } from './actions'

export const metadata: Metadata = {
  title: 'Staff log in',
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Staff sign-in.
 *
 * OUTSIDE THE (console) ROUTE GROUP ON PURPOSE. The console's layout gates on being staff and
 * redirects here when you are not — so if this page sat under that layout, the gate would
 * redirect to a page that runs the gate, forever. Route groups do not appear in the URL, so
 * /admin/login is still /admin/login; it simply inherits the bare /admin shell instead of the
 * one with the rail, the top bar and the guard.
 *
 * It also should not have that chrome. A sidebar full of links you cannot open yet is not
 * navigation, it is a list of things to be refused.
 *
 * Dark, unlike the customer login. The console is dark-chromed throughout and the difference
 * is deliberate: it should be impossible to mistake which surface you are typing a staff
 * password into.
 */
export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const gate = await getStaffGate()
  const live = hasSupabaseEnv()

  // Already in. Honour `next` on exactly the terms the action does, so a stale tab lands
  // somewhere sensible rather than bouncing off the dashboard.
  if (gate.state === 'staff') redirect(consoleNext(next))

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-600 font-display text-base text-white">
            U
          </span>
          <span className="font-display text-lg leading-tight tracking-tight text-white">
            Utsava
            <span className="block text-[10px] font-normal uppercase tracking-[0.18em] text-ink-400">
              Staff console
            </span>
          </span>
        </div>

        {gate.state === 'not_staff' ? (
          <NotStaff email={gate.email} phone={gate.phone} />
        ) : (
          <>
            <h1 className="font-display text-2xl text-white">Log in</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">
              Staff accounts use an email and password. The mobile-number login on the main site
              is for customers.
            </p>

            {gate.state === 'locked' ? (
              <Locked reason={gate.reason} />
            ) : (
              <>
                {/* No database, but a local admin is configured. Say which credentials these
                    are, or the operator types their Supabase password into a form that has
                    never heard of Supabase. */}
                {!live && (
                  <p className="mt-5 rounded-md bg-warning-500/15 px-3 py-2.5 text-xs leading-relaxed text-warning-500">
                    No database is attached, so this accepts the local admin credentials from
                    <code className="mx-1 rounded bg-ink-800 px-1 py-0.5">.env.local</code>
                    and every screen inside will be showing fixtures.
                  </p>
                )}

                <div className="mt-6">
                  <StaffLoginForm {...(next ? { next } : {})} />
                </div>
              </>
            )}

            <p className="mt-8 border-t border-ink-800 pt-5 text-xs leading-relaxed text-ink-500">
              Every action you take in the console is written to an append-only audit log with
              your name on it. If you are here to book a photographer,{' '}
              <Link href="/" className="text-ink-300 underline hover:text-white">
                the main site is this way
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </main>
  )
}

/**
 * There is no way in yet, so say how to make one.
 *
 * The console is locked rather than open, which is the whole point of this change — but locked
 * with no explanation is a bug report. The three lines are pasteable, and the secret is
 * deliberately shown as a command to run rather than a value to copy: a secret printed in
 * documentation is a secret everybody shares.
 */
function Locked({ reason }: { reason: LocalAuthStatus }) {
  if (reason === 'weak') {
    return (
      <div className="mt-5 rounded-md bg-warning-500/15 p-4 text-sm leading-relaxed text-warning-500">
        <p className="font-medium">The local admin credentials are too weak to sign with.</p>
        <p className="mt-2">
          <code className="text-white">ADMIN_LOCAL_SECRET</code> needs at least 32 characters and{' '}
          <code className="text-white">ADMIN_LOCAL_PASSWORD</code> at least 8. A short secret means
          a forgeable cookie, which looks exactly like a working login until somebody forges one.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-5 space-y-4 rounded-md bg-ink-800/70 p-4 text-sm leading-relaxed text-ink-300">
      <p className="font-medium text-white">Nothing to log in to yet.</p>
      <p>
        The console is locked because there is no database attached and no local admin
        configured. Two ways to open it:
      </p>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
          For now, without a database
        </p>
        <p className="mt-1.5">
          Put these in <code className="text-white">apps/web/.env.local</code> and restart:
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-ink-950 p-3 text-xs leading-relaxed text-ink-200">
          {`ADMIN_LOCAL_EMAIL=you@utsava.in
ADMIN_LOCAL_PASSWORD=<something long>
ADMIN_LOCAL_SECRET=<32+ random characters>`}
        </pre>
        <p className="mt-2 text-xs text-ink-500">
          Generate the secret rather than inventing it —{' '}
          <code className="text-ink-300">openssl rand -hex 32</code>. Everything inside the
          console will still be fixtures; nothing you do is saved.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
          Properly
        </p>
        <p className="mt-1.5">
          Connect a Supabase project. Real staff accounts, real roles, a real audit trail — and
          this local path disables itself the moment{' '}
          <code className="text-white">NEXT_PUBLIC_SUPABASE_URL</code> is set, so it can never be
          left switched on in production.
        </p>
      </div>
    </div>
  )
}

/**
 * Where to send an already-signed-in staff member. Must agree with safeNext() in ./actions.ts.
 *
 * The `/admin/` test is not the same as `startsWith('/admin')`, and the difference is the point:
 * the looser form also accepts `/adminfoo`, which is a different route tree that happens to
 * share five characters. Same origin, so not an open redirect — but a rule that admits paths
 * nobody meant to admit is one that stops being read carefully.
 *
 * `//evil.example` is a protocol-relative URL browsers treat as another host, which is why the
 * `//` test exists separately from the `/` one.
 */
function consoleNext(next: string | undefined): string {
  if (!next) return '/admin'
  if (!next.startsWith('/') || next.startsWith('//')) return '/admin'
  if (next !== '/admin' && !next.startsWith('/admin/')) return '/admin'
  return next
}

/**
 * Signed in, but this account holds no staff role.
 *
 * A 404 would be defensible for a stranger and wrong for the far likelier case: a colleague
 * whose role has not been granted yet, or a customer who followed a link. Both need to be told
 * what happened. Nothing here reveals anything they do not already know — they are looking at
 * their own session.
 */
function NotStaff({ email, phone }: { email: string | null; phone: string | null }) {
  const who = email ?? phone ?? 'this account'

  return (
    <div>
      <h1 className="font-display text-2xl text-white">Not a staff account</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-400">
        You are signed in as <span className="text-white">{who}</span>, but it holds no staff
        role, so the console has nothing to show you. If you should have access, ask a super
        admin to grant it — it takes effect on your next page load, with no new account needed.
      </p>

      <div className="mt-6 space-y-3">
        {/* Sign out first, then log in as someone else. Without this the form below would
            just re-establish the same session and land back on this screen. */}
        <form action={signOutStaff}>
          <button
            type="submit"
            className="w-full rounded-md bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Sign out and use a staff account
          </button>
        </form>
        <Link
          href="/account"
          className="block rounded-md border border-ink-700 px-4 py-2.5 text-center text-sm font-medium text-ink-200 transition-colors hover:bg-ink-800"
        >
          Go to my account
        </Link>
      </div>
    </div>
  )
}

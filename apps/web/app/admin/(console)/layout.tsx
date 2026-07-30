import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

import { AdminSidebar } from '@/components/admin-sidebar'
import { AdminTopBar } from '@/components/admin-topbar'
import { getStaffGate } from '@/lib/admin-auth'

/**
 * The staff console proper: the gate, then the chrome.
 *
 * Plan §3 specifies "a separate deploy, SSO + IP allowlist, append-only audit log". It shares
 * an origin with the customer site by explicit product decision, so the network isolation the
 * plan assumed is replaced by three layers:
 *
 *   · middleware.ts — IP allowlist on /admin/*, and a 404 rather than a 403 for outsiders
 *   · this gate — email + password, and a staff role, before any screen renders
 *   · public.staff_roles + RLS — the actual authorization boundary, unchanged
 *
 * THE GATE IS NOT THE BOUNDARY, and it matters that this is understood before anyone edits it.
 * Every query the console makes runs on the caller's own session and is filtered by policies
 * that call app.is_staff() independently. Remove this file and a stranger sees empty tables,
 * not data. What the gate adds is that they see a login screen instead — and that a moderator
 * whose role was revoked this morning stops seeing the console rather than seeing an oddly
 * empty one.
 *
 * FOUR OUTCOMES, and the fourth is the one worth arguing about:
 *
 *   demo      → no Supabase attached. Render the console on fixtures. There is no identity to
 *               check and nothing real to protect; a login wall in front of hardcoded sample
 *               rows would only stop the person trying to build the thing.
 *   anonymous → /admin/login, carrying where they were headed.
 *   not_staff → /admin/login, which explains it and offers a sign-out. NOT a 404: the likeliest
 *               person here is a colleague whose role has not been granted yet, and telling them
 *               "this does not exist" sends them to debug a working system. It reveals nothing —
 *               they are being shown facts about their own session.
 *   staff     → the console.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const gate = await getStaffGate()

  if (gate.state === 'anonymous' || gate.state === 'not_staff') {
    // Middleware forwards the path because a Server Component has no way to read it. Without
    // it, someone deep-linked to an enquiry would sign in and land on the dashboard, then have
    // to find their way back.
    const path = (await headers()).get('x-pathname')
    const next = path && path.startsWith('/admin') ? `?next=${encodeURIComponent(path)}` : ''
    redirect(`/admin/login${next}`)
  }

  const identity = gate.state === 'staff' ? gate.identity : null

  return (
    // Denser type than the customer site: a moderator working a queue needs rows per screen,
    // not whitespace. Scoped here so it cannot leak into the public pages.
    <div className="min-h-screen bg-ink-50 text-[0.9375rem]">
      <AdminSidebar role={identity?.role ?? null} />

      {/* `lg:pl-60` rather than a flex row, because the rail is `fixed`: a position-fixed
          sidebar is out of flow, so the content has to be inset by hand. A flex row would
          scroll the rail away with the page, and a nav that scrolls off is one you have to
          scroll back for. */}
      <div className="lg:pl-60">
        <AdminTopBar identity={identity} />

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>

        <footer className="mx-auto max-w-[1500px] px-4 pb-8 sm:px-6">
          <p className="border-t border-ink-200 pt-5 text-xs text-ink-500">
            {identity
              ? 'Every action taken here is written to an append-only audit log with your identity attached.'
              : 'Demo mode — no database is attached, so nothing you do here is written anywhere.'}
          </p>
        </footer>
      </div>
    </div>
  )
}

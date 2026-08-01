import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getStaffGate } from '@/lib/admin-auth'
import { requireUser } from '@/lib/auth'
import { DASHBOARDS, viewerHome } from '@/lib/viewer'

/**
 * "My dashboard" — one URL that resolves to whichever surface belongs to the caller.
 *
 * Plan §3 gives one human one identity and hangs capabilities off memberships, which means
 * there is no single dashboard to link to: the same person can be a customer, a studio owner
 * and a moderator. Everything that wants to say "go to your dashboard" — the header, an email,
 * the sign-in redirect — points here and lets lib/viewer.ts work out where that is. There is one
 * login for all three, and this is the piece that makes that possible.
 *
 * IT REDIRECTS RATHER THAN RENDERS. A router that draws its own page would be a fourth surface
 * to keep in step with the three real ones, and would leave `/dashboard` in the history for
 * the back button to bounce off.
 *
 * THE STAFF CHECK COMES FIRST, AND NOT ONLY FOR PRECEDENCE. With no Supabase attached, a staff
 * session is the local credential cookie from lib/admin-local-auth.ts — there is no auth.users
 * row behind it, so requireUser() would find no session and bounce a signed-in admin back to
 * the login form they just came through. getStaffGate() understands both kinds of session.
 *
 * `dynamic = 'force-dynamic'`: the answer depends on the session and on membership rows that
 * change under the caller. A cached copy of this route would hand one person's landing page to
 * the next.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
}

export default async function DashboardPage(): Promise<never> {
  const gate = await getStaffGate()
  if (gate.state === 'staff') redirect(DASHBOARDS.console)

  // Carries `/dashboard` through as `next`, so signing in comes straight back here and
  // resolves again with a session — rather than dumping a signed-out visitor on /account.
  await requireUser('/dashboard')
  redirect(await viewerHome())
}

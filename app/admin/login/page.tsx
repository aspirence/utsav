import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Staff log in',
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Kept as a redirect, not deleted.
 *
 * The staff form that lived here is gone: there is one login for everyone at /login, and which
 * dashboard you get is decided by /dashboard reading your memberships rather than by which URL
 * you opened. Plan §3 gives one human one auth identity; two forms writing to one auth.users
 * table gave that human two doors.
 *
 * This path stays because it is in bookmarks, in the README's history, and in every staff
 * member's muscle memory. A 404 for somebody trying to start work is a support ticket; a
 * redirect is not.
 *
 * `next` is carried through and re-validated at the other end — see app/(site)/login/page.tsx,
 * which only honours same-origin absolute paths. It is not trusted here either: this passes it
 * along as an opaque string and does not act on it.
 *
 * NOTE THE CHANGE IN EXPOSURE. This path sits under the ADMIN_IP_ALLOWLIST check in
 * middleware.ts, so it is invisible from an unlisted address — but it now forwards to a page
 * that is not. The allowlist still guards /admin/* itself, so a stolen staff password does not
 * open the console from outside; what it no longer does is hide the form.
 */
export default async function StaffLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}): Promise<never> {
  const { next } = await searchParams
  redirect(`/login?next=${encodeURIComponent(next ?? '/admin')}`)
}

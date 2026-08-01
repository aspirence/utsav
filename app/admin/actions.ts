'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { LOCAL_COOKIE_NAME } from '@/lib/admin-local-auth'
import { hasSupabaseEnv } from '@/lib/db'
import { getServerClient } from '@/lib/supabase'

/**
 * The console's sign-out.
 *
 * THIS FILE USED TO ALSO HOLD signInStaff, AND THAT IS THE POINT OF THE CHANGE. There were two
 * login forms writing to one auth.users table — /admin/login and /login — which gave the same
 * person two doors, two sign-out buttons and two places for a session to go stale. Plan §3 gives
 * one human one auth identity, so there is now one form: app/(site)/login. Where you land is
 * decided by /dashboard reading your memberships, not by which URL you opened.
 *
 * Sign-out stays its own action rather than reusing the site's, for one reason: it sends staff
 * back to /login instead of to the homepage. Somebody signing out of a console is between two
 * pieces of work, not leaving.
 */
export async function signOutStaff(): Promise<void> {
  // Clear both, unconditionally. Which one is live depends on the environment, and a sign-out
  // that only clears the session it expects to find is a sign-out that sometimes does nothing.
  const jar = await cookies()
  jar.delete(LOCAL_COOKIE_NAME)

  if (hasSupabaseEnv()) {
    const supabase = await getServerClient()
    // scope 'local' clears this browser only. 'global' would sign the same person out of the
    // customer site on their phone, which is a different context and not this button's business.
    await supabase.auth.signOut({ scope: 'local' })
  }

  redirect('/login')
}

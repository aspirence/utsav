import { getProfile, getSessionUser } from '@/lib/auth'

import { ProfileForm } from './profile-form'

/**
 * Profile.
 *
 * The row is read through the caller's own session, so RLS decides what comes back. There
 * is no `where id = me` in application code doing the security work - migration 000300
 * restricts profiles to the owner, and this page would return nothing rather than someone
 * else's row if that policy were ever wrong.
 *
 * Falls back to the session's own phone when the profile row has not caught up. The
 * on_auth_user_created trigger fills it, but reading through it rather than assuming means
 * the page renders either way instead of showing a dash on a first sign-in.
 */
export default async function ProfilePage() {
  const [profile, user] = await Promise.all([getProfile(), getSessionUser()])

  return (
    <div>
      <h2 className="font-display text-xl text-ink-900">Your details</h2>
      <p className="mt-2 max-w-prose text-ink-600">
        Only what a vendor needs to reply to you properly.
      </p>

      <div className="mt-8">
        <ProfileForm
          fullName={profile?.fullName ?? null}
          email={profile?.email ?? user?.email ?? null}
          phone={profile?.phone ?? user?.phone ?? null}
        />
      </div>
    </div>
  )
}

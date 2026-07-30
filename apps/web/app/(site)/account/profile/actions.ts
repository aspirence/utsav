'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionUser } from '@/lib/auth'
import { getServerClientOrNull } from '@/lib/supabase'

/**
 * Profile edits. One zod-validated actions.ts for the feature, per CLAUDE.md.
 *
 * Note what is NOT here: the phone. It is the account identity and is set by verifying an
 * OTP, so changing it is a re-verification flow rather than a text field - and profiles.phone
 * is `unique`, so a plain update would fail on collision with a message about a constraint.
 *
 * The `.eq('id', user.id)` is a courtesy, not the guard. RLS restricts profiles to the
 * caller's own row (migration 000300), so dropping it would change nothing about what this
 * can touch - which is the point of plan §6 putting authorization in the database.
 */
const schema = z.object({
  fullName: z
    .string()
    .trim()
    .max(120, 'That is longer than a name needs to be.')
    .optional()
    .transform((v) => (v ? v : null)),
  email: z
    .string()
    .trim()
    .email('That does not look like an email address.')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
})

export interface ProfileState {
  error?: string
  saved?: boolean
}

export async function saveProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const parsed = schema.safeParse({
    fullName: form.get('fullName'),
    email: form.get('email'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check those details.' }
  }

  const user = await getSessionUser()
  if (!user) return { error: 'Your session expired. Sign in again.' }

  const supabase = await getServerClientOrNull()
  if (!supabase) return { error: 'Not connected to a database yet.' }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName, email: parsed.data.email })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/account')
  revalidatePath('/account/profile')
  return { saved: true }
}

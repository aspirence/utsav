'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  LastSuperAdmin,
  NotSuperAdmin,
  findAccounts,
  grantRole,
  revokeRole,
  type AccountMatch,
} from '@/lib/admin-users'

import type { StaffRoleKind } from '@/lib/db'

/**
 * The four things /admin/users can do, each behind its own zod schema.
 *
 * NONE OF THESE CHECK WHO IS CALLING. That is not an oversight and it is not left to the page
 * either: every one of them lands in lib/admin-users.ts, where `requireSuper()` runs before the
 * service-role key is touched. Putting the check here as well would give two places to keep in
 * step and would make it possible to add a fifth action that has one but not the other.
 *
 * Errors come back as state rather than thrown, because these drive `useActionState` forms and a
 * thrown error there is an error boundary swallowing the reason. NotSuperAdmin and LastSuperAdmin
 * carry sentences worth showing; anything else is reported generically, since an unexpected
 * Postgres message on a privilege screen is more likely to be a leak than a help.
 */

const ROLES = ['super', 'moderator', 'finance', 'field_agent'] as const

export interface TeamActionState {
  error?: string
  notice?: string
}

const grantSchema = z.object({
  profileId: z.string().uuid('Pick an account from the search results.'),
  role: z.enum(ROLES),
  // Comma-separated city ids from the form. Only meaningful for field_agent; see grantRole.
  cityIds: z.string().optional(),
  reason: z.string().trim().max(300).optional(),
})

const revokeSchema = z.object({
  profileId: z.string().uuid(),
  role: z.enum(ROLES),
  reason: z.string().trim().max(300).optional(),
})

export async function grantStaffRole(
  _prev: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const parsed = grantSchema.safeParse({
    profileId: text(form.get('profileId')),
    role: text(form.get('role')),
    cityIds: text(form.get('cityIds')),
    reason: text(form.get('reason')),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check those details.' }
  }

  try {
    await grantRole({
      profileId: parsed.data.profileId,
      role: parsed.data.role as StaffRoleKind,
      cityIds: splitIds(parsed.data.cityIds),
      reason: parsed.data.reason ?? null,
    })
  } catch (error) {
    return { error: message(error) }
  }

  revalidatePath('/admin/users')
  return { notice: `${label(parsed.data.role)} granted.` }
}

export async function revokeStaffRole(
  _prev: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const parsed = revokeSchema.safeParse({
    profileId: text(form.get('profileId')),
    role: text(form.get('role')),
    reason: text(form.get('reason')),
  })
  if (!parsed.success) return { error: 'Could not work out which role to revoke.' }

  try {
    await revokeRole({
      profileId: parsed.data.profileId,
      role: parsed.data.role as StaffRoleKind,
      reason: parsed.data.reason ?? null,
    })
  } catch (error) {
    return { error: message(error) }
  }

  revalidatePath('/admin/users')
  return { notice: `${label(parsed.data.role)} revoked.` }
}

/** Account lookup for the grant form. Read-only, and RLS-scoped like every other console read. */
export async function searchAccounts(query: string): Promise<AccountMatch[]> {
  return findAccounts(query)
}

// ---------------------------------------------------------------------------

function message(error: unknown): string {
  if (error instanceof NotSuperAdmin || error instanceof LastSuperAdmin) return error.message
  return 'That did not go through. Try again, and check the audit log if it half-worked.'
}

function label(role: string): string {
  return (
    {
      super: 'Super admin',
      moderator: 'Moderator',
      finance: 'Finance',
      field_agent: 'Field agent',
    }[role] ?? role
  )
}

function splitIds(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function text(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

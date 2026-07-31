'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionUser } from '@/lib/auth'
import { getServerClientOrNull } from '@/lib/supabase'

/**
 * Events — the container an enquiry, a shortlist and a checklist all hang off.
 *
 * MONEY IS INTEGER PAISE (plan §5). The form collects rupees because that is what a person
 * types; nothing downstream ever sees rupees. `rupeesToPaise` is the only place the two
 * meet, and it rounds rather than truncating - `Math.trunc(1.5 * 100)` on a float that came
 * out as 149.99999 quietly loses a paisa, and money that quietly loses anything is a bug
 * that surfaces in a reconciliation six months later.
 *
 * `owner_id` comes from the verified session, never from the form. `events_all_own` gates
 * both USING and WITH CHECK on `owner_id = auth.uid()`, so a forged value fails the policy
 * rather than writing into another account - but sending it from the client at all is the
 * shape of mistake worth not having in the file.
 */

const EVENT_TYPES = [
  'wedding',
  'engagement',
  'reception',
  'sangeet',
  'mehendi',
  'birthday',
  'anniversary',
  'baby_shower',
  'housewarming',
  'corporate',
  'conference',
  'festival',
  'other',
] as const

function text(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Rupees in, paise out. Never a float past this line. */
function rupeesToPaise(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.round(n * 100)
}

const schema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().max(120, 'That is longer than a name needs to be.').optional(),
    eventType: z.enum(EVENT_TYPES, { message: 'Pick what kind of event it is.' }),
    eventDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.')
      .optional(),
    dateFlexible: z.boolean(),
    guestCount: z.coerce
      .number()
      .int()
      .positive('A guest count has to be more than nobody.')
      .max(100_000)
      .optional(),
    cityId: z.string().uuid().optional(),
    budgetMin: z.number().int().nonnegative().optional(),
    budgetMax: z.number().int().nonnegative().optional(),
    notes: z.string().max(2000).optional(),
  })
  // Mirrors the `events_budget_ordered` check constraint. Catching it here means the user
  // reads a sentence instead of a Postgres constraint name.
  .refine((d) => d.budgetMin == null || d.budgetMax == null || d.budgetMin <= d.budgetMax, {
    message: 'The lower budget has to be the smaller number.',
  })

export interface EventState {
  error?: string
  saved?: boolean
}

export async function saveEvent(_prev: EventState, form: FormData): Promise<EventState> {
  const parsed = schema.safeParse({
    id: text(form.get('id')),
    name: text(form.get('name')),
    eventType: text(form.get('eventType')),
    eventDate: text(form.get('eventDate')),
    dateFlexible: form.get('dateFlexible') === 'on',
    guestCount: text(form.get('guestCount')),
    cityId: text(form.get('cityId')),
    budgetMin: rupeesToPaise(text(form.get('budgetMin'))),
    budgetMax: rupeesToPaise(text(form.get('budgetMax'))),
    notes: text(form.get('notes')),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check those details.' }
  }

  const user = await getSessionUser()
  if (!user) return { error: 'Your session expired. Sign in again.' }

  const supabase = await getServerClientOrNull()
  if (!supabase) return { error: 'Not connected to a database yet.' }

  const d = parsed.data
  const row = {
    name: d.name ?? null,
    event_type: d.eventType,
    event_date: d.eventDate ?? null,
    date_flexible: d.dateFlexible,
    guest_count: d.guestCount ?? null,
    city_id: d.cityId ?? null,
    budget_min: d.budgetMin ?? null,
    budget_max: d.budgetMax ?? null,
    notes: d.notes ?? null,
  }

  const { error } = d.id
    ? await supabase.from('events').update(row).eq('id', d.id)
    : await supabase.from('events').insert({ ...row, owner_id: user.id })

  if (error) return { error: error.message }

  revalidatePath('/account/events')
  revalidatePath('/account')
  return { saved: true }
}

/**
 * Archive, not delete.
 *
 * `events` is referenced by enquiries (`on delete set null`), shortlists and checklists
 * (`on delete cascade`) - so a real delete silently takes a checklist and a set of saved
 * vendors with it, and orphans the enquiries. Archiving keeps the history that the enquiry
 * rows point at.
 */
export async function archiveEvent(_prev: EventState, form: FormData): Promise<EventState> {
  const id = text(form.get('id'))
  if (!id) return { error: 'Unknown event.' }

  const supabase = await getServerClientOrNull()
  if (!supabase) return { error: 'Not connected to a database yet.' }

  const { error } = await supabase.from('events').update({ is_archived: true }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/account/events')
  revalidatePath('/account')
  return { saved: true }
}

export { EVENT_TYPES }

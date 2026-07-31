'use server'

import { revalidatePath } from 'next/cache'

import { z } from 'zod'

import { eventTypeSchema, paiseSchema, slugSchema, type UtsavaClient } from '@/lib/db'

import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/supabase'

/**
 * The customer's event — plan §5: "the demand spine is the product: events → enquiries →
 * leads → quotes → bookings". An event is the container everything else hangs off: a
 * couple's wedding groups the photographer enquiry, the caterer enquiry, the shortlists
 * and, later, the bookings.
 *
 * Authorization is `events_all_own` (migration 001300): USING and WITH CHECK are both
 * `owner_id = auth.uid()`, so an event can only ever be created for, read by and edited
 * by its owner. No filtering happens in this file — an update that matches nothing simply
 * returns no row, which is what produces the "we could not find that event" message.
 */

export type EventState =
  | { status: 'idle' }
  | { status: 'created'; eventId: string; message: string }
  | { status: 'updated'; eventId: string; message: string }
  | { status: 'signin_required'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }

/**
 * Mirrors the CHECK constraints on `public.events`. The database is the authority; this
 * exists so a customer sees the problem before the round trip.
 */
const eventDraftSchema = z
  .object({
    name: z.string().trim().min(2, 'Give this event a name').max(160).optional(),
    eventType: eventTypeSchema,
    eventDate: z.string().date().optional(),
    dateFlexible: z.boolean().default(false),
    guestCount: z.number().int().positive().max(100_000).optional(),
    citySlug: slugSchema.optional(),
    localitySlug: slugSchema.optional(),
    // Plan §5: integer paise on the wire and in the column. The form collects rupees and
    // rupeesToPaise() below is the only place the two units meet.
    budgetMin: paiseSchema.optional(),
    budgetMax: paiseSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.budgetMin == null || v.budgetMax == null || v.budgetMin <= v.budgetMax, {
    message: 'Minimum budget cannot exceed the maximum',
    path: ['budgetMin'],
  })
  .refine((v) => v.dateFlexible || Boolean(v.eventDate), {
    message: 'Pick a date, or tell us your dates are still open',
    path: ['eventDate'],
  })

const eventIdSchema = z.string().uuid('That event reference does not look right')

/**
 * `public.events` is absent from packages/db's `database.types.ts` — that file is
 * hand-authored and covers only the read surface apps/web renders today. Narrowing the
 * client here keeps these writes typed without editing something `pnpm db:types` will
 * regenerate wholesale, the same trick as apps/web/app/enquire/otp-actions.ts.
 */
interface EventWrites {
  from: (table: 'events') => {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: { id: string } | null
          error: { message: string; code?: string } | null
        }>
      }
    }
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          maybeSingle: () => Promise<{
            data: { id: string } | null
            error: { message: string; code?: string } | null
          }>
        }
      }
    }
  }
}

export async function createEvent(_prev: EventState, formData: FormData): Promise<EventState> {
  const parsed = eventDraftSchema.safeParse(readDraft(formData))
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'Your event details validated correctly, but no Supabase instance is connected ' +
        'yet. Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to save it for real.',
    }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) {
    return {
      status: 'signin_required',
      message: 'Sign in to start planning an event — we keep your shortlists and enquiries on it.',
    }
  }

  const place = await resolvePlace(supabase, parsed.data.citySlug, parsed.data.localitySlug)
  if (place.error) return { status: 'error', message: place.error }

  const { data, error } = await (supabase as unknown as EventWrites)
    .from('events')
    .insert({
      owner_id: user.id,
      ...columnsFor(parsed.data, place),
    })
    .select('id')
    .single()

  if (error || !data) {
    return { status: 'error', message: 'Could not save this event just now. Please try again.' }
  }

  revalidatePath('/events')

  return {
    status: 'created',
    eventId: data.id,
    message: 'Event saved. Every enquiry and shortlist you make from here files under it.',
  }
}

/**
 * Edit semantics are whole-form, not patch: what the form posts is the event. An optional
 * field left blank is cleared, which is what an edit screen implies and what lets someone
 * remove a guest count they are no longer sure about.
 */
export async function updateEvent(_prev: EventState, formData: FormData): Promise<EventState> {
  const id = eventIdSchema.safeParse(String(formData.get('eventId') ?? ''))
  if (!id.success) {
    return { status: 'error', message: 'We could not tell which event this was.' }
  }

  const parsed = eventDraftSchema.safeParse(readDraft(formData))
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'Your changes validated correctly, but no Supabase instance is connected yet. ' +
        'Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to save them for real.',
    }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) {
    return { status: 'signin_required', message: 'Sign in to change this event.' }
  }

  const place = await resolvePlace(supabase, parsed.data.citySlug, parsed.data.localitySlug)
  if (place.error) return { status: 'error', message: place.error }

  const { data, error } = await (supabase as unknown as EventWrites)
    .from('events')
    .update({
      ...columnsFor(parsed.data, place),
      is_archived: formData.get('isArchived') === 'on',
    })
    .eq('id', id.data)
    .select('id')
    .maybeSingle()

  if (error) {
    return { status: 'error', message: 'Could not save your changes just now. Please try again.' }
  }

  // No row came back: `events_all_own` scopes the update to the caller's own events, so
  // this is either a deleted event or somebody else's. One message covers both, and
  // deliberately does not confirm that the id exists.
  if (!data) {
    return { status: 'error', message: 'We could not find that event on your account.' }
  }

  revalidatePath('/events')
  revalidatePath(`/events/${id.data}`)

  return { status: 'updated', eventId: data.id, message: 'Your event details are up to date.' }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EventDraft = z.infer<typeof eventDraftSchema>
interface ResolvedPlace {
  cityId: string | null
  localityId: string | null
  error?: string
}

function columnsFor(draft: EventDraft, place: ResolvedPlace): Record<string, unknown> {
  return {
    name: draft.name ?? null,
    event_type: draft.eventType,
    event_date: draft.eventDate ?? null,
    date_flexible: draft.dateFlexible,
    guest_count: draft.guestCount ?? null,
    city_id: place.cityId,
    locality_id: place.localityId,
    budget_min: draft.budgetMin ?? null,
    budget_max: draft.budgetMax ?? null,
    notes: draft.notes ?? null,
  }
}

/** Slugs are what the form has; the table stores ids. */
async function resolvePlace(
  supabase: UtsavaClient,
  citySlug?: string,
  localitySlug?: string,
): Promise<ResolvedPlace> {
  if (!citySlug) return { cityId: null, localityId: null }

  const { data: city } = await supabase
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .maybeSingle()

  if (!city) return { cityId: null, localityId: null, error: 'That city is not on Utsava yet.' }
  if (!localitySlug) return { cityId: city.id, localityId: null }

  const { data: locality } = await supabase
    .from('localities')
    .select('id')
    .eq('slug', localitySlug)
    .eq('city_id', city.id)
    .maybeSingle()

  // An unknown locality is not worth blocking the save over — the city is what routing
  // and discovery actually need.
  return { cityId: city.id, localityId: locality?.id ?? null }
}

function readDraft(formData: FormData): Record<string, unknown> {
  return {
    name: str(formData.get('name')),
    eventType: String(formData.get('eventType') ?? 'wedding'),
    eventDate: str(formData.get('eventDate')),
    dateFlexible: formData.get('dateFlexible') === 'on',
    guestCount: num(formData.get('guestCount')),
    citySlug: str(formData.get('citySlug')),
    localitySlug: str(formData.get('localitySlug')),
    budgetMin: rupeesToPaise(formData.get('budgetMin')),
    budgetMax: rupeesToPaise(formData.get('budgetMax')),
    notes: str(formData.get('notes')),
  }
}

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value == null ? '' : String(value).trim()
  return s === '' ? undefined : s
}

function num(value: FormDataEntryValue | null): number | undefined {
  const s = str(value)
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/** The form collects rupees; the database stores paise (plan §5). */
function rupeesToPaise(value: FormDataEntryValue | null): number | undefined {
  const n = num(value)
  return n == null ? undefined : Math.round(n * 100)
}

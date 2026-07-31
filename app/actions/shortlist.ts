'use server'

import { revalidatePath } from 'next/cache'

import { z } from 'zod'

import type { UtsavaClient } from '@/lib/db'

import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/supabase'

/**
 * Shortlisting. Plan §10 names `shortlist_added` as a discover-stage funnel event, so
 * this is a measured step in the journey rather than a bookmark widget.
 *
 * A genuine toggle: the server reads what is stored and flips it, then reports the new
 * truth back. That matters because the same account can shortlist from a laptop and a
 * phone — a "set to true/false" call would let the second device overwrite the first,
 * whereas a toggle plus a reconciliation on the button converges.
 *
 * The action is deliberately tolerant of a signed-out visitor. Discovery happens long
 * before anyone creates an account — plan §2 puts the account behind the enquiry, not in
 * front of the catalogue — so an unauthenticated toggle returns `local` and the button
 * keeps the choice in localStorage until there is a session to attach it to.
 *
 * Writes go through the caller's RLS-scoped client (plan §6): `shortlists_all_own` scopes
 * both USING and WITH CHECK to `profile_id = auth.uid()`, so a forged vendor reference
 * still cannot put a row on somebody else's shortlist.
 */

export type ShortlistState =
  | { status: 'saved'; shortlisted: true; message?: string }
  | { status: 'removed'; shortlisted: false; message?: string }
  /** No session yet — the button keeps the choice on the device. */
  | { status: 'local'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const shortlistInputSchema = z.object({
  /** Either a vendor UUID or the profile slug a card has to hand. */
  vendor: z.string().trim().min(1, 'Missing listing').max(200),
  /**
   * Plan §5: a shortlist row may be filed under one of the customer's events, so a
   * couple planning a wedding and a housewarming keeps the two lists apart. Absent
   * means the account-wide shortlist.
   */
  eventId: z.string().uuid().optional(),
})

export async function toggleShortlist(vendor: string, eventId?: string): Promise<ShortlistState> {
  const parsed = shortlistInputSchema.safeParse({ vendor, eventId })
  if (!parsed.success) {
    return { status: 'error', message: 'That listing reference does not look right.' }
  }

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message: 'Saved on this device — no Supabase instance is connected yet.',
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
      status: 'local',
      message: 'Saved on this device. Sign in to keep your shortlist across devices.',
    }
  }

  const vendorId = await resolveVendorId(supabase, parsed.data.vendor)
  if (!vendorId) {
    return { status: 'error', message: 'That listing is no longer available.' }
  }

  const eventFilter = parsed.data.eventId ?? null

  // `unique (profile_id, event_id, vendor_id)` does not dedupe when event_id is NULL —
  // in Postgres two NULLs are not equal, so the index never fires for account-wide
  // rows. Reading first is what actually keeps them unique, hence `.is()` rather than
  // `.eq()` for the null case.
  const existing = supabase
    .from('shortlists')
    .select('id')
    .eq('profile_id', user.id)
    .eq('vendor_id', vendorId)

  const { data: rows, error: readError } = await (eventFilter
    ? existing.eq('event_id', eventFilter)
    : existing.is('event_id', null))

  if (readError) {
    return { status: 'error', message: 'Could not open your shortlist just now.' }
  }

  if (rows && rows.length > 0) {
    // Delete every match, not just the first: if a race did slip a duplicate past the
    // read above, un-shortlisting still leaves a clean state.
    const remove = supabase
      .from('shortlists')
      .delete()
      .eq('profile_id', user.id)
      .eq('vendor_id', vendorId)

    const { error } = await (eventFilter
      ? remove.eq('event_id', eventFilter)
      : remove.is('event_id', null))

    if (error) {
      return { status: 'error', message: 'Could not remove that just now. Please try again.' }
    }

    revalidateShortlist(parsed.data.eventId)
    return { status: 'removed', shortlisted: false }
  }

  const { error } = await supabase.from('shortlists').insert({
    profile_id: user.id,
    vendor_id: vendorId,
    event_id: eventFilter,
  })

  // 23505 means an event-scoped duplicate got in first. Two taps, one row — not a failure.
  if (error && error.code !== '23505') {
    return { status: 'error', message: 'Could not save that just now. Please try again.' }
  }

  revalidateShortlist(parsed.data.eventId)
  return { status: 'saved', shortlisted: true }
}

/**
 * The vendor profile page is deliberately NOT revalidated. Shortlist state is per-user
 * and read on the client, so busting a heavily-crawled static profile on every tap would
 * cost plan §12's "static-first pages" for nothing.
 *
 * These were `/shortlist` and `/events/:id` - paths that were never built. The account area
 * lives under /account, so a tap was busting two routes that do not exist and leaving the
 * one that does stale.
 */
function revalidateShortlist(eventId?: string): void {
  revalidatePath('/account/shortlists')
  revalidatePath('/account')
  if (eventId) revalidatePath(`/account/events/${eventId}`)
}

/**
 * Accepts a UUID or a slug. A UUID is used as-is: `vendors_select_live` hides anything
 * not live, so resolving a slug for a paused listing would fail and strand a shortlist
 * row the customer can see but not remove.
 */
async function resolveVendorId(supabase: UtsavaClient, vendor: string): Promise<string | null> {
  if (UUID.test(vendor)) return vendor

  const { data, error } = await supabase
    .from('vendors')
    .select('id')
    .eq('slug', vendor)
    .maybeSingle()

  if (error || !data) return null
  return data.id
}

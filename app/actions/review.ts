'use server'

import { revalidatePath } from 'next/cache'

import { reviewSchema } from '@/lib/db'

import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/supabase'

/**
 * Review submission. Plan §2 Must-tier: "booking-gated reviews".
 *
 * The gate is not in this file and must not be. `reviews_insert_completed_booking`
 * (migration 001300) already requires, in one place, that the row's author is the caller,
 * that the booking is the caller's own, that its vendor matches the review's vendor, and
 * that it has reached `completed` or `released`. Re-checking that here would give us two
 * definitions of "may review" that can drift apart; plan §6 is explicit that RLS is the
 * authorization model. What this action owes the customer is a sentence they can act on
 * when the policy says no — not a second gate.
 *
 * The booking read below is not that second gate. `vendor_id` is NOT NULL on `reviews`
 * and the policy compares it against the booking, so the action has to fetch it anyway;
 * `bookings_select_customer` means the read is itself RLS-scoped to the caller. Since the
 * status arrives in the same row, it is used to turn what would otherwise be an opaque
 * 42501 into "you can review this once the booking is marked complete".
 *
 * Moderation: every review is inserted with `moderation = 'pending'` and
 * `published_at = null` — the policy refuses any other combination. Nothing on this path
 * can publish a review. It becomes visible only when a moderator moves it to `approved`
 * and stamps `published_at` through `reviews_all_moderator`, which is why plan §13 gates
 * launch on "moderation staffed with SLA". `app.guard_review_columns()` additionally
 * sends an edited review back through moderation, so this is not a one-time check.
 */

export interface ReviewDraftInput {
  bookingId: string
  rating: number
  ratingQuality?: number
  ratingValue?: number
  ratingPunctuality?: number
  ratingProfessionalism?: number
  title?: string
  body: string
}

export type ReviewState =
  | { status: 'idle' }
  | { status: 'submitted'; message: string }
  | { status: 'signin_required'; message: string }
  | { status: 'not_eligible'; message: string }
  | { status: 'duplicate'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }

/**
 * `public.bookings` is absent from packages/db's `database.types.ts` — that file is
 * hand-authored and covers only the read surface apps/web renders today. Narrowing the
 * client here keeps the call typed without editing something `pnpm db:types` will
 * regenerate wholesale, the same trick as apps/web/app/enquire/otp-actions.ts.
 */
interface BookingLookup {
  from: (table: 'bookings') => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { id: string; vendor_id: string; status: string } | null
          error: { message: string } | null
        }>
      }
    }
  }
}

/** Plan §5: bookings exist as records before escrow ships, so a completed booking may
 *  legitimately carry zero rupees. Both terminal-happy states earn a review. */
const REVIEWABLE_STATUSES = ['completed', 'released']

export async function submitReview(draft: ReviewDraftInput): Promise<ReviewState> {
  const parsed = reviewSchema.safeParse(draft)
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
        'Your review validated correctly, but no Supabase instance is connected yet. ' +
        'Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to publish it for real.',
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
      message: 'Sign in with the number you booked on, and your review will be attached to it.',
    }
  }

  const review = parsed.data

  const { data: booking } = await (supabase as unknown as BookingLookup)
    .from('bookings')
    .select('id, vendor_id, status')
    .eq('id', review.bookingId)
    .maybeSingle()

  if (!booking) {
    return {
      status: 'not_eligible',
      message:
        'We could not find that booking on your account. Reviews on Fremmo come from ' +
        'real bookings only, which is what makes them worth reading.',
    }
  }

  if (!REVIEWABLE_STATUSES.includes(booking.status)) {
    return {
      status: 'not_eligible',
      message:
        'This booking is not complete yet. You can leave a review as soon as the event ' +
        'is done and the booking is marked complete.',
    }
  }

  const { error } = await supabase.from('reviews').insert({
    booking_id: review.bookingId,
    vendor_id: booking.vendor_id,
    author_id: user.id,
    rating: review.rating,
    rating_quality: review.ratingQuality ?? null,
    rating_value: review.ratingValue ?? null,
    rating_punctuality: review.ratingPunctuality ?? null,
    rating_professionalism: review.ratingProfessionalism ?? null,
    title: review.title ?? null,
    body: review.body,
    // Both are required by reviews_insert_completed_booking. Stated rather than left to
    // the column default so the intent is visible at the call site.
    moderation: 'pending',
    published_at: null,
  })

  if (error) {
    // 23505 on the UNIQUE booking_id — plan §5's "one review per completed booking".
    if (error.code === '23505') {
      return {
        status: 'duplicate',
        message:
          'You have already reviewed this booking. Reviews can be edited, but each ' +
          'booking gets exactly one.',
      }
    }

    // 42501 is the policy declining. By the time we reach here the booking read has
    // ruled out the two ordinary causes, so something genuinely unexpected happened —
    // say so plainly rather than guessing.
    if (error.code === '42501') {
      return {
        status: 'not_eligible',
        message:
          'Fremmo could not accept this review against that booking. Please contact ' +
          'support and quote your booking reference.',
      }
    }

    return { status: 'error', message: 'Could not save your review just now. Please try again.' }
  }

  // The vendor profile is deliberately not revalidated: a pending review is invisible
  // there until a moderator publishes it, so there is nothing new to render yet.
  revalidatePath('/account/reviews')

  return {
    status: 'submitted',
    message:
      'Thank you — your review is with our moderators and usually appears within a day. ' +
      'We read every one before publishing.',
  }
}

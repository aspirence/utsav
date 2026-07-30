'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

import {
  createAdminClient,
  createUtsavaServerClient,
  hasSupabaseEnv,
  indianPhoneInputSchema,
  slugSchema,
} from '@utsava/db'

import { BOOKING, balancePaise, getInvitationTemplate } from '@/lib/invitation-templates'

/**
 * Place an invitation order.
 *
 * WHY THIS RUNS ON THE SERVICE-ROLE KEY, when almost nothing else in this codebase does.
 *
 * The person filling this form has no account. There is no login step before it and there should
 * not be — asking someone to create an account before they can pay you ₹99 loses the order. So
 * there is no auth.uid() for a WITH CHECK to test against, and `invitation_orders` has no INSERT
 * policy for anon or authenticated at all.
 *
 * That is the same shape as apps/web/app/(site)/enquire/actions.ts, which writes an enquiry
 * service-side and lets the customer claim it once an OTP has given them a JWT. Plan §6 sanctions
 * exactly this: RLS is the boundary for *client* reads and writes, and the service-role key is
 * for the routing and escrow paths where no client identity exists yet.
 *
 * THE PRICE IS NEVER TAKEN FROM THE FORM. It is read from the template row on the server. The
 * form does not post an amount and this action would ignore one if it did — a client-supplied
 * price on an orders table is a ₹1 wedding website. The amounts written here also have to satisfy
 * `invitation_orders_amounts_reconcile` (booking + balance = template price), so a mistake here is
 * a rejected insert rather than a wrong invoice.
 *
 * NO PAYMENT IS TAKEN. There is no payment provider wired — plan §14 puts escrow in July 2027 —
 * so the row is created `awaiting_payment` with a null `paid_at`, and
 * `invitation_orders_paid_before_progress` will not let it advance past that without a payment
 * stamp. When Razorpay is connected, its webhook sets paid_at/payment_ref and moves the status;
 * nothing in this file should ever set them.
 */

export type BookingState =
  | { status: 'idle' }
  | { status: 'placed'; reference: string; message: string }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

const bookingSchema = z.object({
  templateSlug: slugSchema,
  contactName: z.string().trim().min(2, 'Please enter your name').max(120),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('That email address does not look right')
    .max(254),
  contactPhone: indianPhoneInputSchema,
  notes: z.string().trim().max(1000).optional(),
})

export async function placeInvitationOrder(
  _prev: BookingState,
  form: FormData,
): Promise<BookingState> {
  const parsed = bookingSchema.safeParse({
    templateSlug: text(form.get('templateSlug')),
    contactName: text(form.get('contactName')),
    contactEmail: text(form.get('contactEmail')),
    contactPhone: text(form.get('contactPhone')),
    notes: text(form.get('notes')),
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' }
  }
  const d = parsed.data

  // The template, and therefore the price, from the database — never from the request.
  const template = await getInvitationTemplate(d.templateSlug)
  if (!template || !template.isActive) {
    return { status: 'error', message: 'That design is no longer available. Please pick another.' }
  }

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'No database is attached, so this order was not saved. Everything you typed is still ' +
        'here — connect a Supabase project and submit again.',
    }
  }

  const admin = adminOrNull()
  if (!admin) {
    return {
      status: 'error',
      message:
        'Orders cannot be recorded right now (the server has no service-role key configured). ' +
        'Please contact us directly and we will take the details by hand.',
    }
  }

  const reference = orderReference()
  const bookingAmount = BOOKING.amountPaise
  const balance = balancePaise(template.pricePaise)

  /**
   * A signed-in visitor gets their order attached immediately; a guest's stays unclaimed.
   *
   * Read on the *caller's* session, not the service-role client — asking the admin client who is
   * signed in would always answer "nobody", and every order would be orphaned.
   */
  const customerId = await currentUserId()

  const { error } = await admin.from('invitation_orders').insert({
    reference,
    template_id: template.isDemo ? null : template.id,
    template_slug: template.slug,
    template_name: template.name,
    template_price: template.pricePaise,
    booking_amount: bookingAmount,
    balance_amount: balance,
    status: 'awaiting_payment',
    contact_name: d.contactName,
    contact_email: d.contactEmail,
    contact_phone: d.contactPhone,
    customer_id: customerId,
    notes: d.notes ?? null,
  })

  if (error) return { status: 'error', message: explain(error) }

  revalidatePath('/admin/orders')

  return {
    status: 'placed',
    reference,
    message:
      `Your slot is reserved under ${reference}. We will message you on WhatsApp to collect your ` +
      'names, dates and photographs.',
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * UTS-INV-XXXXXX, matching invitation_orders_reference_format.
 *
 * Random rather than sequential: a sequential reference tells every customer how many orders we
 * have taken, and "UTS-INV-000003" on a launch week is not a number to hand out. Crockford-ish
 * alphabet with I, O, 1 and 0 removed, because this gets read aloud on the phone.
 *
 * Six characters from a 32-symbol alphabet is ~1e9 combinations; the unique index is what
 * actually guarantees no collision, and a duplicate surfaces as a 23505 the caller reports.
 */
function orderReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  let out = ''
  for (const byte of bytes) out += alphabet[byte % alphabet.length]
  return `UTS-INV-${out}`
}

/** The signed-in user, if any. Uses the caller's cookies, not the service-role client. */
async function currentUserId(): Promise<string | null> {
  try {
    const store = await cookies()
    const supabase = createUtsavaServerClient({
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      // A read-only adapter. This action must not rotate anybody's session as a side effect of
      // taking an order.
      setAll: () => {},
    })
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Service-role client, or null when the key is absent.
 *
 * createAdminClient() throws rather than falling back, which is correct — a silent downgrade to
 * the anon key would produce an RLS refusal that looks like a validation error. Catching it here
 * turns "no key configured" into a sentence the customer can act on.
 */
function adminOrNull() {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

function text(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function explain(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    return 'Something clashed while saving that. Please submit once more — it will get a new reference.'
  }
  if (error.message.includes('invitation_orders_amounts_reconcile')) {
    // A bug on our side, not theirs, so say so instead of blaming the form.
    return 'We could not price that order correctly. Nothing was saved — please tell us and we will fix it.'
  }
  if (error.message.includes('invitation_orders_phone_format')) {
    return 'That WhatsApp number does not look like a valid mobile number.'
  }
  if (error.message.includes('invitation_orders_email_shape')) {
    return 'That email address does not look right.'
  }
  return `Could not place the order: ${error.message}`
}

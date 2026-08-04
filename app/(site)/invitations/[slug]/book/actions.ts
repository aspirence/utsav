'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

import type { Json } from '@/lib/db'

import {
  CARD_CONTENT_VERSION,
  cardContentSchema,
  cardSlug,
  type ParsedCardContent,
} from '@/lib/invitation-card'

import {
  createAdminClient,
  createFremmoServerClient,
  hasSupabaseEnv,
  indianPhoneInputSchema,
  slugSchema,
} from '@/lib/db'

import { getInvitationTemplate, orderLegs } from '@/lib/invitation-templates'

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
 * NO PAYMENT IS TAKEN HERE, and none ever should be. The row is created `awaiting_payment` with
 * a null `paid_at`, and `invitation_orders_paid_before_progress` will not let it advance past
 * that without a payment stamp.
 *
 * The stamp comes from one place only: app/api/webhooks/cashfree, on a signature-verified
 * server-to-server POST. Not from here, and not from the page the customer lands on after
 * paying — that is a URL anyone can open, and a payment flow that trusts a redirect hands out
 * free orders to whoever reads the address bar.
 *
 * With CASHFREE_APP_ID unset the aggregator is inert and this stays a manual flow: the order is
 * recorded and staff send a payment link over WhatsApp. Plan §14 puts full escrow in July 2027;
 * this is the one money path that exists before it.
 */

export type BookingState =
  | { status: 'idle' }
  /**
   * `detailsToken` is how the confirmation screen writes the card wording back.
   *
   * Returned once, to the session that just placed the order, and never stored in the browser
   * beyond this state object. Deliberately not the reference: a reference is printed, read out
   * and pasted into chats, so it identifies an order rather than authorising a write to it —
   * see 20260803000300.
   */
  | {
      status: 'placed'
      reference: string
      message: string
      cardSlug?: string
      detailsToken: string
    }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

/**
 * The card's wording, collected at checkout rather than on WhatsApp afterwards.
 *
 * IT USED TO BE COLLECTED BY A PERSON. The confirmation message still said "we will message you
 * on WhatsApp […] to collect your names, dates and photographs", because there was nowhere to put
 * them: invitation_orders held contact details and amounts and nothing about the card. Migration
 * 20260801000200 added `card_content`, and this is what fills it.
 *
 * OPTIONAL AS A WHOLE, REQUIRED AS A UNIT. Somebody who has not settled on wording yet should
 * still be able to reserve the design — that was the entire flow until now. So an empty form
 * places an order with no content, exactly as before, and a filled one places a card that can be
 * published. What is not allowed is half: a card with a groom and no date renders wrong, and
 * `superRefine` below is where that is refused rather than discovered at publish time.
 */
const cardSchema = z.object({
  hosts: z.string().trim().max(64).optional(),
  groomName: z.string().trim().max(24).optional(),
  groomParents: z.string().trim().max(64).optional(),
  brideName: z.string().trim().max(24).optional(),
  brideParents: z.string().trim().max(64).optional(),
  cardDate: z.string().trim().max(48).optional(),
  cardTime: z.string().trim().max(32).optional(),
  venue: z.string().trim().max(120).optional(),
})

/**
 * Two fields to place an order.
 *
 * IT USED TO BE ELEVEN. Four contact fields and then the entire card — hosts, venue, both sets
 * of parents, the couple, the date and the time — all demanded before the order existed. That is
 * the whole content of the product, asked of somebody who has not yet decided to buy it.
 *
 * The card wording now comes after checkout, on the confirmation screen, through
 * saveInvitationCard() below. Same fields, same validation, asked once there is an order to
 * attach them to.
 *
 * NO EMAIL. contact_email is nullable as of 20260803000300 and this form no longer collects it.
 * WhatsApp is the channel this product actually uses: the draft link goes there, the payment
 * link goes there, and contact_phone is still `not null`. Email was a required field rather than
 * a used one.
 */
const bookingSchema = z.object({
  templateSlug: slugSchema,
  contactName: z.string().trim().min(2, 'Please enter your name').max(120),
  contactPhone: indianPhoneInputSchema,
})

/** Everything the artwork needs to render a line. Parents are the only optional part. */
const REQUIRED_CARD_FIELDS = [
  'hosts',
  'groomName',
  'brideName',
  'cardDate',
  'cardTime',
  'venue',
] as const

export async function placeInvitationOrder(
  _prev: BookingState,
  form: FormData,
): Promise<BookingState> {
  const parsed = bookingSchema.safeParse({
    templateSlug: text(form.get('templateSlug')),
    contactName: text(form.get('contactName')),
    contactPhone: text(form.get('contactPhone')),
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

  /*
   * A demo template must never produce an order row.
   *
   * getInvitationTemplates() falls back to a hardcoded set when no database is attached. Those
   * rows have no catalogue row behind them: their price is a TypeScript literal and their id is
   * not a uuid, so an order written against one would carry an invented amount and a null,
   * unjoinable template_id — permanently, because there is no DELETE policy on orders.
   *
   * The fallback is a rendering convenience for an unconfigured environment. It is not a
   * sellable catalogue, and this is the line that says so.
   */
  if (template.isDemo) {
    return {
      status: 'unconfigured',
      message:
        'This design is part of the demo catalogue, so no order was placed. Connect a Supabase ' +
        'project and add real templates in the console before taking orders.',
    }
  }

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'No database is attached, so this order was not saved and the form has been cleared. ' +
        'Connect a Supabase project and submit again.',
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
  // Both legs from one derivation, so they satisfy invitation_orders_amounts_reconcile by
  // construction rather than by two numbers happening to agree.
  const { bookingPaise, balancePaise } = orderLegs(template.pricePaise)

  /**
   * A signed-in visitor gets their order attached immediately; a guest's stays unclaimed.
   *
   * Read on the *caller's* session, not the service-role client — asking the admin client who is
   * signed in would always answer "nobody", and every order would be orphaned.
   */
  const customerId = await currentUserId()

  /*
   * The card, if they filled it in. superRefine has already refused a half-filled one, so this is
   * all-or-nothing by the time it gets here.
   *
   * PUBLISHED IMMEDIATELY, BEFORE THE MONEY LANDS, AND THAT IS DELIBERATE. The order is inserted
   * `awaiting_payment` and nothing is reserved until the booking amount arrives — but the card
   * itself is what the customer just wrote, and holding their own words hostage to a payment
   * teaches them nothing except that the link is broken. Nothing about the published card implies
   * the order is paid; /account/invitations shows the real status beside it.
   */
  /*
   * No card content at insert. The order is created from a name and a number; the wording is
   * written afterwards by saveInvitationCard(), from the confirmation screen.
   *
   * A LONG COMMENT USED TO LIVE HERE arguing that the card should be published immediately,
   * before the money lands, because "holding their own words hostage to a payment teaches them
   * nothing except that the link is broken". That reasoning still holds and still applies — it
   * has simply moved to saveInvitationCard(), which is now the thing that publishes.
   */
  const { data: inserted, error } = await admin
    .from('invitation_orders')
    .insert({
      reference,
      template_id: template.isDemo ? null : template.id,
      template_slug: template.slug,
      template_name: template.name,
      template_price: template.pricePaise,
      booking_amount: bookingPaise,
      balance_amount: balancePaise,
      status: 'awaiting_payment',
      contact_name: d.contactName,
      contact_phone: d.contactPhone,
      customer_id: customerId,
    })
    // details_token is defaulted by the database and never travels from the browser, so it has
    // to be read back here — this is the one moment it is available to anybody.
    .select('details_token')
    .single()

  if (error || !inserted) return { status: 'error', message: explain(error) }

  revalidatePath('/admin/orders')

  /*
   * "Order received", not "slot reserved".
   *
   * The row is inserted `awaiting_payment`, and /admin/orders tells staff in as many words that
   * "nothing is reserved for them until it lands". Telling the customer the opposite on the same
   * fact is the two halves of the product disagreeing, and the customer is the half that would
   * find out late.
   *
   * The message no longer promises to collect the wording over WhatsApp, because the screen this
   * returns to now asks for it directly.
   */
  return {
    status: 'placed',
    reference,
    detailsToken: inserted.details_token,
    message:
      `We have your order under ${reference}. Your design slot is held once the booking amount ` +
      'reaches us — we will message you on WhatsApp with the payment link.',
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * FRM-INV-XXXXXX, matching invitation_orders_reference_format.
 *
 * Random rather than sequential: a sequential reference tells every customer how many orders we
 * have taken, and "FRM-INV-000003" on a launch week is not a number to hand out. Crockford-ish
 * alphabet with I, O, 1 and 0 removed, because this gets read aloud on the phone.
 *
 * Six characters from a 32-symbol alphabet is ~1e9 combinations; the unique index is what
 * actually guarantees no collision, and a duplicate surfaces as a 23505 the caller reports.
 */
/**
 * The form's flat fields, as the card's nested shape.
 *
 * Returns null when nothing was filled in — superRefine has already refused the half-filled case,
 * so the only two states reaching here are "all of it" and "none of it".
 *
 * The fixed lines are not asked for and not editable. "request your gracious presence" and the
 * occasion wording are the artwork's voice; a free-text box there would let somebody put a
 * paragraph where two measured lines belong, and the wipe timing in invitation-3d was tuned to
 * these lengths. cardContentSchema's defaults are what fill them.
 */
function cardContent(card: Record<string, string | undefined>): ParsedCardContent | null {
  if (!card.hosts || !card.groomName || !card.brideName) return null
  if (!card.cardDate || !card.cardTime || !card.venue) return null

  const parsed = cardContentSchema.safeParse({
    hosts: card.hosts,
    occasionLines: ['on the auspicious occasion of', 'the wedding of'],
    groom: { name: card.groomName, ...(card.groomParents ? { parents: card.groomParents } : {}) },
    bride: { name: card.brideName, ...(card.brideParents ? { parents: card.brideParents } : {}) },
    date: card.cardDate,
    time: card.cardTime,
    // The venue arrives as one field and renders as up to three lines. Splitting on the comma is
    // what a person writing "SMC Party Plot, Athwalines, Surat" already means by it.
    venueLines: card.venue
      .split(',')
      .map((part, index, all) => (index === all.length - 1 ? part.trim() : `${part.trim()},`))
      .filter((part) => part.length > 1)
      .slice(0, 3),
  })

  return parsed.success ? parsed.data : null
}

/** Absolute, because this sentence gets copied into WhatsApp. */
function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')
}

function orderReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  let out = ''
  for (const byte of bytes) out += alphabet[byte % alphabet.length]
  return `FRM-INV-${out}`
}

/** The signed-in user, if any. Uses the caller's cookies, not the service-role client. */
async function currentUserId(): Promise<string | null> {
  try {
    const store = await cookies()
    const supabase = createFremmoServerClient({
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

// ---------------------------------------------------------------------------
// Step two: the card wording, after the order exists
// ---------------------------------------------------------------------------

export type CardState =
  | { status: 'idle' }
  | { status: 'saved'; cardSlug: string; message: string }
  | { status: 'error'; message: string }

/**
 * Write the card wording onto an order that has already been placed.
 *
 * WHY THIS IS A SECOND ACTION AND NOT A LONGER FORM. Everything here used to be collected before
 * the order existed — eleven fields between a customer and a booking, of which eight were the
 * contents of the product rather than anything needed to sell it. Now the order is created from
 * a name and a number, and this fills in the rest from the confirmation screen.
 *
 * THE TOKEN IS THE AUTHORISATION, AND IT IS NOT THE REFERENCE. A reference is printed, read out
 * on WhatsApp and quoted to support — it names an order, it does not prove you placed it. The
 * token is minted by the database at insert, returned exactly once to the session that placed
 * the order, and required by app.save_invitation_card(). See 20260803000300 for the whole
 * argument.
 *
 * The token is validated as a uuid here before it reaches Postgres. That is not defence in depth
 * for its own sake: a malformed uuid makes the RPC raise a type error rather than the clean
 * "no editable order" the caller knows how to render.
 *
 * PUBLISHED AS SOON AS IT IS WRITTEN, BEFORE THE MONEY LANDS. That was true when this lived in
 * the booking action and it is still true: the card is what the customer just wrote, and holding
 * their own words hostage to a payment teaches them nothing except that the link is broken.
 * Nothing about a published card implies the order is paid — /account/invitations shows the real
 * status beside it, and the confirmation copy says the slot is held once the amount reaches us.
 */
export async function saveInvitationCard(_prev: CardState, form: FormData): Promise<CardState> {
  const parsed = z
    .object({ token: z.string().uuid('That link is not valid any more.'), card: cardSchema })
    .superRefine((value, ctx) => {
      // Whole card or nothing, exactly as before — a card with a groom and no date renders
      // wrong, and this is where that is refused rather than discovered at publish time.
      const filled = REQUIRED_CARD_FIELDS.filter((key) => value.card[key])
      if (filled.length !== REQUIRED_CARD_FIELDS.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['card'],
          message:
            'Please fill in the hosts, both names, the date, the time and the venue — the card ' +
            'needs all of them to read properly.',
        })
      }
    })
    .safeParse({
      token: text(form.get('detailsToken')),
      card: {
        hosts: text(form.get('hosts')),
        groomName: text(form.get('groomName')),
        groomParents: text(form.get('groomParents')),
        brideName: text(form.get('brideName')),
        brideParents: text(form.get('brideParents')),
        cardDate: text(form.get('cardDate')),
        cardTime: text(form.get('cardTime')),
        venue: text(form.get('venue')),
      },
    })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check those details.' }
  }

  const admin = adminOrNull()
  if (!admin) {
    return {
      status: 'error',
      message:
        'Your order is safe, but the wording could not be saved just now. We will collect it on ' +
        'WhatsApp instead.',
    }
  }

  const card = cardContent(parsed.data.card)
  if (!card) {
    return { status: 'error', message: 'Please fill in the whole card.' }
  }

  const slug = cardSlug(card.groom.name, card.bride.name)

  const { data, error } = await admin.rpc('save_invitation_card', {
    p_token: parsed.data.token,
    p_content: card as unknown as Json,
    p_version: CARD_CONTENT_VERSION,
    p_slug: slug,
  })

  if (error || !data) {
    return {
      status: 'error',
      message:
        'That link is no longer editable. If your invitation has already been delivered, message ' +
        'us on WhatsApp and we will change the wording for you.',
    }
  }

  // The card is public the moment it is written, so the page showing it has to be revalidated or
  // the customer opens their own link and sees the empty state they just filled in.
  revalidatePath(`/invite/${data.public_slug ?? slug}`)
  revalidatePath('/account/invitations')
  revalidatePath('/admin/orders')

  return {
    status: 'saved',
    cardSlug: data.public_slug ?? slug,
    message: 'Your card is live. Open it, and share it when you are happy with it.',
  }
}

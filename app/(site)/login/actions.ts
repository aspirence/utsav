'use server'

import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import {
  LOCAL_COOKIE_NAME,
  checkLocalCredentials,
  isLocalAuthAvailable,
  mintLocalCookie,
} from '@/lib/admin-local-auth'
import { createAdminClient } from '@/lib/db'
import { getServerClient, hasSupabaseEnv } from '@/lib/supabase'

/**
 * Phone OTP sign-in. One zod-validated actions.ts for the feature, per the conventions in
 * CLAUDE.md.
 *
 * WHY PHONE AND NOT EMAIL. Plan §3: "Guest becomes Customer on first OTP-verified
 * enquiry", and profiles.phone is commented "the primary customer identity in India;
 * OTP-verified at enquiry". There is no password anywhere in the plan, and no signup form -
 * a wedding is a once-in-a-lifetime purchase and nobody stops to create an account for it.
 * The OTP that makes a lead real is the same OTP that makes the account.
 *
 * WHY THE PHONE IS NORMALISED HERE. profiles.phone carries
 * `check (phone ~ '^\+[1-9][0-9]{7,14}$')` - E.164, no spaces, no leading zero. A user
 * typing "98765 43210" or "098765 43210" is not making a mistake, so this fixes it up
 * rather than rejecting it. Getting it wrong does not fail at the form; it fails at the
 * database constraint, one screen later, with nothing useful to say.
 */

/** India only for now - plan §14 puts multi-country in the Won't tier for year one. */
const DEFAULT_CC = '91'

function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '')

  if (digits.startsWith('+')) {
    return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null
  }
  // 0XXXXXXXXXX - the domestic trunk prefix, which E.164 does not use.
  const local = digits.replace(/^0+/, '')
  if (local.length === 10) return `+${DEFAULT_CC}${local}`
  // Already carries a country code without the plus.
  if (local.length > 10 && local.length <= 15) return `+${local}`
  return null
}

/**
 * FormData.get() returns `null` for a field that is not in the form, and zod's
 * `.optional()` accepts `undefined` but not `null` - so an absent hidden input failed
 * validation and surfaced zod's own "Expected string, received null" to the user, on a form
 * where the number they typed was fine and never even looked at.
 *
 * Everything from a FormData goes through here, so the schemas only ever see strings or
 * undefined and their messages are the ones people read.
 */
function text(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' ? value : undefined
}

const phoneSchema = z.object({
  phone: z.string().min(1, 'Enter your mobile number.'),
  next: z.string().optional(),
})

const verifySchema = phoneSchema.extend({
  code: z
    .string({ message: 'Enter the code from the message.' })
    .regex(/^\d{4,8}$/, 'The code is the digits from the message, nothing else.'),
})

export interface AuthState {
  step: 'phone' | 'code'
  phone?: string
  error?: string
  notice?: string
}

/** Step one: ask the auth server to text a code. */
export async function requestCode(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = phoneSchema.safeParse({
    phone: text(form.get('phone')),
    next: text(form.get('next')),
  })
  if (!parsed.success) {
    return { step: 'phone', error: parsed.error.issues[0]?.message ?? 'Check that number.' }
  }

  const phone = toE164(parsed.data.phone)
  if (!phone) {
    return {
      step: 'phone',
      error: 'That does not look like a mobile number. Ten digits, or +91 and then ten.',
    }
  }

  if (!hasSupabaseEnv()) {
    // Honest about it rather than pretending a code was sent. The site runs off fixtures
    // until it is pointed at a Supabase instance, and a form that silently does nothing is
    // worse than one that says so.
    return {
      step: 'phone',
      phone,
      error: 'Sign-in is not connected yet. Set NEXT_PUBLIC_SUPABASE_URL to enable it.',
    }
  }

  const supabase = await getServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    // No `shouldCreateUser: false` - the whole point is that the first OTP creates the
    // account. The profiles row follows from the on_auth_user_created trigger.
    options: { channel: 'sms' },
  })

  if (error) {
    return { step: 'phone', phone, error: humanise(error.message) }
  }
  return { step: 'code', phone, notice: `Code sent to ${phone}.` }
}

/** Step two: exchange the code for a session. */
export async function verifyCode(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = verifySchema.safeParse({
    phone: text(form.get('phone')),
    code: text(form.get('code')),
    next: text(form.get('next')),
  })
  if (!parsed.success) {
    return {
      step: 'code',
      phone: text(form.get('phone')) ?? '',
      error: parsed.error.issues[0]?.message ?? 'Check that code.',
    }
  }

  const phone = toE164(parsed.data.phone)
  if (!phone) return { step: 'phone', error: 'Start again with your number.' }

  if (!hasSupabaseEnv()) {
    return { step: 'code', phone, error: 'Sign-in is not connected yet.' }
  }

  const supabase = await getServerClient()
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token: parsed.data.code,
    type: 'sms',
  })

  if (error) {
    return { step: 'code', phone, error: humanise(error.message) }
  }

  // Everything cached under the old (anonymous) session is now wrong.
  revalidatePath('/', 'layout')

  // Only ever a path on this origin. An open redirect here would let a phishing link land
  // someone on an attacker's page carrying a fresh Fremmo session.
  redirect(safeNext(parsed.data.next))
}

export async function signOut() {
  // Clear both, unconditionally. Which one is live depends on the environment, and a sign-out
  // that only clears the session it expects to find is a sign-out that sometimes does nothing —
  // which now matters here, because this page can mint the local admin cookie too.
  const jar = await cookies()
  jar.delete(LOCAL_COOKIE_NAME)

  if (hasSupabaseEnv()) {
    const supabase = await getServerClient()
    await supabase.auth.signOut()
  }
  revalidatePath('/', 'layout')
  redirect('/')
}

// ---------------------------------------------------------------------------
// Email and password.
//
// WHY THIS EXISTS ALONGSIDE THE OTP ABOVE. Plan §3 makes the phone the primary customer
// identity and the note at the top of this file explains why there is no password. That is
// still the intended path. This is the second one, added deliberately: the Supabase project
// has the phone provider disabled (`/auth/v1/settings` reports `"phone": false`), so the OTP
// form cannot mint a session at all, and an account nobody can get into is worse than an
// identity model that is only mostly phone-shaped.
//
// profiles.phone is nullable and only indexed `where deleted_at is null`, so an email-only
// account writes a profiles row with a null phone and breaks nothing — the enquiry flow still
// collects and verifies a number when it needs one.
//
// NO ENUMERATION, same as the console. Every sign-in failure says the same sentence whether
// the address is unknown, the password is wrong or the account is unconfirmed. Supabase
// distinguishes those; passing it through would turn this form into a way to test whether
// somebody has an Fremmo account.
// ---------------------------------------------------------------------------

/** Supabase Auth's own floor is 6. Eight, because this one is chosen by the public. */
const MIN_PASSWORD = 8

const signInSchema = z.object({
  // Not .email() on sign-in: an address that fails this regex still fails at the auth server,
  // and rejecting it here with a different message is the enumeration leak in miniature.
  email: z.string().trim().min(3, 'Enter your email.').max(254),
  password: z.string().min(1, 'Enter your password.').max(200),
  next: z.string().optional(),
})

const signUpSchema = z.object({
  email: z.string().trim().email('That does not look like an email address.').max(254),
  password: z
    .string()
    .min(MIN_PASSWORD, `Pick a password of at least ${MIN_PASSWORD} characters.`)
    .max(200),
  fullName: z.string().trim().max(120).optional(),
  next: z.string().optional(),
})

/**
 * One sentence for every sign-up failure — a taken address, a malformed one, a missing
 * service-role key. Saying which would answer "does this person have an Fremmo account?" to
 * anybody who asks, which is the same leak REFUSED exists to close on the sign-in side.
 */
const SIGNUP_REFUSED =
  'We could not create that account. If you already have one, log in instead — otherwise ' +
  'check the address and try again.'

/** One sentence for every sign-in failure. See the note above before making this helpful. */
const REFUSED = 'That email and password do not match an account. Check both, or create one below.'

export interface EmailAuthState {
  mode: 'signin' | 'signup'
  email?: string
  error?: string
  notice?: string
}

export async function signInWithEmail(
  _prev: EmailAuthState,
  form: FormData,
): Promise<EmailAuthState> {
  const parsed = signInSchema.safeParse({
    email: text(form.get('email')),
    password: text(form.get('password')),
    next: text(form.get('next')),
  })
  if (!parsed.success) {
    return { mode: 'signin', error: parsed.error.issues[0]?.message ?? REFUSED }
  }

  const email = parsed.data.email.toLowerCase()

  /**
   * No Supabase: the local credential path, which used to live only on /admin/login.
   *
   * This is the one way into the console before a database is attached, so folding the staff
   * login into this page means folding this in too — otherwise "one login for everyone" quietly
   * means "and nobody can open the console on a fresh checkout".
   *
   * Mutually exclusive with the Supabase branch below. isLocalAuthAvailable() is false the
   * moment NEXT_PUBLIC_SUPABASE_URL is set, so a real deployment cannot reach this even if the
   * ADMIN_LOCAL_* variables are somehow still in the environment — see lib/admin-local-auth.ts,
   * where that is the single thing keeping it from being a production backdoor.
   */
  if (!hasSupabaseEnv()) {
    if (!isLocalAuthAvailable() || !checkLocalCredentials(email, parsed.data.password)) {
      return { mode: 'signin', email, error: REFUSED }
    }

    const cookie = mintLocalCookie()
    if (!cookie) return { mode: 'signin', email, error: REFUSED }

    const jar = await cookies()
    jar.set(LOCAL_COOKIE_NAME, cookie.value, {
      // httpOnly so no script can read it; the signature stops it being forged, and httpOnly
      // stops it being stolen by one.
      httpOnly: true,
      sameSite: 'lax',
      /*
       * `secure` follows the REQUEST's scheme, not NODE_ENV. `next start` runs with
       * NODE_ENV=production, so deciding from that set a Secure cookie on a plain-http LAN
       * build — which the browser then refused to store, making every navigation look like a
       * sign-out. Deciding from the scheme cannot drift from reality the same way.
       */
      secure: await isHttpsRequest(),
      path: '/',
      maxAge: cookie.maxAge,
    })

    redirect(safeNext(parsed.data.next))
  }

  const supabase = await getServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  })

  // Deliberately not inspecting error.code. See the note above.
  if (error) return { mode: 'signin', email, error: REFUSED }

  revalidatePath('/', 'layout')
  // redirect() throws, so nothing after it runs — which is what we want: the session cookies
  // are already on the response by now, written by the setAll adapter in lib/supabase.ts.
  redirect(safeNext(parsed.data.next))
}

export async function signUpWithEmail(
  _prev: EmailAuthState,
  form: FormData,
): Promise<EmailAuthState> {
  const parsed = signUpSchema.safeParse({
    email: text(form.get('email')),
    password: text(form.get('password')),
    fullName: text(form.get('fullName')),
    next: text(form.get('next')),
  })
  if (!parsed.success) {
    return { mode: 'signup', error: parsed.error.issues[0]?.message ?? 'Check those details.' }
  }

  const email = parsed.data.email.toLowerCase()

  if (!hasSupabaseEnv()) {
    return { mode: 'signup', email, error: 'Sign-up is not connected yet.' }
  }

  const next = safeNext(parsed.data.next)
  const supabase = await getServerClient()

  /**
   * THE ACCOUNT IS CREATED WITH THE SERVICE-ROLE KEY, NOT WITH signUp(), AND THE MAILER IS THE
   * REASON. `supabase.auth.signUp()` asks the auth server to send a confirmation email whether
   * or not anybody intends to read it, and this project is on Supabase's built-in mailer — two
   * messages an hour, project-team addresses only. Signing up twice in an hour returned
   * "email rate limit exceeded" and no account, which is a sign-up form that works for nobody.
   *
   * `admin.createUser({ email_confirm: true })` sends nothing, has no such limit, and produces
   * an account that can be signed into immediately. The confirmation round trip is gone
   * entirely rather than being papered over.
   *
   * NOBODY PROVES THEY OWN THE ADDRESS ANY MORE, AND THAT IS THE TRADE. Anyone can register
   * under an address they do not control. Two things bound the damage today, and neither is
   * permanent:
   *
   *   · Email is not the identity. Plan §3 makes the OTP-verified phone the customer identity,
   *     and `profiles.email` is a contact field, not a credential for anything else.
   *   · Nothing in the codebase treats "has an email" as "has a verified email". The moment
   *     something does — password reset by mail, staff invitations, a payout notice — that
   *     feature is trusting a claim nobody checked, and this is where the claim came from.
   *
   * TWO MORE THINGS THIS PATH NO LONGER GETS. It bypasses the project's own `disable_signup`
   * setting, so turning sign-ups off in the dashboard will not turn this form off — that has to
   * be done here. And the confirmation step, weak as it was, was the only thing between this
   * form and a script; there is no captcha and no rate limit in front of it now.
   *
   * THE CLEANER SHAPE IS A DASHBOARD TOGGLE PLUS REAL SMTP: Auth → Providers → Email → Confirm
   * email → off removes the mail without the service-role key, and configuring an SMTP provider
   * removes the two-an-hour ceiling if confirmations are ever wanted back. Either one makes
   * this block deletable in favour of a plain signUp().
   */
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      // Read by app.handle_new_user() in migration 20260727000300 — this is the only chance to
      // put a name on the profiles row that trigger writes.
      user_metadata: parsed.data.fullName ? { full_name: parsed.data.fullName } : {},
    })

    /*
     * createUser is candid where signUp is not: a taken address comes back as a plain "already
     * registered" error rather than the decoy user signUp returns. That candour must not reach
     * the screen — it would turn this form into a way to test who has an Fremmo account — so
     * every failure here, taken address or malformed one, gets the same sentence below.
     */
    if (error || !data.user) return { mode: 'signup', error: SIGNUP_REFUSED }
  } catch {
    // createAdminClient() throws when SUPABASE_SERVICE_ROLE_KEY is absent. That is a deployment
    // fact rather than something the reader did, and it is not theirs to debug.
    return { mode: 'signup', error: SIGNUP_REFUSED }
  }

  /**
   * Now sign them in, through the request-scoped client so the cookies land on this response.
   * The account exists and is confirmed at this point, so a failure here is a genuine surprise
   * — but leaving somebody with an account and no session, staring at a form that says the
   * address is taken, is the one outcome worth spending a branch on.
   */
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  })

  if (signInError) {
    return {
      mode: 'signin',
      email,
      notice: 'Your account is ready. Log in with the password you just chose.',
    }
  }

  revalidatePath('/', 'layout')
  redirect(next)
}

/**
 * Same-origin absolute paths only. An open redirect off a just-signed-in page is how sessions
 * get handed to phishing.
 *
 * With no `next` the answer is /dashboard, which is itself a redirect to whichever surface the
 * caller's memberships resolve to (see app/(site)/dashboard/page.tsx). Deciding it here instead
 * would mean reading membership rows before the session cookies have been written to the
 * response, and would hard-code /account for a studio owner who has never used one.
 */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard'
  return next
}

/**
 * Did this request arrive over https?
 *
 * `x-forwarded-proto` is what a proxy sets — Vercel, nginx, a load balancer — and the left-most
 * entry is the original client's scheme; anything after it was appended by a later hop. With no
 * proxy in front there is no header at all, which means a direct connection, which for this
 * server means plain http.
 *
 * Erring towards "not secure" is right here and only here: the only cookie decided by this runs
 * on the no-Supabase path, which is a local or LAN session by definition.
 */
async function isHttpsRequest(): Promise<boolean> {
  try {
    const h = await headers()
    const proto = h.get('x-forwarded-proto')
    if (!proto) return false
    return proto.split(',')[0]?.trim().toLowerCase() === 'https'
  } catch {
    return false
  }
}

/**
 * Supabase's auth errors are written for developers. These are the ones a real user
 * actually hits; anything else passes through, because a wrong-but-specific message is
 * more use than a friendly one that hides what happened.
 */
function humanise(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.'
  }
  if (m.includes('expired')) return 'That code has expired. Ask for a new one.'
  if (m.includes('invalid') && m.includes('token')) return 'That code is not right.'
  if (m.includes('sms') || m.includes('provider')) {
    return 'We could not send the message. Check the number, or try again shortly.'
  }
  return message
}

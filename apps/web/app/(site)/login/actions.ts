'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

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

const phoneSchema = z.object({
  phone: z.string().min(1, 'Enter your mobile number.'),
  next: z.string().optional(),
})

const verifySchema = phoneSchema.extend({
  code: z
    .string()
    .regex(/^\d{4,8}$/, 'The code is the digits from the message, nothing else.'),
})

export interface AuthState {
  step: 'phone' | 'code'
  phone?: string
  error?: string
  notice?: string
}

/** Step one: ask the auth server to text a code. */
export async function requestCode(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const parsed = phoneSchema.safeParse({
    phone: form.get('phone'),
    next: form.get('next'),
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
    phone: form.get('phone'),
    code: form.get('code'),
    next: form.get('next'),
  })
  if (!parsed.success) {
    return {
      step: 'code',
      phone: String(form.get('phone') ?? ''),
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
  // someone on an attacker's page carrying a fresh Utsava session.
  const next = parsed.data.next
  redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/account')
}

export async function signOut() {
  if (hasSupabaseEnv()) {
    const supabase = await getServerClient()
    await supabase.auth.signOut()
  }
  revalidatePath('/', 'layout')
  redirect('/')
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

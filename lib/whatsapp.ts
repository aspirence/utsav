/**
 * The business WhatsApp number, for "message us" links on the public site.
 *
 * ── THIS IS NOT THE SAME THING AS THE WHATSAPP API CREDENTIALS ───────────────
 * `.env` already carries `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`. Those belong to
 * the Business API and are used by the notifications worker to send *outbound* messages under
 * the service-role key — they are secrets, they are server-only, and a phone number id is not a
 * phone number. None of that can produce a `wa.me` link for a customer to tap.
 *
 * So this is a separate, deliberately public value: the number a customer opens a chat with.
 * `NEXT_PUBLIC_` because it is inlined into the client bundle and is meant to be — it is printed
 * on a link anybody can read.
 *
 * ── AN UNSET NUMBER HIDES THE LINK RATHER THAN BREAKING IT ───────────────────
 * `whatsappHref` returns null when nothing is configured, and callers drop the control. The
 * alternative is `https://wa.me/?text=…`, which is a live link to a WhatsApp error page — the
 * worst outcome of the three, because it looks like it worked until a customer taps it.
 */
const NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '')

/**
 * A wa.me deep link carrying a prefilled message, or null if no number is configured.
 *
 * The number goes in international form with no `+` and no spaces — `919812345678`. wa.me
 * rejects anything else, and it fails by showing "phone number shared via url is invalid"
 * rather than by erroring, so a wrong format is easy to ship and hard to notice.
 */
export function whatsappHref(message: string): string | null {
  if (!NUMBER) return null
  return `https://wa.me/${NUMBER}?text=${encodeURIComponent(message)}`
}

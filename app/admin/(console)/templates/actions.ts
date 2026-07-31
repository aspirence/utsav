'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

import { createUtsavaServerClient, hasSupabaseEnv, slugSchema } from '@/lib/db'

/**
 * Invitation templates: create, edit, publish, retire.
 *
 * The preview is a URL somebody pastes. That is the product decision this whole screen exists
 * to serve, and it means validation here is doing more work than usual — a bad link does not
 * throw, it renders a phone-shaped hole on the home page.
 *
 * Three things are checked before a link is accepted:
 *
 *   · https only. An http video inside an https page is blocked as mixed content, and the
 *     symptom is an empty frame with nothing in the console a non-developer would find. The
 *     database enforces this too; catching it here means the operator reads a sentence.
 *   · A recognisable shape. Either a direct file the browser can decode, or YouTube/Vimeo.
 *     Anything else is accepted only with a warning in the returned message, because it will
 *     silently fall back to the poster.
 *   · No javascript:, data: or blob:. new URL() happily parses all three.
 *
 * Writes go through the operator's own session: `invitation_templates_write_staff` admits
 * moderator and super, not field agents. Plan §6 makes RLS the authorization model, so this
 * file validates and sequences — it does not authorize.
 *
 * TWO FIELDS WERE REMOVED HERE AS DEAD, and this note exists so they are not helpfully added
 * back. `order_url` and `demo_url` were written before the product page existed. Nothing renders
 * them now: the card links to /invitations/<slug>, that page's button goes to
 * /enquire?template=<slug>, and the demo button was removed on request. An input that changes
 * nothing is worse than a missing one — it asks the operator to make a decision that has no
 * effect.
 *
 * `slug` is no longer asked for either. It is derived from the name on create and passed back as
 * a hidden field on edit, because it is the key the row is saved against and nobody should be
 * retyping it.
 */

export type TemplateActionState =
  | { status: 'idle' }
  /**
   * `warn` is what decides whether the dialog closes itself.
   *
   * A clean save needs no acknowledgement — the row appearing in the list is the feedback. A save
   * that produced a caveat (a link that saved fine but cannot play) has something to read, and
   * closing the dialog would throw it away. So the form stays open for one and not the other, and
   * this flag is how it tells them apart.
   */
  | { status: 'done'; message: string; warn: boolean }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * A URL we are willing to put in a src attribute.
 *
 * Scheme allowlist rather than a blocklist: `javascript:`, `data:` and `blob:` all parse cleanly
 * through new URL(), and a blocklist is a list of the attacks somebody has thought of.
 */
function httpsUrl(label: string) {
  return z
    .string()
    .trim()
    .max(1000)
    .refine((v) => {
      try {
        return new URL(v).protocol === 'https:'
      } catch {
        return false
      }
    }, `${label} has to be a full https:// link`)
}


const templateSchema = z
  .object({
    slug: slugSchema,
    name: z.string().trim().min(2, 'A template needs a name').max(120),
    // Four tags is the DB constraint; more than that does not fit above the name anyway.
    tags: z.array(z.string().trim().min(1).max(24)).max(4, 'Four tags is the maximum'),
    priceRupees: z.number().int().positive('A template needs a price'),
    videoUrl: httpsUrl('The preview link').optional(),
    posterUrl: httpsUrl('The poster link').optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999),
    isActive: z.boolean(),
  })
  .refine((d) => d.videoUrl != null || d.posterUrl != null, {
    message: 'Give it either a preview video or a poster image — a card with neither is an empty phone',
  })

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function saveTemplate(
  _prev: TemplateActionState,
  form: FormData,
): Promise<TemplateActionState> {
  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'No Supabase instance is connected, so nothing was saved. The storefront is showing its ' +
        'demo set — run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to manage real templates.',
    }
  }

  const name = text(form.get('name'))
  const parsed = templateSchema.safeParse({
    // Editing posts the existing slug in a hidden field; creating posts nothing and gets one
    // derived from the name.
    slug: text(form.get('slug')) ?? slugify(name ?? ''),
    name,
    tags: splitTags(text(form.get('tags'))),
    priceRupees: rupees(text(form.get('priceRupees'))),
    videoUrl: text(form.get('videoUrl')),
    posterUrl: text(form.get('posterUrl')),
    sortOrder: text(form.get('sortOrder')) ?? '100',
    isActive: form.get('isActive') === 'on',
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check those details.' }
  }
  const d = parsed.data

  const supabase = await staffClient()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const { data: auth } = await supabase.auth.getUser()

  const row = {
    slug: d.slug,
    name: d.name,
    tags: d.tags,
    // Rupees in, integer paise out (plan §5). Rounds rather than truncating.
    price: Math.round(d.priceRupees * 100),
    video_url: d.videoUrl ?? null,
    poster_url: d.posterUrl ?? null,
    sort_order: d.sortOrder,
    is_active: d.isActive,
  }

  /**
   * Upsert on slug, so this one action both creates and edits.
   *
   * The alternative is two near-identical actions differing in one verb, and a form that has to
   * know which one it is. The slug is the natural key here — it is in the URL of the thing being
   * sold, so it was never going to be editable anyway.
   */
  const { error } = await supabase
    .from('invitation_templates')
    .upsert({ ...row, created_by: auth.user?.id ?? null }, { onConflict: 'slug' })

  if (error) return { status: 'error', message: explain(error) }

  revalidatePath('/admin/templates')
  // The storefront is on the home page, so an edit that does not appear there has not landed
  // as far as the operator is concerned.
  revalidatePath('/')

  return { status: 'done', ...shapeWarning(d.videoUrl, `${d.name} saved.`) }
}

export async function toggleTemplate(slug: string, active: boolean): Promise<TemplateActionState> {
  if (!hasSupabaseEnv()) {
    return { status: 'unconfigured', message: 'No database attached — nothing was changed.' }
  }

  const parsed = slugSchema.safeParse(slug)
  if (!parsed.success) return { status: 'error', message: 'That template reference is not valid.' }

  const supabase = await staffClient()
  if (!supabase) return { status: 'error', message: 'Could not reach the database.' }

  const { data, error } = await supabase
    .from('invitation_templates')
    .update({ is_active: active })
    .eq('slug', parsed.data)
    .select('slug')

  if (error) return { status: 'error', message: explain(error) }
  if (!data || data.length === 0) {
    return {
      status: 'error',
      message:
        'The database refused that change. Editing the storefront is limited to moderators and ' +
        'super admins.',
    }
  }

  revalidatePath('/admin/templates')
  revalidatePath('/')

  return {
    status: 'done',
    // Nothing to read twice about a toggle, so it never holds a dialog open.
    warn: false,
    message: active
      ? 'Published. It is now on the home page.'
      : 'Unpublished. It is off the home page but not deleted.',
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type WriteError = { code?: string; message: string }

async function staffClient() {
  try {
    const store = await cookies()
    return createUtsavaServerClient({
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value, options } of list) store.set(name, value, options)
      },
    })
  } catch {
    return null
  }
}

/**
 * Warn when a link is valid but not a shape the card can play.
 *
 * Mirrors classifyPreview() in lib/invitation-templates.ts. Kept as a warning rather than a
 * rejection on purpose: a link we do not recognise today may be a perfectly good CDN URL whose
 * path has no extension, and refusing it would make this form the thing standing between staff
 * and their own storefront. But it must not save silently, because the failure it produces —
 * a poster where a video was expected — looks like nothing happened.
 */
function shapeWarning(
  videoUrl: string | undefined,
  success: string,
): { message: string; warn: boolean } {
  // No video at all is a choice, not a mistake — a poster-only card is a supported state.
  if (!videoUrl) {
    return { message: `${success} No preview video, so the card shows its poster.`, warn: false }
  }

  let host = ''
  let path = ''
  try {
    const u = new URL(videoUrl)
    host = u.hostname.replace(/^www\./, '')
    path = u.pathname
  } catch {
    return { message: success, warn: false }
  }

  const isFile = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(path)
  const isEmbed = ['youtube.com', 'm.youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com'].includes(host)

  if (isFile || isEmbed) {
    return { message: `${success} The preview will play on the home page.`, warn: false }
  }

  return {
    message:
      `${success} But that link is not a video file (.mp4, .webm, .mov) and not a YouTube or ` +
      'Vimeo link, so the card will show its poster instead of playing. Paste a direct file link ' +
      'if you want it to move.',
    warn: true,
  }
}

/**
 * Name to slug, matching invitation_templates_slug_format: ^[a-z0-9]+(-[a-z0-9]+)*$.
 *
 * Diacritics are folded before stripping, so "Café Royale" becomes cafe-royale rather than
 * caf-royale. A name written entirely in a non-Latin script folds to an empty string, which fails
 * slugSchema and asks for one explicitly instead of inventing a wrong one.
 */
function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Comma-separated in the form, an array in the column. */
function splitTags(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
}

/** Strips grouping separators and the rupee sign, so "1,499" and "₹1499" both work. */
function rupees(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number(raw.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : undefined
}

function text(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function explain(error: WriteError): string {
  if (error.code === '42501' || error.message.includes('row-level security')) {
    return 'Your staff role cannot edit the storefront. Moderators and super admins can.'
  }
  if (error.message.includes('invitation_templates_video_https')) {
    return 'The preview link has to start with https:// — an http video is blocked on a secure page.'
  }
  if (error.message.includes('invitation_templates_price_positive')) {
    return 'The price has to be more than zero.'
  }
  if (error.message.includes('invitation_templates_tag_count')) {
    return 'Four tags is the maximum.'
  }
  if (error.message.includes('invitation_templates_slug_format')) {
    return 'The URL name may only contain lowercase letters, numbers and single hyphens.'
  }
  return `Could not save the template: ${error.message}`
}

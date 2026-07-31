'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

import { createUtsavaServerClient, hasSupabaseEnv, slugSchema } from '@utsava/db'

/**
 * A listing's photographs: add, edit, remove, and choose the cover.
 *
 * These are the images on the cards at /lucknow/photography — `media.storage_path` becomes a card
 * cover through storageImageUrl(), and the alt text and caption travel with it.
 *
 * WRITES GO THROUGH THE OPERATOR'S OWN SESSION. `media_manage` (migration 001300) admits a vendor's
 * manager or staff at field_agent and up; nothing here authorizes anything, it validates and
 * sequences. Plan §6 makes RLS the boundary and a zero-row result is what refusal looks like.
 *
 * ── WHY THE IMAGE IS A PATH RATHER THAN AN UPLOAD ────────────────────────────
 * There is no upload pipeline yet — plan §S3's portfolio editor is still outstanding — so this
 * takes what storageImageUrl() can already resolve: a Supabase Storage object path, or a URL for a
 * file that is already served. That is the same trade the invitation templates made, and it has
 * the same consequence: nothing here resizes, validates dimensions, or guarantees the file exists.
 * When the upload pipeline lands, this field becomes its output rather than a text input.
 *
 * ── TWO THINGS THIS DELIBERATELY DOES NOT SET ────────────────────────────────
 * `moderation` is left at its default of 'pending' on insert. `media_select_live` requires
 * 'approved', so a photograph added here is invisible to customers until it goes through the
 * moderation queue — which is the point of having one. Approving from this screen would let the
 * person adding an image also wave it through.
 *
 * `vendors.media_count` is trigger-maintained (migration 001500). The go-live gate reads it, so
 * writing it here would be setting our own exam.
 */

export type MediaActionState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

/**
 * A Storage object path, or something already servable.
 *
 * Scheme allowlist, not a blocklist: `javascript:`, `data:` and `blob:` all parse through new URL()
 * and a blocklist is a list of the attacks somebody has thought of. A bare path is accepted because
 * that is what Storage objects look like — `vendor-slug/cover.webp` — and storageImageUrl() turns
 * it into a CDN render URL.
 */
const imagePath = z
  .string()
  .trim()
  .min(3, 'Give the photograph a path or a link')
  .max(500)
  .refine((v) => {
    if (v.startsWith('//')) return false
    if (v.startsWith('/')) return true
    if (/^https:\/\//.test(v)) return true
    // A Storage object path: no scheme, no leading slash, no traversal.
    return /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(v) && !v.includes('..')
  }, 'Use a Storage path (vendor-slug/photo.webp), a path on this site starting with /, or an https:// link')

const mediaSchema = z.object({
  vendorSlug: slugSchema,
  /** Present when editing, absent when adding. */
  mediaId: z.string().uuid().optional(),
  storagePath: imagePath,
  altText: z.string().trim().max(300).optional(),
  caption: z.string().trim().max(500).optional(),
  styleTags: z.array(z.string().trim().min(1).max(32)).max(8, 'Eight style tags is the maximum'),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isCover: z.boolean(),
})

export async function saveVendorMedia(
  _prev: MediaActionState,
  form: FormData,
): Promise<MediaActionState> {
  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'No Supabase instance is connected, so nothing was saved. This gallery is showing sample ' +
        'photographs — run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to manage real ones.',
    }
  }

  const parsed = mediaSchema.safeParse({
    vendorSlug: text(form.get('vendorSlug')),
    mediaId: text(form.get('mediaId')),
    storagePath: text(form.get('storagePath')),
    altText: text(form.get('altText')),
    caption: text(form.get('caption')),
    styleTags: splitTags(text(form.get('styleTags'))),
    sortOrder: text(form.get('sortOrder')) ?? '100',
    isCover: form.get('isCover') === 'on',
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check those details.' }
  }
  const d = parsed.data

  const supabase = await staffClient()
  if (!supabase) return { status: 'error', message: 'Could not reach the database.' }

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('slug', d.vendorSlug)
    .maybeSingle()

  if (!vendor) {
    return {
      status: 'error',
      message:
        'That listing is not visible to your account. Field agents are scoped to their own city.',
    }
  }

  /**
   * One cover per listing is a unique partial index (`media_single_cover_idx`), so promoting a new
   * cover has to demote the old one first — otherwise the insert fails on a constraint the operator
   * has no way to interpret.
   *
   * Not a transaction: supabase-js cannot wrap two statements in one. If the demote succeeds and
   * the write fails, the listing is left with no cover — recoverable, visible on this very screen,
   * and better than the alternative of a failed write blamed on the form.
   */
  if (d.isCover) {
    await supabase
      .from('media')
      .update({ is_cover: false })
      .eq('vendor_id', vendor.id)
      .eq('is_cover', true)
  }

  const row = {
    vendor_id: vendor.id,
    storage_path: d.storagePath,
    alt_text: d.altText ?? null,
    caption: d.caption ?? null,
    style_tags: d.styleTags,
    sort_order: d.sortOrder,
    is_cover: d.isCover,
  }

  const { data, error } = d.mediaId
    ? await supabase.from('media').update(row).eq('id', d.mediaId).select('id')
    : await supabase.from('media').insert(row).select('id')

  if (error) return { status: 'error', message: explain(error) }
  if (!data || data.length === 0) {
    return {
      status: 'error',
      message:
        'The database refused that change. Editing a listing’s photographs needs a staff role or ' +
        'membership of the vendor’s own team.',
    }
  }

  revalidatePath(`/admin/vendors/${d.vendorSlug}`)
  // The public card reads from the same rows, so a stale page here is a stale card there.
  revalidatePath(`/vendor/${d.vendorSlug}`)

  return {
    status: 'done',
    message: d.mediaId
      ? 'Photograph updated.'
      : 'Photograph added. It stays out of public view until moderation approves it.',
  }
}

export async function deleteVendorMedia(
  vendorSlug: string,
  mediaId: string,
): Promise<MediaActionState> {
  if (!hasSupabaseEnv()) {
    return { status: 'unconfigured', message: 'No database attached — nothing was removed.' }
  }

  const parsed = z
    .object({ vendorSlug: slugSchema, mediaId: z.string().uuid() })
    .safeParse({ vendorSlug, mediaId })
  if (!parsed.success) return { status: 'error', message: 'That photograph reference is not valid.' }

  const supabase = await staffClient()
  if (!supabase) return { status: 'error', message: 'Could not reach the database.' }

  const { data, error } = await supabase
    .from('media')
    .delete()
    .eq('id', parsed.data.mediaId)
    .select('id')

  if (error) return { status: 'error', message: explain(error) }
  if (!data || data.length === 0) {
    return { status: 'error', message: 'That photograph is not yours to remove.' }
  }

  revalidatePath(`/admin/vendors/${parsed.data.vendorSlug}`)
  revalidatePath(`/vendor/${parsed.data.vendorSlug}`)

  /*
   * The row goes; the Storage object does not. Deleting the file needs the service-role key and a
   * bucket path we may not own — a pasted https:// link is somebody else's file entirely. Saying so
   * is better than implying the image is gone from disk.
   */
  return {
    status: 'done',
    message: 'Removed from the listing. The underlying file is untouched.',
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

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

function splitTags(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8)
}

function text(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function explain(error: { code?: string; message: string }): string {
  if (error.code === '42501' || error.message.includes('row-level security')) {
    return 'Your staff role does not allow editing this listing’s photographs.'
  }
  if (error.message.includes('media_single_cover_idx')) {
    return 'This listing already has a cover. Untick the old one first, or set this as the cover.'
  }
  if (error.message.includes('media_dimensions_positive')) {
    return 'Those image dimensions are not valid.'
  }
  return `Could not save the photograph: ${error.message}`
}

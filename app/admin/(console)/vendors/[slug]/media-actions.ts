'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

import { createFremmoServerClient, hasSupabaseEnv, slugSchema } from '@/lib/db'

import { storeImage } from '@/lib/image-upload'

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
 * ── THE IMAGE IS UPLOADED, NOT PASTED ───────────────────────────────────────
 * It was a text field taking a path or a link. It now takes a file off the operator's machine and
 * lib/image-upload.ts stores it — Supabase Storage when a project is attached, public/uploads
 * otherwise so the feature works while building.
 *
 * That module is where the security lives, and it is worth knowing what it does before touching
 * this: the file type is decided by magic bytes rather than by the client's MIME string, SVG is
 * refused outright because a script-carrying document served from our origin is stored XSS, and
 * the stored filename is a generated uuid so no caller-controlled string ever reaches a path.
 *
 * Editing without choosing a new file keeps the existing object. The old file is not deleted when
 * a new one replaces it — see the note on deleteVendorMedia for why that is deliberate.
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
 * What the uploader gives back, re-checked before it is written.
 *
 * storeImage() already generates this value, so in practice it always passes — the point is that
 * the column is validated at the boundary regardless of who fills it, and a future caller that is
 * less careful hits the same wall. No scheme other than a leading `/` or a bare object path, and
 * no traversal.
 */
const storedPath = z
  .string()
  .trim()
  .min(3)
  .max(500)
  .refine((v) => {
    if (v.includes('..')) return false
    if (v.startsWith('//')) return false
    if (v.startsWith('/')) return /^\/[A-Za-z0-9._\-/]+$/.test(v)
    return /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(v)
  }, 'That stored path is not valid.')

const mediaSchema = z.object({
  vendorSlug: slugSchema,
  /** Present when editing, absent when adding. */
  mediaId: z.string().uuid().optional(),
  storagePath: storedPath,
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
  const vendorSlug = text(form.get('vendorSlug'))
  const slugCheck = slugSchema.safeParse(vendorSlug)
  if (!slugCheck.success) {
    return { status: 'error', message: 'That listing reference is not valid.' }
  }

  /*
   * The upload happens before the database check, and deliberately before the hasSupabaseEnv()
   * guard below.
   *
   * The slug is validated first because it becomes the storage folder, and storeImage() takes it
   * on trust — it says so in its own doc comment. Nothing else from the form is used in a path.
   *
   * Ordering the upload first means a rejected file (wrong format, too large) is reported as a
   * file problem rather than reaching a database error that describes something else.
   */
  const file = form.get('photo')
  const existingPath = text(form.get('existingPath'))
  let storagePath = existingPath

  if (file instanceof File && file.size > 0) {
    const stored = await storeImage(file, slugCheck.data)
    if (!stored.ok) return { status: 'error', message: stored.message }
    storagePath = stored.storagePath
  }

  if (!storagePath) {
    return { status: 'error', message: 'Choose a photograph to upload.' }
  }

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'The image was saved to disk, but there is no database to record it in — this gallery is ' +
        'showing sample photographs. Connect a Supabase project to keep real ones.',
    }
  }

  const parsed = mediaSchema.safeParse({
    vendorSlug,
    mediaId: text(form.get('mediaId')),
    storagePath,
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
  if (!parsed.success)
    return { status: 'error', message: 'That photograph reference is not valid.' }

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
    return createFremmoServerClient({
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

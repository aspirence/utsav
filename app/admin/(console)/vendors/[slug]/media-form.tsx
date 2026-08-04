'use client'

import { useActionState, useEffect, useState } from 'react'

import { useAdminModalClose } from '@/components/admin-modal'
import { mediaVocabulary } from '@/lib/category-attributes'

import { saveVendorMedia, type MediaActionState } from './media-actions'

/**
 * Add or edit one picture on a listing.
 *
 * The wording comes from the listing's category, the form does not. A venue is uploading a picture
 * of a lawn and a caterer one of a chaat counter; both go through the same column, the same magic-
 * byte check and the same moderation queue. Only the labels change — see mediaVocabulary().
 *
 * The path field gets a live preview: paste something and the image renders below it before you
 * save. That is the whole point of this form — the failure it prevents is a path that saves fine
 * and produces a broken card on a page customers see, which nobody notices until somebody looks.
 *
 * Two fields carry more weight than they look:
 *
 *   · ALT TEXT is not optional in spirit even though the column is nullable. It is what a screen
 *     reader reads instead of the photograph, and these are the cards on a discovery page — a
 *     gallery of unlabelled images is a page a blind customer cannot shop from. The hint says so
 *     rather than the form silently accepting empty.
 *   · COVER is a listing-wide switch, not a property of this photograph. Ticking it demotes
 *     whichever image currently holds the slot, because `media_single_cover_idx` allows exactly
 *     one — the label says that out loud so it is not a surprise.
 */
export function MediaForm({
  vendorSlug,
  categorySlug,
  initial,
}: {
  vendorSlug: string
  categorySlug: string
  initial?: {
    id: string
    storagePath: string
    altText: string | null
    caption: string | null
    styleTags: string[]
    sortOrder: number
    isCover: boolean
  }
}) {
  const v = mediaVocabulary(categorySlug)
  const [state, act, pending] = useActionState<MediaActionState, FormData>(saveVendorMedia, {
    status: 'idle',
  })
  const closeDialog = useAdminModalClose()

  const [picked, setPicked] = useState<File | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  /**
   * Preview the chosen file, and hand the memory back.
   *
   * createObjectURL pins the file in memory until it is revoked. Without the cleanup, opening this
   * dialog and picking a few photographs holds every one of them for the life of the tab — which on
   * a gallery screen is exactly what somebody does.
   */
  useEffect(() => {
    if (!picked) {
      setObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(picked)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [picked])

  // Close on success. In an effect rather than inline: calling a parent's setState during render is
  // the classic "cannot update a component while rendering a different component".
  useEffect(() => {
    if (state.status === 'done') closeDialog?.()
  }, [state, closeDialog])

  /** The newly picked file wins; otherwise whatever is already stored, if it can be resolved. */
  const preview = objectUrl ?? previewSrc(initial?.storagePath ?? '')

  return (
    <form action={act} className="space-y-5">
      <input type="hidden" name="vendorSlug" value={vendorSlug} />
      {initial && <input type="hidden" name="mediaId" value={initial.id} />}

      {/* Editing with no new file chosen keeps the object already stored. */}
      {initial && <input type="hidden" name="existingPath" value={initial.storagePath} />}

      <Field label={v.noun} htmlFor="photo" required={!initial}>
        <input
          id="photo"
          name="photo"
          type="file"
          /*
           * A hint to the file picker, not a check. The server decides the type from the file's
           * magic bytes — `accept` is trivially bypassed and `File.type` is a client-supplied
           * string. See lib/image-upload.ts.
           */
          accept="image/jpeg,image/png,image/webp"
          required={!initial}
          onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
          className="text-ink-700 file:bg-ink-900 hover:file:bg-ink-800 block w-full text-sm file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />
        <Hint>
          JPEG, PNG or WebP, up to 8&nbsp;MB. SVG is refused — it can carry scripts, and one served
          from this site would run with this site&rsquo;s privileges.
          {initial && ` Leave this empty to keep the current ${v.noun}.`}
        </Hint>

        {/* The preview. A locally-picked file previews from an object URL; an existing one from
            wherever it is already stored. */}
        <div className="border-ink-200 bg-ink-50 mt-3 flex aspect-[4/3] w-full max-w-xs items-center justify-center overflow-hidden rounded-lg border">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- plan §12: no Vercel optimizer
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <p className="text-ink-500 px-4 text-center text-xs leading-relaxed">
              The {v.noun} will preview here.
            </p>
          )}
        </div>

        {picked && (
          <p className="text-ink-500 mt-2 text-xs">
            {picked.name} · {(picked.size / (1024 * 1024)).toFixed(1)} MB
            {picked.size > 8 * 1024 * 1024 && (
              <span className="text-danger-700"> — over the 8 MB limit</span>
            )}
          </p>
        )}
      </Field>

      <Field label="Alt text" htmlFor="altText">
        <input
          id="altText"
          name="altText"
          type="text"
          defaultValue={initial?.altText ?? ''}
          placeholder={v.altPlaceholder}
          className={INPUT}
        />
        <Hint>
          What a screen reader says instead of the image. These are cards on a discovery page, so
          leaving it empty makes this listing unshoppable for someone using one.
        </Hint>
      </Field>

      <Field label="Caption" htmlFor="caption">
        <input
          id="caption"
          name="caption"
          type="text"
          defaultValue={initial?.caption ?? ''}
          placeholder={v.captionPlaceholder}
          className={INPUT}
        />
        <Hint>Shown under the {v.noun} on the listing. Optional.</Hint>
      </Field>

      <Field label={v.tagsLabel} htmlFor="styleTags">
        <input
          id="styleTags"
          name="styleTags"
          type="text"
          defaultValue={initial?.styleTags.join(', ') ?? ''}
          placeholder={v.tagsPlaceholder}
          className={INPUT}
        />
        <Hint>{v.tagsHint}</Hint>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Position" htmlFor="sortOrder">
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={initial?.sortOrder ?? 100}
            className={INPUT}
          />
          <Hint>Lower comes first in the gallery.</Hint>
        </Field>

        <div className="flex items-end">
          <label className="text-ink-800 flex items-start gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              name="isCover"
              defaultChecked={initial?.isCover ?? false}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Use as the listing&rsquo;s cover
              <span className="text-ink-500 block text-xs">
                Only one {v.noun} can be — ticking this demotes the current cover.
              </span>
            </span>
          </label>
        </div>
      </div>

      {(state.status === 'error' || state.status === 'unconfigured') && (
        <p
          role="alert"
          className={
            'rounded-md border px-3 py-2.5 text-sm leading-relaxed ' +
            (state.status === 'unconfigured'
              ? 'border-warning-500/40 bg-warning-50 text-warning-700'
              : 'border-danger-500/30 bg-danger-50 text-danger-700')
          }
        >
          {state.message}
        </p>
      )}

      <div className="border-ink-200 flex flex-wrap items-center gap-3 border-t pt-4">
        <button
          type="submit"
          disabled={pending}
          className="bg-ink-900 hover:bg-ink-800 rounded-md px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60"
        >
          {pending ? 'Saving…' : initial ? 'Save changes' : `Add ${v.noun}`}
        </button>
        {!initial && (
          <span className="text-ink-500 text-xs leading-relaxed">
            New uploads wait for moderation before customers see them.
          </span>
        )}
      </div>
    </form>
  )
}

/**
 * Preview an already-stored picture.
 *
 * Only a path this page can serve directly. A bare Storage object path would need the project URL
 * and bucket rebuilt client-side, which storageImageUrl() already does on the server for the
 * gallery tiles — duplicating it here to fill a preview that the tile behind the dialog is already
 * showing is not worth a second copy of that logic.
 */
function previewSrc(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  if (v.startsWith('//')) return null
  if (v.startsWith('/')) return v
  if (/^https:\/\//.test(v)) return v
  return null
}

const INPUT =
  'w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-ink-400'

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-ink-500 block text-xs font-semibold tracking-[0.14em] uppercase"
      >
        {label}
        {required && (
          <span className="text-danger-700 ml-1 font-normal tracking-normal normal-case">
            required
          </span>
        )}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-500 mt-1.5 text-xs leading-relaxed">{children}</p>
}

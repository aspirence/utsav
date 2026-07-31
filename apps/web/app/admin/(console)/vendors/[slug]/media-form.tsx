'use client'

import { useActionState, useEffect, useState } from 'react'

import { useAdminModalClose } from '@/components/admin-modal'

import { saveVendorMedia, type MediaActionState } from './media-actions'

/**
 * Add or edit one photograph on a listing.
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
  initial,
}: {
  vendorSlug: string
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
  const [state, act, pending] = useActionState<MediaActionState, FormData>(saveVendorMedia, {
    status: 'idle',
  })
  const closeDialog = useAdminModalClose()

  const [path, setPath] = useState(initial?.storagePath ?? '')

  // Close on success. In an effect rather than inline: calling a parent's setState during render is
  // the classic "cannot update a component while rendering a different component".
  useEffect(() => {
    if (state.status === 'done') closeDialog?.()
  }, [state, closeDialog])

  const preview = previewSrc(path)

  return (
    <form action={act} className="space-y-5">
      <input type="hidden" name="vendorSlug" value={vendorSlug} />
      {initial && <input type="hidden" name="mediaId" value={initial.id} />}

      <Field label="Image path or link" htmlFor="storagePath" required>
        <input
          id="storagePath"
          name="storagePath"
          type="text"
          required
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="lightleak-studio/pheras-01.webp"
          className={INPUT}
        />
        <Hint>
          A Storage object path, a path on this site starting with <code>/</code>, or an{' '}
          <code>https://</code> link. There is no upload here yet — plan §S3&rsquo;s portfolio
          editor is still to come.
        </Hint>

        {/* The preview. A broken path shows as a broken frame, which is the answer. */}
        <div className="border-ink-200 bg-ink-50 mt-3 flex aspect-[4/3] w-full max-w-xs items-center justify-center overflow-hidden rounded-lg border">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- plan §12: no Vercel optimizer
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <p className="text-ink-500 px-4 text-center text-xs leading-relaxed">
              {path
                ? 'Cannot preview a bare Storage path from here — it resolves through the CDN once saved.'
                : 'The photograph will preview here.'}
            </p>
          )}
        </div>
      </Field>

      <Field label="Alt text" htmlFor="altText">
        <input
          id="altText"
          name="altText"
          type="text"
          defaultValue={initial?.altText ?? ''}
          placeholder="Bride and groom during the pheras"
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
          placeholder="Gomti Nagar, December 2026"
          className={INPUT}
        />
        <Hint>Shown under the photograph on the listing. Optional.</Hint>
      </Field>

      <Field label="Style tags" htmlFor="styleTags">
        <input
          id="styleTags"
          name="styleTags"
          type="text"
          defaultValue={initial?.styleTags.join(', ') ?? ''}
          placeholder="candid, traditional"
          className={INPUT}
        />
        <Hint>
          Comma-separated, eight at most. These are what the style filter on the discovery page
          searches, so they should match the category&rsquo;s taxonomy.
        </Hint>
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
                Only one photograph can be — ticking this demotes the current cover.
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
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Add photograph'}
        </button>
        {!initial && (
          <span className="text-ink-500 text-xs leading-relaxed">
            New photographs wait for moderation before customers see them.
          </span>
        )}
      </div>
    </form>
  )
}

/**
 * What the preview can actually render.
 *
 * A bare Storage path resolves through the Supabase CDN, and building that URL needs the project
 * URL plus a bucket — which the browser has but which would render a 404 for an object that does
 * not exist yet. So the preview only shows what it can be sure of: a local path or an https link.
 * Saying "cannot preview this from here" is more useful than a broken image icon.
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
        className="text-ink-500 block text-xs font-semibold uppercase tracking-[0.14em]"
      >
        {label}
        {required && (
          <span className="text-danger-700 ml-1 font-normal normal-case tracking-normal">
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

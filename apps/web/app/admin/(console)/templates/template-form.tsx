'use client'

import { useActionState, useState } from 'react'

import { saveTemplate, type TemplateActionState } from './actions'

/**
 * Add or edit an invitation template.
 *
 * The preview link is the point of this form, so it gets a live readout: paste something and the
 * form says which element it will render before you save. Staff pasting a YouTube watch page
 * and expecting a looping clip is the failure this prevents — the card would show a poster and
 * nobody would know why.
 *
 * The check mirrors classifyPreview() on the server. Duplicated deliberately: this one only has
 * to be roughly right to be useful as feedback, and importing the real one would drag a
 * `server-only` module into the browser.
 */
export function TemplateForm({
  initial,
}: {
  initial?: {
    slug: string
    name: string
    tags: string[]
    priceRupees: number
    videoUrl: string | null
    posterUrl: string | null
    orderUrl: string | null
    demoUrl: string | null
    sortOrder: number
    isActive: boolean
  }
}) {
  const [state, act, pending] = useActionState<TemplateActionState, FormData>(saveTemplate, {
    status: 'idle',
  })

  const [video, setVideo] = useState(initial?.videoUrl ?? '')
  const verdict = describeLink(video)

  return (
    <form action={act} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={initial?.name ?? ''}
            placeholder="Taj Mahal Elegance"
            className={INPUT}
          />
        </Field>

        <Field label="URL name" htmlFor="slug" required>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            defaultValue={initial?.slug ?? ''}
            readOnly={Boolean(initial)}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="taj-mahal-elegance"
            className={INPUT + (initial ? ' bg-ink-50 text-ink-600' : '')}
          />
          <Hint>
            {initial
              ? 'Fixed once created — it is the key this row is saved against.'
              : 'Lowercase letters, numbers and single hyphens.'}
          </Hint>
        </Field>
      </div>

      <Field label="Preview video link" htmlFor="videoUrl">
        <input
          id="videoUrl"
          name="videoUrl"
          type="url"
          value={video}
          onChange={(e) => setVideo(e.target.value)}
          placeholder="https://…/taj-mahal.mp4  or  https://youtu.be/…"
          className={INPUT}
        />
        {/* The readout. role=status so a screen reader hears the verdict change. */}
        <p
          role="status"
          className={
            'mt-1.5 text-xs leading-relaxed ' +
            (verdict.tone === 'good'
              ? 'text-success-700'
              : verdict.tone === 'warn'
                ? 'text-warning-700'
                : 'text-ink-500')
          }
        >
          {verdict.message}
        </p>
      </Field>

      <Field label="Poster image link" htmlFor="posterUrl">
        <input
          id="posterUrl"
          name="posterUrl"
          type="url"
          defaultValue={initial?.posterUrl ?? ''}
          placeholder="https://…/taj-mahal-poster.webp"
          className={INPUT}
        />
        <Hint>
          The first frame, shown until the video starts and instead of it if the link is not
          playable. A card needs either this or a video.
        </Hint>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tags" htmlFor="tags">
          <input
            id="tags"
            name="tags"
            type="text"
            defaultValue={initial?.tags.join(', ') ?? ''}
            placeholder="Royal, Vibrant, New"
            className={INPUT}
          />
          <Hint>Comma-separated, four at most. Shown in small caps above the name.</Hint>
        </Field>

        <Field label="Price in rupees" htmlFor="priceRupees" required>
          <input
            id="priceRupees"
            name="priceRupees"
            type="text"
            inputMode="numeric"
            required
            defaultValue={initial ? String(initial.priceRupees) : ''}
            placeholder="1499"
            className={INPUT}
          />
          <Hint>Typed in rupees, stored as integer paise.</Hint>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Order link" htmlFor="orderUrl">
          <input
            id="orderUrl"
            name="orderUrl"
            type="text"
            defaultValue={initial?.orderUrl ?? ''}
            placeholder="/enquire?template=…"
            className={INPUT}
          />
          <Hint>Where &ldquo;Order now&rdquo; goes. Blank sends them to the enquiry form.</Hint>
        </Field>

        <Field label="Live demo link" htmlFor="demoUrl">
          <input
            id="demoUrl"
            name="demoUrl"
            type="text"
            defaultValue={initial?.demoUrl ?? ''}
            placeholder="/invitation"
            className={INPUT}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Sort order" htmlFor="sortOrder">
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={initial?.sortOrder ?? 100}
            className={INPUT}
          />
          <Hint>Lower comes first. Ties fall back to the name.</Hint>
        </Field>

        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-800">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={initial?.isActive ?? false}
              className="h-4 w-4"
            />
            Published
            <span className="text-xs text-ink-500">— unticked keeps it off the home page</span>
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

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
        >
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Add template'}
        </button>

        {state.status === 'done' && !pending && (
          <span role="status" className="text-sm leading-relaxed text-success-700">
            {state.message}
          </span>
        )}
      </div>
    </form>
  )
}

/**
 * What will this link actually do?
 *
 * Mirrors classifyPreview() in lib/invitation-templates.ts. Approximate on purpose — it is
 * feedback, not validation, and the server decides.
 */
function describeLink(url: string): { tone: 'idle' | 'good' | 'warn'; message: string } {
  const trimmed = url.trim()
  if (!trimmed) {
    return {
      tone: 'idle',
      message: 'A direct video file (.mp4, .webm, .mov) or a YouTube or Vimeo link. Leave blank to show only the poster.',
    }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { tone: 'warn', message: 'That is not a complete link yet — it needs to start with https://' }
  }

  if (parsed.protocol !== 'https:') {
    return {
      tone: 'warn',
      message: 'Has to be https. An http video is blocked inside a secure page and the phone comes out empty.',
    }
  }

  if (/\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(parsed.pathname)) {
    return { tone: 'good', message: 'A video file — this will loop silently in the phone frame.' }
  }

  const host = parsed.hostname.replace(/^www\./, '')
  if (['youtube.com', 'm.youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com'].includes(host)) {
    return { tone: 'good', message: `A ${host.includes('vimeo') ? 'Vimeo' : 'YouTube'} link — it will be embedded, muted and looping, with the player chrome hidden.` }
  }

  return {
    tone: 'warn',
    message:
      'Not a recognised video file or a YouTube/Vimeo link. It will save, but the card will show the poster instead of playing.',
  }
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
        className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-500"
      >
        {label}
        {required && (
          <span className="ml-1 font-normal normal-case tracking-normal text-danger-700">
            required
          </span>
        )}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{children}</p>
}

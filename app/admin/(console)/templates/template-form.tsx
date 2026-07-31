'use client'

import { useActionState, useEffect, useState } from 'react'

import { useAdminModalClose } from '@/components/admin-modal'

import { saveTemplate, type TemplateActionState } from './actions'

/**
 * Add or edit an invitation template.
 *
 * THREE FIELDS, then everything else folded away. A card is a name, a video and a price — that is
 * the whole product — so those are what the form asks for and the rest is behind one summary line
 * nobody has to open. It was nine fields flat, including two that changed nothing (see the note in
 * actions.ts) and a URL name that derives from the name anyway. A form that asks for more than it
 * needs teaches the operator that some of the boxes do not matter, and then they stop reading any
 * of them.
 *
 * The preview link gets a live readout: paste something and the form says which element it will
 * render *before* you save. Staff pasting a YouTube watch page and expecting a looping clip is the
 * failure this prevents — the card would show a still image and nobody would know why.
 *
 * That check mirrors classifyPreview() on the server. Duplicated deliberately: this one only has
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
    sortOrder: number
    isActive: boolean
  }
}) {
  const [state, act, pending] = useActionState<TemplateActionState, FormData>(saveTemplate, {
    status: 'idle',
  })
  const closeDialog = useAdminModalClose()

  const [video, setVideo] = useState(initial?.videoUrl ?? '')
  const verdict = describeLink(video)

  /**
   * Close on a clean save only.
   *
   * A warning is something to read — a link that saved but will not play — and closing the dialog
   * would throw the sentence away. So the caveat case stays open and the operator dismisses it
   * themselves. In an effect rather than inline, because calling a parent's setState during
   * render is the classic "cannot update a component while rendering a different component".
   */
  useEffect(() => {
    if (state.status === 'done' && !state.warn) closeDialog?.()
  }, [state, closeDialog])

  return (
    <form action={act} className="space-y-5">
      {/* Editing keeps the slug; creating derives one from the name server-side. Either way it is
          not something to retype — it is the key the row is saved against. */}
      {initial && <input type="hidden" name="slug" value={initial.slug} />}

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
        {initial ? (
          <Hint>
            Lives at <code className="text-ink-700">/invitations/{initial.slug}</code> — the address
            does not change when you rename it.
          </Hint>
        ) : (
          <Hint>The web address is made from this automatically.</Hint>
        )}
      </Field>

      <Field label="Video link" htmlFor="videoUrl" required>
        <input
          id="videoUrl"
          name="videoUrl"
          type="url"
          value={video}
          onChange={(e) => setVideo(e.target.value)}
          placeholder="https://…/taj-mahal.mp4  or  https://youtu.be/…"
          className={INPUT}
        />
        {/* role=status so a screen reader hears the verdict change as it is typed. */}
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

      <div className="grid gap-5 sm:grid-cols-2">
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
        </Field>

        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-800">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={initial?.isActive ?? false}
              className="h-4 w-4"
            />
            Show on the home page
          </label>
        </div>
      </div>

      {/*
        <details> rather than a state toggle: the browser handles it, it works before hydration, and
        the summary line is honest about what is inside so nobody has to open it to find out.
      */}
      <details className="rounded-md border border-ink-200 bg-ink-50/60 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-800">
          Optional
          <span className="ml-1.5 font-normal text-ink-500">
            — tag words, a poster image, and where it sits in the row
          </span>
        </summary>

        <div className="mt-5 space-y-5">
          <Field label="Tag words" htmlFor="tags">
            <input
              id="tags"
              name="tags"
              type="text"
              defaultValue={initial?.tags.join(', ') ?? ''}
              placeholder="Royal, Vibrant, New"
              className={INPUT}
            />
            <Hint>
              The small capitals above the name on the card. Comma-separated, four at most.
            </Hint>
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
              A still shown while the video loads, and instead of it if the link turns out not to be
              playable. Skip it if you have given a video link above.
            </Hint>
          </Field>

          <Field label="Position in the row" htmlFor="sortOrder">
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={initial?.sortOrder ?? 100}
              className={INPUT + ' sm:w-32'}
            />
            <Hint>Lower comes first. Leave it at 100 and they order by name.</Hint>
          </Field>
        </div>
      </details>

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
      message:
        'A page on this site like /invitation, a video file (.mp4, .webm, .mov), or a YouTube ' +
        'or Vimeo link.',
    }
  }

  // A path on this site, checked before URL parsing because new URL() throws on one.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return /\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(trimmed)
      ? { tone: 'good', message: 'A video file on this site — it will loop silently in the phone frame.' }
      : {
          tone: 'good',
          message:
            'A page on this site — it will run live inside the phone frame, animation and all.',
        }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return {
      tone: 'warn',
      message:
        'Not a complete link yet. Use https://… for somewhere else, or start with / for a page ' +
        'on this site — /invitation, not http://192.168.1.20:3000/invitation.',
    }
  }

  if (parsed.protocol !== 'https:') {
    /*
     * The most common paste is this site's own address copied out of the browser bar, which
     * over LAN or localhost is http and gets refused. The fix is not "make it https" — it is
     * to drop the host entirely, because it is our own page. So the message says that
     * instead of repeating the rule.
     */
    return {
      tone: 'warn',
      message:
        `For a page on this site, paste just the path — ${parsed.pathname || '/invitation'} — ` +
        'not the whole address. An http link is blocked inside a secure page and the phone ' +
        'comes out empty.',
    }
  }

  if (/\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(parsed.pathname)) {
    return { tone: 'good', message: 'A video file — this will loop silently in the phone frame.' }
  }

  const host = parsed.hostname.replace(/^www\./, '')
  if (['youtube.com', 'm.youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com'].includes(host)) {
    return {
      tone: 'good',
      message: `A ${host.includes('vimeo') ? 'Vimeo' : 'YouTube'} link — embedded, muted and looping, with the player controls hidden.`,
    }
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

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
          <label className="text-ink-800 flex items-center gap-2 pb-2 text-sm">
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
      <details className="border-ink-200 bg-ink-50/60 rounded-md border px-4 py-3">
        <summary className="text-ink-800 cursor-pointer text-sm font-medium">
          Optional
          <span className="text-ink-500 ml-1.5 font-normal">
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

      <div className="border-ink-200 flex flex-wrap items-center gap-3 border-t pt-4">
        <button
          type="submit"
          disabled={pending}
          className="bg-ink-900 hover:bg-ink-800 rounded-md px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60"
        >
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Add template'}
        </button>

        {state.status === 'done' && !pending && (
          <span role="status" className="text-success-700 text-sm leading-relaxed">
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
        'A video file (.mp4, .webm, .mov), an image or GIF (.gif, .webp, .jpg, .png), or a ' +
        'YouTube link. Not a page link — a preview is media, not a live page.',
    }
  }

  // A path on this site, checked before URL parsing because new URL() throws on one.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    if (/\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(trimmed)) {
      return {
        tone: 'good',
        message: 'A video file on this site — it will loop silently in the phone frame.',
      }
    }
    if (/\.(gif|webp|png|jpe?g|avif)$/i.test(trimmed)) {
      return {
        tone: 'good',
        message: 'An image on this site — it will fill the phone frame. A GIF will animate.',
      }
    }
    /*
     * A PAGE ON THIS SITE USED TO BE THE HEADLINE FEATURE HERE, and it is now the one thing
     * this field refuses to do anything useful with. The card framed the page in an iframe, so
     * the mockup showed our own header and back button inside it — a phone showing our site
     * rather than a preview of an invitation.
     */
    return {
      tone: 'warn',
      message:
        'That is a page, not a file. Pages are no longer shown in the card — record it as a ' +
        'short clip or export a still, and paste that instead.',
    }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return {
      tone: 'warn',
      message: 'Not a complete link yet. Use https://… , or start with / for a file on this site.',
    }
  }

  if (parsed.protocol !== 'https:') {
    return {
      tone: 'warn',
      message:
        'An http link is blocked inside a secure page and the phone comes out empty. Use https, ' +
        'or paste just the path for a file on this site.',
    }
  }

  if (/\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(parsed.pathname)) {
    return { tone: 'good', message: 'A video file — this will loop silently in the phone frame.' }
  }

  if (/\.(gif|webp|png|jpe?g|avif)$/i.test(parsed.pathname)) {
    return { tone: 'good', message: 'An image — it will fill the phone frame. A GIF will animate.' }
  }

  const host = parsed.hostname.replace(/^www\./, '')

  if (['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
    return {
      tone: 'good',
      message:
        "A YouTube link — the card shows YouTube's thumbnail as a still. Paste a file link if you want it to move.",
    }
  }

  if (['vimeo.com', 'player.vimeo.com'].includes(host)) {
    // Vimeo thumbnails need an oEmbed round trip, which this render path does not make.
    return {
      tone: 'warn',
      message:
        'Vimeo thumbnails cannot be worked out from the link, so the card will show its poster. ' +
        'Add a poster image, or paste a direct file link.',
    }
  }

  return {
    tone: 'warn',
    message:
      'Not a recognised video, image or YouTube link. It will save, but the card will show the poster instead.',
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

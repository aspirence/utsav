'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { cn } from '@/components/ui'

/**
 * Style filters for /invitations, behind one icon.
 *
 * ── WHY THEY MOVED OFF THE PAGE ──────────────────────────────────────────────
 * They used to be a row of pills — "All" plus every tag staff had ever invented. There are
 * fifteen of them today and the row wrapped onto two lines on a laptop, so the first thing
 * under the heading was a block of chips deeper than the heading itself, and the products it
 * was meant to filter started below the fold. It also grows: every new tag makes it worse, and
 * nothing in the console warns anybody that adding one costs a line of the listing page.
 *
 * One control at a fixed size does not grow. The heading and the trigger now sit on a single
 * row, and the grid starts directly under them.
 *
 * ── THE FILTERS ARE STILL LINKS, AND THAT IS THE POINT ───────────────────────
 * Only the open/closed state is client-side. Every option inside is the same `?tag=` anchor it
 * always was, rendered into the DOM whether the dialog is open or not, so all of the properties
 * the plain row had survive the move: the filtered view is a real URL, it is shareable, back
 * works, and a crawler following the markup reaches every tag without executing anything. A
 * `useState` filter would have thrown all four away to ship more JavaScript.
 *
 * ── <dialog>, FOR THE SAME REASONS AdminModal GIVES ──────────────────────────
 * Top layer so no ancestor's overflow can clip it, the rest of the page inert, focus returned
 * to the trigger on close, and Escape for free. The one trap that component records applies
 * here too: the UA stylesheet puts `overflow: auto` on the element, which floats a scrollbar
 * inside the rounded corners, so the dialog is `overflow-hidden` and the panel inside scrolls.
 */
export function InvitationFilters({
  tags,
  activeTag,
  /**
   * Prefilled wa.me link, or null when no number is configured — see lib/whatsapp.ts. Null
   * drops the option entirely rather than rendering a link to a WhatsApp error page.
   */
  customHref,
}: {
  tags: string[]
  activeTag?: string
  customHref: string | null
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const titleId = useId()

  const close = useCallback(() => setOpen(false), [])

  /*
   * State drives the element, not the other way round. showModal()/close() are imperative, so
   * calling them from the click handler *and* tracking `open` in state gives two sources of
   * truth that disagree the moment Escape closes the dialog behind React's back. The `close`
   * listener below is what keeps state honest. Same reasoning as AdminModal.
   */
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    const sync = () => setOpen(false)
    // Fires for Escape and for close(); `cancel` alone would miss the programmatic path.
    el.addEventListener('close', sync)
    return () => el.removeEventListener('close', sync)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // The active tag rides on the trigger. Without it the only way to find out what the
        // grid is filtered to would be to open the dialog, which is a strange thing to have to
        // do to read the state of the page you are looking at.
        aria-haspopup="dialog"
        className="border-ink-200 text-ink-800 hover:border-ink-300 hover:bg-ink-50 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border bg-white px-4 text-sm font-medium transition-colors"
      >
        <FilterIcon />
        <span>{activeTag ?? 'Filter'}</span>
        {activeTag && (
          // A count of one, styled as a dot, so "filtered" is legible without reading.
          <span className="bg-primary-600 h-1.5 w-1.5 rounded-full" aria-hidden="true" />
        )}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="border-ink-200 text-ink-900 backdrop:bg-ink-950/50 fixed inset-0 m-auto w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-3xl border bg-white p-0"
        // Clicking the backdrop. The event target is the dialog itself only when the click
        // landed outside the panel, which is what makes this work without a second overlay.
        onClick={(event) => {
          if (event.target === dialog.current) close()
        }}
      >
        <div className="max-h-[80vh] overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-ink-900 text-lg font-semibold">
              Filter by style
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="text-ink-500 hover:bg-ink-100 hover:text-ink-900 -mt-1 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors"
            >
              <CloseIcon />
            </button>
          </div>

          {/*
            FIRST OPTION, ABOVE THE STYLES, BY REQUEST.

            It is deliberately not a filter — it is the way out of the catalogue for somebody
            whose answer is not in it. Putting it first is the whole point: the person most
            likely to need it is the one who has just opened the filters because nothing on the
            page matched, and they meet it before they scroll a list that is about to fail them
            again.

            It is the one option that leaves the site, so it is the one option that is styled as
            a card rather than a row, and it carries `target="_blank"` with the rel that has to
            come with it — without `noopener` the opened tab gets a handle on this one.
          */}
          {customHref && (
            <a
              href={customHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className="border-ink-200 hover:border-primary-300 hover:bg-primary-50/60 mt-4 flex items-center gap-3 rounded-2xl border p-4 transition-colors"
            >
              <span className="bg-primary-600 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white">
                <WhatsAppIcon />
              </span>
              <span className="min-w-0">
                <span className="text-ink-900 block text-sm font-semibold">
                  Need something custom?
                </span>
                <span className="text-ink-600 block text-sm">Message now on WhatsApp</span>
              </span>
            </a>
          )}

          <p className="text-ink-500 mt-5 mb-2 text-xs font-semibold tracking-[0.12em] uppercase">
            Styles
          </p>

          {/*
            `onClick={close}` on a link that is about to navigate looks redundant and is not.
            These are client-side Next navigations, so the dialog's React tree survives the
            route change — without this the page behind would change and the dialog would still
            be sitting open on top of it.
          */}
          <nav aria-label="Filter by style" className="flex flex-wrap gap-2">
            <FilterPill href="/invitations" label="All" active={!activeTag} onNavigate={close} />
            {tags.map((tag) => (
              <FilterPill
                key={tag}
                href={`/invitations?tag=${encodeURIComponent(tag)}`}
                label={tag}
                active={activeTag === tag}
                onNavigate={close}
              />
            ))}
          </nav>
        </div>
      </dialog>
    </>
  )
}

function FilterPill({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string
  label: string
  active: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors',
        active
          ? 'bg-ink-900 text-white'
          : 'text-ink-700 ring-ink-200 hover:text-ink-950 bg-white ring-1',
      )}
    >
      {label}
    </Link>
  )
}

/* Icons are inline and `aria-hidden` — each one sits beside a real text label. */

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M4 7h16M7 12h10M10 17h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.02 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  )
}

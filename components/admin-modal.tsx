'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * How a form inside the dialog closes it.
 *
 * NOT a render prop, and the reason is a hard rule rather than taste: `children` is created by a
 * Server Component, and a function cannot cross the server/client boundary — React refuses with
 * "Functions cannot be passed directly to Client Components". A context reads at runtime on the
 * client, where both sides are ordinary React, so the children stay a serialisable element.
 *
 * Returns null outside a dialog, which is how a form tells the difference: CreateVendorForm shows
 * its success panel on the standalone /admin/vendors/new page and closes the dialog on the
 * roster page, from one implementation.
 */
const CloseContext = createContext<(() => void) | null>(null)

export function useAdminModalClose(): (() => void) | null {
  return useContext(CloseContext)
}

/**
 * A button that opens a form in a dialog.
 *
 * The console had one page with its list and its create form stacked on top of each other, which
 * read as one long muddle rather than as two things. This is the fix, and it is written to be
 * reused: every screen that creates or edits something gets its own trigger, in its own header,
 * opening its own form.
 *
 * WHY <dialog> AND NOT A DIV WITH A HIGH z-index. The native element brings four behaviours that
 * are each a bug when hand-rolled: it renders in the top layer so no ancestor's `overflow` or
 * `transform` can clip it, it makes the rest of the page inert so Tab cannot walk out of the
 * form, it returns focus to the trigger on close, and Escape works without a key listener.
 *
 * ONE KNOWN <dialog> TRAP, hit before in this codebase: the UA stylesheet sets `overflow: auto`
 * on the element itself, which puts a scrollbar inside the rounded corners. The dialog is
 * therefore `overflow-hidden` and the scrolling happens on the inner panel, which has its own
 * padding to keep content off the edge.
 *
 * CLOSING ON SUCCESS is the form's decision, not this component's — it has no idea whether a
 * submit worked. The form pulls `close` out of context and calls it when its own action reports
 * success. See TemplateForm, which deliberately stays open when the save produced a warning worth
 * reading.
 */
export function AdminModal({
  trigger,
  title,
  description,
  children,
  /** 'primary' for a create button, 'quiet' for a row-level edit. */
  variant = 'primary',
  width = 'md',
}: {
  trigger: ReactNode
  title: string
  description?: string
  children: ReactNode
  variant?: 'primary' | 'quiet'
  width?: 'md' | 'lg'
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const titleId = useId()

  const close = useCallback(() => setOpen(false), [])

  /**
   * State drives the element, not the other way round.
   *
   * showModal()/close() are imperative, so calling them from the click handler *and* tracking
   * `open` in state would give two sources of truth — and they disagree the moment Escape closes
   * the dialog behind React's back. The `close` event below is what keeps state honest.
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
        className={
          variant === 'primary'
            ? 'bg-ink-900 hover:bg-ink-800 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-white transition-colors'
            : 'border-ink-200 text-ink-800 hover:border-ink-300 hover:bg-ink-50 inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors'
        }
      >
        {trigger}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        // Positioned by the top layer, so no ancestor can clip it. overflow-hidden keeps the
        // scrollbar out of the rounded corners; the panel inside scrolls instead.
        className={
          'border-ink-200 text-ink-900 backdrop:bg-ink-950/50 fixed inset-0 m-auto w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border bg-white p-0 ' +
          (width === 'lg' ? 'max-w-3xl' : 'max-w-xl')
        }
        // Clicking the backdrop. The event target is the dialog itself only when the click landed
        // outside the panel — a click on any child bubbles up with that child as the target.
        onClick={(e) => {
          if (e.target === dialog.current) close()
        }}
      >
        <div className="flex max-h-[85vh] flex-col">
          <div className="border-ink-200 flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 id={titleId} className="font-display text-ink-900 text-lg">
                {title}
              </h2>
              {description && (
                <p className="text-ink-600 mt-1 max-w-lg text-xs leading-relaxed">{description}</p>
              )}
            </div>

            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="text-ink-500 hover:bg-ink-100 hover:text-ink-900 -mt-1 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>

          {/*
            The form is mounted only while the dialog is open, so `key` is not needed to reset it:
            closing unmounts it and every defaultValue is read fresh next time. A form that
            remembered last time's half-typed price would be worse than one that forgets.
          */}
          <div className="overflow-y-auto px-5 py-5">
            {open && <CloseContext.Provider value={close}>{children}</CloseContext.Provider>}
          </div>
        </div>
      </dialog>
    </>
  )
}

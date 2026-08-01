import type { ReactNode } from 'react'

import { ConsoleTopBar, type ConsoleTopBarProps } from '@/components/console-topbar'

/**
 * The workspace chrome: dark rail, top bar, content column, footer note.
 *
 * ONE SHELL FOR THREE SURFACES — the staff console at /admin, the partner dashboard, and the
 * customer account. Plan §3 gives one human many contexts, and the three used to look like
 * three products: a dark fixed rail for staff, a light sticky column for partners, and pill tabs
 * under the public header for customers. Switching hats meant relearning the furniture. Now only
 * the nav items and the footer sentence change.
 *
 * `lg:pl-60` rather than a flex row, because the rail is `fixed`: a position-fixed sidebar is out
 * of flow, so the content has to be inset by hand. A flex row would scroll the rail away with the
 * page, and a nav that scrolls off is one you have to scroll back for.
 *
 * The denser type is scoped here rather than set globally. Somebody working a queue needs rows
 * per screen; the customer site opposite it optimises for whitespace, and neither should leak
 * into the other.
 */
export function ConsoleShell({
  sidebar,
  topBar,
  footnote,
  children,
}: {
  /**
   * A <ConsoleSidebar>, built by the caller rather than configured here. The console filters its
   * own items by staff role and the other two do not, so passing the element is one prop instead
   * of a nav schema plus an escape hatch for the one surface that needs more.
   */
  sidebar: ReactNode
  topBar: ConsoleTopBarProps
  /** The one line under the content. Says what this surface is, or warns about its state. */
  footnote: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-ink-50 text-[0.9375rem]">
      {sidebar}

      <div className="lg:pl-60">
        <ConsoleTopBar {...topBar} />

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>

        <footer className="mx-auto max-w-[1500px] px-4 pb-8 sm:px-6">
          <p className="border-t border-ink-200 pt-5 text-xs text-ink-500">{footnote}</p>
        </footer>
      </div>
    </div>
  )
}

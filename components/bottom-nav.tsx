'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The phone navigation bar — one implementation, four surfaces.
 *
 * The public site, the account area, the partner dashboard and the console all get the same
 * bar with different items. Writing it once is not just less code: a bottom bar that behaves
 * differently depending on which part of the product you are in is the thing that makes a web
 * app feel like a web app. The height, the press feedback and the safe-area handling have to be
 * identical everywhere or the seams show every time somebody crosses between surfaces.
 *
 * ── IT DOES NOT REPLACE THE HAMBURGER ────────────────────────────────────────
 * Five slots is the hard limit before the labels stop being readable at 11px, and every one of
 * these surfaces has more than five destinations. So this carries the primary ones and
 * SiteNavMobile keeps carrying the rest. A bottom bar that swallowed the whole menu would need
 * a "More" tab, which is a hamburger wearing a different hat and one level deeper.
 *
 * ── WHY `pb-[env(safe-area-inset-bottom)]` IS NOT OPTIONAL ───────────────────
 * On any iPhone without a home button the bottom 34px of the viewport is the home indicator.
 * A bar that ends at `bottom: 0` puts its labels under it — legible, but you cannot tap the
 * middle of the row without the OS reading it as a swipe-up. The inset pushes the content up
 * and lets the bar's background continue behind the indicator, which is what a native tab bar
 * does.
 *
 * This only works if the document opts into it. `viewportFit: 'cover'` in app/layout.tsx is what
 * makes env(safe-area-inset-*) resolve to anything other than zero — without it these paddings
 * are all 0px and the whole thing silently degrades to the broken version. The two changes
 * belong together.
 *
 * ── ACTIVE STATE IS PREFIX-MATCHED, EXCEPT FOR ROOTS ─────────────────────────
 * `/account/events` should light the Account tab, so the rule is prefix. But `/` is a prefix of
 * every path and `/admin` is a prefix of `/admin/orders`, so a plain prefix test lights the home
 * tab permanently. Roots are therefore matched exactly, and `exact` says which ones are roots.
 * Getting this wrong is the single most common bottom-bar bug and it is invisible on the home
 * page, where it looks correct.
 */

export interface BottomNavItem {
  href: string
  label: string
  icon: React.ReactNode
  /**
   * Match this href exactly rather than by prefix. Set it on section roots — `/`, `/admin`,
   * `/account` — whose path is a prefix of everything beside them.
   */
  exact?: boolean
  /**
   * Extra paths that should also light this tab. For a tab whose section lives under a
   * different URL than its link — the console's Dashboard tab points at `/admin`, but
   * `/admin/pipeline` has no tab of its own and belongs to it.
   */
  alsoMatch?: string[]
}

export function BottomNav({
  items,
  /**
   * Where the bar stops. The site header reveals its full nav at `md`; the console's rail
   * appears at `lg`. The bar has to disappear exactly where its replacement arrives, or there
   * are two navigations on screen at once.
   */
  hideFrom = 'md',
  label = 'Primary',
}: {
  items: BottomNavItem[]
  hideFrom?: 'sm' | 'md' | 'lg'
  label?: string
}) {
  const pathname = usePathname() ?? '/'

  const hidden = { sm: 'sm:hidden', md: 'md:hidden', lg: 'lg:hidden' }[hideFrom]

  return (
    <nav
      aria-label={label}
      /*
       * `pb-[env(...)]` on the <nav> and not on the row inside it, so the bar's own background
       * and top border extend behind the home indicator. Padding the row instead leaves a strip
       * of page showing through under the bar as you scroll, which reads as a rendering fault.
       *
       * z-40 sits under SiteNavMobile's full-screen panel (z-50) on purpose: when that menu is
       * open it covers everything, and a tab bar floating on top of an open menu is wrong.
       */
      className={
        `fixed inset-x-0 bottom-0 z-40 border-t border-ink-200/80 bg-white/95 ` +
        `pb-[env(safe-area-inset-bottom)] backdrop-blur ${hidden}`
      }
    >
      <ul className="flex items-stretch justify-around">
        {items.map((item) => {
          const active = isActive(pathname, item)
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                /*
                 * min-h-[3.25rem] is 52px, comfortably past the 44px Apple and 48px Material
                 * minimums once the safe-area padding is added under it. The whole cell is the
                 * target, not the icon — a 24px icon inside a 52px row that only responds on the
                 * glyph is a target that measures 24px in practice.
                 *
                 * active:scale-95 with no transition on the way in: press feedback has to be
                 * immediate to read as a press. `touch-manipulation` drops the 300ms
                 * double-tap-zoom delay that otherwise sits between the tap and the navigation.
                 */
                className={
                  `flex min-h-[3.25rem] touch-manipulation select-none flex-col items-center ` +
                  `justify-center gap-1 px-1 py-1.5 text-[0.6875rem] font-medium leading-none ` +
                  `transition-transform active:scale-95 ` +
                  (active ? 'text-primary-700' : 'text-ink-500')
                }
              >
                <span aria-hidden="true" className="grid h-6 w-6 place-items-center">
                  {item.icon}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * The spacer that keeps the last row of a page off the bar.
 *
 * A fixed bar is out of flow, so without this the final control on every page sits underneath
 * it — reachable only by over-scrolling, and on a form that is the submit button. Rendered as a
 * sibling at the end of the scroll container rather than as padding on <main>, because several
 * layouts here give <main> a background that would then extend past the content.
 *
 * Height matches the bar: 3.25rem row + the safe-area inset.
 */
export function BottomNavSpacer({ hideFrom = 'md' }: { hideFrom?: 'sm' | 'md' | 'lg' }) {
  const hidden = { sm: 'sm:hidden', md: 'md:hidden', lg: 'lg:hidden' }[hideFrom]
  return (
    <div
      aria-hidden="true"
      className={`h-[calc(3.25rem+env(safe-area-inset-bottom))] ${hidden}`}
    />
  )
}

function isActive(pathname: string, item: BottomNavItem): boolean {
  const candidates = [item.href, ...(item.alsoMatch ?? [])]

  return candidates.some((href) => {
    if (item.exact) return pathname === href
    // `startsWith` alone would light /account for /accountancy. The boundary check is what makes
    // it a path-segment prefix rather than a string prefix.
    return pathname === href || pathname.startsWith(`${href}/`)
  })
}

import Link from 'next/link'

import { formatPaise } from '@/lib/db'

import { TemplatePhone, type PhonePreview } from '@/components/template-phone'

/**
 * Curated Collections as a grid.
 *
 * ── WHY THIS REPLACED A CAROUSEL ─────────────────────────────────────────────
 * The section used to be a four-up auto-rotating track. Three things were wrong with it and
 * only the third is about taste.
 *
 * Below 640px the arrows were `hidden sm:flex`, so a phone got a row that advanced on a timer
 * and accepted no input at all — you waited or you left. Second, everything past the fourth
 * card was invisible until the timer reached it, which is a strange way to sell eight products.
 * Third, an auto-rotating carousel moves the thing you were reading out from under you.
 *
 * A grid has none of those failure modes, and it is the pattern every app store uses for
 * exactly this job.
 *
 * ── IT IS A SERVER COMPONENT, AND THAT IS THE POINT ──────────────────────────
 * The carousel needed `'use client'` for its index, its timer, its snap-back and its drag. None
 * of that exists here, so this ships no JavaScript. Plan §13 gates launch on LCP over 4G and
 * this section sits high on the home page — taking a stateful client component off it is worth
 * more than the animation was.
 *
 * The phones inside still lazy-load their own previews; TemplatePhone is a client component and
 * stays one, because IntersectionObserver has to run somewhere.
 */

export interface TemplateGridItem extends PhonePreview {
  slug: string
  tags: string[]
  pricePaise: number
}

export function TemplateGrid({
  items,
  /**
   * How many to render. The home page shows six and links to the full list; the listing page
   * passes nothing and shows everything.
   *
   * NO COUNT FILLS 2, 3 AND 4 COLUMNS CLEANLY except twelve, which is more than a home page
   * section should carry. So a short last row is unavoidable somewhere, and the only question is
   * where to put it:
   *
   *   six   → clean at 2 and 3 across; leaves two cards alone on the 4-across desktop row
   *   eight → clean at 2 and 4 across; leaves two alone on the 3-across tablet row
   *
   * Six is kept because the home page's job is to sample the range and send people to
   * /invitations, not to show the catalogue — and a full row of four followed by a short one
   * still reads as "there is more", which is exactly what the button under it says.
   */
  limit,
}: {
  items: TemplateGridItem[]
  limit?: number
}) {
  const shown = typeof limit === 'number' ? items.slice(0, limit) : items

  if (shown.length === 0) return null

  return (
    /*
     * Two across on a phone, three at tablet, four from `lg`.
     *
     * AN EARLIER VERSION OF THIS COMMENT ARGUED AGAINST FOUR, on the grounds that a quarter of a
     * 1280px row would make a 280px-wide phone at 1:2.174 — a 600px pillar. That was wrong, and
     * wrong in a way worth recording: TemplateGridCard caps the frame at `max-w-[200px]`, so a
     * wider cell does not make a wider phone. At four across the cell is about 286px and the
     * 200px phone simply centres in it. The extra width becomes gutter, not device.
     *
     * ── RULED CELLS, NOT FLOATING CARDS ─────────────────────────────────────────
     * The cells used to be separated by gaps. They are separated by shared rules now, which is
     * the catalogue-sheet look the section was asked for: every product sits in its own box and
     * the boxes touch.
     *
     * EVERY CELL CARRIES A WHOLE BORDER, and `-mr-px -mb-px` pulls each one a pixel over its
     * neighbour so the two touching edges collapse into a single 1px rule. This is the old
     * border-collapse trick and it is here for a specific reason: the alternative — top and
     * left on the container, right and bottom on each cell — draws every rule once too, but
     * only works when the grid is a full rectangle.
     *
     * IT NEVER IS. The home page passes six into a four-column row, and /invitations passes
     * however many templates exist. With the container-edge version, the bottom rule of the
     * last full row runs the whole width while the short row beneath fills only part of it, so
     * the line juts out into empty space with nothing under it. Boxing each cell means a short
     * row is simply fewer boxes, which is what the reference does and what reads as deliberate.
     *
     * `gap-0` is load-bearing and is not the default here: any gap separates the borders and
     * the grid draws every internal rule twice, at double weight.
     *
     * NO `items-start` ANY MORE. It let each cell take its own height, which was right when they
     * floated and is wrong now: ragged cell heights would break every horizontal rule into
     * steps. The cells stretch, and TemplateGridCard pushes its button down with `mt-auto` so
     * the buttons still line up across a row no matter how deep the names wrap.
     */
    <ul className="grid grid-cols-2 gap-0 sm:grid-cols-3 lg:grid-cols-4">
      {shown.map((item) => (
        <li
          key={item.slug}
          className="border-ink-200 -mr-px -mb-px border p-4 sm:p-5"
        >
          <TemplateGridCard item={item} />
        </li>
      ))}
    </ul>
  )
}

/**
 * One template: the phone, its tags, its name, its price.
 *
 * Shared by the home page and the listing page deliberately. Two copies of a product card drift
 * — one gets a price change and the other does not — and the customer meets both within two
 * clicks of each other.
 */
export function TemplateGridCard({ item }: { item: TemplateGridItem }) {
  const href = `/invitations/${item.slug}`

  return (
    // `h-full` and a column: the cell stretches to its row, and the button is pushed to the
    // bottom of whatever height that turns out to be. See the grid's note on ruled cells.
    <figure className="group flex h-full flex-col">
      {/*
        The whole phone is the link to the detail page. Somebody who wants to *see* a template
        taps its picture; making them find a small button underneath is a worse version of the
        same journey. Buying is the separate, explicit action below.

        `block` so the anchor is the size of what it contains — an inline anchor around a block
        child gives a hit area the height of a line of text, which is the classic version of
        "the picture is not clickable on my phone".
      */}
      <Link
        href={href}
        className="block"
        aria-label={`${item.name}, ${formatPaise(item.pricePaise)}`}
      >
        <TemplatePhone item={item} className="mx-auto w-full max-w-[200px]" />
      </Link>

      <figcaption className="mt-3 flex flex-1 flex-col text-center sm:mt-4">
        {/*
          THE TAG ROW IS GONE — it read "ROYAL · VIBRANT · NEW" above every name. Removed by
          request. `tags` stays on the item because the filters on /invitations and the detail
          page both still use it; this card just no longer prints it.

          The name keeps `line-clamp-2` but has lost its reserved min-height. That height existed
          to hold the price rows level across a row while the cells were free-standing. The cells
          stretch now and `mt-auto` on the button does that job properly, so reserving space for
          a second line under a one-line name is just a gap.
        */}
        <h3 className="font-display text-ink-900 line-clamp-2 text-base leading-snug sm:text-lg">
          {item.name}
        </h3>

        {/*
          The gap above the button lives here as `mb-3`, not on the button itself. `mt-auto`
          eats any margin-top it is given, so the button cannot carry its own minimum gap — on
          the tallest card in a row there is no slack for `auto` to expand into and the button
          would sit hard against the price.
        */}
        <p className="text-ink-800 mt-1.5 mb-3 text-base font-semibold tabular-nums sm:text-lg">
          {formatPaise(item.pricePaise)}
        </p>

        {/*
          Buy now, straight to the order form — the card's second and only other action.

          SQUARE ON PURPOSE. Every other button on the site is `rounded-full`; this one is
          explicitly `rounded-none` because the section was asked for flat. It is written out
          rather than left off so that the next person to touch it can see the corner is a
          decision and not an omission.

          `mt-auto` is what lines the buttons up across a row: it eats whatever slack the cell
          has, so a card with a one-line name and one with a two-line name still put their
          buttons on the same baseline.

          The label is two words; the accessible name carries the product, because a screen
          reader can pull a link out of its surrounding card and "Buy now" alone names nothing.
        */}
        <Link
          href={`${href}/book`}
          aria-label={`Buy ${item.name}, ${formatPaise(item.pricePaise)}`}
          className="bg-ink-900 hover:bg-primary-700 mt-auto flex min-h-11 items-center justify-center rounded-none px-4 text-xs font-semibold tracking-[0.08em] text-white uppercase transition-colors sm:text-sm"
        >
          Buy now
        </Link>
      </figcaption>
    </figure>
  )
}

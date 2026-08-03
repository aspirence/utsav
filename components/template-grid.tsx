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
     * `items-start` so a two-line name does not stretch its neighbour's cell; each caption sits
     * under its own phone.
     */
    <ul className="grid grid-cols-2 items-start gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
      {shown.map((item) => (
        <li key={item.slug}>
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
    <figure className="group">
      {/*
        The whole phone is the link. Somebody who wants to see a template taps its picture;
        making them find a small button underneath is a worse version of the same journey.

        `block` so the anchor is the size of what it contains — an inline anchor around a block
        child gives a hit area the height of a line of text, which is the classic version of
        "the picture is not clickable on my phone".
      */}
      <Link href={href} className="block" aria-label={`${item.name}, ${formatPaise(item.pricePaise)}`}>
        <TemplatePhone item={item} className="mx-auto w-full max-w-[200px]" />
      </Link>

      <figcaption className="mt-3 text-center sm:mt-5">
        {item.tags.length > 0 && (
          /*
            Tracking steps down with the size. Letter-spacing is a proportion of the type size
            and does not survive being shrunk without being retuned — at 0.16em a three-tag row
            wrapped to three lines in a 170px column.
          */
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-700/80 sm:text-[11px] sm:tracking-[0.16em]">
            {item.tags.map((tag, i) => (
              <span key={tag}>
                {i > 0 && <span aria-hidden="true"> &middot; </span>}
                {tag}
              </span>
            ))}
          </p>
        )}

        {/*
          The reserved height keeps the price rows aligned across a row as names wrap to
          different depths. It shrinks with the type, or it reserves room for a third line that
          can no longer occur.
        */}
        <h3 className="mt-1.5 line-clamp-2 min-h-[2.75rem] font-display text-base leading-snug text-ink-900 sm:mt-2 sm:min-h-[3.5rem] sm:text-xl">
          {item.name}
        </h3>

        {/*
          The price, plain.

          There was a hover flip here that turned it into an "Order now" button. It is gone with
          the carousel: hover does not exist on the surface this section is mostly read on, and
          the whole card is already a link to a page whose primary action is ordering. One
          decision, one target.
        */}
        <p className="mt-2 text-base tabular-nums text-ink-800 sm:text-lg">
          {formatPaise(item.pricePaise)}
        </p>
      </figcaption>
    </figure>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'

import { Container, SectionHeading, cn } from '@/components/ui'

import { TemplateGrid } from '@/components/template-grid'
import { getLiveInvitationTemplates } from '@/lib/invitation-templates'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Every invitation template. Plan §2 counts the storefront as a revenue line; this is its index.
 *
 * WHY THIS PAGE DID NOT EXIST UNTIL NOW, which is worth recording because it was a real hole.
 * The only routes were `/invitation` — the full-screen animated demo, deliberately outside the
 * (site) group and chrome-free — and `/invitations/[slug]` for one template. So the complete
 * catalogue was reachable from precisely one place: a rotating carousel on the home page, which
 * showed four at a time. Anybody who wanted to compare the range had nowhere to do it, and
 * nothing on the site could link to "all invitations" because there was no such URL.
 *
 * `revalidate = 3600` matching /stories. Templates are national storefront copy edited by staff
 * in the console, not per-request data; an hour-old price on a listing is fine and a
 * per-request render of eight phones is not.
 */
export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Digital wedding invitations',
  description:
    'Animated digital wedding invitations, each one a blank canvas for your own names, dates ' +
    'and traditions. Pick a design, add your details, and share one link with every guest.',
  alternates: { canonical: '/invitations' },
  openGraph: { title: 'Digital wedding invitations on Fremmo', type: 'website' },
}

export default async function InvitationsPage({ searchParams }: Props) {
  const params = await searchParams
  const activeTag = typeof params.tag === 'string' ? params.tag : undefined

  const templates = await getLiveInvitationTemplates()

  /*
   * Tags come from the templates themselves rather than a fixed list.
   *
   * Staff add a tag in the console and it appears here; a hardcoded set would silently drop
   * whatever they invented. Sorted so the row does not reshuffle when a template is edited.
   */
  const tags = [...new Set(templates.flatMap((template) => template.tags))].sort((a, b) =>
    a.localeCompare(b),
  )

  const shown = activeTag
    ? templates.filter((template) => template.tags.includes(activeTag))
    : templates

  return (
    <Container className="py-12 sm:py-16">
      <SectionHeading
        eyebrow="Digital invitations"
        title="Every invitation, in one place"
        description="Hand-crafted templates, each one a blank canvas for your own names, dates and traditions. Tap any card to see it running on a phone."
      />

      {tags.length > 0 && (
        /*
         * Filters as links, not a client component.
         *
         * Each one is a plain href carrying `?tag=`, so the page stays a Server Component, the
         * filtered view is shareable and crawlable, and back does what it should. A useState
         * filter would ship JavaScript to do worse.
         *
         * `scroll-rail` with momentum: on a phone this row runs past the edge, and a filter
         * strip that scrolls without inertia is the most obvious tell that something is a web
         * page rather than an app.
         */
        <nav aria-label="Filter by style" className="scroll-rail mt-8 -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <FilterPill href="/invitations" label="All" active={!activeTag} />
          {tags.map((tag) => (
            <FilterPill
              key={tag}
              href={`/invitations?tag=${encodeURIComponent(tag)}`}
              label={tag}
              active={activeTag === tag}
            />
          ))}
        </nav>
      )}

      <div className="mt-10">
        {shown.length > 0 ? (
          <TemplateGrid items={shown} />
        ) : (
          /*
           * Only reachable by a hand-typed or stale `?tag=`, since every pill above comes from
           * the live set. It names the tag and offers the way back rather than showing an empty
           * grid, which reads as a broken page.
           */
          <div className="rounded-xl border border-ink-200 bg-white px-6 py-12 text-center">
            <p className="text-ink-700">
              No invitations tagged &ldquo;{activeTag}&rdquo; just yet.
            </p>
            <Link
              href="/invitations"
              className="mt-3 inline-block text-sm font-medium text-primary-700 underline-offset-4 hover:underline"
            >
              See all invitations
            </Link>
          </div>
        )}
      </div>
    </Container>
  )
}

function FilterPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      // min-h-9 keeps the pill past a thumb-sized target on a phone; `shrink-0` stops the row
      // squeezing them into unreadable slivers instead of scrolling.
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors',
        active
          ? 'bg-ink-900 text-white'
          : 'bg-white text-ink-700 ring-1 ring-ink-200 hover:text-ink-950',
      )}
    >
      {label}
    </Link>
  )
}

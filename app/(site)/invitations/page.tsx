import type { Metadata } from 'next'
import Link from 'next/link'

import { Container, SectionHeading } from '@/components/ui'

import { InvitationFilters } from '@/components/invitation-filters'
import { TemplateGrid } from '@/components/template-grid'
import { getLiveInvitationTemplates } from '@/lib/invitation-templates'
import { whatsappHref } from '@/lib/whatsapp'

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
      {/*
        Heading and filter trigger on one row, which is the whole reason the pill row moved into
        a dialog — see components/invitation-filters.tsx. `items-end` sits the control on the
        heading's baseline block rather than floating it level with the eyebrow, and the whole
        row stacks on a phone, where a 44px control beside a three-line heading would squeeze
        the title into a column.
      */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading
          eyebrow="Digital invitations"
          title="Every invitation, in one place"
          description="Hand-crafted templates, each one a blank canvas for your own names, dates and traditions. Tap any card to see it running on a phone."
        />

        {tags.length > 0 && (
          <InvitationFilters
            tags={tags}
            {...(activeTag ? { activeTag } : {})}
            customHref={whatsappHref(
              'Hi Fremmo — I would like a custom digital invitation design.',
            )}
          />
        )}
      </div>

      <div className="mt-10">
        {shown.length > 0 ? (
          <TemplateGrid items={shown} />
        ) : (
          /*
           * Only reachable by a hand-typed or stale `?tag=`, since every pill above comes from
           * the live set. It names the tag and offers the way back rather than showing an empty
           * grid, which reads as a broken page.
           */
          <div className="border-ink-200 rounded-xl border bg-white px-6 py-12 text-center">
            <p className="text-ink-700">
              No invitations tagged &ldquo;{activeTag}&rdquo; just yet.
            </p>
            <Link
              href="/invitations"
              className="text-primary-700 mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline"
            >
              See all invitations
            </Link>
          </div>
        )}
      </div>
    </Container>
  )
}

/*
 * FilterPill moved into components/invitation-filters.tsx with the row it belonged to. It is
 * not exported from there and has no other caller — the home page never had filters.
 */

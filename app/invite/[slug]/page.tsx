import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getPublishedCard } from '@/lib/invitation-card'

import { CardExperience } from './card-experience'

/**
 * A published invitation, at its own unlisted link.
 *
 * OUTSIDE app/(site) ON PURPOSE, AND THIS IS THE LOAD-BEARING DECISION ON THE PAGE. The site
 * layout renders a header that reads the session, which touches `cookies()`, which bails the
 * whole subtree out of static serving — measured on 2026-08-01, a production build prerenders 416
 * pages and then re-renders every one of them per request. A wedding invitation opened from a
 * WhatsApp group is the single most cache-friendly page this product has; putting it under that
 * layout would throw the cache away and hand every guest a marketplace navigation bar they did
 * not ask for.
 *
 * So: no header, no footer, no session, nothing that reads a cookie anywhere in this tree. If
 * that ever has to change, the session has to be hydrated in the browser instead — the trade-off
 * is written up in components/header-account-link.tsx.
 *
 * THE WORDING IS SERVER-RENDERED AS REAL HTML. The 3D scene is roughly 150 KB of JavaScript
 * before its assets, and this link is opened on a phone on mobile data, often from a chat app's
 * in-app browser. Names, date and venue are in the document before any of that arrives, so the
 * invitation is readable — and legible to a screen reader, and to a link preview — whether or not
 * WebGL ever starts. See ./card-experience.tsx for that boundary.
 *
 * noindex: an unlisted link is not a search result. The slug carries six random characters
 * precisely so the card is not enumerable, and letting a crawler publish it would undo that.
 */

export const revalidate = 3600

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const card = await getPublishedCard(slug)

  if (!card) return { title: 'Invitation', robots: { index: false, follow: false } }

  const couple = `${card.content.groom.name} & ${card.content.bride.name}`

  return {
    title: `${couple} — you are invited`,
    description: `${card.content.hosts} · ${card.content.date}`,
    // The link is shared, so the preview card matters more than usual. No image yet: the scene
    // renders in a browser, and a poster would have to be generated per card.
    openGraph: { title: couple, description: card.content.date, type: 'website' },
    robots: { index: false, follow: false },
  }
}

export default async function InvitePage({ params }: PageProps) {
  const { slug } = await params
  const card = await getPublishedCard(slug)

  // Unpublished, unknown, or content that no longer parses — all one answer. Distinguishing them
  // would tell somebody probing slugs which of their guesses exist.
  if (!card) notFound()

  return <CardExperience card={card} />
}

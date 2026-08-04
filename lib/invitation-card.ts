import 'server-only'

import { z } from 'zod'

import type { InvitationCardContent } from '@/components/invitation-3d/content'

import { getPublicReadClient } from '@/lib/supabase'

/**
 * The card's content: its shape, its validation, and how a published one is read.
 *
 * ZOD, NOT JSON SCHEMA, AND THE REASON MATTERS. docs/invitation-platform-review.md argues that
 * per-template content should be validated by stored JSON Schema, because a schema that lives in
 * a `jsonb` column cannot be TypeScript. That argument is right and it does not apply yet: there
 * is one design, its shape is a TypeScript literal in this file, and nothing reads a schema out
 * of the database. Adding Ajv now would mean running two validation systems so that one of them
 * could validate a schema that is not stored anywhere — pure cost, and a departure from the
 * repository's "one zod-validated actions.ts per feature" convention for no benefit.
 *
 * The moment a second design needs a different shape, the schema has to move into
 * `template_versions` and this becomes JSON Schema. `card_content_version` exists so that
 * migration has something to pin against.
 *
 * WHY THE SHAPE IS THIS SHAPE. It mirrors the artwork, not a generic invitation. A north-Indian
 * card names the hosts, the occasion, each side with their parents, then when and where — see
 * components/invitation-3d/content.ts, which owns the rendering side of the same contract.
 */

/** Bumped when the shape changes in a way old rows do not satisfy. Pinned per order. */
export const CARD_CONTENT_VERSION = 1

/*
 * Lengths are the artwork's limits, not arbitrary. The wording sits in a
 * `w-[min(46vh,20rem)]` column at 1.55vh; past roughly these counts a line wraps into the
 * ornament rather than staying on the leaf. A longer name is not a validation failure in the
 * abstract — it is a card that renders wrong, which is worse than a rejected form.
 */
const line = (max: number) => z.string().trim().min(1).max(max)

export const cardContentSchema = z.object({
  hosts: line(64),
  invitationLine: line(64).default('request your gracious presence'),
  occasionLines: z.array(line(48)).min(1).max(2),
  groom: z.object({ name: line(24), parents: line(64).optional() }),
  joiner: line(12).default('with'),
  bride: z.object({ name: line(24), parents: line(64).optional() }),
  date: line(48),
  time: line(32),
  venueLines: z.array(line(40)).min(1).max(3),
})

/**
 * The parsed shape and the renderer's shape must stay the same thing.
 *
 * This assignment is the check. If either side drifts — a field added here, a field renamed
 * there — this stops compiling, which is the only moment anybody would notice before a card
 * rendered with a missing line.
 */
export type ParsedCardContent = z.infer<typeof cardContentSchema>
const _contractsAgree: InvitationCardContent = null as unknown as ParsedCardContent
void _contractsAgree

export interface PublishedCard {
  slug: string
  templateSlug: string
  templateName: string
  content: InvitationCardContent
  version: number
  publishedAt: string
}

/**
 * A published card, by its public slug.
 *
 * READS THE VIEW, NEVER THE TABLE. `public.invitation_cards` is the only object granted to `anon`
 * that reads invitation_orders, it carries no contact detail or amount, and its
 * `published_at is not null` clause is the authorization boundary rather than a filter — see the
 * migration and supabase/tests/09_invitation_cards.sql. Reading invitation_orders here instead
 * would work in development, where the caller is often signed in, and return nothing for the
 * guest the link was actually sent to.
 *
 * getPublicReadClient() rather than getServerClientOrNull(): a card is read by people with no
 * session at all, and the null-returning client reports "no database" during a prerender.
 *
 * The content is re-validated on the way out. It was validated on the way in, but the row may
 * predate a shape change, and rendering a card with a missing line is worse than saying the card
 * could not be loaded.
 */
export async function getPublishedCard(slug: string): Promise<PublishedCard | null> {
  const supabase = await getPublicReadClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('invitation_cards')
    .select(
      'public_slug, template_slug, template_name, card_content, card_content_version, published_at',
    )
    .eq('public_slug', slug)
    .maybeSingle()

  if (error || !data?.public_slug || !data.published_at) return null

  const parsed = cardContentSchema.safeParse(data.card_content)
  if (!parsed.success) return null

  return {
    slug: data.public_slug,
    templateSlug: data.template_slug,
    templateName: data.template_name,
    content: parsed.data,
    version: data.card_content_version ?? CARD_CONTENT_VERSION,
    publishedAt: data.published_at,
  }
}

/**
 * A public slug for a new card.
 *
 * Two readable words from the couple, then four random characters. The words are what makes the
 * link feel like theirs when it lands in a group chat; the suffix is what stops the next couple's
 * card being one guess away. Twelve characters minimum is enforced by the database.
 *
 * `crypto.randomUUID()` rather than Math.random(): the suffix is the only thing protecting an
 * unlisted card, and a predictable PRNG makes "unlisted" mean "sequential".
 */
export function cardSlug(groomName: string, brideName: string): string {
  const words = [groomName, brideName]
    .map((n) =>
      n
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 12),
    )
    .filter(Boolean)

  const stem = words.length ? words.join('-and-') : 'invitation'
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6)
  return `${stem}-${suffix}`
}

/**
 * What an invitation says, separated from how it looks.
 *
 * THE WORDING USED TO BE COMPILED INTO THE COMPONENT — one real family's names, in a literal
 * array in index.tsx. That made the scene a finished invitation rather than a template: there was
 * no seam at which somebody else's names could enter, so "personalise this design" meant editing
 * TypeScript and shipping a deploy.
 *
 * WHAT IS CONTENT AND WHAT IS DESIGN. Only the words are here. Type sizes, the gaps between
 * stanzas, the wipe timing and the class names stay in `linesFor` below, because they are the
 * artwork: they were measured off the film, and a customer who could set them would be able to
 * push type off the leaf. This is the same split the plan draws everywhere else — the thing the
 * customer owns is their own information, not the layout that carries it.
 *
 * THE SHAPE IS THIS ARTWORK'S SHAPE, NOT A GENERIC ONE. A north-Indian wedding card names the
 * hosts, then the occasion, then each side with their parents, then when and where. A generic
 * `{ names, date, venue }` would not render this card, and inventing a universal schema before a
 * second design exists would be guessing at what the second design needs.
 */

export interface InvitationCardContent {
  /** Who is inviting — grandparents, parents, or the couple themselves. */
  hosts: string
  /** "request your gracious presence" */
  invitationLine: string
  /** Two short lines naming the occasion and the couple's relation to the hosts. */
  occasionLines: readonly string[]
  groom: { name: string; parents?: string }
  /** The word between the two names. "with", "&", "weds". */
  joiner: string
  bride: { name: string; parents?: string }
  /** "on Monday, 1st May" — written the way it should read, not a machine date. */
  date: string
  /** "9:00 p.m. onwards" */
  time: string
  /** The venue, already broken where the line should break. */
  venueLines: readonly string[]
}

/**
 * The demo wording, kept verbatim.
 *
 * /invitation is the public showcase of the artwork and has no order behind it, so it needs
 * something to say. These are the words the scene was designed and timed against — the stanza
 * gaps below were tuned to these line lengths, so changing them changes the film.
 */
export const DEMO_CARD_CONTENT: InvitationCardContent = {
  hosts: 'Mrs. Ramilaben & Mr. Manoj Kumar',
  invitationLine: 'request your gracious presence',
  occasionLines: ['on the auspicious occasion of', 'the wedding of their grandson'],
  groom: { name: 'Dhanesh', parents: '(S/o. Mrs. Gita & Mr. Mahesh Kumar)' },
  joiner: 'with',
  bride: { name: 'Radha', parents: '(D/o. Mrs. Kailashben & Mr. Randhir Jariwala)' },
  date: 'on Monday, 1st May',
  time: '9:00 p.m. onwards',
  venueLines: ['SMC Party Plot,', 'Athwalines, Surat, India.'],
}

export interface CardLine {
  t: string
  cls?: string
  gap?: number
  hidden?: boolean
}

/**
 * The wording, laid out.
 *
 * Sizes are `vh` because the card is framed to height — tie them to width and the type drifts off
 * the leaf the moment the window stops being portrait.
 *
 * The parent lines are dropped rather than rendered empty when absent. An empty <p> still takes
 * its `gap`, so an omitted line would leave a hole where the eye expects the next name.
 *
 * The first entry is a hidden spacer that the animation's timing depends on; it was in the
 * original array and stays here so the phase table in scene.tsx keeps lining up.
 */
export function linesFor(content: InvitationCardContent): CardLine[] {
  const lines: CardLine[] = [
    { t: 'R&D', cls: 'font-display text-[7vh] leading-none text-[#2b2119]', hidden: true },

    { t: content.hosts, gap: 2.4 },
    { t: content.invitationLine },
    ...content.occasionLines.map((t) => ({ t })),

    { t: content.groom.name, cls: NAME, gap: 2.4 },
  ]

  if (content.groom.parents) lines.push({ t: content.groom.parents, cls: PARENTS })
  lines.push({ t: content.joiner, gap: 1 })
  lines.push({ t: content.bride.name, cls: NAME, gap: 0.8 })
  if (content.bride.parents) lines.push({ t: content.bride.parents, cls: PARENTS })

  lines.push({ t: content.date, gap: 2.6 })
  lines.push({ t: content.time })
  lines.push({ t: 'at' })
  lines.push(...content.venueLines.map((t) => ({ t })))

  return lines
}

const NAME = 'font-display text-[2.6vh] italic leading-tight'
const PARENTS = 'text-[1.35vh] leading-snug'

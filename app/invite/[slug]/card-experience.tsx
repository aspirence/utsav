import type { PublishedCard } from '@/lib/invitation-card'

import { CardScene } from './card-scene'

/**
 * The invitation as HTML first, then as a scene.
 *
 * THE HTML IS NOT A FALLBACK, IT IS THE INVITATION. It is in the document on the first byte, it
 * is what a screen reader reads, it is what renders in a chat app that blocks WebGL, and it is
 * what somebody sees on a 3G connection while 150 KB of three.js is still in flight. The scene
 * layers over it once it is ready.
 *
 * THE LAZY BOUNDARY IS ALREADY INSIDE Invitation3D, which loads its three.js scene with
 * `dynamic(..., { ssr: false })` of its own. A second one here is not only redundant, it does not
 * compile — `ssr: false` is not allowed in a Server Component, and this file has to stay one so
 * the wording reaches the first byte. So CardScene is imported plainly: its wrapper renders on the
 * server, its canvas does not.
 *
 * ONE CANVAS, ONE ROUTE. Nothing else on this page mounts WebGL, and nothing on any other route
 * imports this file — plan §13 gates launch on LCP over 4G, and a marketing page has no business
 * paying for a renderer it never mounts.
 */

export function CardExperience({ card }: { card: PublishedCard }) {
  const { content } = card

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#2a1f16]">
      {/*
        The wording, in reading order, before anything else exists.

        `sr-only` rather than hidden: the scene draws the same words itself, so leaving two
        visible copies would be a duplicate. Screen readers, crawlers and a browser that never
        starts WebGL all still get this one — and `not-sr-only` on no-JS puts it back on screen.
      */}
      <article className="sr-only">
        <h1>
          {content.groom.name} &amp; {content.bride.name}
        </h1>
        <p>{content.hosts}</p>
        <p>{content.invitationLine}</p>
        {content.occasionLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {content.groom.parents && <p>{content.groom.parents}</p>}
        {content.bride.parents && <p>{content.bride.parents}</p>}
        <p>{content.date}</p>
        <p>{content.time}</p>
        <address>{content.venueLines.join(' ')}</address>
      </article>

      {/*
        The same wording again, visible only when JavaScript never runs. A card that renders as a
        black rectangle in a locked-down in-app browser is a card the couple finds out about from
        an aunt who could not open it.
      */}
      <noscript>
        <div className="relative z-10 mx-auto max-w-md px-6 py-16 text-center text-[#e8dcc9]">
          <p className="text-sm">{content.hosts}</p>
          <p className="mt-4 text-sm">{content.invitationLine}</p>
          <p className="font-display mt-8 text-3xl italic">{content.groom.name}</p>
          <p className="mt-2 text-sm">{content.joiner}</p>
          <p className="font-display mt-2 text-3xl italic">{content.bride.name}</p>
          <p className="mt-8 text-sm">{content.date}</p>
          <p className="text-sm">{content.time}</p>
          {content.venueLines.map((line) => (
            <p key={line} className="text-sm">
              {line}
            </p>
          ))}
        </div>
      </noscript>

      <CardScene content={content} />
    </main>
  )
}

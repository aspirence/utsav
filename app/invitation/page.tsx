import type { Metadata } from 'next'
import Link from 'next/link'

import { Invitation3D } from '@/components/invitation-3d'

/**
 * The animated invitation, on its own route.
 *
 * Deliberately outside the (site) route group, so it gets the bare document shell from the
 * root layout and none of the public chrome. A header and a footer around a full-screen
 * invitation would frame it as a page about invitations; without them it just *is* one,
 * which is the whole point of showing it.
 *
 * Two consequences worth stating:
 *
 *  · **Nothing on the marketing site pays for this.** three.js and the four texture
 *    layers are reached only by navigating here. Plan §13 gates launch on LCP over 4G, and
 *    the homepage's bundle is unchanged.
 *
 *  · **It is noindex.** This is a demonstration built on one couple's artwork, not a page
 *    that should turn up in search results for a real wedding.
 */
export const metadata: Metadata = {
  title: 'A wedding invitation',
  description: 'An animated wedding invitation - the doors open, the card rises.',
  robots: { index: false, follow: false },
}

export default function InvitationPage() {
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#2a1f16]">
      <Invitation3D />

      {/* The way back. Sits over the scene rather than above it, because the scene owns
          the whole viewport and there is no "above". */}
      <Link
        href="/"
        className="absolute left-4 top-4 z-10 rounded-full bg-[#2a1f16]/70 px-4 py-2 text-sm text-white/90 backdrop-blur-sm transition-colors hover:bg-[#2a1f16] hover:text-white"
      >
        &larr; Utsava
      </Link>
    </main>
  )
}

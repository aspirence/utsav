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

/**
 * The five textures the scene is built from, preloaded.
 *
 * WITHOUT THIS THE PAGE LOADS IN THREE SEQUENTIAL STEPS. The document arrives, the page
 * chunk mounts Invitation3D, that pulls in the three.js chunk — and only once that has
 * downloaded and executed does TextureLoader ask for the first image. So 533 KB of artwork
 * did not begin downloading until roughly 170 KB of JavaScript had finished, and the whole
 * time the viewer sat looking at a dark rectangle.
 *
 * A preload link in the document moves the images onto the first round trip, next to the
 * scripts rather than behind them. TextureLoader uses an Image under the hood, so `as=image`
 * is the same request the browser is already going to make and it comes straight out of the
 * cache when the scene finally asks.
 *
 * The order matters slightly: the stage is the backdrop and the doors are what the eye
 * actually watches move, so those three go first. Nothing renders until all five resolve —
 * the card at t=0 is doors-closed, and a stage with no doors on it is not a frame anybody
 * should see.
 *
 * fetchPriority high because this is the LCP of this route. There is nothing else on it.
 */
const SCENE_TEXTURES = [
  '/inv/stage.webp',
  '/inv/door-l.webp',
  '/inv/door-r.webp',
  '/inv/lotus.webp',
  '/inv/lights.webp',
] as const

/**
 * `?loop=1` replays the film instead of stopping on the finished card. Opt-in, because the
 * two audiences want opposite things: somebody reading the invitation should not have it
 * restart under them forever, while the phone frame on the home page has nothing to show but
 * a repeat and asks for one.
 *
 * THE FLAG IS READ IN THE BROWSER, NOT HERE. Taking it from searchParams would make this
 * route dynamic, and it is embedded eight times on the home page — that is eight server
 * renders of a page whose entire payload is static and whose work is all on the GPU. The
 * scene is a client component that has to mount before anything happens anyway, so reading
 * location.search there costs nothing and keeps this prerendered.
 */
export default function InvitationPage() {

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#2a1f16]">
      {SCENE_TEXTURES.map((href) => (
        <link key={href} rel="preload" as="image" href={href} fetchPriority="high" />
      ))}

      <Invitation3D />

      {/* The way back. Sits over the scene rather than above it, because the scene owns
          the whole viewport and there is no "above". */}
      <Link
        href="/"
        className="absolute left-4 top-4 z-10 rounded-full bg-[#2a1f16]/70 px-4 py-2 text-sm text-white/90 backdrop-blur-sm transition-colors hover:bg-[#2a1f16] hover:text-white"
      >
        &larr; Fremmo
      </Link>
    </main>
  )
}

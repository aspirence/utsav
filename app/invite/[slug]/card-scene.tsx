'use client'

import { Invitation3D } from '@/components/invitation-3d'
import type { InvitationCardContent } from '@/components/invitation-3d/content'

/**
 * The client boundary, and nothing else.
 *
 * `Invitation3D` is a Client Component that carries its own `dynamic(..., { ssr: false })` around
 * the three.js scene, so the heavy bundle is already deferred one level down. This wrapper exists
 * so card-experience.tsx can stay a Server Component — importing a client component from a server
 * one is fine; declaring `ssr: false` inside one is not.
 *
 * The scene renders full-bleed behind the HTML, which is `sr-only` — so the words on screen are
 * the ones the scene draws, and the ones in the document are for everything that is not a screen.
 */
export function CardScene({ content }: { content: InvitationCardContent }) {
  return (
    <div className="absolute inset-0">
      <Invitation3D content={content} />
    </div>
  )
}

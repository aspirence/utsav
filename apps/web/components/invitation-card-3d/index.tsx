'use client'

import dynamic from 'next/dynamic'

/**
 * Loader for the 3D invitation.
 *
 * three.js is roughly 150 KB gzipped - more than the rest of this page's JavaScript put
 * together. Plan §13 gates launch on "LCP < 2.5 s on 4G mid-range Android", so it is
 * behind `dynamic(..., { ssr: false })`: it is never in the server render, never in the
 * initial bundle, and only fetched once React reaches this component. The scene itself
 * then waits for an IntersectionObserver before it plays.
 *
 * The placeholder is the night colour the scene opens on, so the swap is invisible rather
 * than a flash of empty page.
 */
const Scene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-2xl bg-[#0a1730]" aria-hidden="true" />,
})

export function InvitationCard3D() {
  return <Scene />
}

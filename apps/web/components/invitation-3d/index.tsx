'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

/**
 * The invitation experience: the three.js scene, plus the wording as real DOM over it.
 *
 * three.js is roughly 150 KB gzipped, which is why this whole thing lives on its own route
 * and is loaded with `dynamic(..., { ssr: false })`. Nothing here reaches any other page -
 * plan §13 gates launch on LCP over 4G, and a marketing page has no business paying for a
 * WebGL renderer it never mounts.
 *
 * The wording is DOM rather than a canvas texture on purpose. Text drawn into a texture is
 * resolution-locked and resampled by the GPU, so it goes soft at exactly the size someone
 * reads it - and on a wedding invitation the names are the one thing that has to be sharp.
 * It also means the card is selectable, searchable, and legible to a screen reader.
 */
const Scene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#2a1f16]" aria-hidden="true" />,
})

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function Invitation3D() {
  const [t, setT] = useState(0)

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#2a1f16]">
      <Scene onTime={setT} />
      <Wording t={t} />
    </div>
  )
}

function Wording({ t }: { t: number }) {
  /** Fade up, staggered off the same clock the scene runs on. */
  const at = (start: number, len = 0.7) => {
    const p = clamp01((t - start) / len)
    return { opacity: p, transform: `translateY(${(1 - p) * 12}px)` }
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {/* Sized as a share of the viewport height, because the card is framed to height -
          tie it to width and it drifts off the leaf the moment the window is not portrait. */}
      <div
        className="w-[min(46vh,20rem)] text-center text-[#3a2f24]"
        style={{ marginTop: '2vh' }}
      >
        <p
          aria-hidden="true"
          className="font-display text-[7vh] leading-none text-[#2b2119]"
          style={at(6.2)}
        >
          R<span className="mx-[-0.18em] align-baseline">&amp;</span>D
        </p>

        <p className="mt-[3vh] text-[1.55vh] leading-[1.9]" style={at(7.0)}>
          Mrs. Ramilaben &amp; Mr. Manoj Kumar
          <br />
          request your gracious presence
          <br />
          on the auspicious occasion of
          <br />
          the wedding of their grandson
        </p>

        <p className="mt-[2.4vh] font-display text-[2.6vh] italic leading-tight" style={at(7.8)}>
          Dhanesh
        </p>
        <p className="text-[1.35vh] leading-snug" style={at(7.8)}>
          (S/o. Mrs. Gita &amp; Mr. Mahesh Kumar)
        </p>
        <p className="mt-[1vh] text-[1.4vh]" style={at(8.2)}>
          with
        </p>
        <p className="mt-[0.6vh] font-display text-[2.6vh] italic leading-tight" style={at(8.6)}>
          Radha
        </p>
        <p className="text-[1.35vh] leading-snug" style={at(8.6)}>
          (D/o. Mrs. Kailashben &amp; Mr. Randhir Jariwala)
        </p>

        <p className="mt-[2.6vh] text-[1.55vh] leading-[1.9]" style={at(9.4)}>
          on Monday, 1st May
          <br />
          9:00 p.m. onwards
          <br />
          at
          <br />
          SMC Party Plot,
          <br />
          Athwalines, Surat, India.
        </p>
      </div>
    </div>
  )
}

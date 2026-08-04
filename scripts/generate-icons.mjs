#!/usr/bin/env node
/**
 * Render every raster the brand mark ships as, from one copy of its geometry.
 *
 *   node scripts/generate-icons.mjs
 *
 * Commit the generated files — CI does not run this.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The mark lives in components/brand-mark.tsx as inline SVG, which covers every use inside
 * the React tree. Three things sit outside it and can only be raster: the two PWA icons, the
 * maskable icon, and the iOS touch icon. Hand-exporting those from a drawing tool is how a
 * favicon ends up one revision behind the site for a year, so they are generated from the
 * same six paths instead.
 *
 * PATHS below is the one duplicate. It has to be, because a .mjs script cannot import a .tsx
 * component — but it is a literal copy, so a diff shows immediately when the two drift.
 * Change the mark, paste the new paths here, re-run.
 */

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// sharp ships as a Next.js dependency; pnpm's strict layout means it is not hoisted.
function loadSharp() {
  try {
    return require('sharp')
  } catch {
    const store = path.join(root, 'node_modules', '.pnpm')
    const entries = fs.existsSync(store) ? fs.readdirSync(store) : []
    const dir = entries.find((d) => d.startsWith('sharp@'))
    if (!dir) throw new Error('sharp not found — run `pnpm install` first')
    return require(path.join(store, dir, 'node_modules', 'sharp'))
  }
}

const sharp = loadSharp()
const OUT = path.join(root, 'public')

/** The six iris blades. Verbatim from components/brand-mark.tsx — keep them identical. */
const PATHS = [
  'M 27.27 19 L 55.66 19 C 54.24 14.36 51.83 10.28 48.8 7.14 C 44.75 5.5 40.07 4.79 35.24 5.19 Z',
  'M 40.89 21.4 L 55.09 45.99 C 58.39 42.44 60.72 38.31 61.93 34.12 C 61.32 29.8 59.6 25.38 56.83 21.4 Z',
  'M 45.63 34.4 L 31.43 58.99 C 36.15 60.08 40.89 60.03 45.13 58.98 C 48.57 56.29 51.53 52.59 53.6 48.21 Z',
  'M 36.73 45 L 8.34 45 C 9.76 49.64 12.17 53.72 15.2 56.86 C 19.25 58.5 23.93 59.21 28.76 58.81 Z',
  'M 23.11 42.6 L 8.91 18.01 C 5.61 21.56 3.28 25.69 2.07 29.88 C 2.68 34.2 4.4 38.62 7.17 42.6 Z',
  'M 18.37 29.6 L 32.57 5.01 C 27.85 3.92 23.11 3.97 18.87 5.02 C 15.43 7.71 12.47 11.41 10.4 15.79 Z',
]

/** The canvas colour from components/ui/styles.css, for the icons that cannot be transparent. */
const CANVAS = '#fffcf9'

/** `pad` insets the art inside the 64 box, in viewBox units — the maskable safe zone. */
function svg({ pad = 0, mono = false } = {}) {
  const paint = mono ? '#ffffff' : 'url(#fremmo-mark-gradient)'
  const scale = (64 - 2 * pad) / 64
  const defs = mono
    ? ''
    : `<defs>
    <linearGradient id="fremmo-mark-gradient" x1="10" y1="4" x2="54" y2="60" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f5c455"/>
      <stop offset=".45" stop-color="#de8a21"/>
      <stop offset="1" stop-color="#b3402b"/>
    </linearGradient>
  </defs>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">${defs}
  <g transform="translate(${pad} ${pad}) scale(${scale})" fill="${paint}" stroke="${paint}" stroke-width="1.6" stroke-linejoin="round">
${PATHS.map((d) => `    <path d="${d}"/>`).join('\n')}
  </g>
</svg>
`
}

/** Density is high so the rasteriser supersamples before the resize — the blade tips alias badly otherwise. */
const render = (source, size, background) => {
  const pipe = sharp(Buffer.from(source), { density: 2400 }).resize(size, size)
  return background ? pipe.flatten({ background }) : pipe
}

const written = []
const note = (file) => written.push(path.relative(root, file))

// The canonical vector, for anything outside the React tree: email, OG art, a partner deck.
fs.writeFileSync(path.join(OUT, 'logo-mark.svg'), svg())
note(path.join(OUT, 'logo-mark.svg'))

// purpose:'any' — transparent, drawn to the edges, used wherever nothing masks it.
for (const size of [192, 512]) {
  await render(svg(), size).png().toFile(path.join(OUT, `icon-${size}.png`))
  note(path.join(OUT, `icon-${size}.png`))
}

// purpose:'maskable' — Android crops ~20% off every edge, so the mark sits in the middle 60%.
// Flattened, not transparent: the mark is six separated blades around an open centre, so a
// launcher's own background would otherwise show through the gaps and read as part of the art.
await render(svg({ pad: 13 }), 512, CANVAS).png().toFile(path.join(OUT, 'icon-maskable-512.png'))
note(path.join(OUT, 'icon-maskable-512.png'))

// iOS composites a touch icon onto black wherever it finds alpha, so this one is flattened too.
await render(svg({ pad: 5 }), 180, CANVAS).png().toFile(path.join(OUT, 'apple-touch-icon.png'))
note(path.join(OUT, 'apple-touch-icon.png'))

// Kept only for anything still pointing at the old /logo-mark.webp URL.
await render(svg(), 384).webp({ quality: 92 }).toFile(path.join(OUT, 'logo-mark.webp'))
note(path.join(OUT, 'logo-mark.webp'))

console.log(written.map((f) => `  ${f}`).join('\n'))

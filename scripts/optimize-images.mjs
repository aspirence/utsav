#!/usr/bin/env node
/**
 * Pre-build responsive image variants from design/source-images/.
 *
 * Plan §12 turns the Vercel image optimizer off (`images.unoptimized`) so media cost
 * stays flat at SEO scale — vendor media goes through Supabase's CDN transforms instead.
 * Static design assets like the hero have no Supabase object behind them, so they are
 * optimised here at commit time and served straight from public/.
 *
 * Plan §13 is why it matters: the hero is the LCP element on the homepage, and the gate
 * is "LCP < 2.5 s on 4G mid-range Android".
 *
 *   node scripts/optimize-images.mjs
 *
 * Commit the generated .webp files — CI does not run this.
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
    const dir = fs.readdirSync(store).find((d) => d.startsWith('sharp@'))
    if (!dir) throw new Error('sharp not found — run `pnpm install` first')
    return require(path.join(store, dir, 'node_modules', 'sharp'))
  }
}

const SOURCE_DIR = path.join(root, 'design', 'source-images')
const OUT_DIR = path.join(root, 'apps', 'web', 'public')

/** Widths chosen to match the `sizes="100vw"` breakpoints in the consuming component. */
const WIDTHS = [
  { w: 768, quality: 76 },
  { w: 1280, quality: 74 },
  { w: 1920, quality: 72 },
]

const sharp = loadSharp()

const sources = fs
  .readdirSync(SOURCE_DIR)
  .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))

if (sources.length === 0) {
  console.log('No source images in design/source-images/')
  process.exit(0)
}

for (const file of sources) {
  const src = path.join(SOURCE_DIR, file)
  const base = file.replace(/\.[^.]+$/, '')
  const meta = await sharp(src).metadata()
  const before = fs.statSync(src).size

  console.log(`\n${file} — ${meta.width}×${meta.height}, ${(before / 1024).toFixed(0)} KB`)

  for (const { w, quality } of WIDTHS) {
    if (meta.width && w > meta.width * 1.5) continue // no point upscaling
    const out = path.join(OUT_DIR, `${base}-${w}.webp`)
    await sharp(src)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toFile(out)
    const kb = fs.statSync(out).size / 1024
    console.log(`  ${base}-${w}.webp`.padEnd(34) + `${kb.toFixed(0)} KB`)
  }

  // Inline blur placeholder — paste into the component that renders this image.
  const blur = await sharp(src).resize({ width: 24 }).blur(1.2).webp({ quality: 40 }).toBuffer()
  console.log(`  blur data URI (${blur.length} bytes):`)
  console.log(`  data:image/webp;base64,${blur.toString('base64')}`)
}

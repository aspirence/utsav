/**
 * Every surface in the 3D invitation is drawn here with Canvas2D, at load time, and handed
 * to three.js as a texture. Nothing is fetched.
 *
 * That is a deliberate trade. The reference film is bespoke Mughal illustration - jaali
 * screens, floral butas, a lotus border - and there is no version of that we can ship as
 * an image without an artist drawing it first. What *can* be reproduced faithfully is the
 * geometry and the choreography: a cusped arch, two doors on hinges, a starlit dome behind
 * them, a card that rises through the opening. So the ornament here is generated - real
 * Mughal construction (cusped arches, repeating butas, a scalloped border), in the Utsava
 * palette rather than a traced copy of someone else's artwork.
 *
 * Everything is drawn once and cached. A texture regenerated per frame would be the single
 * most expensive thing on the page.
 */

/** Palette sampled from the reference film, mapped onto the Utsava tokens it matches. */
export const PAL = {
  door: '#6b5a3a',
  doorDeep: '#4a3d27',
  doorLight: '#8c7a52',
  panel: '#b09a79',
  panelDeep: '#8a7355',
  maroon: '#7b2c22',
  olive: '#5e6b3a',
  gold: '#c9a227',
  goldLight: '#f5d98a',
  night: '#132a4d',
  nightDeep: '#0a1730',
  card: '#c3ac89',
  cardDeep: '#a8916d',
  ink: '#2c2721',
  lotus: '#e8a0a8',
  leaf: '#7fa090',
} as const

function make(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const x = c.getContext('2d')
  if (!x) throw new Error('2D canvas is unavailable')
  return { c, x }
}

/**
 * A cusped (multifoil) arch - the shape over every Mughal doorway.
 *
 * Built as a real path rather than an image so the doors, the card and the backdrop all
 * share one silhouette: `lobes` scallops swept across the top, then straight jambs down.
 */
export function archPath(
  x: CanvasRenderingContext2D,
  w: number,
  h: number,
  springLine: number,
  lobes = 9,
) {
  const r = w / (2 * lobes)
  x.beginPath()
  x.moveTo(0, h)
  x.lineTo(0, springLine)

  // Sweep the scallops left to right along a shallow ellipse.
  for (let i = 0; i < lobes; i++) {
    const cx = r + i * 2 * r
    // Middle lobes ride higher, so the arch peaks in the centre.
    const lift = Math.sin((i + 0.5) / lobes * Math.PI) ** 0.7
    const cy = springLine - lift * springLine * 0.82
    x.quadraticCurveTo(cx - r * 0.2, cy, cx, cy)
    x.quadraticCurveTo(cx + r * 0.2, cy, cx + r, springLine - lift * springLine * 0.6)
  }

  x.lineTo(w, h)
  x.closePath()
}

/** A buta - the almond-shaped floral motif that repeats across Mughal panels. */
function buta(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string) {
  x.save()
  x.translate(cx, cy)
  x.fillStyle = fill
  x.beginPath()
  x.moveTo(0, -s)
  x.bezierCurveTo(s * 0.75, -s * 0.5, s * 0.6, s * 0.55, 0, s)
  x.bezierCurveTo(-s * 0.6, s * 0.55, -s * 0.75, -s * 0.5, 0, -s)
  x.fill()

  // Five petals around the middle, then a stem.
  x.fillStyle = PAL.goldLight
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    x.beginPath()
    x.ellipse(Math.cos(a) * s * 0.28, Math.sin(a) * s * 0.28 - s * 0.1, s * 0.16, s * 0.1, a, 0, Math.PI * 2)
    x.fill()
  }
  x.strokeStyle = PAL.olive
  x.lineWidth = Math.max(1, s * 0.07)
  x.beginPath()
  x.moveTo(0, s * 0.25)
  x.lineTo(0, s * 0.9)
  x.stroke()
  x.restore()
}

/** A row of lotus blooms - the border that runs along the foot of the reference frame. */
function lotusRow(x: CanvasRenderingContext2D, w: number, y: number, scale: number) {
  const step = 46 * scale
  for (let cx = -step / 2; cx < w + step; cx += step) {
    // Leaves behind.
    x.fillStyle = PAL.leaf
    for (const d of [-1, 1]) {
      x.beginPath()
      x.ellipse(cx + d * 17 * scale, y + 4 * scale, 15 * scale, 7 * scale, d * 0.5, 0, Math.PI * 2)
      x.fill()
    }
    // Petals.
    for (let i = -3; i <= 3; i++) {
      const t = i / 3
      x.fillStyle = i === 0 ? '#f4c2c6' : PAL.lotus
      x.beginPath()
      x.ellipse(
        cx + t * 11 * scale,
        y - 5 * scale - (1 - Math.abs(t)) * 7 * scale,
        5.5 * scale,
        13 * scale - Math.abs(t) * 4 * scale,
        t * 0.55,
        0,
        Math.PI * 2,
      )
      x.fill()
    }
  }
}

/**
 * One door leaf. `side` decides which way the hinge stile sits, so the pair reads as a
 * mirrored set rather than the same texture twice.
 */
export function doorTexture(side: 'left' | 'right', w = 512, h = 1024) {
  const { c, x } = make(w, h)

  // Ground and its jaali weave.
  x.fillStyle = PAL.door
  x.fillRect(0, 0, w, h)
  x.strokeStyle = 'rgba(255,255,255,0.05)'
  x.lineWidth = 1
  for (let yy = 0; yy < h; yy += 14) {
    for (let xx = 0; xx < w; xx += 14) {
      x.beginPath()
      x.arc(xx + (yy / 14 % 2 ? 7 : 0), yy, 8, Math.PI, 0)
      x.stroke()
    }
  }

  // Two stacked recessed panels, each under its own cusped arch.
  const inset = w * 0.11
  const panels: [number, number][] = [
    [h * 0.06, h * 0.42],
    [h * 0.52, h * 0.40],
  ]
  for (const [top, ph] of panels) {
    x.save()
    x.translate(inset, top)
    const pw = w - inset * 2

    x.fillStyle = PAL.olive
    archPath(x, pw, ph, ph * 0.34)
    x.fill()

    x.save()
    x.translate(pw * 0.05, ph * 0.05)
    x.fillStyle = PAL.panel
    archPath(x, pw * 0.9, ph * 0.9, ph * 0.31)
    x.fill()

    // Butas on a staggered grid, clipped to the arch.
    x.clip()
    for (let r = 0; r < 5; r++) {
      for (let cc = 0; cc < 3; cc++) {
        buta(
          x,
          pw * 0.9 * ((cc + (r % 2 ? 0.85 : 0.35)) / 3),
          ph * 0.9 * (0.16 + r * 0.19),
          pw * 0.075,
          PAL.maroon,
        )
      }
    }
    x.restore()

    // Gold keyline around the arch.
    x.strokeStyle = PAL.gold
    x.lineWidth = 3
    archPath(x, pw, ph, ph * 0.34)
    x.stroke()
    x.restore()
  }

  // Hinge stile: a darker band down the outer edge, so an open door still reads as a door.
  const stile = w * 0.06
  const grad = x.createLinearGradient(side === 'left' ? 0 : w - stile, 0, side === 'left' ? stile : w, 0)
  grad.addColorStop(0, PAL.doorDeep)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  x.fillStyle = grad
  x.fillRect(side === 'left' ? 0 : w - stile, 0, stile, h)

  // Meeting stile, gold, down the edge the two leaves close against.
  x.fillStyle = PAL.gold
  x.fillRect(side === 'left' ? w - 6 : 0, 0, 6, h)

  return c
}

/** What is behind the doors: a starlit dome over a lit palace facade. */
export function backdropTexture(w = 1024, h = 1024) {
  const { c, x } = make(w, h)

  const sky = x.createLinearGradient(0, 0, 0, h * 0.55)
  sky.addColorStop(0, PAL.nightDeep)
  sky.addColorStop(1, PAL.night)
  x.fillStyle = sky
  x.fillRect(0, 0, w, h)

  // Stars. Deterministic - a random field would differ between renders and flicker on a
  // texture that is meant to be generated once.
  for (let i = 0; i < 260; i++) {
    const sx = (i * 97.13) % w
    const sy = ((i * 61.7) % (h * 0.5))
    const a = 0.25 + ((i * 13) % 60) / 100
    x.fillStyle = `rgba(255,246,214,${a})`
    x.beginPath()
    x.arc(sx, sy, ((i * 7) % 3) * 0.4 + 0.5, 0, Math.PI * 2)
    x.fill()
  }

  // Facade.
  x.fillStyle = '#d8c39c'
  x.fillRect(w * 0.08, h * 0.44, w * 0.84, h * 0.56)
  x.fillStyle = '#c2a87e'
  x.fillRect(w * 0.08, h * 0.44, w * 0.84, h * 0.03)

  // Three storeys of arcading.
  for (let row = 0; row < 3; row++) {
    const top = h * (0.50 + row * 0.16)
    const ah = h * 0.13
    for (let i = 0; i < 7; i++) {
      const aw = w * 0.1
      x.save()
      x.translate(w * 0.11 + i * (w * 0.11), top)
      x.fillStyle = row === 1 && i === 3 ? '#8a6a3f' : '#b9975f'
      archPath(x, aw, ah, ah * 0.45, 3)
      x.fill()
      x.restore()
    }
  }

  // The lamp strings that outline every edge in the reference.
  x.fillStyle = '#fff3cf'
  for (let i = 0; i < 90; i++) {
    x.beginPath()
    x.arc(w * 0.09 + (i / 90) * w * 0.82, h * 0.465, 2.6, 0, Math.PI * 2)
    x.fill()
  }

  lotusRow(x, w, h * 0.985, w / 512)
  return c
}

/** The invitation leaf that rises through the doorway. Type is HTML, not texture. */
export function cardTexture(w = 512, h = 1024) {
  const { c, x } = make(w, h)

  const g = x.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, PAL.card)
  g.addColorStop(1, PAL.cardDeep)
  x.fillStyle = g
  x.fillRect(0, 0, w, h)

  // Laid-paper tooth, so the leaf does not read as flat vector fill.
  for (let i = 0; i < 5000; i++) {
    const px = (i * 131.7) % w
    const py = (i * 79.3) % h
    x.fillStyle = `rgba(255,255,255,${((i * 17) % 10) / 220})`
    x.fillRect(px, py, 1, 1)
  }

  // Double gold rule, following the same cusped arch as everything else.
  x.save()
  x.translate(w * 0.07, h * 0.05)
  x.strokeStyle = PAL.gold
  x.lineWidth = 4
  archPath(x, w * 0.86, h * 0.9, h * 0.2, 7)
  x.stroke()
  x.strokeStyle = 'rgba(245,217,138,0.55)'
  x.lineWidth = 1.5
  x.translate(w * 0.02, h * 0.012)
  archPath(x, w * 0.82, h * 0.876, h * 0.19, 7)
  x.stroke()
  x.restore()

  return c
}

/**
 * The invitation leaf, drawn rather than lifted.
 *
 * Everything else in this scene is the reference artwork itself - the jaali, the butas,
 * the palace, the lotus - because hand-drawn Mughal ornament does not survive being
 * approximated. The leaf is the one exception, and for a good reason: it carries no
 * ornament at all. It is a flat tan silhouette with a double keyline, so a path draws it
 * exactly, and drawing it means the arch stays crisp at any size instead of being a
 * resampled crop.
 *
 * Colours sampled straight off the film: fill rgb(176,143,104), keyline rgb(211,173,136).
 *
 * The silhouette is an onion arch over straight jambs over a cusped trefoil foot - the
 * same profile the doorway behind it uses, which is what makes the leaf look like it
 * belongs in the arch rather than being pasted over it.
 */

export const CARD_FILL = '#b08f68'
export const CARD_RULE = '#d3ad88'
/** Source proportions, so the mesh and the texture cannot drift apart. */
export const CARD_ASPECT = 424 / 1170

function silhouette(x: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2
  // Fractions of the height, measured off the film.
  const apex = 0.0 // tip of the onion arch
  const shoulder = 0.20 // where the arch meets the jambs
  const foot = 0.80 // where the jambs meet the trefoil
  const toe = 1.0 // tip of the trefoil

  x.beginPath()
  x.moveTo(cx, apex * h)

  // Right half of the onion arch: a tight curve out of the tip, then a belly that
  // overshoots the jamb line before settling onto it.
  x.bezierCurveTo(cx + w * 0.18, h * 0.03, w, h * 0.09, w, shoulder * h)
  x.lineTo(w, foot * h)

  // Right lobe of the trefoil, then in to the toe.
  x.bezierCurveTo(w, h * 0.865, w * 0.80, h * 0.85, w * 0.78, h * 0.895)
  x.bezierCurveTo(w * 0.76, h * 0.95, cx + w * 0.06, h * 0.955, cx, toe * h)

  // Mirror back up the left side.
  x.bezierCurveTo(cx - w * 0.06, h * 0.955, w * 0.24, h * 0.95, w * 0.22, h * 0.895)
  x.bezierCurveTo(w * 0.20, h * 0.85, 0, h * 0.865, 0, foot * h)
  x.lineTo(0, shoulder * h)
  x.bezierCurveTo(0, h * 0.09, cx - w * 0.18, h * 0.03, cx, apex * h)
  x.closePath()
}

export function cardTexture(w = 848) {
  const h = Math.round(w / CARD_ASPECT)
  const c = document.createElement('canvas')
  // A margin, so the outer keyline is not clipped by the edge of the bitmap and the
  // alpha has somewhere to fall off.
  const pad = Math.round(w * 0.03)
  c.width = w + pad * 2
  c.height = h + pad * 2
  const x = c.getContext('2d')
  if (!x) throw new Error('2D canvas is unavailable')

  x.translate(pad, pad)

  // Body. A shallow gradient rather than flat fill - the film's leaf is lit slightly from
  // the top left, and a dead-flat tan reads as a cut-out.
  const g = x.createLinearGradient(0, 0, w * 0.6, h)
  g.addColorStop(0, '#bb9c74')
  g.addColorStop(0.55, CARD_FILL)
  g.addColorStop(1, '#a4855f')
  silhouette(x, w, h)
  x.fillStyle = g
  x.fill()

  // Paper tooth. Deterministic - a random field would differ between mounts and shimmer.
  x.save()
  silhouette(x, w, h)
  x.clip()
  for (let i = 0; i < 9000; i++) {
    const px = (i * 137.31) % w
    const py = (i * 89.77) % h
    x.fillStyle = `rgba(255,246,232,${((i * 23) % 12) / 260})`
    x.fillRect(px, py, 1, 1)
  }
  x.restore()

  // Double keyline, following the silhouette inset.
  x.strokeStyle = CARD_RULE
  x.lineWidth = Math.max(2, w * 0.006)
  silhouette(x, w, h)
  x.stroke()

  x.save()
  x.translate(w * 0.035, h * 0.014)
  x.scale(0.93, 0.972)
  x.strokeStyle = 'rgba(226,197,166,0.75)'
  x.lineWidth = Math.max(1, w * 0.0025)
  silhouette(x, w, h)
  x.stroke()
  x.restore()

  return c
}

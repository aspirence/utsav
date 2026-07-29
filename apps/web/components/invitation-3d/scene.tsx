'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { CARD_ASPECT, cardTexture } from './card-texture'

/**
 * The animated invitation, rebuilt in three.js from design/source-images/card1-reference.mp4.
 *
 * WHY THE TEXTURES ARE THE FILM. An earlier version of this drew every surface with
 * Canvas2D and it looked like flat blocks of colour - the reference is hand-drawn Mughal
 * illustration and none of it survives approximation. So the ornament here is the artwork
 * itself, cut out of the film frame by frame, and what three.js contributes is the part a
 * video cannot: real depth, and a card you can look around rather than watch.
 *
 * Five layers, back to front, each one rigid so it only ever has to be moved as a piece:
 *
 *   stage   z -2.6  frame at 4.2s. Palace, starlit dome, jaali border, steps.
 *   card    z -0.7  drawn, not lifted - see card-texture.ts.
 *   doors   z  0.0  frame at 0.2s, split down the middle, hinged at the outer edges.
 *   lotus   z  0.9  the bottom of the stage frame, hue-keyed, in front of everything.
 *   type    DOM     over the canvas, so the names stay crisp at reading size.
 *
 * The doors are children of empty Groups parked on the hinge line, offset by half their
 * own width. A mesh rotates about its own centre; a door rotates about its edge, and the
 * pivot is what turns one into the other. Baking the offset into the geometry would work
 * too, but then the mesh's own transform stops meaning anything.
 *
 * The film cuts the doors off above the flowers, and so does the texture: the leaves stop
 * at 79% of the frame height and the lotus layer covers the join, which is why the flowers
 * stay put while the doors swing.
 *
 * Playback is time-driven, not scroll-driven. It is a film - it should run at its own pace
 * once, not be scrubbed. Under prefers-reduced-motion it renders a single frame at the end
 * state and stops.
 */

const DUR = 12.0

/**
 * The beats, in seconds.
 *
 * There is no camera move. An earlier cut pushed the camera in as the doors opened and it
 * was wrong twice over: the frame the artwork was drawn for got cropped away, and the
 * doors stopped reading as doors because everything grew at once. The camera now sits at
 * the distance that fits the whole frame and stays there - the doors do the moving.
 *
 * `draw` is the leaf being revealed. Not a scale and not a slide - a diagonal wipe from
 * the top-left corner, the way a theatre curtain is drawn across rather than switched on.
 *
 * `lotusOut` clears the flowers off the bottom as the leaf arrives. It starts after the
 * wipe has begun, so the two overlap: the flowers are on their way down while the card is
 * still being drawn, which is what stops it reading as two separate events.
 */
const T = {
  doors: [1.2, 3.4],
  draw: [3.5, 5.6],
  lotusOut: [4.0, 6.0],
} as const

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const seg = (t: number, [a, b]: readonly [number, number]) => ease(clamp01((t - a) / (b - a)))

/** Source frame is 720x1280; the scene is laid out in those proportions at 1 unit = 160px. */
const FRAME_W = 4.5
const FRAME_H = FRAME_W * (1280 / 720)

export default function InvitationScene({ onTime }: { onTime: (t: number) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const tick = useRef(onTime)
  tick.current = onTime

  useEffect(() => {
    const el = host.current
    if (!el) return

    // Declared before the async body so the teardown below can always see it, whether or
    // not the textures ever finished loading.
    const cleanup: (() => void)[] = []
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#2a1f16')
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // Off by default; without it a material's own clippingPlanes are ignored entirely and
    // the curtain sweep silently does nothing.
    renderer.localClippingEnabled = true
    el.appendChild(renderer.domElement)
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' })

    let raf = 0
    let disposed = false
    const loader = new THREE.TextureLoader()

    const load = (url: string) =>
      new Promise<THREE.Texture>((res, rej) =>
        loader.load(
          url,
          (t) => {
            t.colorSpace = THREE.SRGBColorSpace
            t.anisotropy = renderer.capabilities.getMaxAnisotropy()
            res(t)
          },
          undefined,
          rej,
        ),
      )

    const plane = (w: number, h: number, map: THREE.Texture, transparent = false) =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map, transparent, side: THREE.DoubleSide }),
      )

    void (async () => {
      const [stageTex, dlTex, drTex, lotusTex] = await Promise.all([
        load('/inv/stage.webp'),
        load('/inv/door-l.webp'),
        load('/inv/door-r.webp'),
        load('/inv/lotus.webp'),
      ])
      if (disposed) return

      // ── Stage ─────────────────────────────────────────────────────────
      const stage = plane(FRAME_W, FRAME_H, stageTex)
      stage.position.z = -2.6
      // Slightly oversized, so the push-in never runs past its edges.
      stage.scale.setScalar(1.35)
      scene.add(stage)

      // ── Card ──────────────────────────────────────────────────────────
      /*
        Revealed by a clipping plane sweeping across it, not by scaling or sliding it in.

        A scale grows out of the corner and reads as a zoom; a slide reads as a card being
        pushed on from off-screen. A curtain does neither - it stays where it is and is
        uncovered. A single plane whose normal points along the diagonal does exactly that,
        and it costs one uniform per frame rather than a texture rebuild.

        The plane keeps the half-space where `normal · p + constant > 0`. With the normal
        pointing up-and-left, sweeping the constant from -REACH to +REACH uncovers the leaf
        from its top-left corner down to its bottom-right.
      */
      const cardTex = new THREE.CanvasTexture(cardTexture())
      cardTex.colorSpace = THREE.SRGBColorSpace
      cardTex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      const cardH = FRAME_H * 0.92
      const cardW = cardH * CARD_ASPECT * 1.06

      const SQ = Math.SQRT1_2
      const curtain = new THREE.Plane(new THREE.Vector3(-SQ, SQ, 0), 0)
      // Half the diagonal extent, projected onto the sweep direction.
      const REACH = SQ * (cardW / 2 + cardH / 2)

      const card = plane(cardW, cardH, cardTex, true)
      card.position.set(0, 0, -0.7)
      const cardMat = card.material as THREE.MeshBasicMaterial
      cardMat.clippingPlanes = [curtain]
      scene.add(card)

      // ── Doors ─────────────────────────────────────────────────────────
      // Full frame height. They used to stop above the flowers so the lotus layer could
      // stay put while they swung, but a door that ends two thirds of the way down does
      // not read as a door - the leaves now run to the floor, and the lotus in front
      // covers where the two meet.
      const DW = FRAME_W / 2
      const DH = FRAME_H
      const doors: THREE.Group[] = []
      for (const [side, tex] of [
        ['left', dlTex],
        ['right', drTex],
      ] as const) {
        const dir = side === 'left' ? -1 : 1
        const leaf = plane(DW, DH, tex)
        leaf.position.x = (DW / 2) * -dir
        const pivot = new THREE.Group()
        pivot.position.set(dir * DW, 0, 0)
        pivot.add(leaf)
        scene.add(pivot)
        doors.push(pivot)
      }

      // ── Lotus, in front of all of it ──────────────────────────────────
      const lotusH = FRAME_H * 0.43
      const lotus = plane(FRAME_W, lotusH, lotusTex, true)
      const LOTUS_Y = -FRAME_H / 2 + lotusH / 2
      lotus.position.set(0, LOTUS_Y, 0.9)
      scene.add(lotus)

      function apply(t: number) {
        const open = seg(t, T.doors)
        // Inward, away from the camera - the film's leading edges recede as they part.
        doors[0]!.rotation.y = open * 1.95
        doors[1]!.rotation.y = -open * 1.95

        // The curtain. A hair past REACH at each end so the first and last pixels are
        // fully in rather than sitting exactly on the plane.
        curtain.constant = -REACH * 1.02 + seg(t, T.draw) * REACH * 2.04

        // Flowers clear off the bottom as the leaf arrives. Enough travel to put the tops
        // of the tallest blooms below the frame, not just the plane's own centre.
        lotus.position.y = LOTUS_Y - seg(t, T.lotusOut) * lotusH * 1.15

        tick.current(t)
      }

      /**
       * Park the camera at whatever distance shows the whole frame, and leave it there.
       *
       * A fixed z was the bug behind the earlier crop: the artwork is 720x1280, and at
       * 34 degrees a plane 8 units tall needs about 13 units of distance to fit. Sitting
       * at 4.5 put the camera inside the composition.
       *
       * Solved for both axes and the larger distance wins, so a narrow phone frames to
       * width and a wide desktop frames to height. Either way nothing is ever cropped -
       * the arch and the lotus border are the composition, not padding.
       */
      function resize() {
        // `el` is narrowed above, but TypeScript widens a ref-derived const back to
        // nullable inside a closure that outlives the guard.
        const box = el as HTMLDivElement
        const w = box.clientWidth
        const h = box.clientHeight
        if (!w || !h) return

        renderer.setSize(w, h, false)
        camera.aspect = w / h

        const half = THREE.MathUtils.degToRad(camera.fov) / 2
        const forHeight = FRAME_H / 2 / Math.tan(half)
        const forWidth = FRAME_W / 2 / Math.tan(half) / camera.aspect
        // 1.02: a sliver of margin, so the frame's own edge never lands exactly on the
        // viewport edge and shimmer along it at fractional device pixel ratios.
        camera.position.z = Math.max(forHeight, forWidth) * 1.02
        camera.updateProjectionMatrix()
      }
      resize()
      const ro = new ResizeObserver(resize)
      ro.observe(el)

      let started: number | null = null
      function frame(now: number) {
        if (started === null) started = now
        const t = Math.min((now - started) / 1000, DUR)
        apply(t)
        renderer.render(scene, camera)
        if (t < DUR) raf = requestAnimationFrame(frame)
      }

      apply(0)
      renderer.render(scene, camera)
      setReady(true)

      if (reduced) {
        apply(DUR)
        renderer.render(scene, camera)
      } else {
        raf = requestAnimationFrame(frame)
      }

      cleanup.push(() => ro.disconnect())
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      for (const fn of cleanup) fn()
      // three does not release GPU memory on garbage collection. Every geometry, material
      // and texture has to be disposed by hand or navigating away leaks the whole scene.
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose?.()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          ;(m as THREE.MeshBasicMaterial).map?.dispose()
          m.dispose()
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div
      ref={host}
      className="absolute inset-0 transition-opacity duration-700"
      style={{ opacity: ready ? 1 : 0 }}
    />
  )
}

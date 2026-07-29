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

/** The beats, in seconds, so the choreography can be read at a glance. */
const T = {
  hold: [0.0, 1.4],
  doors: [1.4, 3.6],
  push: [1.8, 5.2],
  card: [4.2, 6.0],
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
      const cardTex = new THREE.CanvasTexture(cardTexture())
      cardTex.colorSpace = THREE.SRGBColorSpace
      cardTex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      const cardH = FRAME_H * 0.94
      const card = plane(cardH * CARD_ASPECT * 1.06, cardH * 1.06, cardTex, true)
      card.position.set(0, -FRAME_H, -0.7)
      scene.add(card)

      // ── Doors ─────────────────────────────────────────────────────────
      const DW = FRAME_W / 2
      const DH = FRAME_H * 0.79
      const doors: THREE.Group[] = []
      for (const [side, tex] of [
        ['left', dlTex],
        ['right', drTex],
      ] as const) {
        const dir = side === 'left' ? -1 : 1
        const leaf = plane(DW, DH, tex)
        leaf.position.x = (DW / 2) * -dir
        const pivot = new THREE.Group()
        pivot.position.set(dir * DW, FRAME_H / 2 - DH / 2, 0)
        pivot.add(leaf)
        scene.add(pivot)
        doors.push(pivot)
      }

      // ── Lotus, in front of all of it ──────────────────────────────────
      const lotusH = FRAME_H * 0.43
      const lotus = plane(FRAME_W, lotusH, lotusTex, true)
      lotus.position.set(0, -FRAME_H / 2 + lotusH / 2, 0.9)
      scene.add(lotus)

      function apply(t: number) {
        const open = seg(t, T.doors)
        // Inward, away from the camera - the film's leading edges recede as they part.
        doors[0]!.rotation.y = open * 1.95
        doors[1]!.rotation.y = -open * 1.95

        camera.position.z = 7.6 - seg(t, T.push) * 3.1

        const rise = seg(t, T.card)
        card.position.y = -FRAME_H + rise * FRAME_H
        card.rotation.x = (1 - rise) * -0.75

        tick.current(t)
      }

      function resize() {
        // `el` is narrowed above, but TypeScript widens a ref-derived const back to
        // nullable inside a closure that outlives the guard.
        const box = el as HTMLDivElement
        const w = box.clientWidth
        const h = box.clientHeight
        if (!w || !h) return
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        // The film is portrait. On a landscape window, frame to height so the composition
        // is never cropped top and bottom - the arch and the flowers are the whole point.
        camera.fov = camera.aspect < FRAME_W / FRAME_H ? 34 / camera.aspect * (FRAME_W / FRAME_H) : 34
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

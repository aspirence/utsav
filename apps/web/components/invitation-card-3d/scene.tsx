'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { PAL, backdropTexture, cardTexture, doorTexture } from './textures'

/**
 * The animated invitation, rebuilt from the reference film in three.js.
 *
 * The film's beats, and how each one is done here:
 *
 *   0.0-1.0s  closed cusped-arch doors, camera easing in     camera.position.z
 *   1.0-2.6s  both leaves swing open on their outer hinges   pivot Group rotation.y
 *   2.2-3.6s  camera pushes through the opening              camera.position.z
 *   3.0-4.4s  the invitation leaf rises through the arch     card mesh y + rotation.x
 *   4.0s on   ornament, monogram and text arrive in order    HTML overlay, see Overlay
 *
 * WHY A PIVOT GROUP. A door hinges at its edge, not its middle, and a mesh rotates about
 * its own centre - so each leaf is a child of an empty Group parked on the hinge line and
 * offset by half its width. Rotating the group swings the leaf the way a door swings.
 * Baking the offset into the geometry would work too, but then the mesh's own transform no
 * longer means anything and every later tweak has to account for it.
 *
 * WHY THE TYPE IS HTML. Text drawn into a canvas texture is resolution-locked and resampled
 * by the GPU, so it is soft at exactly the size people read it. The names on a wedding
 * invitation are the one thing that has to be crisp, so they sit in a DOM layer over the
 * canvas, in the same Playfair the rest of the site uses.
 *
 * The timeline is driven by elapsed time from an IntersectionObserver, not by scroll
 * position: it is a film, and it should play once at its own pace rather than being
 * scrubbed. Under prefers-reduced-motion nothing animates - the scene renders one frame at
 * its end state, doors open and card up, and stops.
 */

const DUR = 6.2

/** Everything the timeline needs, in one place, so the beats can be read at a glance. */
const T = {
  doorsOpen: [1.0, 2.6],
  push: [0.0, 3.6],
  cardRise: [3.0, 4.4],
} as const

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
/** Cubic ease-in-out. Doors and cameras do not start and stop instantly. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const seg = (t: number, [a, b]: readonly [number, number]) => ease(clamp01((t - a) / (b - a)))

export function InvitationScene({ onProgress }: { onProgress: (t: number) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const progress = useRef(onProgress)
  progress.current = onProgress

  useEffect(() => {
    const mount = host.current
    if (!mount) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(PAL.nightDeep)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    // Capped at 2: beyond that a phone burns fill rate on pixels nobody can resolve.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'

    const tex = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      return t
    }

    // ── Backdrop ────────────────────────────────────────────────────────
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({ map: tex(backdropTexture()) }),
    )
    backdrop.position.z = -3.2
    scene.add(backdrop)

    // ── The invitation leaf ─────────────────────────────────────────────
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 3.1),
      new THREE.MeshBasicMaterial({ map: tex(cardTexture()), transparent: true }),
    )
    card.position.set(0, -3.4, -1.1)
    scene.add(card)

    // ── Doors ───────────────────────────────────────────────────────────
    const DOOR_W = 1.35
    const DOOR_H = 3.6
    const doors: THREE.Group[] = []

    for (const side of ['left', 'right'] as const) {
      const dir = side === 'left' ? -1 : 1
      const leaf = new THREE.Mesh(
        new THREE.PlaneGeometry(DOOR_W, DOOR_H),
        new THREE.MeshBasicMaterial({ map: tex(doorTexture(side)), side: THREE.DoubleSide }),
      )
      // Offset inside its pivot so the hinge line is the group's origin.
      leaf.position.x = (DOOR_W / 2) * -dir

      const pivot = new THREE.Group()
      pivot.position.set(dir * DOOR_W, 0, 0)
      pivot.add(leaf)
      scene.add(pivot)
      doors.push(pivot)
    }

    // ── Gold dust ───────────────────────────────────────────────────────
    // Positions are deterministic. Math.random() here would place the motes differently on
    // every mount, which is a flicker for anyone who scrolls past twice.
    const COUNT = 220
    const pts = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      pts[i * 3] = (((i * 37) % 100) / 100 - 0.5) * 6
      pts[i * 3 + 1] = (((i * 61) % 100) / 100 - 0.5) * 7
      pts[i * 3 + 2] = (((i * 83) % 100) / 100) * 2.4 - 1.6
    }
    const dustGeo = new THREE.BufferGeometry()
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: new THREE.Color(PAL.goldLight),
        size: 0.035,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    scene.add(dust)

    // Captured once. `mount` is narrowed above, but TypeScript widens a ref-derived const
    // back to nullable inside a closure that outlives the check.
    const el = mount

    function resize() {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    /** Put every animated object where it belongs at time `t`. */
    function apply(t: number) {
      const open = seg(t, T.doorsOpen)
      doors[0]!.rotation.y = open * 2.15
      doors[1]!.rotation.y = -open * 2.15

      camera.position.z = 6.4 - seg(t, T.push) * 3.9

      const rise = seg(t, T.cardRise)
      card.position.y = -3.4 + rise * 3.4
      card.rotation.x = (1 - rise) * -0.9

      const m = dust.material as THREE.PointsMaterial
      m.opacity = seg(t, T.doorsOpen) * 0.75
      dust.rotation.y = t * 0.06

      progress.current(t)
    }

    let raf = 0
    let started: number | null = null

    function frame(now: number) {
      if (started === null) started = now
      const t = Math.min((now - started) / 1000, DUR)
      apply(t)
      renderer.render(scene, camera)
      if (t < DUR) raf = requestAnimationFrame(frame)
    }

    // Only play once it is actually on screen, and only once.
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        if (reduced) {
          apply(DUR)
          renderer.render(scene, camera)
          return
        }
        raf = requestAnimationFrame(frame)
      },
      { threshold: 0.35 },
    )
    io.observe(mount)

    // First paint before anything plays, so the panel is never an empty box.
    apply(0)
    renderer.render(scene, camera)

    return () => {
      io.disconnect()
      ro.disconnect()
      cancelAnimationFrame(raf)
      // three does not free GPU memory on garbage collection - every geometry, material
      // and texture has to be disposed by hand or a few navigations leak the scene.
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

  return <div ref={host} className="absolute inset-0" />
}

/** Convenience wrapper: scene plus the HTML type layer, sharing one timeline clock. */
export default function InvitationCard3D() {
  const [t, setT] = useState(0)

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#0a1730]">
      <InvitationScene onProgress={setT} />
      <Overlay t={t} />
    </div>
  )
}

/**
 * The type layer. Sits over the canvas in real DOM so it stays sharp, and fades in on the
 * same clock the scene runs on.
 *
 * aria-hidden on the ornament and the monogram only - the invitation wording itself is
 * real content and is left readable, so a screen reader gets the whole card rather than a
 * decorative blank.
 */
function Overlay({ t }: { t: number }) {
  const at = (start: number, len = 0.6) => ({
    opacity: clamp01((t - start) / len),
    transform: `translateY(${(1 - clamp01((t - start) / len)) * 10}px)`,
  })

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="w-[46%] max-w-[240px] text-center text-[#2c2721]">
        <div
          aria-hidden="true"
          className="mx-auto mb-2 font-display text-3xl text-[#8a6a1f] transition-none"
          style={at(4.0)}
        >
          &#9765;
        </div>

        <div
          aria-hidden="true"
          className="font-display text-2xl italic leading-none text-[#2c2721]"
          style={at(4.4)}
        >
          R &amp; D
        </div>

        <p className="mt-4 text-[9px] leading-relaxed sm:text-[11px]" style={at(4.8)}>
          request the pleasure of your company
          <br />
          on the auspicious occasion of the
          <br />
          wedding of
        </p>

        <p
          className="mt-2 font-display text-base italic leading-tight sm:text-lg"
          style={at(5.2)}
        >
          Radha
          <span className="mx-1.5 text-[10px] not-italic">with</span>
          Dhanish
        </p>

        <p className="mt-3 text-[9px] leading-relaxed sm:text-[11px]" style={at(5.6)}>
          Monday, 1st May
          <br />
          9:00 p.m. onwards
          <br />
          Lucknow
        </p>
      </div>
    </div>
  )
}

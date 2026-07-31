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

const DUR = 17.5

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
  /** The leaves fade as they finish swinging, so nothing is left standing at the sides. */
  doorsGone: [2.6, 3.8],
  draw: [3.5, 5.6],
  lotusOut: [4.0, 6.0],
} as const

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const seg = (t: number, [a, b]: readonly [number, number]) => ease(clamp01((t - a) / (b - a)))

/** Source frame is 720x1280; the scene is laid out in those proportions at 1 unit = 160px. */
const FRAME_W = 4.5
const FRAME_H = FRAME_W * (1280 / 720)

export default function InvitationScene({
  onTime,
  loop = false,
}: {
  onTime: (t: number) => void
  /** Replay from the top after the card has been held, rather than stopping on it. */
  loop?: boolean
}) {
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
      const [stageTex, dlTex, drTex, lotusTex, lightsTex] = await Promise.all([
        load('/inv/stage.webp'),
        load('/inv/door-l.webp'),
        load('/inv/door-r.webp'),
        load('/inv/lotus.webp'),
        load('/inv/lights.webp'),
      ])
      if (disposed) return

      // ── Stage ─────────────────────────────────────────────────────────
      const stage = plane(FRAME_W, FRAME_H, stageTex)
      stage.position.z = -2.6
      // Oversized, so the frame's own edge is never inside the viewport.
      stage.scale.setScalar(1.35)
      scene.add(stage)

      /*
        ── Lamps ───────────────────────────────────────────────────────

        The strings of bulbs, cut out of the same frame and laid over it with additive
        blending so they read as light rather than as paint.

        The twinkle is a shader rather than a pulsing opacity because pulsing the whole
        layer makes every bulb on the building blink in lockstep, which looks like a fault
        rather than a decoration. Quantising the UV into cells and hashing that gives each
        cluster its own phase, so they drift in and out of step the way real strings do -
        one texture, one draw call, no per-lamp objects.
      */
      const lampMat = new THREE.ShaderMaterial({
        uniforms: { map: { value: lightsTex }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D map;
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vec4 t = texture2D(map, vUv);
            vec2 cell = floor(vUv * vec2(34.0, 60.0));
            float phase = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
            float tw = 0.55 + 0.45 * sin(uTime * 2.1 + phase * 6.2831);
            gl_FragColor = vec4(t.rgb * tw, t.a * tw);
          }
        `,
      })
      const lamps = new THREE.Mesh(new THREE.PlaneGeometry(FRAME_W, FRAME_H), lampMat)
      lamps.position.z = -2.58
      lamps.scale.setScalar(1.35)
      scene.add(lamps)

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
      const cardMat = card.material as THREE.MeshBasicMaterial
      cardMat.clippingPlanes = [curtain]

      /*
        The fold. The wipe alone uncovers the leaf but does not open it, so the sheet also
        swings flat about a crease running from its top-left corner down the diagonal - the
        way a folded card is opened out rather than slid into view.

        The pivot sits on that corner and the mesh is offset into it, because a mesh
        rotates about its own centre and a fold happens at an edge.

        The two effects compose without fighting because the fold axis is exactly
        antiparallel to the clipping plane's normal: rotating about it moves every point
        *within* a plane perpendicular to that normal, so `n · p` never changes and the
        wipe sweeps identically whatever angle the sheet is at.
      */
      const FOLD_AXIS = new THREE.Vector3(SQ, -SQ, 0)
      const cardPivot = new THREE.Group()
      cardPivot.position.set(-cardW / 2, cardH / 2, -0.7)
      card.position.set(cardW / 2, -cardH / 2, 0)
      cardPivot.add(card)
      scene.add(cardPivot)

      // ── Doors ─────────────────────────────────────────────────────────
      // Full frame height. They used to stop above the flowers so the lotus layer could
      // stay put while they swung, but a door that ends two thirds of the way down does
      // not read as a door - the leaves now run to the floor, and the lotus in front
      // covers where the two meet.
      const DW = FRAME_W / 2
      const DH = FRAME_H
      const doors: THREE.Group[] = []
      const doorMats: THREE.MeshBasicMaterial[] = []
      for (const [side, tex] of [
        ['left', dlTex],
        ['right', drTex],
      ] as const) {
        const dir = side === 'left' ? -1 : 1
        const leaf = plane(DW, DH, tex, true)
        leaf.position.x = (DW / 2) * -dir
        const pivot = new THREE.Group()
        pivot.position.set(dir * DW, 0, 0)
        pivot.add(leaf)
        scene.add(pivot)
        doors.push(pivot)
        doorMats.push(leaf.material as THREE.MeshBasicMaterial)
      }

      // ── Lotus, in front of all of it ──────────────────────────────────
      const lotusH = FRAME_H * 0.43
      const lotus = plane(FRAME_W, lotusH, lotusTex, true)
      const LOTUS_Y = -FRAME_H / 2 + lotusH / 2
      lotus.position.set(0, LOTUS_Y, 0.9)
      scene.add(lotus)

      function apply(t: number) {
        /*
          Outward, towards the camera.

          Sign follows from where each pivot is. The left leaf hangs off a hinge at -DW and
          extends in +x, and a positive rotation.y carries +x towards -z - away from the
          viewer. So the left leaf needs a negative angle to come outward, and the right
          leaf, which extends in -x from +DW, needs a positive one.

          Just over a right angle, and then they fade: at 90 degrees a plane is edge-on and
          already almost nothing, and the fade removes the sliver that is left rather than
          leaving two leaves standing at the sides of the frame.
        */
        const open = seg(t, T.doors)
        doors[0]!.rotation.y = -open * 1.75
        doors[1]!.rotation.y = open * 1.75

        const gone = 1 - seg(t, T.doorsGone)
        doorMats[0]!.opacity = gone
        doorMats[1]!.opacity = gone
        doors[0]!.visible = doors[1]!.visible = gone > 0.001

        // The curtain. A hair past REACH at each end so the first and last pixels are
        // fully in rather than sitting exactly on the plane.
        const drawn = seg(t, T.draw)
        curtain.constant = -REACH * 1.02 + drawn * REACH * 2.04

        // ...and the sheet swings flat about the crease through that same corner.
        cardPivot.quaternion.setFromAxisAngle(FOLD_AXIS, (1 - drawn) * 1.15)

        // Flowers clear off the bottom as the leaf arrives. Enough travel to put the tops
        // of the tallest blooms below the frame, not just the plane's own centre.
        lotus.position.y = LOTUS_Y - seg(t, T.lotusOut) * lotusH * 1.15

        lampMat.uniforms.uTime!.value = t

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

      /*
        The loop.

        `loop` runs the film again from the top instead of stopping on the last frame, after
        holding it for HOLD_S so the finished card can actually be read. It is off unless the
        page asks for it: somebody who opened the invitation to look at it should not have it
        restart under them forever, while the phone frame on the home page has nothing to show
        but a repeat.

        This replaces an earlier attempt that remounted the iframe on a timer from outside.
        That was wrong twice over. It reloaded the page rather than replaying the animation,
        and its interval was set from the opening phase table — nine seconds against a film
        that runs DUR, so it cut the thing off less than halfway and never showed the wording
        at all. A loop belongs where the clock is.

        Resetting `started` rather than zeroing an accumulator keeps the timebase in the same
        units as requestAnimationFrame's argument, so a dropped frame slides the next cycle
        rather than accumulating drift.
      */
      const HOLD_S = 2.5

      let started: number | null = null
      function frame(now: number) {
        if (started === null) started = now
        const elapsed = (now - started) / 1000

        if (loop && elapsed >= DUR + HOLD_S) {
          started = now
          apply(0)
          renderer.render(scene, camera)
          raf = requestAnimationFrame(frame)
          return
        }

        const t = Math.min(elapsed, DUR)
        apply(t)
        renderer.render(scene, camera)

        // Without loop, stop on the last frame. With it, keep going through the hold.
        if (loop || t < DUR) raf = requestAnimationFrame(frame)
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
  }, [loop])

  return (
    /*
     * 200ms, down from 700.
     *
     * The fade exists to stop the canvas appearing as a hard cut against the backdrop, and
     * 200ms does that just as well. The other 500 were spent on the one thing this route
     * cannot afford to spend them on: they sat between "everything has loaded" and "the
     * viewer can see it", after a wait that was already the complaint. A reveal is worth a
     * fifth of a second, not most of one.
     */
    <div
      ref={host}
      className="absolute inset-0 transition-opacity duration-200"
      style={{ opacity: ready ? 1 : 0 }}
    />
  )
}

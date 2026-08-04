import type { MetadataRoute } from 'next'

/**
 * The web app manifest — what makes Fremmo installable to a phone's home screen.
 *
 * A route rather than a static public/manifest.json, because Next generates the correct
 * `<link rel="manifest">` and the right Content-Type from this file convention. A hand-written
 * JSON in public/ needs the link tag adding by hand and drifts from the metadata in layout.tsx.
 *
 * ── WHY `display: 'standalone'` AND NOT 'fullscreen' ─────────────────────────
 * standalone drops the browser chrome but keeps the OS status bar — the clock, the battery,
 * the signal. fullscreen takes those too, which is right for a game and wrong for a booking
 * app: somebody comparing photographers at a venue needs to know what time it is and whether
 * they still have signal. Taking the status bar away to look more like an app makes it a worse
 * app.
 *
 * ── THE START URL CARRIES A SOURCE ───────────────────────────────────────────
 * `?source=pwa` is not decoration. Plan §10 measures acquisition, and an installed launch is
 * indistinguishable from a direct visit in analytics without it. It costs nothing and it is the
 * only way to ever answer "is the install worth maintaining".
 *
 * ── TWO ICON PURPOSES, DELIBERATELY ──────────────────────────────────────────
 * Android masks home-screen icons to whatever shape the launcher uses — a circle, a squircle, a
 * teardrop — and crops roughly 20% off every edge to do it. An icon drawn to the edges loses its
 * edges. So `maskable` is a separate file with the mark shrunk into the middle 60%, and `any` is
 * the tight crop used everywhere that does no masking. Shipping one file for both purposes means
 * choosing which platform to look wrong on.
 *
 * The icons are the aperture mark, rendered from the same six paths <BrandMark> draws — see
 * public/logo-mark.svg for the standalone copy. Never the full lockup: a wordmark and a tagline
 * are illegible at 192px and turn the icon into a grey smudge on a home screen. The mark carries
 * no text at all, so these need no change if the name ever moves again.
 *
 * The maskable file is flattened onto the canvas colour rather than left transparent. The mark
 * is six separated blades around an open centre, so on a transparent icon the launcher's own
 * background would show through the gaps and read as part of the artwork.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fremmo — wedding & event vendors in India',
    short_name: 'Fremmo',
    description:
      'Discover photographers, venues, decorators and caterers by locality and price band. ' +
      'Compare packages, check who is free on your date, and book.',

    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',

    // The canvas the app opens on, so the splash does not flash white before the page paints.
    background_color: '#f7f5f3',
    // primary-600, matching the themeColor in app/layout.tsx. The two must agree or the status
    // bar changes colour a moment after launch.
    theme_color: '#B3402B',

    lang: 'en-IN',
    dir: 'ltr',
    categories: ['shopping', 'lifestyle', 'events'],

    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],

    /*
     * Long-press shortcuts on the installed icon. Three, because Android shows at most four and
     * iOS shows none — these are a bonus for the platform that has them, not a navigation model
     * anything depends on.
     */
    shortcuts: [
      {
        name: 'Find vendors',
        short_name: 'Vendors',
        url: '/lucknow?source=pwa-shortcut',
      },
      {
        name: 'Digital invitations',
        short_name: 'Invitations',
        url: '/invitation?source=pwa-shortcut',
      },
      {
        name: 'My account',
        short_name: 'Account',
        url: '/account?source=pwa-shortcut',
      },
    ],
  }
}

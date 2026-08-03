import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,

  /*
   * Where the build output goes. `.next` unless NEXT_DIST_DIR says otherwise.
   *
   * WHY THIS EXISTS. `next dev` and `next build` both write this directory, and running one
   * while the other is up corrupts it — the symptom is a runtime `Cannot find module './787.js'`
   * with a require stack through `.next/server/webpack-runtime.js`, which reads like the page in
   * the stack is broken and is not. It has cost two debugging sessions.
   *
   * The dev server is usually already running here, so a verification build can take its own
   * directory and leave it alone:
   *
   *     NEXT_DIST_DIR=.next-verify pnpm build
   *
   * Plain `pnpm build` is unchanged, so CI and deploys see exactly what they saw before.
   * `.gitignore` carries a wildcard rule covering the `.next-` prefixed alternates.
   *
   * ONE SIDE EFFECT, AND IT IS NOT OBVIOUS. `next build` rewrites tsconfig.json on every run,
   * appending a `<distDir>/types` glob to `include`. A different NEXT_DIST_DIR each time
   * therefore leaves a trail of dead globs in a tracked file — eight of them accumulated before
   * anybody noticed, because TypeScript ignores a glob that matches nothing and the build stays
   * green. Use the ONE name above rather than inventing a new one per run, and check
   * `git diff tsconfig.json` before committing after a build.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // No transpilePackages. The design system and the data layer used to be workspace
  // packages shipping raw TypeScript, which Next had to be told to compile; they now live
  // in components/ui and lib/db and are compiled like any other file in the app.

  // Plan §12: "Supabase CDN transforms bypass the image optimizer" — the mitigation
  // for "Vercel/media cost creep at SEO scale". We render <img> against Storage's own
  // render endpoint, so Next's optimizer is deliberately left out of the media path.
  images: {
    unoptimized: true,
  },

  experimental: {
    // optimizePackageImports is gone with the same move: it rewrites barrel imports from
    // node_modules packages, and components/ui is now first-party source that the compiler
    // tree-shakes on its own.

    /*
     * Server Actions take a 1 MB body by default, which rejects almost any photograph straight off
     * a camera or a phone. 8 MB matches MAX_BYTES in lib/image-upload.ts — the two are a pair, and
     * raising one without the other just moves where the confusing error comes from.
     */
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ]
  },
}

export default config

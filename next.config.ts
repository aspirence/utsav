import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,

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

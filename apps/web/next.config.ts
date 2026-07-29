import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,

  // The workspace packages ship TypeScript source, not a build step.
  transpilePackages: ['@utsava/ui', '@utsava/db'],

  // Plan §12: "Supabase CDN transforms bypass the image optimizer" — the mitigation
  // for "Vercel/media cost creep at SEO scale". We render <img> against Storage's own
  // render endpoint, so Next's optimizer is deliberately left out of the media path.
  images: {
    unoptimized: true,
  },

  experimental: {
    // Plan §13: LCP < 2.5 s on 4G mid-range Android.
    optimizePackageImports: ['@utsava/ui'],
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

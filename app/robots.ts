import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Account, partner and staff surfaces carry personal data and have no search
        // value. /admin especially: it shares an origin with the public site now, so
        // this Disallow, the route's noindex metadata and the X-Robots-Tag header in
        // middleware.ts are three independent reasons it never gets indexed.
        disallow: ['/admin', '/account/', '/partner/dashboard/', '/enquire', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}

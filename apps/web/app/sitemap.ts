import type { MetadataRoute } from 'next'

import { getSeoRoutes } from '@/lib/queries'

/**
 * Plan §2: "programmatic SEO pages + sitemaps" is Must-tier.
 * Plan §12: the mitigation for "SEO indexing lags launch" is that the page engine is
 * live from Oct 2026 with quality thresholds and sitemap partitioning — getSeoRoutes()
 * applies the threshold, so a thin locality page never enters this file.
 *
 * At 3,000 listings this stays well inside the 50,000-URL limit. Past that, split by
 * city into /sitemaps/[city].xml with a sitemap index.
 */
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const now = new Date()

  const routes = await getSeoRoutes()

  return [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1 },
    ...routes.map((route) => ({
      url: `${base}${route.url}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: route.priority,
    })),
  ]
}

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { DiscoverView } from '@/components/discover-view'
import { getCategories, getCategory, getCity, getLaunchedCities } from '@/lib/queries'

type Params = { city: string; category: string }
type Props = {
  params: Promise<Params>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Plan §2/§4: "programmatic SEO pages + sitemaps" — server-rendered ISR pages
 * generated from the catalog. Plan §12: the page engine goes live Oct 2026, six
 * months before launch, so indexing has started by the time customers arrive.
 */
export const revalidate = 3600

export async function generateStaticParams(): Promise<Params[]> {
  const [cities, categories] = await Promise.all([getLaunchedCities(), getCategories()])
  return cities.flatMap((city) =>
    categories.map((category) => ({ city: city.slug, category: category.slug })),
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug, category: categorySlug } = await params
  const [city, category] = await Promise.all([getCity(citySlug), getCategory(categorySlug)])
  if (!city || !category) return {}

  const title = `${category.pluralName} in ${city.name} — portfolios, prices & availability`

  return {
    title,
    description:
      `Compare ${category.pluralName.toLowerCase()} in ${city.name} by locality, style and price band. ` +
      `Real portfolios, packages normalised per day, and vendors who are free on your date.`,
    alternates: { canonical: `/${citySlug}/${categorySlug}` },
    openGraph: { title, type: 'website' },
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { city: citySlug, category: categorySlug } = await params
  const [city, category] = await Promise.all([getCity(citySlug), getCategory(categorySlug)])

  if (!city || !category) notFound()

  return (
    <DiscoverView
      citySlug={citySlug}
      categorySlug={categorySlug}
      searchParams={await searchParams}
    />
  )
}

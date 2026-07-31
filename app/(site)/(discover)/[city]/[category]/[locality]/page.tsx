import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { DiscoverView } from '@/components/discover-view'
import {
  discoverVendors,
  getCategories,
  getCategory,
  getCity,
  getLaunchedCities,
  getLocalities,
} from '@/lib/queries'

type Params = { city: string; category: string; locality: string }
type Props = {
  params: Promise<Params>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Plan §5: "locality = the SEO unit". This is the page the engine multiplies. */
export const revalidate = 3600

export async function generateStaticParams(): Promise<Params[]> {
  const [cities, categories] = await Promise.all([getLaunchedCities(), getCategories()])
  const out: Params[] = []

  for (const city of cities) {
    const localities = await getLocalities(city.slug)
    for (const category of categories) {
      for (const locality of localities) {
        out.push({ city: city.slug, category: category.slug, locality: locality.slug })
      }
    }
  }
  return out
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug, category: categorySlug, locality: localitySlug } = await params
  const [city, category, localities] = await Promise.all([
    getCity(citySlug),
    getCategory(categorySlug),
    getLocalities(citySlug),
  ])
  const locality = localities.find((l) => l.slug === localitySlug)
  if (!city || !category || !locality) return {}

  const { total } = await discoverVendors({
    citySlug,
    categorySlug,
    localitySlug,
    perPage: 1,
  })

  const title = `${category.pluralName} in ${locality.name}, ${city.name}`

  return {
    title,
    description:
      `${total} ${category.pluralName.toLowerCase()} serving ${locality.name} in ${city.name}. ` +
      `Compare portfolios, price bands and availability.`,
    alternates: { canonical: `/${citySlug}/${categorySlug}/${localitySlug}` },
    // Plan §12: "quality thresholds" — a thin locality page is deliberately kept out
    // of the index rather than published as a doorway page.
    robots: total >= 3 ? { index: true, follow: true } : { index: false, follow: true },
  }
}

export default async function LocalityPage({ params, searchParams }: Props) {
  const { city: citySlug, category: categorySlug, locality: localitySlug } = await params

  const [city, category, localities] = await Promise.all([
    getCity(citySlug),
    getCategory(categorySlug),
    getLocalities(citySlug),
  ])

  if (!city || !category || !localities.some((l) => l.slug === localitySlug)) notFound()

  return (
    <DiscoverView
      citySlug={citySlug}
      categorySlug={categorySlug}
      localitySlug={localitySlug}
      searchParams={await searchParams}
    />
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge, Container, LinkButton, SectionHeading, VendorCard } from '@/components/ui'

import { StoryCard } from '@/components/story-card'
import {
  discoverVendors,
  getCategories,
  getCity,
  getLaunchedCities,
  getLocalities,
} from '@/lib/queries'
import { filterStories, getStories } from '@/lib/stories'

type Params = { city: string }
type Props = { params: Promise<Params> }

/**
 * The city hub — the parent of every /[city]/[category] page.
 *
 * Plan §12: the SEO engine multiplies city × category × locality, and without a hub at
 * /[city] those pages are only reachable from the header. This is the page that links
 * to all of them, which is what gets the long tail crawled.
 */
export const revalidate = 3600

export async function generateStaticParams(): Promise<Params[]> {
  const cities = await getLaunchedCities()
  return cities.map((city) => ({ city: city.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug } = await params
  const city = await getCity(citySlug)
  if (!city) return {}

  const title = `Wedding and event vendors in ${city.name}`

  return {
    title,
    description:
      `Photographers, venues, decorators, makeup artists and caterers across ${city.name}, ` +
      `${city.state}. Real portfolios, declared price bands, and who is free on your date.`,
    alternates: { canonical: `/${citySlug}` },
    openGraph: { title, type: 'website' },
  }
}

export default async function CityPage({ params }: Props) {
  const { city: citySlug } = await params
  const [city, categories] = await Promise.all([getCity(citySlug), getCategories()])

  if (!city) notFound()

  const [localities, counted, featured, allStories] = await Promise.all([
    getLocalities(citySlug),
    // One count per category, so the hub tells the truth about depth instead of
    // advertising a category we have not onboarded here yet.
    Promise.all(
      categories.map(async (category) => {
        const { total } = await discoverVendors({
          citySlug,
          categorySlug: category.slug,
          perPage: 1,
        })
        return { category, total }
      }),
    ),
    discoverVendors({ citySlug, categorySlug: 'photography', perPage: 6 }),
    getStories(),
  ])

  const stories = filterStories(allStories, { citySlug })
  const liveTotal = counted.reduce((sum, entry) => sum + entry.total, 0)
  const stocked = counted.filter((entry) => entry.total > 0)
  const empty = counted.filter((entry) => entry.total === 0)

  return (
    <>
      <section className="border-b border-ink-100 bg-gradient-to-b from-accent-50/60 to-surface">
        <Container className="py-12 sm:py-16">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-500">
            <Link href="/" className="hover:text-ink-800">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-ink-700">{city.name}</span>
          </nav>

          <Badge tone="accent" className="mb-4">
            {city.name}, {city.state}
          </Badge>

          <h1 className="max-w-3xl text-4xl leading-[1.1] text-ink-900 sm:text-5xl">
            Everyone you need for a celebration in {city.name}.
          </h1>

          <p className="mt-5 max-w-2xl text-lg text-ink-600">
            {liveTotal} live {liveTotal === 1 ? 'listing' : 'listings'} across{' '}
            {stocked.length} {stocked.length === 1 ? 'category' : 'categories'}, each with a real
            portfolio and a declared price band. Filter by locality, style and your date.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href={`/${citySlug}/photography`} size="lg">
              Browse photographers
            </LinkButton>
            <LinkButton href="/enquire" variant="outline" size="lg">
              Tell us your date
            </LinkButton>
          </div>
        </Container>
      </section>

      <Container className="py-14">
        <SectionHeading
          eyebrow="Categories"
          title={`What are you looking for in ${city.name}?`}
          description="Counts are live listings, not directory entries. A category with nothing in it says so."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stocked.map(({ category, total }) => (
            <Link
              key={category.slug}
              href={`/${citySlug}/${category.slug}`}
              className="group rounded-xl border border-ink-100 bg-surface-raised p-5 transition-colors hover:border-ink-300"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-xl text-ink-900">{category.pluralName}</h3>
                {category.isWedge && <Badge tone="primary">Most booked</Badge>}
              </div>
              <p className="mt-2 text-sm text-ink-600">{category.description}</p>
              <p className="mt-3 text-sm font-medium text-ink-900">
                {total} {total === 1 ? 'listing' : 'listings'} in {city.name}
              </p>
              {category.styleTags.length > 0 && (
                <p className="mt-1.5 text-xs text-ink-500">
                  {category.styleTags
                    .slice(0, 4)
                    .map((tag) => tag.name)
                    .join(' · ')}
                </p>
              )}
            </Link>
          ))}
        </div>

        {empty.length > 0 && (
          <p className="mt-6 text-sm text-ink-500">
            Not live in {city.name} yet:{' '}
            {empty.map((entry) => entry.category.pluralName.toLowerCase()).join(', ')}.{' '}
            <Link href="/partner" className="font-medium text-primary-700 hover:text-primary-800">
              Run one of these businesses?
            </Link>
          </p>
        )}
      </Container>

      {featured.vendors.length > 0 && (
        <Container className="pb-14">
          <div className="flex items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Photography"
              title={`Photographers in ${city.name}`}
              description="Ranked on portfolio completeness, review history and how fast they reply — never on how much they pay us."
            />
            <Link
              href={`/${citySlug}/photography`}
              className="hidden shrink-0 text-sm font-medium text-primary-700 hover:text-primary-800 sm:block"
            >
              See all {featured.total} →
            </Link>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.vendors.map((vendor, i) => (
              <VendorCard
                key={vendor.slug}
                vendor={vendor}
                href={`/vendor/${vendor.slug}`}
                priority={i < 3}
              />
            ))}
          </div>
        </Container>
      )}

      {stories.length > 0 && (
        <Container className="pb-14">
          <div className="flex items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Real weddings"
              title={`Recently shot in ${city.name}`}
              description="Full accounts of real events — the brief, the crew and what was delivered."
            />
            <Link
              href={`/stories?city=${citySlug}`}
              className="hidden shrink-0 text-sm font-medium text-primary-700 hover:text-primary-800 sm:block"
            >
              All stories →
            </Link>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {stories.slice(0, 3).map((story) => (
              <StoryCard key={story.slug} story={story} />
            ))}
          </div>
        </Container>
      )}

      {/* Plan §12: internal linking is what gets the locality pages indexed. This hub is
          the only place that links to every city × category × locality combination. */}
      {localities.length > 0 && (
        <Container className="pb-20">
          <SectionHeading
            eyebrow="By locality"
            title={`Every part of ${city.name}`}
            description={`${localities.length} localities, each with its own page per category.`}
          />

          <div className="mt-8 space-y-7">
            {stocked.map(({ category }) => (
              <div key={category.slug}>
                <h3 className="text-sm font-semibold text-ink-900">{category.pluralName}</h3>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {localities.map((locality) => (
                    <Link
                      key={locality.slug}
                      href={`/${citySlug}/${category.slug}/${locality.slug}`}
                      className="rounded-full border border-ink-200 bg-surface-raised px-3.5 py-1.5 text-sm text-ink-700 transition-colors hover:border-ink-300 hover:text-ink-900"
                    >
                      {locality.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Container>
      )}
    </>
  )
}

import Link from 'next/link'
import { Suspense } from 'react'

import { Badge, Container, VendorCard } from '@/components/ui'

import { CategorySeoBlock } from '@/components/category-seo-block'
import { DiscoverFilters } from '@/components/discover-filters'
import { getCategoryContent } from '@/lib/category-content'
import {
  discoverVendors,
  getCategory,
  getCity,
  getLocalities,
  getLocalityCounts,
  type DiscoverQuery,
} from '@/lib/queries'

/**
 * The discovery surface. Plan §2 Must-tier:
 * "Category × locality discovery with price bands and the 'free on my date'
 * availability filter".
 *
 * Shared by /[city]/[category] and /[city]/[category]/[locality] so the locality page
 * is a genuine narrowing of the same view rather than a separate template — which is
 * what keeps the plan §12 SEO engine from producing doorway pages.
 */
export async function DiscoverView({
  citySlug,
  categorySlug,
  localitySlug,
  searchParams,
}: {
  citySlug: string
  categorySlug: string
  localitySlug?: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const [city, category, localities] = await Promise.all([
    getCity(citySlug),
    getCategory(categorySlug),
    getLocalities(citySlug),
  ])

  const locality = localitySlug ? localities.find((l) => l.slug === localitySlug) : undefined

  const styles = toArray(searchParams.styles)
  const freeOn = typeof searchParams.freeOn === 'string' ? searchParams.freeOn : undefined
  const sort = (
    typeof searchParams.sort === 'string' ? searchParams.sort : 'relevance'
  ) as DiscoverQuery['sort']
  const page = Number(searchParams.page ?? 1) || 1
  const budgetMax = numParam(searchParams.budgetMax)
  const minRating = numParam(searchParams.minRating)
  const days = numParam(searchParams.days)
  // ?q= drives the full-text search. discoverVendors and search_vendors have always
  // accepted it; this page simply never read it, so every ?q link silently returned the
  // unfiltered list.
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() || undefined : undefined

  const content = getCategoryContent(categorySlug)

  const [{ vendors, total }, localityCounts] = await Promise.all([
    discoverVendors({
      citySlug,
      categorySlug,
      localitySlug,
      q,
      styles,
      freeOn,
      budgetMax,
      minRating,
      days,
      sort,
      page,
    }),
    // Only the city-level page carries the internal-linking block; repeating it on every
    // locality page would just be a link farm pointing sideways.
    localitySlug ? Promise.resolve([]) : getLocalityCounts(citySlug, categorySlug),
  ])

  const heading = locality
    ? `${category?.pluralName ?? 'Vendors'} in ${locality.name}, ${city?.name ?? ''}`
    : `${category?.pluralName ?? 'Vendors'} in ${city?.name ?? ''}`

  const basePath = localitySlug
    ? `/${citySlug}/${categorySlug}/${localitySlug}`
    : `/${citySlug}/${categorySlug}`

  return (
    <>
      <div className="border-ink-100 bg-surface-sunken/60 border-b">
        <Container className="py-8 sm:py-10">
          <nav aria-label="Breadcrumb" className="text-ink-500 mb-3 text-sm">
            <Link href="/" className="hover:text-ink-800">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <Link href={`/${citySlug}/${categorySlug}`} className="hover:text-ink-800">
              {city?.name}
            </Link>
            {locality && (
              <>
                <span className="mx-1.5">/</span>
                <span className="text-ink-700">{locality.name}</span>
              </>
            )}
          </nav>

          <h1 className="text-ink-900 text-3xl sm:text-4xl">{heading}</h1>
          <p className="text-ink-600 mt-2">
            {total} {total === 1 ? 'listing' : 'listings'}
            {category?.description ? ` · ${category.description}` : ''}
          </p>

          {/*
            The style taxonomy used to be a row of chips above the filters. It is now the first
            segment of the search bar below — plan §S2/§11 still makes it the wedge's defining
            filter, but a row of nine chips plus a row of five selects was two filter systems
            stacked on one another.
          */}
          {/* Plan §2 Must-tier filters. WedMeGood and the rest of the category ship
              price and rating filters but no availability filter at all — "free on my
              date" is the one that saves a couple from messaging twenty studios to find
              out who is even open, so it leads.

              The Suspense boundary is load-bearing, not decoration. DiscoverFilters calls
              useSearchParams(), and an unwrapped useSearchParams() opts the whole route
              out of static generation — which would turn every one of the 80+ discovery
              pages into a per-request render and undo plan §12's "static-first pages"
              cost mitigation. With the boundary, the shell prerenders and only the filter
              bar waits on the query string. */}
          <Suspense fallback={<div className="mt-5 h-[52px]" aria-hidden />}>
            <DiscoverFilters
              basePath={basePath}
              priceRungs={content.priceRungs}
              showDurationFilter={content.showDurationFilter}
              styleTags={category?.styleTags ?? []}
            />
          </Suspense>

          {freeOn && (
            <p className="mt-4">
              <Badge tone="success">Showing only vendors free on {formatDate(freeOn)}</Badge>
            </p>
          )}
        </Container>
      </div>

      <Container className="py-10">
        {vendors.length === 0 ? (
          <div className="border-ink-200 rounded-xl border border-dashed p-12 text-center">
            <p className="font-display text-ink-900 text-xl">Nothing matches those filters yet</p>
            <p className="text-ink-600 mx-auto mt-2 max-w-md text-sm">
              We are still onboarding {category?.pluralName.toLowerCase()} in this area. Try
              removing a style filter, or browse the whole city.
            </p>
            <Link
              href={`/${citySlug}/${categorySlug}`}
              className="text-primary-700 hover:text-primary-800 mt-5 inline-block text-sm font-medium"
            >
              See all {category?.pluralName.toLowerCase()} in {city?.name} →
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((vendor, i) => (
              <VendorCard
                key={vendor.slug}
                vendor={vendor}
                href={`/vendor/${vendor.slug}`}
                priority={i < 3}
              />
            ))}
          </div>
        )}

        {/* Plan §12: internal linking is what gets locality pages indexed, and the FAQ
            is what wins the long-tail queries a couple actually types. */}
        {!localitySlug && category && city && (
          <CategorySeoBlock
            citySlug={citySlug}
            cityName={city.name}
            categorySlug={categorySlug}
            categoryName={category.name}
            categoryPlural={category.pluralName}
            localities={localityCounts}
            priceRungs={content.priceRungs}
            faqs={content.faqs(city.name)}
          />
        )}
      </Container>
    </>
  )
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'bg-ink-900 rounded-full px-3.5 py-1.5 text-sm font-medium text-white'
          : 'border-ink-200 bg-surface-raised text-ink-700 hover:border-ink-300 hover:text-ink-900 rounded-full border px-3.5 py-1.5 text-sm transition-colors'
      }
    >
      {label}
    </Link>
  )
}

function buildHref(
  base: string,
  params: { styles?: string[]; freeOn?: string; sort?: string },
): string {
  const search = new URLSearchParams()
  for (const style of params.styles ?? []) search.append('styles', style)
  if (params.freeOn) search.set('freeOn', params.freeOn)
  if (params.sort && params.sort !== 'relevance') search.set('sort', params.sort)
  const qs = search.toString()
  return qs ? `${base}?${qs}` : base
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function numParam(value: string | string[] | undefined): number | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

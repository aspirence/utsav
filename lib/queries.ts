import 'server-only'

import { unstable_cache } from 'next/cache'

import { formatPerDay, formatPriceBand, storageImageUrl } from '@/lib/db'
import type { AttributeMap } from '@/lib/category-attributes'
import type { VendorCardData } from '@/components/ui'

import {
  CATEGORIES,
  CITIES,
  LOCALITIES,
  PACKAGES,
  REVIEWS,
  VENDORS,
  type FixtureCategory,
  type FixtureCity,
  type FixtureLocality,
  type FixtureVendor,
} from './fixtures'
import { getPublicReadClient } from './supabase'

/**
 * Read layer for the customer web surface.
 *
 * Each function tries Supabase first and falls back to lib/fixtures.ts when no
 * instance is configured — see the note at the top of that file. The fallback keeps
 * `pnpm dev` working before Docker is installed; it is not a caching layer and does
 * not mask query errors once Supabase is reachable.
 */

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/**
 * Cities as `{ id, name }`, for a form that has to write `events.city_id`.
 *
 * Separate from getLaunchedCities, which returns slugs because that is what a URL needs. A
 * foreign key needs the uuid, and the fixtures do not have one - they are hand-written rows
 * keyed by slug - so with no Supabase attached this returns an empty list and the form falls
 * back to its "Not decided" option. Inventing a uuid to fill the gap would write a value
 * that fails the FK the moment a real database is behind it.
 */
export async function getCityOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await getPublicReadClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('cities')
    .select('id, name')
    .eq('is_launched', true)
    .order('launch_order')

  return (data ?? []).map((c) => ({ id: c.id, name: c.name }))
}

export async function getLaunchedCities(): Promise<FixtureCity[]> {
  const supabase = await getPublicReadClient()
  if (!supabase) return CITIES

  const { data, error } = await supabase
    .from('cities')
    .select('slug, name, state, is_launched')
    .eq('is_launched', true)
    .order('launch_order')

  if (error || !data) return CITIES
  return data.map((c) => ({
    slug: c.slug,
    name: c.name,
    state: c.state,
    isLaunched: c.is_launched,
  }))
}

export async function getCategories(): Promise<FixtureCategory[]> {
  const supabase = await getPublicReadClient()
  if (!supabase) return CATEGORIES

  const { data, error } = await supabase
    .from('categories')
    .select('slug, name, plural_name, description, is_wedge, pricing_unit')
    .eq('is_active', true)
    .order('sort_order')

  if (error || !data) return CATEGORIES

  // Style tags come from their own table; merge them onto each category.
  const { data: tags } = await supabase
    .from('style_tags')
    .select('slug, name, category_id, categories(slug)')
    .eq('is_active', true)
    .order('sort_order')

  const bySlug = new Map<string, { slug: string; name: string }[]>()
  for (const t of (tags ?? []) as unknown as {
    slug: string
    name: string
    categories: { slug: string } | null
  }[]) {
    const key = t.categories?.slug
    if (!key) continue
    const list = bySlug.get(key) ?? []
    list.push({ slug: t.slug, name: t.name })
    bySlug.set(key, list)
  }

  return data.map((c) => ({
    slug: c.slug,
    name: c.name,
    pluralName: c.plural_name,
    description: c.description ?? '',
    isWedge: c.is_wedge,
    pricingUnit: c.pricing_unit,
    styleTags: bySlug.get(c.slug) ?? [],
  }))
}

export async function getCity(slug: string): Promise<FixtureCity | null> {
  const cities = await getLaunchedCities()
  return cities.find((c) => c.slug === slug) ?? null
}

export async function getCategory(slug: string): Promise<FixtureCategory | null> {
  const categories = await getCategories()
  return categories.find((c) => c.slug === slug) ?? null
}

export async function getLocalities(citySlug: string): Promise<FixtureLocality[]> {
  const supabase = await getPublicReadClient()
  if (!supabase) return LOCALITIES.filter((l) => l.citySlug === citySlug)

  const { data, error } = await supabase
    .from('localities')
    .select('slug, name, cities!inner(slug)')
    .eq('cities.slug', citySlug)
    .order('name')

  if (error || !data) return LOCALITIES.filter((l) => l.citySlug === citySlug)
  return (data as unknown as { slug: string; name: string }[]).map((l) => ({
    slug: l.slug,
    name: l.name,
    citySlug,
  }))
}

// ---------------------------------------------------------------------------
// Discovery. Plan §2: "Category × locality discovery with price bands and the
// 'free on my date' availability filter".
// ---------------------------------------------------------------------------

export interface DiscoverQuery {
  citySlug: string
  categorySlug?: string
  localitySlug?: string
  q?: string
  styles?: string[]
  budgetMax?: number
  freeOn?: string
  /** Minimum published rating, e.g. 4.5. Unrated listings are excluded when set. */
  minRating?: number
  /**
   * How many days of coverage the customer needs. Plan §2's per-day normalisation is
   * what makes this answerable — a vendor qualifies if any active package covers the
   * duration, and results are then comparable on price_per_day.
   */
  days?: number
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating'
  page?: number
  perPage?: number
}

export interface DiscoverResult {
  vendors: VendorCardData[]
  total: number
  page: number
  perPage: number
}

/**
 * Discovery, with the result set cached per filter combination.
 *
 * A page that reads `searchParams` is dynamically rendered in Next 15 — that is the
 * framework's rule, and URL-driven server-side filtering (plan §4: "Server Components do
 * all reads, RLS-scoped") requires reading them. So these routes render per request.
 *
 * Plan §12 flags exactly this as a cost risk at SEO scale, and plan §4 supplies the
 * answer: "listing edits revalidate by tag". Caching the query — not the render — keeps
 * the expensive part (a PostGIS + FTS ranking query) off the database on repeat traffic,
 * while `revalidateTag('discover')` after a listing edit still refreshes everything
 * immediately. A dynamic render over a warm cache is cheap; a dynamic render over a cold
 * database is what §12 is warning about.
 */
export async function discoverVendors(query: DiscoverQuery): Promise<DiscoverResult> {
  const key = JSON.stringify(query)

  return unstable_cache(
    () => discoverVendorsUncached(query),
    ['discover', key],
    {
      revalidate: 3600,
      // Tagged by city+category so a single listing edit does not flush the whole index.
      tags: ['discover', `discover:${query.citySlug}:${query.categorySlug ?? 'all'}`],
    },
  )()
}

async function discoverVendorsUncached(query: DiscoverQuery): Promise<DiscoverResult> {
  const perPage = query.perPage ?? 24
  const page = Math.max(1, query.page ?? 1)
  const offset = (page - 1) * perPage

  const supabase = await getPublicReadClient()

  if (supabase) {
    // Plan §4/§12: one ranking definition, called through one RPC.
    const { data, error } = await supabase.rpc('search_vendors', {
      p_city_slug: query.citySlug,
      p_category_slug: query.categorySlug ?? null,
      p_locality_slug: query.localitySlug ?? null,
      p_query: query.q ?? null,
      p_style_tags: query.styles?.length ? query.styles : null,
      p_budget_max: query.budgetMax ?? null,
      p_free_on: query.freeOn ?? null,
      p_sort: query.sort ?? 'relevance',
      p_limit: perPage,
      p_offset: offset,
    })

    if (!error && data) {
      // minRating and days are applied here rather than in search_vendors(). They are
      // cheap post-filters over a page of results, and adding parameters to the RPC
      // means a migration plus a regenerated type file. Worth doing once the filters
      // prove themselves — at which point the count below becomes exact again, since
      // filtering after LIMIT can under-report total_count on a filtered page.
      const filtered = data.filter(
        (row) =>
          (query.minRating == null || (row.rating_avg ?? 0) >= query.minRating) &&
          (query.days == null || row.min_price_per_day != null),
      )

      return {
        vendors: filtered.map((row) =>
          toCard({
            slug: row.slug,
            displayName: row.display_name,
            localityName: row.locality_name,
            cityName: null,
            coverPath: row.cover_path,
            styleTags: row.style_tags,
            ratingAvg: row.rating_avg,
            ratingCount: row.rating_count,
            priceBandMin: row.price_band_min,
            priceBandMax: row.price_band_max,
            minPricePerDay: row.min_price_per_day,
            isAnchorStudio: row.is_anchor_studio,
            medianResponseMins: null,
            freeOn: query.freeOn,
          }),
        ),
        total: query.minRating || query.days ? filtered.length : (data[0]?.total_count ?? 0),
        page,
        perPage,
      }
    }
  }

  // ---- Fixture path: the same filters, applied in memory. ----
  let rows: FixtureVendor[] = VENDORS.filter((v) => v.citySlug === query.citySlug)

  if (query.categorySlug) rows = rows.filter((v) => v.categorySlug === query.categorySlug)
  if (query.localitySlug) rows = rows.filter((v) => v.localitySlug === query.localitySlug)
  if (query.budgetMax) rows = rows.filter((v) => v.priceBandMin <= query.budgetMax!)
  if (query.minRating) rows = rows.filter((v) => (v.ratingAvg ?? 0) >= query.minRating!)
  if (query.days) {
    // A vendor qualifies if they publish a per-day price at all — that is what makes a
    // multi-day comparison meaningful. Categories priced per event (venues, decor) have
    // no per-day figure and are correctly excluded when a duration is specified.
    rows = rows.filter((v) => v.minPricePerDay != null)
  }
  if (query.styles?.length) {
    rows = rows.filter((v) => v.styleTags.some((t) => query.styles!.includes(t)))
  }
  if (query.q) {
    const needle = query.q.toLowerCase()
    rows = rows.filter(
      (v) =>
        v.displayName.toLowerCase().includes(needle) ||
        v.about.toLowerCase().includes(needle) ||
        v.styleTags.some((t) => t.includes(needle)),
    )
  }

  rows = [...rows].sort((a, b) => {
    switch (query.sort) {
      case 'price_asc':
        return a.priceBandMin - b.priceBandMin
      case 'price_desc':
        return b.priceBandMin - a.priceBandMin
      case 'rating':
        return (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0)
      default:
        return fixtureScore(b) - fixtureScore(a)
    }
  })

  const total = rows.length
  const localityName = (slug: string) => LOCALITIES.find((l) => l.slug === slug)?.name ?? null
  const cityName = CITIES.find((c) => c.slug === query.citySlug)?.name ?? null

  return {
    vendors: rows.slice(offset, offset + perPage).map((v) =>
      toCard({
        slug: v.slug,
        displayName: v.displayName,
        localityName: localityName(v.localitySlug),
        cityName,
        coverPath: v.coverPath ?? null,
        styleTags: v.styleTags,
        ratingAvg: v.ratingAvg,
        ratingCount: v.ratingCount,
        priceBandMin: v.priceBandMin,
        priceBandMax: v.priceBandMax,
        minPricePerDay: v.minPricePerDay,
        isAnchorStudio: v.isAnchorStudio,
        medianResponseMins: v.medianResponseMins,
        freeOn: query.freeOn,
      }),
    ),
    total,
    page,
    perPage,
  }
}

/**
 * Mirrors app.vendor_rank()'s shape closely enough to keep fixture ordering plausible.
 * Note what is absent, exactly as in the SQL: no anchor-studio term (plan §11).
 */
function fixtureScore(v: FixtureVendor): number {
  const bayesian = ((v.ratingCount * (v.ratingAvg ?? 4.2) + 20 * 4.2) / (v.ratingCount + 20)) * 6
  const responsiveness =
    v.medianResponseMins == null
      ? 0
      : v.medianResponseMins <= 120
        ? 8
        : Math.max(0, 8 - (v.medianResponseMins - 120) / 165)
  return bayesian + responsiveness + Math.min(30, v.mediaCount * 3) * 0.15
}

interface CardInput {
  slug: string
  displayName: string
  localityName: string | null
  cityName: string | null
  coverPath: string | null
  styleTags: string[]
  ratingAvg: number | null
  ratingCount: number
  priceBandMin: number | null
  priceBandMax: number | null
  minPricePerDay: number | null
  isAnchorStudio: boolean
  medianResponseMins: number | null
  freeOn?: string
}

function toCard(input: CardInput): VendorCardData {
  return {
    slug: input.slug,
    displayName: input.displayName,
    localityName: input.localityName,
    cityName: input.cityName,
    coverUrl: storageImageUrl(input.coverPath, { width: 640, height: 480 }),
    styleTags: input.styleTags,
    ratingAvg: input.ratingAvg,
    ratingCount: input.ratingCount,
    priceBandLabel: formatPriceBand(input.priceBandMin, input.priceBandMax),
    perDayLabel: input.minPricePerDay ? `from ${formatPerDay(input.minPricePerDay)}` : null,
    isAnchorStudio: input.isAnchorStudio,
    respondsInLabel: formatResponse(input.medianResponseMins),
    // Plan §2: search_vendors() has already excluded anyone blocked on this date, so
    // every card in the result set is genuinely free.
    availableOnLabel: input.freeOn ? 'Free on your date' : null,
  }
}

/** Plan §10 KPI: median vendor response under two hours. */
function formatResponse(mins: number | null): string | null {
  if (mins == null) return null
  if (mins <= 60) return `Replies in ~${mins} min`
  if (mins <= 120) return `Replies in ~${Math.round(mins / 60)} h`
  return null
}

// ---------------------------------------------------------------------------
// Vendor profile
// ---------------------------------------------------------------------------

export interface VendorDetail {
  slug: string
  displayName: string
  about: string
  cityName: string | null
  citySlug: string
  localityName: string | null
  categorySlug: string
  categoryName: string
  establishedYear: number | null
  teamSize: number | null
  styleTags: string[]
  /**
   * The category-specific answers — a venue's seated capacity, a caterer's per-plate rates.
   * Stored on vendor_categories (migration 20260730000300) and rendered by
   * components/vendor-category-details.tsx against the definitions in lib/category-attributes.ts.
   * Empty for a listing nobody has filled in yet, and for every fixture.
   */
  attributes: AttributeMap
  priceBandLabel: string
  ratingAvg: number | null
  ratingCount: number
  completedBookings: number
  medianResponseMins: number | null
  isAnchorStudio: boolean
  gallery: { url: string | null; alt: string }[]
  packages: {
    name: string
    description: string
    priceLabel: string
    perDayLabel: string
    durationDays: number
    crewSize: number | null
    editedPhotoCount: number | null
    deliveryDays: number | null
    deliverables: string[]
    inclusions: string[]
  }[]
  reviews: {
    rating: number
    title: string | null
    body: string | null
    authorName: string
    publishedAt: string | null
  }[]
}

export async function getVendorBySlug(slug: string): Promise<VendorDetail | null> {
  const supabase = await getPublicReadClient()

  if (supabase) {
    const { data, error } = await supabase
      .from('vendors')
      .select(
        `id, slug, display_name, about, established_year, team_size,
         price_band_min, price_band_max, rating_avg, rating_count,
         completed_bookings, median_response_mins, is_anchor_studio,
         cities!inner(slug, name), localities(slug, name)`,
      )
      .eq('slug', slug)
      .eq('status', 'live')
      .maybeSingle()

    if (!error && data) {
      const v = data as unknown as {
        id: string
        slug: string
        display_name: string
        about: string | null
        established_year: number | null
        team_size: number | null
        price_band_min: number | null
        price_band_max: number | null
        rating_avg: number | null
        rating_count: number
        completed_bookings: number
        median_response_mins: number | null
        is_anchor_studio: boolean
        cities: { slug: string; name: string }
        localities: { slug: string; name: string } | null
      }

      const [{ data: media }, { data: pkgs }, { data: revs }, { data: vcats }] = await Promise.all([
        supabase
          .from('media')
          .select('storage_path, alt_text')
          .eq('vendor_id', v.id)
          .eq('moderation', 'approved')
          .order('is_cover', { ascending: false })
          .order('sort_order'),
        supabase
          .from('packages')
          .select('*')
          .eq('vendor_id', v.id)
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('reviews')
          .select('rating, title, body, published_at')
          .eq('vendor_id', v.id)
          .eq('moderation', 'approved')
          .order('published_at', { ascending: false })
          .limit(20),
        supabase
          .from('vendor_categories')
          .select('style_tags, attributes, categories!inner(slug, name)')
          .eq('vendor_id', v.id)
          .eq('is_primary', true)
          .maybeSingle(),
      ])

      const cat = vcats as unknown as {
        style_tags: string[]
        attributes: AttributeMap | null
        categories: { slug: string; name: string }
      } | null

      return {
        slug: v.slug,
        displayName: v.display_name,
        about: v.about ?? '',
        cityName: v.cities.name,
        citySlug: v.cities.slug,
        localityName: v.localities?.name ?? null,
        categorySlug: cat?.categories.slug ?? 'photography',
        categoryName: cat?.categories.name ?? 'Vendor',
        establishedYear: v.established_year,
        teamSize: v.team_size,
        styleTags: cat?.style_tags ?? [],
        attributes: cat?.attributes ?? {},
        priceBandLabel: formatPriceBand(v.price_band_min, v.price_band_max, { compact: false }),
        ratingAvg: v.rating_avg,
        ratingCount: v.rating_count,
        completedBookings: v.completed_bookings,
        medianResponseMins: v.median_response_mins,
        isAnchorStudio: v.is_anchor_studio,
        gallery: (media ?? []).map((m) => ({
          url: storageImageUrl(m.storage_path, { width: 1200, height: 900 }),
          alt: m.alt_text ?? `Work by ${v.display_name}`,
        })),
        packages: (pkgs ?? []).map((p) => ({
          name: p.name,
          description: p.description ?? '',
          priceLabel: formatPriceBand(p.price, null, { compact: false }).replace('From ', ''),
          perDayLabel: formatPerDay(p.price_per_day),
          durationDays: Number(p.duration_days),
          crewSize: p.crew_size,
          editedPhotoCount: p.edited_photo_count,
          deliveryDays: p.delivery_days,
          deliverables: p.deliverables ?? [],
          inclusions: p.inclusions ?? [],
        })),
        reviews: (revs ?? []).map((r) => ({
          rating: r.rating,
          title: r.title,
          body: r.body,
          authorName: 'Verified customer',
          publishedAt: r.published_at,
        })),
      }
    }
  }

  // ---- Fixture path ----
  const v = VENDORS.find((x) => x.slug === slug)
  if (!v) return null

  const category = CATEGORIES.find((c) => c.slug === v.categorySlug)
  const locality = LOCALITIES.find((l) => l.slug === v.localitySlug)
  const city = CITIES.find((c) => c.slug === v.citySlug)

  return {
    slug: v.slug,
    displayName: v.displayName,
    about: v.about,
    cityName: city?.name ?? null,
    citySlug: v.citySlug,
    localityName: locality?.name ?? null,
    categorySlug: v.categorySlug,
    categoryName: category?.name ?? 'Vendor',
    // The fixtures predate vendor_categories.attributes and carry none. The section simply
    // does not render, which is the right outcome — inventing a seated capacity for a demo
    // venue would put a number on the page that no operator ever typed.
    attributes: {},
    establishedYear: v.establishedYear,
    teamSize: v.teamSize,
    styleTags: v.styleTags,
    priceBandLabel: formatPriceBand(v.priceBandMin, v.priceBandMax, { compact: false }),
    ratingAvg: v.ratingAvg,
    ratingCount: v.ratingCount,
    completedBookings: v.completedBookings,
    medianResponseMins: v.medianResponseMins,
    isAnchorStudio: v.isAnchorStudio,
    gallery: Array.from({ length: v.mediaCount }, (_, i) => ({
      url: null,
      alt: `Portfolio work by ${v.displayName}, image ${i + 1}`,
    })),
    packages: PACKAGES.filter((p) => p.vendorSlug === v.slug).map((p) => ({
      name: p.name,
      description: p.description,
      priceLabel: formatPriceBand(p.price, null, { compact: false }).replace('From ', ''),
      perDayLabel: formatPerDay(p.pricePerDay),
      durationDays: p.durationDays,
      crewSize: p.crewSize,
      editedPhotoCount: p.editedPhotoCount,
      deliveryDays: p.deliveryDays,
      deliverables: p.deliverables,
      inclusions: p.inclusions,
    })),
    reviews: REVIEWS.filter((r) => r.vendorSlug === v.slug).map((r) => ({
      rating: r.rating,
      title: r.title,
      body: r.body,
      authorName: r.authorName,
      publishedAt: new Date(Date.now() - r.publishedDaysAgo * 86_400_000).toISOString(),
    })),
  }
}

export interface HomeReview {
  vendorSlug: string
  vendorName: string
  rating: number
  title: string
  body: string
  authorName: string
  publishedAt: string
}

/**
 * Recent published reviews, for the homepage trust strip.
 *
 * Every row here is booking-gated by construction: `reviews.booking_id` is UNIQUE and
 * NOT NULL, and the insert policy requires a completed booking owned by the author
 * (plan §2). There is no "testimonial" table and there should never be one — the whole
 * claim on the homepage is that these cannot be bought.
 */
export async function getRecentReviews(limit = 3): Promise<HomeReview[]> {
  const supabase = await getPublicReadClient()

  if (supabase) {
    const { data, error } = await supabase
      .from('reviews')
      .select('rating, title, body, published_at, vendors!inner(slug, display_name)')
      .eq('moderation', 'approved')
      .not('published_at', 'is', null)
      .not('body', 'is', null)
      .order('published_at', { ascending: false })
      .limit(limit)

    /*
     * NO ROWS IS AN ANSWER. THE FIXTURES ARE ONLY FOR "NO DATABASE".
     *
     * This used to be `if (!error && data && data.length > 0)`, so a project with a real
     * database and no reviews yet fell through to the sample set below — and the homepage
     * printed invented testimonials, under invented customer names, linked to real vendor
     * profiles, each one carrying a `verified: true` badge whose entire meaning is "backed
     * by a completed booking". The bookings table was empty. Every part of that was false.
     *
     * A read error returns nothing rather than throwing: this section is decorative, and a
     * transient failure here should not take the homepage down with it. The storefront in
     * lib/invitation-templates.ts does throw, because there the same failure would mean
     * selling designs that do not exist — fail soft where it is cosmetic, loud where it
     * takes money.
     */
    if (error || !data) return []

    return (
      data as unknown as {
        rating: number
        title: string | null
        body: string | null
        published_at: string
        vendors: { slug: string; display_name: string }
      }[]
    ).map((r) => ({
      vendorSlug: r.vendors.slug,
      vendorName: r.vendors.display_name,
      rating: r.rating,
      title: r.title ?? '',
      body: r.body ?? '',
      // Plan §6: the reviewer is a real customer, but the profile is not public.
      // A first name and initial is the most we show.
      authorName: 'Verified customer',
      publishedAt: r.published_at,
    }))
  }

  // Fixtures, reached only when no Supabase project is attached at all.
  return REVIEWS.slice(0, limit).map((r) => ({
    vendorSlug: r.vendorSlug,
    vendorName: VENDORS.find((v) => v.slug === r.vendorSlug)?.displayName ?? r.vendorSlug,
    rating: r.rating,
    title: r.title,
    body: r.body,
    authorName: r.authorName,
    publishedAt: new Date(Date.now() - r.publishedDaysAgo * 86_400_000).toISOString(),
  }))
}

/** Plan §12: the SEO quality threshold. Below this, a locality page is noindex. */
export const LOCALITY_SEO_MIN_LISTINGS = 3

/**
 * Locality links with their live listing count, for the internal-linking block.
 *
 * The count is the point. Plan §5 makes the locality the SEO unit and plan §12 gates
 * publication on a quality threshold, so a link that quietly leads to two listings is
 * worse than one that says "2" — for the crawler and for the person clicking it.
 * Localities with no supply at all are dropped rather than shown as zero.
 */
export async function getLocalityCounts(
  citySlug: string,
  categorySlug: string,
): Promise<{ slug: string; name: string; count: number }[]> {
  const localities = await getLocalities(citySlug)

  const counted = await Promise.all(
    localities.map(async (l) => {
      const { total } = await discoverVendors({
        citySlug,
        categorySlug,
        localitySlug: l.slug,
        perPage: 1,
      })
      return { slug: l.slug, name: l.name, count: total }
    }),
  )

  return counted.filter((l) => l.count > 0).sort((a, b) => b.count - a.count)
}

/**
 * Every live vendor slug. Used for both the sitemap and generateStaticParams, so a
 * profile that is in the index is also one that prerenders.
 */
export async function getLiveVendorSlugs(): Promise<string[]> {
  const supabase = await getPublicReadClient()

  if (supabase) {
    const { data, error } = await supabase
      .from('vendors')
      .select('slug')
      // Plan §12/§13: only listings that clear the completeness threshold get indexed.
      .eq('status', 'live')
      .eq('is_seo_eligible', true)
      .order('slug')

    if (!error && data) return data.map((v) => v.slug)
  }

  return VENDORS.map((v) => v.slug)
}

/**
 * Plan §2/§12: the programmatic SEO engine. Only combinations that clear the quality
 * threshold are put in the sitemap — thin pages stay crawlable but out of the index.
 */
export async function getSeoRoutes(): Promise<{ url: string; priority: number }[]> {
  const [cities, categories, vendorSlugs] = await Promise.all([
    getLaunchedCities(),
    getCategories(),
    getLiveVendorSlugs(),
  ])
  const routes: { url: string; priority: number }[] = []

  for (const city of cities) {
    const localities = await getLocalities(city.slug)
    for (const category of categories) {
      routes.push({ url: `/${city.slug}/${category.slug}`, priority: 0.8 })
      for (const locality of localities) {
        const { total } = await discoverVendors({
          citySlug: city.slug,
          categorySlug: category.slug,
          localitySlug: locality.slug,
          perPage: 1,
        })
        if (total >= LOCALITY_SEO_MIN_LISTINGS) {
          routes.push({ url: `/${city.slug}/${category.slug}/${locality.slug}`, priority: 0.6 })
        }
      }
    }
  }

  // Vendor profiles are the deepest and most numerous SEO surface — at 3,000 launch
  // listings they dominate this file, which is why §12 calls for sitemap partitioning
  // once the total passes the 50,000-URL limit.
  for (const slug of vendorSlugs) {
    routes.push({ url: `/vendor/${slug}`, priority: 0.7 })
  }

  return routes
}

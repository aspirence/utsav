import 'server-only'

import { getServerClientOrNull } from '@/lib/admin-supabase'

/**
 * The reference lists a "create listing" form needs: which cities we operate in, which
 * localities sit inside them, and which categories a listing can belong to.
 *
 * These are foreign keys, not free text. `vendors.city_id` references public.cities with
 * `on delete restrict` and `vendor_categories.category_id` references public.categories, so a
 * typed city name is a failed insert. The form has to offer real rows or nothing.
 *
 * Read on the staff member's own session like everything else in the console. Cities,
 * localities and categories are all publicly readable, so RLS is not doing much work here -
 * but using the same client keeps one rule in the console instead of two.
 *
 * The fallback mirrors supabase/seed/00_geo.sql and 01_catalog.sql. That is a real duplication
 * and worth naming: without it, the create form on a machine with no database attached would
 * be three empty dropdowns, which teaches an operator nothing about what the screen does.
 * The ids are absent from the fallback on purpose - a fake uuid that looks real is how you
 * end up with a form that appears to work and writes nothing.
 */

export interface RefLocality {
  id: string | null
  slug: string
  name: string
}

export interface RefCity {
  id: string | null
  slug: string
  name: string
  state: string
  isLaunched: boolean
  localities: RefLocality[]
}

export interface RefCategory {
  id: string | null
  slug: string
  /** Singular - "Photographer". What you call one vendor. */
  name: string
  isWedge: boolean
}

export interface AdminReference {
  cities: RefCity[]
  categories: RefCategory[]
  /** False when these came from the seed mirror below rather than the database. */
  isLive: boolean
}

export async function getAdminReference(): Promise<AdminReference> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return { cities: DEMO_CITIES, categories: DEMO_CATEGORIES, isLive: false }

  /**
   * Three flat queries rather than one with `cities(..., localities(...))` embedded.
   *
   * packages/db/src/generated/database.types.ts is hand-authored and declares
   * `Relationships: []` on every table, so postgrest-js has no foreign-key metadata to
   * resolve an embed with and types the nested rows as a SelectQueryError. Grouping in JS
   * costs one extra round trip on a page that renders a form, and it does not depend on
   * relationship metadata that a hand-authored types file has no way to state.
   */
  const [cityRes, locRes, catRes] = await Promise.all([
    supabase
      .from('cities')
      .select('id, slug, name, state, is_launched')
      .order('launch_order', { ascending: true }),
    supabase
      .from('localities')
      .select('id, city_id, slug, name')
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('id, slug, name, is_wedge')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ])

  const cityRows = cityRes.data
  const catRows = catRes.data

  // Either list coming back empty means an unseeded database, not "we operate nowhere".
  // Falling back is better than rendering a form that cannot be submitted. Localities are
  // not in this guard - a city with none is a real, workable state; the form allows blank.
  if (!cityRows || cityRows.length === 0 || !catRows || catRows.length === 0) {
    return { cities: DEMO_CITIES, categories: DEMO_CATEGORIES, isLive: false }
  }

  const byCity = new Map<string, RefLocality[]>()
  for (const l of locRes.data ?? []) {
    const list = byCity.get(l.city_id)
    const entry = { id: l.id, slug: l.slug, name: l.name }
    if (list) list.push(entry)
    else byCity.set(l.city_id, [entry])
  }

  return {
    isLive: true,
    cities: cityRows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      state: c.state,
      isLaunched: c.is_launched,
      localities: byCity.get(c.id) ?? [],
    })),
    categories: catRows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      isWedge: c.is_wedge,
    })),
  }
}

// ---------------------------------------------------------------------------
// Seed mirror. Kept in the same order as the seed files so a diff between them is easy to
// read. Only the two launched cities carry localities, because those are the only two the
// seed gives any.
// ---------------------------------------------------------------------------

function loc(slug: string, name: string): RefLocality {
  return { id: null, slug, name }
}

const DEMO_CITIES: RefCity[] = [
  {
    id: null,
    slug: 'lucknow',
    name: 'Lucknow',
    state: 'Uttar Pradesh',
    isLaunched: true,
    localities: [
      loc('alambagh', 'Alambagh'),
      loc('aliganj', 'Aliganj'),
      loc('chowk', 'Chowk'),
      loc('electronic-city', 'Electronic City'),
      loc('faizabad-road', 'Faizabad Road'),
      loc('gomti-nagar', 'Gomti Nagar'),
      loc('hazratganj', 'Hazratganj'),
      loc('indira-nagar', 'Indira Nagar'),
      loc('kanpur-road', 'Kanpur Road'),
      loc('mahanagar', 'Mahanagar'),
      loc('sushant-golf-city', 'Sushant Golf City'),
      loc('yelahanka', 'Yelahanka'),
    ],
  },
  {
    id: null,
    slug: 'delhi-ncr',
    name: 'Delhi NCR',
    state: 'Delhi',
    isLaunched: true,
    localities: [
      loc('chattarpur', 'Chattarpur'),
      loc('dwarka', 'Dwarka'),
      loc('faridabad', 'Faridabad'),
      loc('ghaziabad', 'Ghaziabad'),
      loc('gurugram', 'Gurugram'),
      loc('hauz-khas', 'Hauz Khas'),
      loc('karol-bagh', 'Karol Bagh'),
      loc('noida', 'Noida'),
      loc('pitampura', 'Pitampura'),
      loc('rohini', 'Rohini'),
      loc('south-delhi', 'South Delhi'),
      loc('vasant-kunj', 'Vasant Kunj'),
    ],
  },
  {
    id: null,
    slug: 'mumbai',
    name: 'Mumbai',
    state: 'Maharashtra',
    isLaunched: false,
    localities: [],
  },
  {
    id: null,
    slug: 'hyderabad',
    name: 'Hyderabad',
    state: 'Telangana',
    isLaunched: false,
    localities: [],
  },
  { id: null, slug: 'pune', name: 'Pune', state: 'Maharashtra', isLaunched: false, localities: [] },
  {
    id: null,
    slug: 'chennai',
    name: 'Chennai',
    state: 'Tamil Nadu',
    isLaunched: false,
    localities: [],
  },
  {
    id: null,
    slug: 'jaipur',
    name: 'Jaipur',
    state: 'Rajasthan',
    isLaunched: false,
    localities: [],
  },
  {
    id: null,
    slug: 'ahmedabad',
    name: 'Ahmedabad',
    state: 'Gujarat',
    isLaunched: false,
    localities: [],
  },
]

const DEMO_CATEGORIES: RefCategory[] = [
  { id: null, slug: 'photography', name: 'Photographer', isWedge: true },
  { id: null, slug: 'videography', name: 'Videographer', isWedge: false },
  { id: null, slug: 'venues', name: 'Venue', isWedge: false },
  { id: null, slug: 'catering', name: 'Caterer', isWedge: false },
  { id: null, slug: 'decor', name: 'Decorator', isWedge: false },
  { id: null, slug: 'makeup', name: 'Makeup Artist', isWedge: false },
  { id: null, slug: 'mehendi', name: 'Mehendi Artist', isWedge: false },
  { id: null, slug: 'music-dj', name: 'Music & DJ', isWedge: false },
  { id: null, slug: 'choreography', name: 'Choreographer', isWedge: false },
  { id: null, slug: 'invitations', name: 'Invitation Designer', isWedge: false },
  { id: null, slug: 'transport', name: 'Transport', isWedge: false },
  { id: null, slug: 'pandit', name: 'Pandit', isWedge: false },
  { id: null, slug: 'anchors', name: 'Anchor', isWedge: false },
  { id: null, slug: 'gifting', name: 'Gifting', isWedge: false },
]

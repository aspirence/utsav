import 'server-only'

import type { AttributeMap } from '@/lib/category-attributes'
import { getServerClientOrNull } from '@/lib/admin-supabase'

/**
 * A listing's primary category and its category-specific details.
 *
 * The attributes live on `vendor_categories` — the vendor *in a category* — so this resolves the
 * listing, finds its primary link, and reads the JSONB from there. Three hops rather than one
 * embed for the reason the rest of the console has: database.types.ts is hand-authored with
 * `Relationships: []`, so postgrest types a nested select as a SelectQueryError.
 *
 * With no database attached it falls back to the roster's own category name, so the form still
 * renders the right questions for a venue or a caterer while building.
 */

export interface VendorCategoryDetails {
  categorySlug: string
  categoryName: string
  values: AttributeMap
  isDemo: boolean
}

export async function getVendorCategoryDetails(
  vendorSlug: string,
  /** From the console's roster, so the demo path knows what kind of listing this is. */
  fallbackCategoryName: string,
): Promise<VendorCategoryDetails> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return demoFor(fallbackCategoryName)

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('slug', vendorSlug)
    .maybeSingle()

  if (!vendor) return demoFor(fallbackCategoryName)

  const { data: links } = await supabase
    .from('vendor_categories')
    .select('category_id, is_primary, attributes')
    .eq('vendor_id', vendor.id)

  const primary = links?.find((l) => l.is_primary) ?? links?.[0]
  if (!primary) return { categorySlug: '', categoryName: fallbackCategoryName, values: {}, isDemo: false }

  const { data: category } = await supabase
    .from('categories')
    .select('slug, name')
    .eq('id', primary.category_id)
    .maybeSingle()

  return {
    categorySlug: category?.slug ?? '',
    categoryName: category?.name ?? fallbackCategoryName,
    // The column is `jsonb not null default '{}'`, and a CHECK guarantees it is an object — but a
    // row written before that migration would be undefined here, so the fallback stays.
    values: (primary.attributes as AttributeMap | null) ?? {},
    isDemo: false,
  }
}

/**
 * The roster stores a display name ("Venues", "Catering"), the attribute definitions are keyed by
 * slug. One small map rather than a lookup, because the demo path is the only caller and a wrong
 * guess here shows the wrong questions — which is exactly the bug this whole change is fixing.
 */
const NAME_TO_SLUG: Record<string, string> = {
  Photography: 'photography',
  Venues: 'venues',
  Catering: 'catering',
  Decor: 'decor',
  Makeup: 'makeup',
}

/**
 * Sample answers, so each category's form shows what a filled-in listing looks like rather than a
 * grid of empty boxes. Money values are paise, matching the column.
 */
const DEMO_VALUES: Record<string, AttributeMap> = {
  venues: {
    seatedCapacity: 450,
    floatingCapacity: 800,
    halls: 2,
    rooms: 24,
    parking: 150,
    venueType: 'Lawn',
    rentPerDay: 18_000_000,
    inHouseCatering: true,
    outsideCateringAllowed: false,
    outsideDecorAllowed: true,
    alcoholAllowed: true,
    amenities: ['Generator', 'Valet', 'Bridal room'],
  },
  catering: {
    vegPerPlate: 85_000,
    nonVegPerPlate: 115_000,
    minGuests: 150,
    cuisines: ['Awadhi', 'Mughlai', 'Chaat', 'Continental'],
    liveCounters: true,
    jainSatvik: true,
    barService: false,
    servingStaffIncluded: true,
    tastingAvailable: true,
    noticeDays: 15,
  },
  decor: {
    setups: ['Mandap', 'Stage', 'Entrance', 'Haldi'],
    startingPrice: 6_500_000,
    flowerType: 'Both',
    lighting: true,
    themes: ['Royal', 'Floral', 'Minimal'],
    setupHours: 8,
    noticeDays: 10,
    venueTieUps: true,
  },
  makeup: {
    bridalPrice: 3_500_000,
    partyPrice: 350_000,
    products: ['MAC', 'Bobbi Brown', 'Huda Beauty'],
    techniques: ['HD', 'Airbrush', 'Natural'],
    trialAvailable: true,
    trialPrice: 500_000,
    travelsToVenue: true,
    hairIncluded: true,
    drapingIncluded: true,
    teamSize: 3,
    hoursPerBride: 4,
  },
  photography: {
    deliveryDays: 21,
    editedPhotos: 600,
    crewSize: 4,
    droneAvailable: true,
    albumIncluded: false,
    rawHandover: false,
    sameDayEdit: true,
  },
}

function demoFor(categoryName: string): VendorCategoryDetails {
  const slug = NAME_TO_SLUG[categoryName] ?? ''
  return {
    categorySlug: slug,
    categoryName,
    values: DEMO_VALUES[slug] ?? {},
    isDemo: true,
  }
}

/**
 * Local fixture dataset — mirrors supabase/seed/03_demo.sql.
 *
 * Plan §9 says local development runs `supabase start` + seed, which needs Docker.
 * Until that is installed, every query in lib/queries.ts falls back to this module so
 * `pnpm dev` renders a real-looking site with no infrastructure at all. The moment
 * NEXT_PUBLIC_SUPABASE_URL is set, the fallback stops being used.
 *
 * Keep this in sync with the seed, or delete it once the local stack is the norm.
 */

export interface FixtureCity {
  slug: string
  name: string
  state: string
  isLaunched: boolean
}

export interface FixtureLocality {
  slug: string
  name: string
  citySlug: string
}

export interface FixtureCategory {
  slug: string
  name: string
  pluralName: string
  description: string
  isWedge: boolean
  pricingUnit: string
  styleTags: { slug: string; name: string }[]
}

export interface FixtureVendor {
  slug: string
  displayName: string
  citySlug: string
  localitySlug: string
  categorySlug: string
  about: string
  establishedYear: number
  teamSize: number
  styleTags: string[]
  priceBandMin: number
  priceBandMax: number
  minPricePerDay: number | null
  ratingAvg: number | null
  ratingCount: number
  medianResponseMins: number | null
  completedBookings: number
  isAnchorStudio: boolean
  mediaCount: number
  /**
   * Cover artwork, as a path under apps/web/public. Optional: a vendor without one falls
   * through to the placeholder in the card, which is the honest state while supply is
   * still being photographed.
   *
   * Against the database this field is a `cover_path` — a key inside the vendor-media
   * bucket, with no leading slash. storageImageUrl() branches on that slash, so a local
   * path here is served straight from public/ and a real key still goes through the
   * Supabase CDN transform (plan §12).
   */
  coverPath?: string
}

export const CITIES: FixtureCity[] = [
  { slug: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', isLaunched: true },
  { slug: 'delhi-ncr', name: 'Delhi NCR', state: 'Delhi', isLaunched: true },
]

export const LOCALITIES: FixtureLocality[] = [
  { slug: 'gomti-nagar', name: 'Gomti Nagar', citySlug: 'lucknow' },
  { slug: 'hazratganj', name: 'Hazratganj', citySlug: 'lucknow' },
  { slug: 'sushant-golf-city', name: 'Sushant Golf City', citySlug: 'lucknow' },
  { slug: 'aliganj', name: 'Aliganj', citySlug: 'lucknow' },
  { slug: 'indira-nagar', name: 'Indira Nagar', citySlug: 'lucknow' },
  { slug: 'mahanagar', name: 'Mahanagar', citySlug: 'lucknow' },
  { slug: 'chowk', name: 'Chowk', citySlug: 'lucknow' },
  { slug: 'alambagh', name: 'Alambagh', citySlug: 'lucknow' },
  { slug: 'faizabad-road', name: 'Faizabad Road', citySlug: 'lucknow' },
  { slug: 'kanpur-road', name: 'Kanpur Road', citySlug: 'lucknow' },
  { slug: 'gurugram', name: 'Gurugram', citySlug: 'delhi-ncr' },
  { slug: 'noida', name: 'Noida', citySlug: 'delhi-ncr' },
  { slug: 'south-delhi', name: 'South Delhi', citySlug: 'delhi-ncr' },
  { slug: 'chattarpur', name: 'Chattarpur', citySlug: 'delhi-ncr' },
]

const photographyStyles = [
  { slug: 'candid', name: 'Candid' },
  { slug: 'traditional', name: 'Traditional' },
  { slug: 'cinematic', name: 'Cinematic' },
  { slug: 'documentary', name: 'Documentary' },
  { slug: 'fine-art', name: 'Fine Art' },
  { slug: 'pre-wedding', name: 'Pre-wedding' },
  { slug: 'drone', name: 'Drone / Aerial' },
  { slug: 'portrait', name: 'Portraiture' },
]

export const CATEGORIES: FixtureCategory[] = [
  {
    slug: 'photography',
    name: 'Photographer',
    pluralName: 'Photographers',
    description: 'Wedding and event photography — candid, traditional, cinematic and more.',
    isWedge: true,
    pricingUnit: 'per_day',
    styleTags: photographyStyles,
  },
  {
    slug: 'venues',
    name: 'Venue',
    pluralName: 'Venues',
    description: 'Banquet halls, farmhouses, resorts and lawns.',
    isWedge: false,
    pricingUnit: 'per_event',
    styleTags: [
      { slug: 'banquet', name: 'Banquet Hall' },
      { slug: 'farmhouse', name: 'Farmhouse' },
      { slug: 'resort', name: 'Resort' },
      { slug: 'heritage', name: 'Heritage' },
    ],
  },
  {
    slug: 'makeup',
    name: 'Makeup Artist',
    pluralName: 'Makeup Artists',
    description: 'Bridal and party makeup, hair and draping.',
    isWedge: false,
    pricingUnit: 'per_day',
    styleTags: [
      { slug: 'hd-makeup', name: 'HD Makeup' },
      { slug: 'airbrush', name: 'Airbrush' },
      { slug: 'natural', name: 'Natural' },
    ],
  },
  {
    slug: 'decor',
    name: 'Decorator',
    pluralName: 'Decorators',
    description: 'Stage, mandap, floral and lighting design.',
    isWedge: false,
    pricingUnit: 'per_event',
    styleTags: [
      { slug: 'floral', name: 'Floral' },
      { slug: 'minimal', name: 'Minimal' },
      { slug: 'royal', name: 'Royal / Grand' },
      { slug: 'boho', name: 'Boho' },
    ],
  },
  {
    slug: 'catering',
    name: 'Caterer',
    pluralName: 'Caterers',
    description: 'Multi-cuisine catering, live counters and bar service.',
    isWedge: false,
    pricingUnit: 'per_plate',
    styleTags: [
      { slug: 'north-indian', name: 'North Indian' },
      { slug: 'south-indian', name: 'South Indian' },
      { slug: 'jain-satvik', name: 'Jain / Satvik' },
      { slug: 'live-counters', name: 'Live Counters' },
    ],
  },
]

/** Amounts are integer paise, exactly as the database stores them (plan §5). */
export const VENDORS: FixtureVendor[] = [
  {
    slug: 'lightleak-studio',
    displayName: 'Lightleak Studio',
    citySlug: 'lucknow',
    localitySlug: 'gomti-nagar',
    categorySlug: 'photography',
    about:
      'A four-person candid team that has shot over 300 weddings across South India since 2016. We work quietly, stay out of the rituals, and hand over a full gallery in three weeks.',
    establishedYear: 2016,
    teamSize: 4,
    styleTags: ['candid', 'documentary', 'pre-wedding'],
    priceBandMin: 12_000_000,
    priceBandMax: 35_000_000,
    minPricePerDay: 11_000_000,
    ratingAvg: 5,
    ratingCount: 1,
    medianResponseMins: 38,
    completedBookings: 1,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'saat-phere-films',
    displayName: 'Saat Phere Films',
    citySlug: 'lucknow',
    localitySlug: 'hazratganj',
    categorySlug: 'photography',
    about:
      'Cinematic wedding films and photography under one roof. Known for same-day edits screened at the reception, and for destination weddings in Goa and Udaipur.',
    establishedYear: 2018,
    teamSize: 6,
    styleTags: ['cinematic', 'candid', 'drone'],
    priceBandMin: 18_000_000,
    priceBandMax: 60_000_000,
    minPricePerDay: 28_000_000,
    ratingAvg: 4.8,
    ratingCount: 42,
    medianResponseMins: 55,
    completedBookings: 61,
    isAnchorStudio: false,
    mediaCount: 8,
    coverPath: '/luck-2-1280.webp',
  },
  {
    slug: 'anantha-photography',
    displayName: 'Anantha Photography',
    citySlug: 'lucknow',
    localitySlug: 'aliganj',
    categorySlug: 'photography',
    about:
      'Three generations of traditional South Indian wedding photography — Tamil, Telugu and Kannada ceremonies. We know every ritual before the priest calls it, and we are set up before the muhurtham starts.',
    establishedYear: 1994,
    teamSize: 5,
    styleTags: ['traditional', 'portrait'],
    priceBandMin: 6_500_000,
    priceBandMax: 18_000_000,
    minPricePerDay: 8_500_000,
    ratingAvg: 4.6,
    ratingCount: 128,
    medianResponseMins: 95,
    completedBookings: 310,
    isAnchorStudio: false,
    mediaCount: 8,
    coverPath: '/luck-3-1280.webp',
  },
  {
    slug: 'the-mango-tree-co',
    displayName: 'The Mango Tree Co.',
    citySlug: 'lucknow',
    localitySlug: 'indira-nagar',
    categorySlug: 'photography',
    about:
      'Fine-art and editorial wedding photography for couples who want their album to look like a magazine.',
    establishedYear: 2019,
    teamSize: 3,
    styleTags: ['fine-art', 'editorial', 'pre-wedding'],
    priceBandMin: 22_000_000,
    priceBandMax: 55_000_000,
    minPricePerDay: 32_000_000,
    ratingAvg: 4.9,
    ratingCount: 31,
    medianResponseMins: 42,
    completedBookings: 44,
    isAnchorStudio: false,
    mediaCount: 8,
    coverPath: '/luck-1-1280.webp',
  },
  {
    slug: 'frame-by-frame',
    displayName: 'Frame by Frame',
    citySlug: 'lucknow',
    localitySlug: 'sushant-golf-city',
    categorySlug: 'photography',
    about:
      'Documentary-first coverage. One photographer, one film-maker, no posing, no interruptions.',
    establishedYear: 2020,
    teamSize: 2,
    styleTags: ['documentary', 'candid'],
    priceBandMin: 9_000_000,
    priceBandMax: 24_000_000,
    minPricePerDay: 11_000_000,
    ratingAvg: 4.7,
    ratingCount: 19,
    medianResponseMins: 28,
    completedBookings: 23,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'kalyana-clicks',
    displayName: 'Kalyana Clicks',
    citySlug: 'lucknow',
    localitySlug: 'chowk',
    categorySlug: 'photography',
    about:
      'Affordable full-day wedding coverage with a fast turnaround, serving Lucknow families since 2011 — Kannada, Tamil, Malayali and Christian ceremonies.',
    establishedYear: 2011,
    teamSize: 6,
    styleTags: ['traditional', 'candid'],
    priceBandMin: 4_500_000,
    priceBandMax: 12_000_000,
    minPricePerDay: 5_500_000,
    ratingAvg: 4.3,
    ratingCount: 87,
    medianResponseMins: 140,
    completedBookings: 190,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'northlight-studio',
    displayName: 'Northlight Studio',
    citySlug: 'lucknow',
    localitySlug: 'kanpur-road',
    categorySlug: 'photography',
    about:
      'Natural-light portraiture and pre-wedding shoots across Uttar Pradesh. Drone coverage in-house.',
    establishedYear: 2017,
    teamSize: 3,
    styleTags: ['portrait', 'pre-wedding', 'drone'],
    priceBandMin: 8_000_000,
    priceBandMax: 20_000_000,
    minPricePerDay: 9_000_000,
    ratingAvg: 4.5,
    ratingCount: 26,
    medianResponseMins: 65,
    completedBookings: 38,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'the-vermilion-project',
    displayName: 'The Vermilion Project',
    citySlug: 'lucknow',
    localitySlug: 'mahanagar',
    categorySlug: 'photography',
    about:
      'Bold, colour-forward wedding photography. We chase the loud moments, not the staged ones.',
    establishedYear: 2021,
    teamSize: 4,
    styleTags: ['candid', 'cinematic', 'fine-art'],
    priceBandMin: 14_000_000,
    priceBandMax: 38_000_000,
    minPricePerDay: 24_000_000,
    ratingAvg: 4.8,
    ratingCount: 14,
    medianResponseMins: 33,
    completedBookings: 17,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'fremmo-studio',
    displayName: 'Fremmo Studio',
    citySlug: 'lucknow',
    localitySlug: 'gomti-nagar',
    categorySlug: 'photography',
    about:
      "The in-house studio operated by Fremmo's founder. Listed under a public disclosure policy: no ranking preference, overflow bookings only, and capped at roughly 5% of category bookings.",
    establishedYear: 2026,
    teamSize: 3,
    styleTags: ['candid', 'cinematic', 'pre-wedding'],
    priceBandMin: 15_000_000,
    priceBandMax: 40_000_000,
    minPricePerDay: 18_000_000,
    ratingAvg: 4.9,
    ratingCount: 11,
    medianResponseMins: 22,
    completedBookings: 12,
    isAnchorStudio: true,
    mediaCount: 8,
  },
  {
    slug: 'shaadi-stories-delhi',
    displayName: 'Shaadi Stories',
    citySlug: 'delhi-ncr',
    localitySlug: 'gurugram',
    categorySlug: 'photography',
    about:
      'Big-fat-wedding specialists across Gurugram and the Chattarpur farmhouse belt — Punjabi, Sindhi and Rajasthani celebrations. Ten-person crews, multi-day coverage, and a baraat team that keeps up.',
    establishedYear: 2015,
    teamSize: 10,
    styleTags: ['candid', 'traditional', 'drone'],
    priceBandMin: 25_000_000,
    priceBandMax: 90_000_000,
    minPricePerDay: 24_000_000,
    ratingAvg: 4.7,
    ratingCount: 96,
    medianResponseMins: 70,
    completedBookings: 154,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'mehfil-media',
    displayName: 'Mehfil Media',
    citySlug: 'delhi-ncr',
    localitySlug: 'south-delhi',
    categorySlug: 'photography',
    about:
      'Candid photography and cinematic films for South Delhi weddings — Punjabi, Kashmiri Pandit and Gujarati families. Small crew, premium output.',
    establishedYear: 2019,
    teamSize: 4,
    styleTags: ['candid', 'cinematic'],
    priceBandMin: 20_000_000,
    priceBandMax: 55_000_000,
    minPricePerDay: 26_000_000,
    ratingAvg: 4.8,
    ratingCount: 37,
    medianResponseMins: 45,
    completedBookings: 52,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'roshni-photography',
    displayName: 'Roshni Photography',
    citySlug: 'delhi-ncr',
    localitySlug: 'noida',
    categorySlug: 'photography',
    about:
      'Traditional and candid coverage for Noida and Ghaziabad families — Punjabi, Bengali and Marathi weddings, plus nikah ceremonies. In-house album studio.',
    establishedYear: 2013,
    teamSize: 7,
    styleTags: ['traditional', 'candid'],
    priceBandMin: 8_000_000,
    priceBandMax: 22_000_000,
    minPricePerDay: 10_000_000,
    ratingAvg: 4.4,
    ratingCount: 64,
    medianResponseMins: 110,
    completedBookings: 128,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'the-tamarind-estate',
    displayName: 'The Tamarind Estate',
    citySlug: 'lucknow',
    localitySlug: 'faizabad-road',
    categorySlug: 'venues',
    about:
      'A six-acre farmhouse venue with lawn seating for 800, a covered banquet for 400, and 12 guest rooms.',
    establishedYear: 2015,
    teamSize: 25,
    styleTags: ['farmhouse', 'resort'],
    priceBandMin: 35_000_000,
    priceBandMax: 120_000_000,
    minPricePerDay: null,
    ratingAvg: 4.6,
    ratingCount: 58,
    medianResponseMins: 88,
    completedBookings: 96,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'rangoli-banquets',
    displayName: 'Rangoli Banquets',
    citySlug: 'lucknow',
    localitySlug: 'alambagh',
    categorySlug: 'venues',
    about:
      'Centrally located air-conditioned banquet hall seating 500, with in-house catering and parking for 120 cars.',
    establishedYear: 2009,
    teamSize: 40,
    styleTags: ['banquet'],
    priceBandMin: 18_000_000,
    priceBandMax: 45_000_000,
    minPricePerDay: null,
    ratingAvg: 4.2,
    ratingCount: 141,
    medianResponseMins: 130,
    completedBookings: 402,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'blush-by-meera',
    displayName: 'Blush by Meera',
    citySlug: 'lucknow',
    localitySlug: 'gomti-nagar',
    categorySlug: 'makeup',
    about:
      'HD and airbrush bridal makeup. Meera has done over 400 brides and travels across South India.',
    establishedYear: 2017,
    teamSize: 3,
    styleTags: ['hd-makeup', 'airbrush'],
    priceBandMin: 3_500_000,
    priceBandMax: 9_500_000,
    minPricePerDay: 4_500_000,
    ratingAvg: 4.9,
    ratingCount: 203,
    medianResponseMins: 25,
    completedBookings: 412,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'the-glow-room',
    displayName: 'The Glow Room',
    citySlug: 'lucknow',
    localitySlug: 'hazratganj',
    categorySlug: 'makeup',
    about: 'Skin-first, natural bridal looks. We prep your skin for six weeks before the date.',
    establishedYear: 2020,
    teamSize: 4,
    styleTags: ['natural', 'hd-makeup'],
    priceBandMin: 4_500_000,
    priceBandMax: 12_000_000,
    minPricePerDay: 6_500_000,
    ratingAvg: 4.8,
    ratingCount: 47,
    medianResponseMins: 40,
    completedBookings: 71,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'marigold-decor',
    displayName: 'Marigold Decor',
    citySlug: 'lucknow',
    localitySlug: 'aliganj',
    categorySlug: 'decor',
    about:
      'Fresh-flower mandaps and stage design. We source from the Lucknow flower market every morning.',
    establishedYear: 2012,
    teamSize: 18,
    styleTags: ['floral', 'royal'],
    priceBandMin: 15_000_000,
    priceBandMax: 60_000_000,
    minPricePerDay: null,
    ratingAvg: 4.5,
    ratingCount: 74,
    medianResponseMins: 105,
    completedBookings: 168,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'white-space-events',
    displayName: 'White Space Events',
    citySlug: 'lucknow',
    localitySlug: 'indira-nagar',
    categorySlug: 'decor',
    about: 'Minimal, contemporary decor for couples who find traditional staging too heavy.',
    establishedYear: 2021,
    teamSize: 8,
    styleTags: ['minimal', 'boho'],
    priceBandMin: 20_000_000,
    priceBandMax: 70_000_000,
    minPricePerDay: null,
    ratingAvg: 4.7,
    ratingCount: 22,
    medianResponseMins: 50,
    completedBookings: 29,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'adyar-ananda-catering',
    displayName: 'Adyar Ananda Catering',
    citySlug: 'lucknow',
    localitySlug: 'chowk',
    categorySlug: 'catering',
    about: 'Pure-veg South Indian and Jain satvik menus. Sixty years of banana-leaf service.',
    establishedYear: 1965,
    teamSize: 60,
    styleTags: ['south-indian', 'jain-satvik'],
    priceBandMin: 45_000,
    priceBandMax: 110_000,
    minPricePerDay: null,
    ratingAvg: 4.6,
    ratingCount: 312,
    medianResponseMins: 75,
    completedBookings: 890,
    isAnchorStudio: false,
    mediaCount: 8,
  },
  {
    slug: 'spice-route-catering',
    displayName: 'Spice Route Catering',
    citySlug: 'lucknow',
    localitySlug: 'sushant-golf-city',
    categorySlug: 'catering',
    about: 'Multi-cuisine catering with live counters — North Indian, Continental and Pan-Asian.',
    establishedYear: 2014,
    teamSize: 45,
    styleTags: ['north-indian', 'continental', 'live-counters'],
    priceBandMin: 65_000,
    priceBandMax: 180_000,
    minPricePerDay: null,
    ratingAvg: 4.4,
    ratingCount: 118,
    medianResponseMins: 60,
    completedBookings: 265,
    isAnchorStudio: false,
    mediaCount: 8,
  },
]

export interface FixturePackage {
  vendorSlug: string
  name: string
  description: string
  price: number
  durationDays: number
  pricePerDay: number
  crewSize: number | null
  editedPhotoCount: number | null
  deliveryDays: number | null
  deliverables: string[]
  inclusions: string[]
}

export const PACKAGES: FixturePackage[] = [
  {
    vendorSlug: 'lightleak-studio',
    name: 'Wedding Day — Candid',
    description: 'Single-day candid coverage by two photographers, from haldi to vidaai.',
    price: 14_000_000,
    durationDays: 1,
    pricePerDay: 14_000_000,
    crewSize: 2,
    editedPhotoCount: 600,
    deliveryDays: 21,
    deliverables: ['600+ edited photos', 'Online gallery', 'USB drive'],
    inclusions: ['2 photographers', 'Full-day coverage', 'Colour grading'],
  },
  {
    vendorSlug: 'lightleak-studio',
    name: 'Three-Day Wedding',
    description: 'Mehendi, sangeet and wedding day with a four-person crew.',
    price: 33_000_000,
    durationDays: 3,
    pricePerDay: 11_000_000,
    crewSize: 4,
    editedPhotoCount: 1800,
    deliveryDays: 28,
    deliverables: ['1800+ edited photos', 'Two 30-page albums', 'Online gallery'],
    inclusions: ['4 crew', '3 days', 'Two albums', 'Drone on wedding day'],
  },
  {
    vendorSlug: 'saat-phere-films',
    name: 'Film + Photo Combo',
    description: 'Cinematic film and candid photography for the wedding day, with a same-day edit.',
    price: 28_000_000,
    durationDays: 1,
    pricePerDay: 28_000_000,
    crewSize: 6,
    editedPhotoCount: 700,
    deliveryDays: 30,
    deliverables: ['8-minute wedding film', 'Same-day edit', '700+ photos'],
    inclusions: ['6 crew', '2 cinema cameras', 'Drone', 'Same-day edit screening'],
  },
  {
    vendorSlug: 'fremmo-studio',
    name: 'Wedding Day Coverage',
    description: 'Candid and cinematic coverage by the in-house studio team.',
    price: 18_000_000,
    durationDays: 1,
    pricePerDay: 18_000_000,
    crewSize: 3,
    editedPhotoCount: 650,
    deliveryDays: 21,
    deliverables: ['650+ edited photos', 'Online gallery'],
    inclusions: ['3 crew', 'Full-day', 'Drone'],
  },
  {
    vendorSlug: 'anantha-photography',
    name: 'Traditional Full Coverage',
    description: 'Complete ritual documentation in the classic South Indian style.',
    price: 8_500_000,
    durationDays: 1,
    pricePerDay: 8_500_000,
    crewSize: 3,
    editedPhotoCount: 500,
    deliveryDays: 25,
    deliverables: ['500+ edited photos', '40-page printed album'],
    inclusions: ['3 photographers', 'Printed album', 'All rituals covered'],
  },
]

export interface FixtureReview {
  vendorSlug: string
  rating: number
  title: string
  body: string
  authorName: string
  publishedDaysAgo: number
}

/**
 * Every one of these is tied to a completed booking in the seed — plan §2 makes reviews
 * booking-gated, and a fixture that ignored that would misrepresent the product on the
 * one surface where trust is being claimed.
 */
export const REVIEWS: FixtureReview[] = [
  {
    vendorSlug: 'lightleak-studio',
    rating: 5,
    title: 'They disappeared into the wedding and came back with everything',
    body: 'We barely noticed them during the ceremony, which is exactly what we wanted. The gallery arrived in nineteen days with 700 photos, and they caught moments from the muhurtham that none of our family managed to see.',
    authorName: 'Priya S.',
    publishedDaysAgo: 20,
  },
  {
    vendorSlug: 'blush-by-meera',
    rating: 5,
    title: 'Did my trial twice without charging me again',
    body: 'I changed my mind about the look three weeks before the date. Meera redid the trial, told me honestly which one photographed better, and turned up at 4am on the day without a word of complaint.',
    authorName: 'Ananya I.',
    publishedDaysAgo: 34,
  },
  {
    vendorSlug: 'anantha-photography',
    rating: 4,
    title: 'Knew the rituals better than our own relatives',
    body: 'They have shot Tamil weddings for thirty years and it shows — nobody had to tell them what was coming next. The album took five weeks rather than the four we were promised, which is the only reason this is not five stars.',
    authorName: 'Karthik R.',
    publishedDaysAgo: 51,
  },
  {
    vendorSlug: 'the-tamarind-estate',
    rating: 5,
    title: 'The rain plan actually worked',
    body: 'It poured on the sangeet evening. Their team had the covered banquet ready in forty minutes and not one of our 400 guests got wet. Worth every rupee for that alone.',
    authorName: 'Meera & Arjun',
    publishedDaysAgo: 63,
  },
]

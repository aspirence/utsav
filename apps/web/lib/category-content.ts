import 'server-only'

/**
 * Category-specific discovery copy and budget rungs.
 *
 * Plan §2 makes price bands a Must-tier filter, and plan §12 puts the SEO page engine
 * live six months before launch — which only helps if the pages say something true and
 * specific. Generic filler ranks for nothing.
 *
 * The rungs are set from the price bands real vendors in these categories actually
 * quote in Lucknow and Delhi NCR, so "under ₹1 L" returns a useful set rather than an
 * empty one. Amounts are integer paise (plan §5).
 */

const L = 100_000 * 100 // one lakh, in paise

export interface CategoryContent {
  priceRungs: { label: string; value: number }[]
  /** Only categories priced per day benefit from a duration filter. */
  showDurationFilter: boolean
  faqs: (city: string) => { q: string; a: string }[]
}

const PHOTOGRAPHY: CategoryContent = {
  priceRungs: [
    { label: 'Under ₹50 K', value: 50_000 * 100 },
    { label: 'Under ₹1 L', value: 1 * L },
    { label: 'Under ₹2 L', value: 2 * L },
    { label: 'Under ₹5 L', value: 5 * L },
  ],
  showDurationFilter: true,
  faqs: (city) => [
    {
      q: `What does a wedding photographer cost in ${city}?`,
      a:
        `Most full-day wedding coverage in ${city} falls between ₹60,000 and ₹4 lakh, ` +
        'depending on crew size, how many days you need and whether a film is included. ' +
        'Every listing on Utsava shows a price band up front, and every package shows a ' +
        'per-day figure so a three-day quote and a one-day quote are directly comparable.',
    },
    {
      q: 'What is the difference between candid, traditional and cinematic photography?',
      a:
        'Candid means unposed — the photographer stays out of the rituals and shoots what ' +
        'happens. Traditional means posed portraits and formal ritual coverage, which is ' +
        'what most families want for the album. Cinematic refers to the film, not the ' +
        'photos: a graded, edited wedding video. Most studios do a mix; the style tags on ' +
        'each listing tell you where their work actually sits.',
    },
    {
      q: 'How many photos should I expect, and how soon?',
      a:
        'A single-day wedding usually yields 400 to 800 edited photographs. Three weeks is ' +
        'a normal turnaround and four is common in peak season. Each package on Utsava ' +
        'states its own photo count and delivery time, so you can compare rather than guess.',
    },
    {
      q: 'How far in advance should I book?',
      a:
        'Six to nine months for a peak-season date, and longer for the November–February ' +
        'window. Good studios are booked out first. You can filter by your exact date on ' +
        'Utsava to see only the photographers who are genuinely free that day.',
    },
    {
      q: 'Do photographers travel for destination weddings?',
      a:
        'Most do, and travel plus stay is usually billed on top of the package. Listings ' +
        'that travel outstation say so on their profile.',
    },
  ],
}

const VENUES: CategoryContent = {
  priceRungs: [
    { label: 'Under ₹2 L', value: 2 * L },
    { label: 'Under ₹5 L', value: 5 * L },
    { label: 'Under ₹10 L', value: 10 * L },
    { label: 'Under ₹25 L', value: 25 * L },
  ],
  showDurationFilter: false,
  faqs: (city) => [
    {
      q: `How much does a wedding venue cost in ${city}?`,
      a:
        `Banquet halls in ${city} typically run ₹1.5–5 lakh for the day, while farmhouses ` +
        'and resorts start higher. Many venues price per plate rather than per event, so ' +
        'check which basis a listing quotes before comparing two numbers.',
    },
    {
      q: 'Is catering usually included in the venue price?',
      a:
        'Often yes for banquet halls, and often no for farmhouses and lawns. Where it is ' +
        'included, the price is normally quoted per plate with a guaranteed minimum guest ' +
        'count — that minimum matters more than the plate rate for a smaller wedding.',
    },
    {
      q: 'What should I check before booking a venue?',
      a:
        'Guest capacity for both seated and floating formats, parking, whether outside ' +
        'caterers and decorators are allowed, the sound cut-off time, and what the ' +
        'cancellation terms are. Ask all five before paying an advance.',
    },
    {
      q: 'How far in advance are venues booked?',
      a:
        'Nine to twelve months for a peak-season Saturday. Off-season and weekday dates ' +
        'open up much later and are often materially cheaper.',
    },
  ],
}

const MAKEUP: CategoryContent = {
  priceRungs: [
    { label: 'Under ₹25 K', value: 25_000 * 100 },
    { label: 'Under ₹50 K', value: 50_000 * 100 },
    { label: 'Under ₹1 L', value: 1 * L },
  ],
  showDurationFilter: true,
  faqs: (city) => [
    {
      q: `What does bridal makeup cost in ${city}?`,
      a:
        `Bridal makeup in ${city} generally runs ₹25,000 to ₹1 lakh for the wedding day, ` +
        'with trials and additional family members priced separately. Listings show their ' +
        'band before you enquire.',
    },
    {
      q: 'What is the difference between HD and airbrush makeup?',
      a:
        'HD makeup uses finely milled products that photograph well under strong light. ' +
        'Airbrush is sprayed rather than applied by hand and tends to last longer in heat, ' +
        'which matters for a long summer function. Many artists offer both.',
    },
    {
      q: 'Should I do a trial?',
      a:
        'Yes, and ideally four to six weeks before the date so there is time to change ' +
        'artists if the look is not right. Most artists charge for the trial and adjust it ' +
        'against the final bill if you book.',
    },
  ],
}

const DECOR: CategoryContent = {
  priceRungs: [
    { label: 'Under ₹1 L', value: 1 * L },
    { label: 'Under ₹3 L', value: 3 * L },
    { label: 'Under ₹6 L', value: 6 * L },
    { label: 'Under ₹15 L', value: 15 * L },
  ],
  showDurationFilter: false,
  faqs: (city) => [
    {
      q: `What does wedding decor cost in ${city}?`,
      a:
        'Mandap and stage decor commonly runs ₹1–6 lakh depending on flower volume and ' +
        'structure. Fresh flowers are the single largest variable — the same design in ' +
        'seasonal blooms can cost a third of what imported flowers do.',
    },
    {
      q: 'Can I use my own decorator at any venue?',
      a:
        'Not always. Many banquet halls have an in-house decorator or charge an outside ' +
        'vendor fee. Confirm this with the venue before you sign a decorator.',
    },
    {
      q: 'How early does setup need to start?',
      a:
        'Large floral setups need six to ten hours, which usually means access the night ' +
        'before. Check what the venue allows, since it affects what the decorator can build.',
    },
  ],
}

const CATERING: CategoryContent = {
  priceRungs: [
    { label: 'Under ₹800 / plate', value: 800 * 100 },
    { label: 'Under ₹1,200 / plate', value: 1_200 * 100 },
    { label: 'Under ₹2,000 / plate', value: 2_000 * 100 },
  ],
  showDurationFilter: false,
  faqs: (city) => [
    {
      q: `What is the per-plate cost of wedding catering in ${city}?`,
      a:
        `Vegetarian menus in ${city} generally start around ₹450 per plate and rise past ` +
        '₹1,800 with live counters and a wider spread. Non-vegetarian and multi-cuisine ' +
        'menus sit higher. Caterers quote per plate against a minimum guest count.',
    },
    {
      q: 'How many dishes should a wedding menu have?',
      a:
        'For 300 guests a typical spread is two or three starters, four or five mains, two ' +
        'breads, rice, and two or three desserts. More dishes mostly increases waste rather ' +
        'than satisfaction — depth on fewer items reads better.',
    },
    {
      q: 'Do caterers handle Jain or satvik requirements?',
      a:
        'Many do, with a separate no-onion-no-garlic kitchen line. Filter by the Jain / ' +
        'satvik style tag and confirm whether it is a full separate preparation or just a ' +
        'few dishes.',
    },
  ],
}

const DEFAULT: CategoryContent = {
  priceRungs: [
    { label: 'Under ₹50 K', value: 50_000 * 100 },
    { label: 'Under ₹1 L', value: 1 * L },
    { label: 'Under ₹3 L', value: 3 * L },
  ],
  showDurationFilter: false,
  faqs: () => [],
}

const BY_CATEGORY: Record<string, CategoryContent> = {
  photography: PHOTOGRAPHY,
  videography: PHOTOGRAPHY,
  venues: VENUES,
  makeup: MAKEUP,
  decor: DECOR,
  catering: CATERING,
}

export function getCategoryContent(categorySlug: string): CategoryContent {
  return BY_CATEGORY[categorySlug] ?? DEFAULT
}

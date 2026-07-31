/**
 * What each kind of listing is actually asked.
 *
 * The generic form on a vendor — name, about, price band, team size — is true of a photographer,
 * a caterer and a banquet lawn alike, and says nothing useful about any of them. A customer
 * choosing a venue wants a seated capacity; choosing a caterer, a per-plate rate; choosing a
 * makeup artist, whether she travels to the venue on the morning. These are those questions.
 *
 * Deliberately NOT a `server-only` module: the form renders from these definitions and the action
 * validates against the same ones, so the labels a person reads and the rules the server enforces
 * cannot drift apart. Nothing here touches a database or a session.
 *
 * Stored in `vendor_categories.attributes` (migration 20260730000300) — the vendor *in a category*,
 * because a farmhouse that also caters has a capacity in one row and a per-plate rate in the other.
 *
 * MONEY IS RUPEES IN THE FIELD AND PAISE IN THE COLUMN (plan §5). The 'money' type is what marks
 * that boundary; `coerceAttributes` does the conversion and rounds rather than truncating, because
 * a float landing on 149.99999 loses a paisa to Math.trunc and money that quietly loses anything
 * surfaces in a reconciliation months later.
 */

export type AttributeField =
  | { key: string; label: string; type: 'text'; hint?: string; max?: number }
  | { key: string; label: string; type: 'number'; hint?: string; min?: number; max?: number; unit?: string }
  /** Typed in rupees, stored as integer paise. */
  | { key: string; label: string; type: 'money'; hint?: string }
  | { key: string; label: string; type: 'boolean'; hint?: string }
  | { key: string; label: string; type: 'select'; hint?: string; options: string[] }
  /** Comma-separated in the field, a string array in the column. */
  | { key: string; label: string; type: 'tags'; hint?: string; max?: number }

export interface CategoryAttributeSet {
  /** Shown above the fields, so an operator knows why this section differs per listing. */
  intro: string
  fields: AttributeField[]
}

/**
 * Keyed by category slug, matching supabase/seed/01_catalog.sql.
 *
 * FIVE OF THE FOURTEEN SEEDED CATEGORIES, and that is the scope on purpose. Venues, catering,
 * decor and makeup were specified; photography is the wedge and was already here. Sets for the
 * other nine were written and taken back out — inventing what to ask a pandit or a transport
 * company is a product decision, not a coding one, and a form of fields nobody can answer teaches
 * operators to skip the section entirely.
 *
 * A category with no entry gets a sentence instead of an empty form. That is a real answer.
 */
export const CATEGORY_ATTRIBUTES: Record<string, CategoryAttributeSet> = {
  venues: {
    intro:
      'What a couple needs before they will come and see it. Capacity and catering rules decide ' +
      'most shortlists before anyone visits.',
    fields: [
      { key: 'seatedCapacity', label: 'Seated capacity', type: 'number', min: 1, max: 20000, unit: 'guests', hint: 'Dining-style seating, not theatre.' },
      { key: 'floatingCapacity', label: 'Floating capacity', type: 'number', min: 1, max: 50000, unit: 'guests' },
      { key: 'halls', label: 'Halls or lawns', type: 'number', min: 1, max: 50, hint: 'Separate bookable spaces on the property.' },
      { key: 'rooms', label: 'Guest rooms', type: 'number', min: 0, max: 2000, hint: 'Zero if there is no stay.' },
      { key: 'parking', label: 'Parking', type: 'number', min: 0, max: 5000, unit: 'cars' },
      { key: 'venueType', label: 'Type', type: 'select', options: ['Banquet hall', 'Lawn', 'Farmhouse', 'Resort', 'Hotel', 'Heritage property', 'Destination'] },
      { key: 'rentPerDay', label: 'Rent per day', type: 'money', hint: 'Space only, before food.' },
      { key: 'inHouseCatering', label: 'In-house catering', type: 'boolean' },
      { key: 'outsideCateringAllowed', label: 'Outside caterer allowed', type: 'boolean' },
      { key: 'outsideDecorAllowed', label: 'Outside decorator allowed', type: 'boolean' },
      { key: 'alcoholAllowed', label: 'Alcohol permitted', type: 'boolean' },
      { key: 'amenities', label: 'Amenities', type: 'tags', max: 10, hint: 'Comma-separated — generator, valet, bridal room, lift.' },
    ],
  },

  catering: {
    intro:
      'Priced per plate, so the two rates and the minimum are the whole comparison. Dietary ' +
      'answers matter as much as the number.',
    fields: [
      { key: 'vegPerPlate', label: 'Veg, per plate', type: 'money' },
      { key: 'nonVegPerPlate', label: 'Non-veg, per plate', type: 'money' },
      { key: 'minGuests', label: 'Minimum guests', type: 'number', min: 1, max: 10000, unit: 'guests' },
      { key: 'cuisines', label: 'Cuisines', type: 'tags', max: 12, hint: 'Awadhi, Mughlai, South Indian, Continental, Chaat.' },
      { key: 'liveCounters', label: 'Live counters', type: 'boolean' },
      { key: 'jainSatvik', label: 'Jain / satvik available', type: 'boolean', hint: 'Prepared separately, not just labelled.' },
      { key: 'barService', label: 'Bar service', type: 'boolean' },
      { key: 'servingStaffIncluded', label: 'Serving staff included', type: 'boolean' },
      { key: 'tastingAvailable', label: 'Tasting session offered', type: 'boolean' },
      { key: 'noticeDays', label: 'Notice needed', type: 'number', min: 0, max: 365, unit: 'days' },
    ],
  },

  decor: {
    intro:
      'What they build and what it costs to start. Decorators are shortlisted on style and on ' +
      'whether the flowers are real.',
    fields: [
      { key: 'setups', label: 'Setups offered', type: 'tags', max: 12, hint: 'Mandap, stage, entrance, haldi, sangeet, car decor.' },
      { key: 'startingPrice', label: 'Starting price', type: 'money', hint: 'The smallest job they will take.' },
      { key: 'flowerType', label: 'Flowers', type: 'select', options: ['Fresh only', 'Artificial only', 'Both'] },
      { key: 'lighting', label: 'Lighting included', type: 'boolean' },
      { key: 'themes', label: 'Themes', type: 'tags', max: 10, hint: 'Royal, minimal, floral, boho, traditional.' },
      { key: 'setupHours', label: 'Setup time', type: 'number', min: 1, max: 168, unit: 'hours' },
      { key: 'noticeDays', label: 'Notice needed', type: 'number', min: 0, max: 365, unit: 'days' },
      { key: 'venueTieUps', label: 'Works at any venue', type: 'boolean', hint: 'Untick if they are tied to particular properties.' },
    ],
  },

  makeup: {
    intro:
      'Bridal work is booked on the morning of, so travel and timing are as decisive as the ' +
      'price. Trials are what most couples decide on.',
    fields: [
      { key: 'bridalPrice', label: 'Bridal package', type: 'money', hint: 'One bride, one function.' },
      { key: 'partyPrice', label: 'Party or guest makeup', type: 'money', hint: 'Per person.' },
      { key: 'products', label: 'Product brands', type: 'tags', max: 10, hint: 'What they work with — MAC, Bobbi Brown, Huda.' },
      { key: 'techniques', label: 'Techniques', type: 'tags', max: 8, hint: 'HD, airbrush, natural, dewy.' },
      { key: 'trialAvailable', label: 'Trial available', type: 'boolean' },
      { key: 'trialPrice', label: 'Trial charge', type: 'money', hint: 'Leave blank if the trial is free.' },
      { key: 'travelsToVenue', label: 'Travels to the venue', type: 'boolean' },
      { key: 'hairIncluded', label: 'Hair styling included', type: 'boolean' },
      { key: 'drapingIncluded', label: 'Saree / dupatta draping included', type: 'boolean' },
      { key: 'teamSize', label: 'Artists on the day', type: 'number', min: 1, max: 50, unit: 'artists' },
      { key: 'hoursPerBride', label: 'Time per bride', type: 'number', min: 1, max: 12, unit: 'hours' },
    ],
  },

  photography: {
    intro:
      'The generic listing fields already cover most of this category. These are the few a couple ' +
      'asks that the price band does not answer.',
    fields: [
      { key: 'deliveryDays', label: 'Delivery time', type: 'number', min: 1, max: 365, unit: 'days', hint: 'Full edited gallery, not the teaser.' },
      { key: 'editedPhotos', label: 'Edited photographs', type: 'number', min: 1, max: 5000, hint: 'Typical count for a full day.' },
      { key: 'crewSize', label: 'Crew on the day', type: 'number', min: 1, max: 50, unit: 'people' },
      { key: 'droneAvailable', label: 'Drone available', type: 'boolean' },
      { key: 'albumIncluded', label: 'Printed album included', type: 'boolean' },
      { key: 'rawHandover', label: 'Hands over raw files', type: 'boolean' },
      { key: 'sameDayEdit', label: 'Same-day edit offered', type: 'boolean' },
    ],
  },









}

/** Money fields are stored in paise; a UI showing them needs to know which ones. */
export function isMoneyField(field: AttributeField): boolean {
  return field.type === 'money'
}

/**
 * What a listing's pictures are called, and what the tags on them mean.
 *
 * The gallery was headed "Photographs" on every listing, which is a photographer's word. On a
 * venue the pictures are of the lawn and the banquet hall; on a caterer they are of dishes and
 * live counters; on a decorator they are of a mandap that was built. Same panel, same table, same
 * upload — different question being asked, so different words.
 *
 * `tagsHint` matters more than it looks. On a photographer the tags are shooting styles and feed
 * the discovery style filter; on a venue the useful tag is which space the picture shows, because
 * that is what a couple is trying to see. The field is one `text[]` column either way — what
 * changes is what an operator is told to put in it.
 */
export interface MediaVocabulary {
  /** Panel heading. */
  heading: string
  /** One line under it, saying what these pictures are for. */
  description: string
  /** The singular noun, used in buttons and messages: "Add a {noun}". */
  noun: string
  /** Shown when there are none yet. */
  empty: string
  tagsLabel: string
  tagsHint: string
  tagsPlaceholder: string
  altPlaceholder: string
  captionPlaceholder: string
}

const DEFAULT_MEDIA: MediaVocabulary = {
  heading: 'Photographs',
  description: 'The images on this listing’s cards. Plan §13 gates going live on five.',
  noun: 'photograph',
  empty: 'No photographs yet. This listing cannot go live until it has five.',
  tagsLabel: 'Style tags',
  tagsHint:
    'Comma-separated, eight at most. These are what the style filter on the discovery page ' +
    'searches, so they should match the category’s taxonomy.',
  tagsPlaceholder: 'candid, traditional',
    altPlaceholder: 'Bride and groom during the pheras',
  captionPlaceholder: 'Gomti Nagar, December 2026',
}

const MEDIA_BY_CATEGORY: Record<string, MediaVocabulary> = {
  photography: DEFAULT_MEDIA,

  venues: {
    heading: 'Venue photos',
    description:
      'What a couple sees before deciding to visit. Plan §13 gates going live on five.',
    noun: 'photo',
    empty: 'No photos yet. A venue nobody can see is a venue nobody books, and five is the floor.',
    tagsLabel: 'Which space',
    tagsHint:
      'Comma-separated — banquet hall, lawn, mandap area, entrance, guest room, parking. A couple ' +
      'is trying to work out what each picture is of.',
    tagsPlaceholder: 'main lawn, banquet hall',
    altPlaceholder: 'The main lawn set for an evening reception',
    captionPlaceholder: 'Seats 450 · Gomti Nagar',
  },

  catering: {
    heading: 'Food photos',
    description: 'Dishes, counters and how a spread actually looks. Five is the go-live floor.',
    noun: 'photo',
    empty: 'No photos yet. Catering is chosen on how the food looks, and five is the floor.',
    tagsLabel: 'What it shows',
    tagsHint:
      'Comma-separated — Awadhi, chaat counter, live counter, dessert, plated, buffet. Say what ' +
      'is in the picture, not how good it is.',
    tagsPlaceholder: 'chaat counter, Awadhi',
    altPlaceholder: 'Live chaat counter at a reception',
    captionPlaceholder: 'Awadhi spread for 300 guests',
  },

  decor: {
    heading: 'Setup photos',
    description: 'Work they have actually built. Plan §13 gates going live on five.',
    noun: 'photo',
    empty: 'No photos yet. A decorator is judged entirely on past setups, and five is the floor.',
    tagsLabel: 'What was built',
    tagsHint:
      'Comma-separated — mandap, stage, entrance, haldi, sangeet, car decor. Match the setups ' +
      'listed in the details above.',
    tagsPlaceholder: 'mandap, stage',
    altPlaceholder: 'Floral mandap with fairy lights',
    captionPlaceholder: 'Fresh flowers · Sushant Golf City',
  },

  makeup: {
    heading: 'Portfolio looks',
    description: 'Finished looks on real clients. Plan §13 gates going live on five.',
    noun: 'look',
    empty: 'No looks yet. Bridal makeup is booked on the portfolio, and five is the floor.',
    tagsLabel: 'Look type',
    tagsHint:
      'Comma-separated — bridal, engagement, HD, airbrush, natural, party. This is what a bride ' +
      'searches by.',
    tagsPlaceholder: 'bridal, HD',
    altPlaceholder: 'Bridal look with a traditional red lehenga',
    captionPlaceholder: 'HD makeup · Lucknow',
  },
}

/**
 * The vocabulary for a category, falling back to the photographer's.
 *
 * The fallback is not laziness: a category with no entry still has a gallery, still gates on five
 * pictures, and still needs a heading. "Photographs" is the least wrong general word for a picture
 * of somebody's work.
 */
export function mediaVocabulary(categorySlug: string): MediaVocabulary {
  return MEDIA_BY_CATEGORY[categorySlug] ?? DEFAULT_MEDIA
}

export type AttributeValue = string | number | boolean | string[]
export type AttributeMap = Record<string, AttributeValue>

/**
 * Turn one submitted form into a validated attribute object.
 *
 * Returns the value map, or the first problem as a sentence. Driven by the field definitions above
 * rather than by a hand-written schema per category, so adding a question is one line and the
 * validation follows it.
 *
 * Blank is not an error. Most of these are genuinely optional — a venue that has not counted its
 * parking spaces should be able to save everything else — so an empty field is simply omitted from
 * the object rather than stored as null. That keeps `attributes` to what is actually known.
 */
export function coerceAttributes(
  categorySlug: string,
  read: (key: string) => string | undefined,
  readBoolean: (key: string) => boolean,
): { ok: true; values: AttributeMap } | { ok: false; message: string } {
  const set = CATEGORY_ATTRIBUTES[categorySlug]
  if (!set) return { ok: true, values: {} }

  const values: AttributeMap = {}

  for (const field of set.fields) {
    if (field.type === 'boolean') {
      // A checkbox is always answerable, so it is always stored — the difference between "no" and
      // "not said" is not one an unticked box can express.
      values[field.key] = readBoolean(field.key)
      continue
    }

    const raw = read(field.key)?.trim()
    if (!raw) continue

    if (field.type === 'number') {
      const n = Number(raw.replace(/[^\d.-]/g, ''))
      if (!Number.isFinite(n)) return { ok: false, message: `${field.label} has to be a number.` }
      if (field.min != null && n < field.min) {
        return { ok: false, message: `${field.label} cannot be below ${field.min}.` }
      }
      if (field.max != null && n > field.max) {
        return { ok: false, message: `${field.label} cannot be above ${field.max}.` }
      }
      values[field.key] = Math.round(n)
      continue
    }

    if (field.type === 'money') {
      const n = Number(raw.replace(/[^\d.]/g, ''))
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, message: `${field.label} has to be an amount in rupees.` }
      }
      // Rupees in, integer paise out. Rounds, never truncates (plan §5).
      values[field.key] = Math.round(n * 100)
      continue
    }

    if (field.type === 'select') {
      if (!field.options.includes(raw)) {
        return { ok: false, message: `${field.label} is not one of the options.` }
      }
      values[field.key] = raw
      continue
    }

    if (field.type === 'tags') {
      const tags = raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, field.max ?? 12)
      if (tags.length > 0) values[field.key] = tags
      continue
    }

    // text
    if (raw.length > (field.max ?? 300)) {
      return { ok: false, message: `${field.label} is too long.` }
    }
    values[field.key] = raw
  }

  return { ok: true, values }
}

/** Paise back to a plain rupee number for a text input's default value. */
export function paiseToRupeeInput(value: AttributeValue | undefined): string {
  if (typeof value !== 'number') return ''
  return String(Math.round(value / 100))
}

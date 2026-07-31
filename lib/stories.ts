import 'server-only'

import { storageImageUrl, type EventType } from '@/lib/db'

import { getServerClientOrNull } from './supabase'

/**
 * Read layer for real-wedding stories (plan §5, migration 000800 "trust").
 *
 * Same contract as lib/queries.ts: try Supabase, fall back to the fixtures below when
 * no instance is configured. Kept in its own module so the discovery read layer stays
 * untouched — stories are a content surface, not part of the search path.
 *
 * Plan §11: stories are the content engine the wedge category feeds. They are what a
 * couple reads before they trust a price band, so every one of them names the vendor
 * who shot it and links straight to that profile.
 */

export interface StoryImage {
  url: string | null
  alt: string
}

export interface Story {
  slug: string
  title: string
  subtitle: string | null
  /** Plain text, paragraphs separated by a blank line. Rendered whitespace-pre-line. */
  body: string
  coupleNames: string | null
  eventType: EventType
  /** ISO date of the event itself, not of publication. */
  eventDate: string | null
  citySlug: string | null
  cityName: string | null
  localityName: string | null
  styleTags: string[]
  coverUrl: string | null
  gallery: StoryImage[]
  vendorSlug: string | null
  vendorName: string | null
  publishedAt: string | null
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  wedding: 'Wedding',
  engagement: 'Engagement',
  reception: 'Reception',
  sangeet: 'Sangeet',
  mehendi: 'Mehendi',
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  baby_shower: 'Baby shower',
  housewarming: 'Griha pravesh',
  corporate: 'Corporate event',
  conference: 'Conference',
  festival: 'Festival',
  other: 'Celebration',
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Columns of public.stories the web surface reads. Single line: the select string is
 *  parsed at type level, so it has to stay a plain literal. */
const STORY_COLUMNS =
  'slug, title, subtitle, body, couple_names, event_type, event_date, style_tags, cover_storage_path, gallery, published_at, city_id, locality_id, author_vendor_id'

/** Published stories, newest first. */
export async function getStories(): Promise<Story[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return FIXTURE_STORIES

  const { data, error } = await supabase
    .from('stories')
    .select(STORY_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(60)

  if (error || !data) return FIXTURE_STORIES

  // The names live on cities/localities/vendors. Three flat lookups beat an embedded
  // select here: the generated types cover only the read surface and carry no
  // relationship metadata, so an embed would have to be cast away anyway.
  const [{ data: cities }, { data: localities }, { data: vendors }] = await Promise.all([
    supabase.from('cities').select('id, slug, name'),
    supabase.from('localities').select('id, name'),
    supabase.from('vendors').select('id, slug, display_name'),
  ])

  const cityById = new Map((cities ?? []).map((c) => [c.id, c] as const))
  const localityById = new Map((localities ?? []).map((l) => [l.id, l] as const))
  const vendorById = new Map((vendors ?? []).map((v) => [v.id, v] as const))

  return data.map((row) => {
    const city = row.city_id ? cityById.get(row.city_id) : undefined
    const locality = row.locality_id ? localityById.get(row.locality_id) : undefined
    const vendor = row.author_vendor_id ? vendorById.get(row.author_vendor_id) : undefined
    const fallbackAlt = row.couple_names ? `${row.couple_names} — ${row.title}` : row.title

    return {
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      body: row.body ?? '',
      coupleNames: row.couple_names,
      eventType: row.event_type,
      eventDate: row.event_date,
      citySlug: city?.slug ?? null,
      cityName: city?.name ?? null,
      localityName: locality?.name ?? null,
      styleTags: row.style_tags,
      coverUrl: storageImageUrl(row.cover_storage_path, { width: 1400, height: 788 }),
      gallery: toGallery(row.gallery, fallbackAlt),
      vendorSlug: vendor?.slug ?? null,
      vendorName: vendor?.display_name ?? null,
      publishedAt: row.published_at,
    }
  })
}

export async function getStoryBySlug(slug: string): Promise<Story | null> {
  const stories = await getStories()
  return stories.find((s) => s.slug === slug) ?? null
}

export async function getStorySlugs(): Promise<string[]> {
  const stories = await getStories()
  return stories.map((s) => s.slug)
}

/** Pure — the index page filters the one list it already fetched. */
export function filterStories(
  stories: Story[],
  filter: { citySlug?: string; styleTag?: string } = {},
): Story[] {
  return stories.filter((story) => {
    if (filter.citySlug && story.citySlug !== filter.citySlug) return false
    if (filter.styleTag && !story.styleTags.includes(filter.styleTag)) return false
    return true
  })
}

/** Every style tag that actually has a story behind it, in frequency order. */
export function storyStyleTags(stories: Story[]): { slug: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const story of stories) {
    for (const tag of story.styleTags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
}

export function formatEventDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

/** `stories.gallery` is jsonb. Accept either a list of paths or a list of
 *  `{ path, alt }` objects, and ignore anything else rather than throwing. */
function toGallery(raw: unknown, fallbackAlt: string): StoryImage[] {
  if (!Array.isArray(raw)) return []
  const out: StoryImage[] = []

  for (const item of raw) {
    if (typeof item === 'string') {
      out.push({ url: storageImageUrl(item, { width: 1200, height: 900 }), alt: fallbackAlt })
      continue
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>
      const path =
        typeof record.path === 'string'
          ? record.path
          : typeof record.storage_path === 'string'
            ? record.storage_path
            : null
      const alt = typeof record.alt === 'string' ? record.alt : fallbackAlt
      out.push({ url: storageImageUrl(path, { width: 1200, height: 900 }), alt })
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Fixtures — the no-database path. Mirrors the shape of supabase/seed/03_demo.sql's
// stories rows, and only references vendors, cities and localities that exist in
// lib/fixtures.ts, so every link on the page resolves.
// ---------------------------------------------------------------------------

function placeholderGallery(coupleNames: string, frames: string[]): StoryImage[] {
  // Storage objects do not exist locally, so url stays null and MediaFrame renders the
  // warm gradient placeholder. The alt text is still real, because it ships to search.
  return frames.map((frame) => ({ url: null, alt: `${coupleNames} — ${frame}` }))
}

const FIXTURE_STORIES: Story[] = [
  {
    slug: 'priya-arjun-gomti-nagar',
    title: 'A quiet muhurtham in Gomti Nagar, and 700 photographs nobody posed for',
    subtitle:
      'Priya and Arjun capped the guest list at 180 and asked for one thing: no one interrupting the rituals.',
    body: `The ceremony started at 6.40 a.m. because that was the muhurtham, and by 7.15 most of the family had stopped noticing the two photographers in the room.

Priya had shortlisted five studios on Utsava and sent one enquiry. Three replied the same morning. She picked Lightleak Studio because their gallery had more grandmothers in it than couples — which, she said afterwards, is how you can tell somebody is actually watching the wedding instead of directing it.

The brief was small. Two photographers, one day, no separate video crew, no staged couple portraits after the ceremony. The family wanted to eat breakfast together and leave by noon, and they did.

The gallery arrived in nineteen days: just over 700 edited frames, including the one everybody now has printed — Priya's grandmother adjusting the garland, three seconds before the exchange, entirely unaware of the camera.`,
    coupleNames: 'Priya & Arjun',
    eventType: 'wedding',
    eventDate: '2026-02-14',
    citySlug: 'lucknow',
    cityName: 'Lucknow',
    localityName: 'Gomti Nagar',
    styleTags: ['candid', 'documentary'],
    coverUrl: null,
    gallery: placeholderGallery('Priya & Arjun', [
      'the mandap being set at first light',
      'the garland exchange',
      'her grandmother watching from the second row',
      'breakfast on banana leaves after the ceremony',
      'the couple leaving through the side gate',
      'the empty hall at nine in the morning',
    ]),
    vendorSlug: 'lightleak-studio',
    vendorName: 'Lightleak Studio',
    publishedAt: '2026-03-02',
  },
  {
    slug: 'meera-karthik-aliganj',
    title: 'Four generations in one frame at a Aliganj muhurtham',
    subtitle:
      'A 6 a.m. ceremony, 400 guests, and a photographer who knew every ritual before the priest called it.',
    body: `Karthik's family have been in Aliganj since 1971 and the wedding was booked at the same kalyana mantapa his parents used. The constraint was not budget. It was that nothing could be re-staged: no repeating the kanyadaan for a better angle, no asking anyone to look up.

Anantha Photography have been shooting South Indian weddings since 1994, which is the entire reason Meera's father chose them. Their team knew where to stand for the saptapadi without being told, and they had a second photographer on the mantapa steps for the whole three hours.

The album that came back is deliberately old-fashioned — forty printed pages, sequenced in ritual order, with a full-family frame at the end that has four generations in it. Meera's ninety-one-year-old great-grandmother sat for it for eleven minutes and then went home.

Five hundred edited photographs, delivered in twenty-five days, printed album included.`,
    coupleNames: 'Meera & Karthik',
    eventType: 'wedding',
    eventDate: '2025-11-23',
    citySlug: 'lucknow',
    cityName: 'Lucknow',
    localityName: 'Aliganj',
    styleTags: ['traditional', 'portrait'],
    coverUrl: null,
    gallery: placeholderGallery('Meera & Karthik', [
      'the mantapa before the guests arrived',
      'the kashi yatra',
      'the saptapadi',
      'the priest and the two families',
      'four generations, in ritual order',
      'the printed album, forty pages',
    ]),
    vendorSlug: 'anantha-photography',
    vendorName: 'Anantha Photography',
    publishedAt: '2025-12-11',
  },
  {
    slug: 'sanya-rohan-chattarpur',
    title: 'Three days in a Chattarpur farmhouse, shot by a crew of ten',
    subtitle:
      'Mehendi on Friday, sangeet on Saturday, phere at two in the morning on Sunday — covered without a single gap.',
    body: `A multi-day Delhi wedding is a logistics problem before it is a photography problem. Sanya and Rohan had 900 guests across three functions in two venues, and the phere did not begin until two in the morning.

Shaadi Stories put ten people on it: four photographers, three on film, one on drone, and two assistants doing nothing but managing cards and batteries. That is not an upsell — at this scale, a six-person crew simply misses the sangeet stage while it is covering the entrance.

What the couple actually asked for was restraint. No LED wall, no on-stage direction, and the drone grounded during the ceremony itself. The aerial frames are all from the mehendi lawn in daylight, which is where they belong.

Delivery took a little over five weeks for roughly 2,400 edited photographs and an eleven-minute film. The same-day edit that played at the reception was cut on site by a member of the crew who never left the farmhouse.`,
    coupleNames: 'Sanya & Rohan',
    eventType: 'wedding',
    eventDate: '2026-01-18',
    citySlug: 'delhi-ncr',
    cityName: 'Delhi NCR',
    localityName: 'Chattarpur',
    styleTags: ['candid', 'traditional', 'drone'],
    coverUrl: null,
    gallery: placeholderGallery('Sanya & Rohan', [
      'the mehendi lawn from above',
      'the sangeet, forty seconds before the first performance',
      'the baraat arriving at the farmhouse gate',
      'the phere at two in the morning',
      'the crew of ten between functions',
      'the reception, after the same-day edit played',
    ]),
    vendorSlug: 'shaadi-stories-delhi',
    vendorName: 'Shaadi Stories',
    publishedAt: '2026-02-20',
  },
  {
    slug: 'divya-nikhil-sushant-golf-city',
    title: 'A Sunday registrar wedding in Sushant Golf City, and nothing was staged',
    subtitle:
      'Thirty-one guests, one photographer, one film-maker, and a lunch that ran until four.',
    body: `Divya and Nikhil registered their marriage on a Sunday morning and had lunch at her parents' flat in Sushant Golf City afterwards. Thirty-one people, no mandap, no stage, no decor budget at all.

Small weddings are harder to photograph than large ones. There is no crowd to hide in, so the moment a camera is obvious, everyone performs. Frame by Frame send exactly two people for this reason — one photographer, one film-maker, both working without flash.

There are no couple portraits in the gallery. The couple did not want any, and nobody talked them into it on the day. What there is instead: the registrar's desk, Nikhil's father signing as a witness, the four hours of lunch, and a fifteen-minute stretch on the balcony that neither of them remembers happening.

Two hundred and forty edited photographs and a six-minute film, delivered in a fortnight.`,
    coupleNames: 'Divya & Nikhil',
    eventType: 'wedding',
    eventDate: '2026-03-08',
    citySlug: 'lucknow',
    cityName: 'Lucknow',
    localityName: 'Sushant Golf City',
    styleTags: ['documentary', 'candid'],
    coverUrl: null,
    gallery: placeholderGallery('Divya & Nikhil', [
      'the registrar office corridor',
      'the signing, with both fathers as witnesses',
      'the walk back to the flat',
      'lunch, somewhere in the third hour',
      'the balcony, mid-afternoon',
      'thirty-one guests and one photograph of all of them',
    ]),
    vendorSlug: 'frame-by-frame',
    vendorName: 'Frame by Frame',
    publishedAt: '2026-03-25',
  },
  {
    slug: 'aarti-vivek-indira-nagar',
    title: 'An engagement in Indira Nagar that fit into one afternoon',
    subtitle: 'Sixty guests, a terrace, and a shot list of exactly four frames.',
    body: `Aarti and Vivek gave themselves five hours: ring exchange at four, photographs until six, dinner until nine. The whole thing happened on a terrace in Indira Nagar with two strings of lights and no stage.

The Mango Tree Co. shoot fine-art, which usually means slow — and slow is the wrong instinct for an afternoon this short. So the shot list was cut to four setups before the day, agreed with both families, and everything else was left to whatever happened.

The frames people ask about are not from the four setups. They are from the twenty minutes after the ring exchange, when both mothers were arguing about the seating and nobody was looking at the camera.

Three hundred edited photographs in eighteen days, and an album the couple ordered later, once they had seen them.`,
    coupleNames: 'Aarti & Vivek',
    eventType: 'engagement',
    eventDate: '2026-04-05',
    citySlug: 'lucknow',
    cityName: 'Lucknow',
    localityName: 'Indira Nagar',
    styleTags: ['fine-art', 'pre-wedding'],
    coverUrl: null,
    gallery: placeholderGallery('Aarti & Vivek', [
      'the terrace at four in the afternoon',
      'the ring exchange',
      'both mothers, mid-argument, about the seating',
      'the light at half past five',
      'dinner, sixty guests, one long table',
      'the last frame of the shot list',
    ]),
    vendorSlug: 'the-mango-tree-co',
    vendorName: 'The Mango Tree Co.',
    publishedAt: '2026-04-19',
  },
]

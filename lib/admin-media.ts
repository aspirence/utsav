import 'server-only'

import { storageImageUrl } from '@/lib/db'

import { getServerClientOrNull } from '@/lib/admin-supabase'

/**
 * A listing's photographs, for the console.
 *
 * This is what the cards on /lucknow/photography are made of: `media.storage_path` becomes the
 * card's cover through storageImageUrl(), and alt text, caption and style tags travel with it.
 *
 * Read on the staff member's own session. `media_manage` admits a vendor's manager or staff at
 * field_agent and up, and `media_select_live` is what the public gets — approved rows on live
 * listings only. Plan §6 makes RLS the boundary, so this file does no filtering of its own.
 *
 * TWO THINGS ABOUT MODERATION THAT THE SCREEN HAS TO SAY OUT LOUD. A new row defaults to
 * `pending`, and `media_select_live` requires `approved` — so a photograph added here is invisible
 * to customers until somebody approves it. And `vendors.media_count` is trigger-maintained, which
 * is why the go-live gate ("five photos") moves on its own rather than being set here.
 */

export type MediaModeration = 'pending' | 'approved' | 'rejected' | 'escalated'

export interface AdminMediaItem {
  id: string
  /** What is stored: a Storage object path, or a local/CDN URL if one was pasted. */
  storagePath: string
  /** Resolved for display. Null when storageImageUrl cannot build one (no Supabase, no leading /). */
  url: string | null
  altText: string | null
  caption: string | null
  styleTags: string[]
  sortOrder: number
  isCover: boolean
  moderation: MediaModeration
  isDemo: boolean
}

export async function getVendorMedia(vendorSlug: string): Promise<AdminMediaItem[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return demoFor(vendorSlug)

  // Two queries rather than an embed: database.types.ts is hand-authored with `Relationships: []`,
  // so postgrest types a nested select as a SelectQueryError. Same reason as lib/admin-reference.ts.
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('slug', vendorSlug)
    .maybeSingle()

  if (!vendor) return []

  const { data, error } = await supabase
    .from('media')
    .select('id, storage_path, alt_text, caption, style_tags, sort_order, is_cover, moderation')
    .eq('vendor_id', vendor.id)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true })

  // An empty gallery is a real answer, and so is a failure. Only a missing database falls back —
  // the same rule the templates and orders readers settled on after the review found the opposite.
  if (error) throw new Error(`Could not read this listing's photographs: ${error.message}`)
  if (!data) return []

  return data.map((m) => ({
    id: m.id,
    storagePath: m.storage_path,
    url: storageImageUrl(m.storage_path, { width: 640, height: 480 }),
    altText: m.alt_text,
    caption: m.caption,
    styleTags: m.style_tags ?? [],
    sortOrder: m.sort_order,
    isCover: m.is_cover,
    moderation: m.moderation as MediaModeration,
    isDemo: false,
  }))
}

/** Resolve a vendor slug to its id. Exported because the write actions need the same lookup. */
export async function getVendorIdBySlug(slug: string): Promise<string | null> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return null

  const { data } = await supabase.from('vendors').select('id').eq('slug', slug).maybeSingle()
  return data?.id ?? null
}

// ---------------------------------------------------------------------------
// Demo set
// ---------------------------------------------------------------------------

function item(
  n: number,
  path: string,
  alt: string,
  caption: string | null,
  tags: string[],
  moderation: MediaModeration,
  isCover = false,
): AdminMediaItem {
  return {
    id: `demo-media-${n}`,
    storagePath: path,
    url: storageImageUrl(path, { width: 640, height: 480 }),
    altText: alt,
    caption,
    styleTags: tags,
    sortOrder: n * 10,
    isCover,
    moderation,
    isDemo: true,
  }
}

/**
 * Sample photographs, varied per listing.
 *
 * A single shared constant was the first version, and it made every listing in the console — a
 * venue, a caterer, a decorator — show the same five wedding-photography frames. That reads as
 * "the gallery is broken" rather than as "there is no database attached", which is the opposite of
 * what a demo set is for.
 *
 * The pool is every static image in public/ that looks like event work. A listing gets a stable
 * slice of it derived from its slug, so the same listing always shows the same photographs and two
 * different listings almost never show the same set. Not random: a set that reshuffles on every
 * render makes the screen look unstable.
 *
 * The awkward cases are seeded deliberately — one photograph still pending approval and therefore
 * invisible to customers, and one with no alt text. A gallery that only shows finished rows teaches
 * nobody what to look for.
 */
const POOL: { path: string; alt: string; caption: string | null; tags: string[] }[] = [
  {
    path: '/luck-1-1280.webp',
    alt: 'Bride and groom during the pheras',
    caption: 'Gomti Nagar, December 2026',
    tags: ['traditional'],
  },
  {
    path: '/luck-2-1280.webp',
    alt: 'Haldi ceremony in the courtyard',
    caption: null,
    tags: ['candid'],
  },
  {
    path: '/luck-3-1280.webp',
    alt: 'Couple portrait at golden hour',
    caption: 'Shot on the terrace at Hazratganj',
    tags: ['fine-art'],
  },
  {
    path: '/luck-4-1280.webp',
    alt: 'Baraat arriving with dhol',
    caption: null,
    tags: ['candid', 'documentary'],
  },
  {
    path: '/historical-1280.webp',
    alt: 'Couple at Rumi Darwaza',
    caption: 'Pre-wedding, Lucknow',
    tags: ['pre-wedding'],
  },
  {
    path: '/temple-1280.webp',
    alt: 'Temple mandap set for the ceremony',
    caption: null,
    tags: ['traditional'],
  },
  {
    path: '/mountain-1280.webp',
    alt: 'Mandap against the hills at dusk',
    caption: 'Destination setup',
    tags: ['destination'],
  },
  {
    path: '/beach-1280.webp',
    alt: 'Beachside mandap at sunset',
    caption: null,
    tags: ['destination'],
  },
  {
    path: '/marathi-1280.webp',
    alt: 'Marathi ceremony under the antarpat',
    caption: null,
    tags: ['traditional'],
  },
  {
    path: '/punjabi-1280.webp',
    alt: 'Anand karaj in the gurudwara',
    caption: 'Punjabi ceremony',
    tags: ['documentary'],
  },
  {
    path: '/tamil-1280.webp',
    alt: 'South Indian ceremony with the nadaswaram',
    caption: null,
    tags: ['traditional'],
  },
  {
    path: '/place-gomti-nagar-1280.webp',
    alt: 'Reception hall dressed for the evening',
    caption: 'Gomti Nagar',
    tags: ['decor'],
  },
  {
    path: '/place-hazratganj-1280.webp',
    alt: 'Banquet lawn laid out for dinner',
    caption: null,
    tags: ['decor'],
  },
]

/**
 * A stable slice of the pool, chosen from the slug.
 *
 * A tiny FNV-style hash rather than an index into a map: it needs no table to maintain, gives every
 * slug a different starting point, and produces the same answer every render — including on the
 * server and the client, which a Math.random() version would not.
 */
function demoFor(vendorSlug: string): AdminMediaItem[] {
  let hash = 2166136261
  for (let i = 0; i < vendorSlug.length; i++) {
    hash ^= vendorSlug.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  /*
   * Both the starting point and the step come from the hash.
   *
   * With only the offset varying, two slugs landing on the same start produced the same five
   * photographs — which happened on the first try, between a caterer and a photographer. POOL.length
   * is prime, so any step from 1 to length-1 walks the whole pool without repeating, and two
   * listings now have to collide on both numbers to look alike.
   */
  const offset = Math.abs(hash) % POOL.length
  const stride = 1 + (Math.abs(Math.imul(hash, 2654435761)) % (POOL.length - 1))

  return Array.from({ length: 5 }, (_, i) => {
    const entry = POOL[(offset + i * stride) % POOL.length]!
    return item(
      i + 1,
      entry.path,
      // The fourth in every set has no alt text, so the missing-alt counter always has something
      // to report and the red state is visible without hunting for it.
      i === 3 ? '' : entry.alt,
      entry.caption,
      entry.tags,
      // The second is still awaiting moderation, so the "approved and public" count never matches
      // the total and the gap is visible.
      i === 1 ? 'pending' : 'approved',
      i === 0,
    )
  })
}

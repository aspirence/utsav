import 'server-only'

import { storageImageUrl } from '@utsava/db'

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
  if (!supabase) return DEMO

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
 * Local files from public/, so the grid has something real to show with no database attached.
 *
 * The awkward cases are here on purpose: one still pending approval and therefore invisible to
 * customers, and one with no alt text. A gallery that only shows finished rows teaches nobody what
 * to look for.
 */
const DEMO: AdminMediaItem[] = [
  item(1, '/luck-1-1280.webp', 'Bride and groom during the pheras', 'Gomti Nagar, December 2026', ['traditional'], 'approved', true),
  item(2, '/luck-2-1280.webp', 'Haldi ceremony in the courtyard', null, ['candid'], 'approved'),
  item(3, '/luck-3-1280.webp', 'Couple portrait at golden hour', 'Shot on the terrace at Hazratganj', ['fine-art'], 'approved'),
  item(4, '/luck-4-1280.webp', 'Baraat arriving with dhol', null, ['candid', 'documentary'], 'pending'),
  item(5, '/historical-1280.webp', '', 'Rumi Darwaza pre-wedding', ['pre-wedding'], 'approved'),
]

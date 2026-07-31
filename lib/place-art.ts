import 'server-only'

/**
 * Photographs for Lucknow's localities, keyed by slug.
 *
 * One table, because two bands use it - the explore panel and the packages slider - and a
 * second copy of these widths would drift the first time an image is re-exported.
 *
 * Keyed rather than positional. The explore list is ordered by vendor count, so a
 * positional map would silently hand Gomti Nagar's photograph to whichever area happened
 * to overtake it. A locality with no photograph yet is simply absent and falls through to
 * the placeholder, which is the honest state and not a bug.
 *
 * THE WIDTHS ARE EACH FILE'S REAL PIXEL WIDTH, and they have to be written out rather than
 * derived from the filenames. `pnpm images` resizes withoutEnlargement and skips a variant
 * once it would be an upscale, so:
 *
 *   · a 1536px source yields a `-1920.webp` that is 1536 wide
 *   · a 1448px source yields a `-1920.webp` that is 1448 wide
 *   · Kanpur Road's square 1254px source yields a 1254px `-1280.webp` and no 1920 at all
 *
 * A descriptor that claims more than the file holds makes the browser pick something
 * smaller than it asked for.
 */
const FILE_WIDTHS = [768, 1280, 1920] as const

/** slug -> the real width of each generated variant, in FILE_WIDTHS order. */
const REAL: Record<string, readonly number[]> = {
  'gomti-nagar': [768, 1280, 1448],
  hazratganj: [768, 1280, 1448],
  aliganj: [768, 1280, 1448],
  chowk: [768, 1280, 1448],
  'indira-nagar': [768, 1280, 1536],
  'sushant-golf-city': [768, 1280, 1536],
  mahanagar: [768, 1280, 1536],
  'kanpur-road': [768, 1254],
}

export interface PlaceArt {
  imageUrl: string
  imageSrcSet: string
}

export const PLACE_ART: Record<string, PlaceArt> = Object.fromEntries(
  Object.entries(REAL).map(([slug, widths]) => [
    slug,
    {
      imageUrl: `/place-${slug}-1280.webp`,
      imageSrcSet: widths
        .map((real, i) => `/place-${slug}-${FILE_WIDTHS[i]}.webp ${real}w`)
        .join(', '),
    },
  ]),
)

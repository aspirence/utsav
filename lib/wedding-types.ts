import 'server-only'

import type { SliderCard } from '@/components/type-slider'

/**
 * Hindu wedding traditions across India.
 *
 * SCOPE: this list is Hindu traditions only, by an explicit product decision. Nikah and
 * Christian ceremonies were both removed rather than left below the cut-off, so nobody
 * later "restores" them by raising `limit` and reintroduces a scope change by accident.
 * They are real segments in both launch cities; putting them back is a content call, not
 * a code one.
 *
 * Plan section 1 calls Fremmo an all-events marketplace "for India" - and India does not
 * have one wedding, it has a few dozen. A Tamil muhurtham at 5am and a Punjabi baraat at
 * 8pm need different things from a photographer, a caterer and a venue, and a couple
 * searching will describe their wedding by its tradition long before they describe it by
 * a category.
 *
 * The one-liners are specific on purpose - an actual ritual, an actual garment, an actual
 * time of day. "Celebrate your special day" would be true of all of them and useful for
 * none.
 *
 * Each card runs a real full-text search against vendor profiles (search_vendors takes
 * p_query, and the fixture path matches on name, about and style tags). Where a city has
 * nobody who mentions that tradition yet, the discovery page shows its proper empty
 * state rather than a fake result - which is the honest outcome while supply is still
 * being built.
 *
 * ORDER MATTERS. The list is sorted by how many people in India would actually pick that
 * card, which is roughly community size, and the homepage shows the first eight. The
 * remainder stays in the file rather than being deleted: they are correct, they are used
 * nowhere else yet, and the cut-off is a presentation decision that will move as supply
 * grows city by city. Raise `limit` to surface more.
 */
export function getWeddingTypes(citySlug: string, limit = 8): SliderCard[] {
  const find = (q: string) => `/${citySlug}/photography?q=${encodeURIComponent(q)}`

  /**
   * Artwork, where it exists. Traditions without a photograph yet fall through to the
   * placeholder in the card - that is deliberate, and better than borrowing a Punjabi
   * baraat to illustrate a Malayali sadhya.
   *
   * `widths` are the files' real pixel widths, which are not always what the filename
   * says: optimize-images.mjs resizes withoutEnlargement and skips a variant entirely
   * once it would be an upscale, so a square 1254px source yields a `-1280.webp` that is
   * 1254px wide and no `-1920.webp` at all. Lying in a descriptor makes the browser pick
   * a file smaller than it asked for.
   */
  const art = (name: string, widths: [number, number][] = []) => ({
    imageUrl: `/${name}-1280.webp`,
    imageSrcSet: widths.map(([file, real]) => `/${name}-${file}.webp ${real}w`).join(', '),
  })

  const all: SliderCard[] = [
    {
      slug: 'punjabi',
      title: 'Punjabi',
      blurb:
        'Milni at the gate, chooda on the wrists, four pheras around the fire, and a jago night nobody sleeps through.',
      href: find('punjabi'),
      ...art('punjabi', [
        [768, 768],
        [1280, 1280],
        [1920, 1536],
      ]),
    },
    {
      slug: 'tamil',
      title: 'Tamil',
      blurb:
        'Muhurtham before sunrise, kashi yatra, the oonjal swing, and a nine-yard madisar the bride is dressed into.',
      href: find('tamil'),
      // 1537px wide, not 1536 - the odd source dimension is real, not a typo.
      ...art('tamil', [
        [768, 768],
        [1280, 1280],
        [1920, 1537],
      ]),
    },
    {
      slug: 'bengali',
      title: 'Bengali',
      blurb:
        'Gaye holud, the shubho drishti under betel leaves, conch shells at dusk, and sindoor daan to close it.',
      href: find('bengali'),
      // Square 1254px source, so there is no 1920 variant to point at.
      ...art('bengali', [
        [768, 768],
        [1280, 1254],
      ]),
    },
    {
      slug: 'marathi',
      title: 'Marathi',
      blurb:
        'The antarpat curtain dropped at the muhurat, mundavalya on both foreheads, and it is usually done by noon.',
      href: find('marathi'),
      ...art('marathi', [
        [768, 768],
        [1280, 1280],
        [1920, 1536],
      ]),
    },
    {
      slug: 'gujarati',
      title: 'Gujarati',
      blurb:
        'Garba until 2am, ponkhvu at the door where the groom gets his nose pulled, and four mangal pheras.',
      href: find('gujarati'),
      ...art('gujarati', [
        [768, 768],
        [1280, 1280],
        [1920, 1536],
      ]),
    },
    {
      slug: 'telugu',
      title: 'Telugu',
      blurb:
        'Jeelakarra bellam pressed on both heads, then talambralu - rice thrown until everyone gives up laughing.',
      href: find('telugu'),
      ...art('telugu', [
        [768, 768],
        [1280, 1280],
        [1920, 1536],
      ]),
    },
    {
      slug: 'kannada',
      title: 'Kannada',
      blurb:
        'Kashi yatra with the umbrella and the walking stick, dhare herdu, and the bale shastra bangle ceremony.',
      href: find('kannada'),
    },
    {
      slug: 'malayali',
      title: 'Malayali',
      blurb:
        'Twenty minutes of ceremony, a kasavu saree, a thaali tied, and then a sadhya that takes four hours.',
      href: find('malayali'),
      ...art('malayali', [
        [768, 768],
        [1280, 1280],
        [1920, 1536],
      ]),
    },

    // --- below the homepage cut-off ---
    {
      slug: 'rajasthani',
      title: 'Rajasthani',
      blurb:
        'A baraat on horseback, pehrawani for the groom, and a haveli or a fort doing most of the work.',
      href: find('rajasthani'),
    },
    {
      slug: 'sindhi',
      title: 'Sindhi',
      blurb:
        'Berana satsang, the saanth ceremony, and a palli procession to the temple before the wedding day.',
      href: find('sindhi'),
    },
    {
      slug: 'kashmiri',
      title: 'Kashmiri Pandit',
      blurb:
        'Devgon, the mahraz in a dejhoor-lined mandap, and vyoog rangoli drawn at the threshold to receive them.',
      href: find('kashmiri'),
    },
    {
      slug: 'destination',
      title: 'Destination',
      blurb:
        'Three days, one property, and a guest list that flies in. Usually Goa, Udaipur or somewhere with a beach.',
      href: find('destination'),
    },
  ]

  return all.slice(0, limit)
}

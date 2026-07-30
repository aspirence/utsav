import 'server-only'

import { getServerClientOrNull } from '@/lib/admin-supabase'

/**
 * The invitation storefront. Plan §2 counts digital invitations as a revenue line.
 *
 * Each row is one phone-shaped card on the home page: a looping preview, a few tag words, a
 * name and a price that flips to "Order now" under the cursor.
 *
 * Read through whatever session is asking. `invitation_templates_select_active` is granted to
 * anon, so the home page works for a visitor; `invitation_templates_select_staff` adds the
 * drafts, so the console lists what is not live yet. One query, two answers, decided by RLS
 * rather than by a flag passed in from here.
 */

export type PreviewKind = 'video' | 'embed' | 'none'

/**
 * What every template includes.
 *
 * A shared constant, not a per-row column, because it is currently true of all of them — they
 * are the same product in different art, at the same price. A `features text[]` column would let
 * them diverge, and the day one actually does is the day to add it; until then eight copies of
 * the same seven strings is eight places to forget to update.
 */
export const INVITATION_FEATURES = [
  'A free “save the date” invite',
  'Immersive “tap to enter” gateway',
  'Background music, chosen to match',
  'Interactive ceremony timeline',
  'High-fidelity photo gallery',
  'RSVP and guest management',
  'Venue maps for every event',
] as const

/**
 * How ordering an invitation actually goes.
 *
 * Written from the flow that exists, not from a template. There is deliberately no turnaround
 * promise — no "ready in 30 minutes" — because nothing behind this is automated yet: the order
 * button opens an enquiry form and a person answers it. A number here would be the one line on
 * the page nobody could keep.
 */
export const INVITATION_STEPS = [
  {
    title: 'Pick a design',
    body: 'Every collection is the same price, so choose on how it looks, not on what it costs.',
  },
  {
    title: 'Send us the details',
    body: 'Your names, the dates, the venues and the photographs — through one short form.',
  },
  {
    title: 'We set it up',
    body: 'Your story goes into the template and you get a preview link to approve before anyone else sees it.',
  },
  {
    title: 'Share one link',
    body: 'Send it on WhatsApp. Guests RSVP on their phones and the replies come back to you.',
  },
] as const

/**
 * Testimonials for the invitation storefront.
 *
 * NOT MARKED VERIFIED, and that is the point. Plan §2's review promise is that a review requires
 * a completed booking, and the bookings table has never had a row — escrow is a July 2027
 * milestone (§14). These are placeholder copy for a section that has no data source yet, so they
 * carry `verified: false` and the marquee prints no badge on them.
 *
 * When invitations start being ordered for real, this constant becomes a query and the flag
 * becomes true. Until then the section is honest about being unverified rather than borrowing a
 * claim from the vendor side.
 */
export const INVITATION_REVIEWS = [
  {
    rating: 5,
    title: 'Our relatives actually used the RSVP.',
    body: 'Sixty-odd replies came back through the link without a single phone call. The venue map was the part my father kept forwarding to people.',
    authorName: 'Sneha & Arjun',
    sourceName: 'Lucknow',
    verified: false,
  },
  {
    rating: 5,
    title: 'The timeline sold it for us.',
    body: 'Four events over three days, and everybody could see what was where. Guests coming from outside the city stopped asking us for the schedule.',
    authorName: 'Meera & Kartik',
    sourceName: 'a Goa destination wedding',
    verified: false,
  },
  {
    rating: 4,
    title: 'Gallery section sabse best laga.',
    body: 'Pre-wedding shoot ki photos ka layout kamaal ka tha. Ek hi link bheji aur sab ne dekh liya — printing ka jhanjhat hi khatam.',
    authorName: 'Aisha & Kabir',
    sourceName: 'Jaipur',
    verified: false,
  },
  {
    rating: 5,
    title: 'Read properly on my nani’s phone.',
    body: 'That was the real test. She opened it on a six-year-old Android and the music and the countdown both worked.',
    authorName: 'Neha & Varun',
    sourceName: 'Pune',
    verified: false,
  },
  {
    rating: 4,
    title: 'Changed the date twice, no reprints.',
    body: 'The muhurat moved after we had already sent the invite out. They updated the same link and nobody had to be told twice.',
    authorName: 'Kritika & Rohan',
    sourceName: 'a Kerala backwater wedding',
    verified: false,
  },
] as const

export interface InvitationTemplate {
  id: string
  slug: string
  name: string
  tags: string[]
  pricePaise: number
  videoUrl: string | null
  posterUrl: string | null
  isActive: boolean
  /** What the card should render. Derived, never stored — see classifyPreview. */
  preview: PreviewKind
  /** For 'embed', the URL that actually belongs in an iframe src. */
  embedUrl: string | null
  /** True when this row came from the demo set rather than the database. */
  isDemo: boolean
}

/** Everything the storefront shows. Active rows for a visitor, all rows for staff. */
export async function getInvitationTemplates(): Promise<InvitationTemplate[]> {
  const supabase = await getServerClientOrNull()
  if (!supabase) return DEMO

  const { data, error } = await supabase
    .from('invitation_templates')
    .select('id, slug, name, tags, price, video_url, poster_url, is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error || !data || data.length === 0) return DEMO

  return data.map((r) => shape(r))
}

/** Active rows only, for the public page — belt and braces over the RLS policy. */
export async function getLiveInvitationTemplates(): Promise<InvitationTemplate[]> {
  return (await getInvitationTemplates()).filter((t) => t.isActive)
}

export async function getInvitationTemplate(slug: string): Promise<InvitationTemplate | null> {
  return (await getInvitationTemplates()).find((t) => t.slug === slug) ?? null
}

// ---------------------------------------------------------------------------
// Preview classification
// ---------------------------------------------------------------------------

/**
 * Decide what element a pasted URL needs.
 *
 * THIS IS THE PART THAT MATTERS, because staff paste whatever they have. A `<video>` pointed
 * at a YouTube watch page renders a black rectangle; an `<iframe>` pointed at an .mp4 renders
 * a download prompt. Neither errors, so both look like "the section is broken" rather than
 * "that link is the wrong kind".
 *
 * Two shapes are recognised:
 *
 *   video → a direct file the browser can decode: .mp4, .webm, .ogg/.ogv, .mov. Supabase
 *           Storage public URLs and any plain CDN link land here.
 *   embed → YouTube or Vimeo, rewritten to their embed form with autoplay+mute+loop, because
 *           a watch URL in an iframe shows chrome, a title bar and related videos.
 *
 * Anything else is 'none' and the card falls back to its poster. Guessing would mean rendering
 * a broken element on a page customers see; showing a still image is the honest degradation.
 *
 * A NOTE ON MUTED AUTOPLAY. Every browser blocks autoplay with sound, so both branches force
 * mute. That is not a preference — an unmuted autoplay is an autoplay that does not happen.
 */
export function classifyPreview(url: string | null): { kind: PreviewKind; embedUrl: string | null } {
  if (!url) return { kind: 'none', embedUrl: null }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    // Not a URL at all. The DB constraint requires https://, so this is a row written before
    // that constraint or by hand.
    return { kind: 'none', embedUrl: null }
  }

  // Query strings are normal on storage URLs (tokens, cache busters), so test the path only.
  if (/\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(parsed.pathname)) {
    return { kind: 'video', embedUrl: null }
  }

  const host = parsed.hostname.replace(/^www\./, '')

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    // /watch?v=ID, and /shorts/ID for the vertical clips these previews usually are.
    const id = parsed.searchParams.get('v') ?? parsed.pathname.match(/^\/shorts\/([\w-]+)/)?.[1]
    return id ? { kind: 'embed', embedUrl: youtubeEmbed(id) } : { kind: 'none', embedUrl: null }
  }

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1)
    return id ? { kind: 'embed', embedUrl: youtubeEmbed(id) } : { kind: 'none', embedUrl: null }
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parsed.pathname.match(/(\d+)/)?.[1]
    return id
      ? {
          kind: 'embed',
          embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&loop=1&background=1`,
        }
      : { kind: 'none', embedUrl: null }
  }

  return { kind: 'none', embedUrl: null }
}

/**
 * `playlist` repeats the id on purpose: YouTube's `loop=1` is a playlist feature and does
 * nothing on a single video without it. `controls=0&modestbranding=1&rel=0` strips the chrome
 * that would otherwise sit over a phone mockup.
 */
function youtubeEmbed(id: string): string {
  const q = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    playlist: id,
    controls: '0',
    modestbranding: '1',
    rel: '0',
    playsinline: '1',
  })
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface RawTemplate {
  id: string
  slug: string
  name: string
  tags: string[] | null
  price: number
  video_url: string | null
  poster_url: string | null
  is_active: boolean
}

function shape(r: RawTemplate, isDemo = false): InvitationTemplate {
  const { kind, embedUrl } = classifyPreview(r.video_url)
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    tags: r.tags ?? [],
    pricePaise: r.price,
    videoUrl: r.video_url,
    posterUrl: r.poster_url,
    isActive: r.is_active,
    preview: kind,
    embedUrl,
    isDemo,
  }
}

/**
 * The demo set.
 *
 * Deliberately carries NO video_url. There is no video to point at yet — that is the thing
 * the console is for — and inventing a link to somebody else's file would make the section
 * look finished while quietly depending on a stranger's bandwidth. Every card falls back to
 * its poster and the console says where the videos go.
 *
 * Posters reuse art already in public/. Prices match the reference: ₹1,499 = 149900 paise.
 */
const DEMO: InvitationTemplate[] = [
  raw('vibrant-heritage', 'Vibrant Heritage', ['Royal', 'Vibrant', 'New'], 149_900, '/invitation.webp'),
  raw('divine-kedarnath', 'Divine Kedarnath Elegance', ['Temple', 'New', 'Shiva'], 149_900, '/mountain-1280.webp'),
  raw('taj-mahal-elegance', 'Taj Mahal Elegance', ['New', 'Royal', 'Tajmahal'], 149_900, '/historical-1280.webp'),
  raw('modern-rajputana', 'The Modern Rajputana', ['Modern', 'Royalty', 'New'], 149_900, '/luck-3-1280.webp'),
  raw('divine-prem-radha-krishna', 'Divine Prem: The Radha-Krishna Edition', ['Radha', 'Temple', 'Krishna'], 149_900, '/temple-1280.webp'),
  raw('marathi-shalu', 'Marathi Shalu & Mundavalya', ['Marathi', 'Classic', 'New'], 149_900, '/marathi-1280.webp'),
  raw('punjabi-phulkari', 'Punjabi Phulkari', ['Punjabi', 'Vibrant', 'Dhol'], 149_900, '/punjabi-1280.webp'),
  raw('kanjivaram-classic', 'Kanjivaram Classic', ['South', 'Temple', 'Silk'], 149_900, '/tamil-1280.webp'),
].map((r) => shape(r, true))

function raw(
  slug: string,
  name: string,
  tags: string[],
  price: number,
  poster: string,
): RawTemplate {
  return {
    id: `demo-${slug}`,
    slug,
    name,
    tags,
    price,
    video_url: null,
    poster_url: poster,
    is_active: true,
  }
}

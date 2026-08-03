import 'server-only'

import { formatPaise } from '@/lib/db'
import { getPublicReadClient } from '@/lib/supabase'

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

/**
 * What a template's preview actually renders as.
 *
 * THERE IS NO 'embed' ANY MORE, AND THAT IS THE POINT OF THIS TYPE. The card used to iframe a
 * live page — our own /invitation, or a YouTube player — inside the phone mockup. Three things
 * were wrong with it:
 *
 *   · It framed OUR OWN CHROME. /invitation carries a "← Fremmo" back link and a mute button,
 *     so the phone in the storefront showed a phone showing our site, back button and all. In
 *     development it also showed the Next.js dev badge sitting in the mockup.
 *   · It cost a full page load and a WebGL context per card, which is what made the section
 *     visibly slow to fill in.
 *   · It could not be a thumbnail. A preview has to render the same way every time; a live page
 *     renders whatever it happens to be doing when you look.
 *
 * A preview is now media: a video file, or an image — and a GIF is an image, which is why the
 * kind is 'image' rather than 'gif'. Nothing framed, nothing live.
 */
export type PreviewKind = 'video' | 'image' | 'none'

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
 * The booking amount, in one place.
 *
 * A customer pays a small amount to reserve a design slot and the balance on approval. These are
 * business numbers, so they live as one constant rather than scattered through copy — the launch
 * price appears in a banner, a summary row, a button and a note, and four literals is four
 * places to forget when the offer ends.
 *
 * The balance is DERIVED, never written down: `invitation_orders_amounts_reconcile` requires
 * booking + balance = template price, so a hardcoded "₹1,400" would be a constraint violation the
 * day the template price changes.
 *
 * Integer paise (plan §5).
 */
export const BOOKING = {
  /** What the launch offer asks for now. */
  amountPaise: 9_900,
  /** What it will be afterwards — shown struck through, so the offer means something. */
  regularAmountPaise: 29_900,
  /** The offer's cap. Copy only; nothing counts orders against it yet. */
  offerSeats: 20,
} as const

/**
 * The two legs of an order, derived together from the price.
 *
 * ONE FUNCTION, BECAUSE THEY MUST RECONCILE. `invitation_orders_amounts_reconcile` requires
 * booking + balance = template_price. The first version of this computed only the balance as
 * `Math.max(0, price - 99)`, which silently broke that for any template priced under the booking
 * amount: a ₹49 design quoted "booking ₹99, balance ₹0" — a reservation fee larger than the
 * product — and then every insert was rejected by the constraint with a message blaming the form.
 * The clamp was what hid it; without it the value went negative and app.paise would have named
 * the real problem.
 *
 * So a template cheaper than the booking amount is simply paid in full up front.
 */
export function orderLegs(templatePricePaise: number): {
  bookingPaise: number
  balancePaise: number
} {
  const bookingPaise = Math.min(BOOKING.amountPaise, templatePricePaise)
  return { bookingPaise, balancePaise: templatePricePaise - bookingPaise }
}

/** Just the balance, for copy. Same derivation, so it cannot disagree with orderLegs(). */
export function balancePaise(templatePricePaise: number): number {
  return orderLegs(templatePricePaise).balancePaise
}

/**
 * How ordering an invitation actually goes.
 *
 * Written from the flow that exists, not from a template. There is deliberately no turnaround
 * promise — no "ready in 30 minutes" — because nothing behind this is automated yet: the order
 * button opens an enquiry form and a person answers it. A number here would be the one line on
 * the page nobody could keep.
 */
export const INVITATION_STEPS = [
  /*
   * NO CROSS-CATALOGUE PRICE CLAIM HERE. This step used to read "Every collection is the same
   * price, so choose on how it looks, not on what it costs". `price` is a per-row app.paise
   * column whose only constraint is `> 0` (20260730000100) and the console edits it one template
   * at a time, so that sentence was a statement about seven rows nobody had read, printed beside
   * a grid where each card shows its own price — the page could contradict itself the first time
   * staff repriced anything. Every card carries its price; that is where the comparison belongs.
   */
  {
    title: 'Pick a design',
    body: 'Choose on how it looks. Every collection shows its own price on its card.',
  },
  /*
   * PHOTOGRAPHS ARE NOT COLLECTED ON THE FORM, and this step used to say they were. The booking
   * form has no file field at all — its fieldsets are contact details plus the card's wording —
   * and the order confirmation in book/actions.ts tells the customer in as many words that we
   * message them on WhatsApp "to collect your names, dates and photographs". Two halves of the
   * same flow disagreeing about what a customer has to have ready is the kind of thing they only
   * find out after paying.
   */
  {
    title: 'Send us the details',
    body: 'Your names, the date and the venue go on one short form. Photographs come to us on WhatsApp afterwards.',
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
 * The questions somebody asks before ordering, answered from the flow that exists.
 *
 * DERIVED, NOT TYPED OUT. The amounts come from orderLegs() and the inclusions from
 * INVITATION_FEATURES, so an answer cannot end up disagreeing with the price printed beside it
 * or with the list printed above it — which is how every hand-written FAQ block eventually goes
 * wrong.
 *
 * FOUR THINGS ARE DELIBERATELY NOT ANSWERED HERE. Check this list before adding a question:
 *
 *   · A TURNAROUND NUMBER. See INVITATION_STEPS above — nothing behind this is automated and a
 *     person answers each order, so a stock "ready in N hours" is the one line nobody could keep.
 *     The timing question is answered by naming the sequence instead of a duration.
 *   · WHETHER THE BOOKING AMOUNT COMES BACK. The booking card's own copy says it does;
 *     app/(site)/p/[slug] carries three terms documents and not one of them has an invitation
 *     cancellation or refund clause. A refund promise belongs in the terms first and in an FAQ
 *     second, or it is a guarantee whose only citation is itself.
 *   · WHETHER DETAILS CAN BE CHANGED AFTER SENDING. There is no customer-facing edit path —
 *     /account/invitations lists orders and a status label and offers no action on them. The only
 *     support for the claim is INVITATION_REVIEWS[4], which carries verified: false.
 *   · HOW A MULTI-DAY WEDDING RENDERS. There was a "we have four functions over three days, does
 *     that work?" answer here promising that the timeline and the maps are per event, so a mehndi,
 *     a haldi, the wedding and the reception each get their own time, place and map. Nothing in
 *     the repo can produce that: cardContentSchema and InvitationCardContent carry ONE `date`, ONE
 *     `time` and one `venueLines` — a single address pre-broken at its commas — and app/invite/
 *     [slug] renders exactly those through linesFor(). There is no schedule, RSVP, gallery or map
 *     code anywhere on this product. (`e_invite_rsvps` belongs to the separate engagement-ops
 *     feature and is not what an invitation order writes.) An answer here would be a capability a
 *     customer buys on and a Question node a crawler indexes; it needs the card to grow the shape
 *     first. Somebody with several functions has the form's "Anything we should know?" box and a
 *     person on the other end of it.
 */
export function invitationFaqs(pricePaise: number): { q: string; a: string }[] {
  const { bookingPaise, balancePaise } = orderLegs(pricePaise)
  const booking = formatPaise(bookingPaise)
  const balance = formatPaise(balancePaise)
  // A template priced under the booking amount is paid in full up front — see orderLegs.
  const split = balancePaise > 0

  return [
    {
      q: 'What do I pay now, and what do I pay later?',
      a: split
        ? `${booking} today books your design slot. The ${balance} balance falls due only after your draft is ready and you have approved it, so you see the finished invitation before you pay the rest of it.`
        : `${booking}, once. That is the whole price and there is nothing to pay afterwards.`,
    },
    {
      q: 'Do I have to design anything myself?',
      // The fields named here are the booking form's actual fieldsets, and the WhatsApp sentence
      // is the one book/actions.ts sends on a placed order. The form has no file input.
      a: 'No. You send your names, the date and the venue on one short form, we ask for the photographs on WhatsApp afterwards, and a person sets all of it into the design you picked. There is no builder to learn and nothing to lay out.',
    },
    {
      q: 'Can I see it before my guests do?',
      a: 'Yes, and that is the order things happen in. Your story goes into the template and you get a preview link to approve before anyone else sees it. Nothing goes out until you have looked at it.',
    },
    {
      q: 'What does “one link” mean?',
      a: 'Your invitation is a web page at its own address. You send that one link on WhatsApp and guests open it in whatever browser is already on their phone — no app to download, no PDF to save, nothing to print. Their RSVPs come back to you.',
    },
    {
      /*
       * ABOUT THIS DESIGN, NOT ABOUT THE CATALOGUE. This answer used to open "Every collection is
       * the same price" — a claim about seven other rows, derived from the one price passed in.
       * Price is per row and staff edit them one at a time, so the sentence was one repricing away
       * from being contradicted by the "Other collections" grid further down the same page, which
       * prints each template's own price. What IS guaranteed is that the two payments sum to the
       * price shown: invitation_orders_amounts_reconcile enforces booking + balance = template
       * price, which is the same reconciliation orderLegs() computes above.
       */
      q: 'What is included at this price?',
      a: `${formatPaise(pricePaise)} is the whole price of this design — the amount you pay now and the balance add up to exactly that, and there is nothing else to buy. It includes: ${INVITATION_FEATURES.join('; ')}.`,
    },
    {
      q: 'How soon will it be ready?',
      a: split
        ? `A person sets up every card by hand, so there is no stock turnaround time printed here — it would be the one line we could not keep for every order. What is fixed is the sequence, and that is the part that protects you: you see the draft and approve it first, and the ${balance} balance is only due after that.`
        : 'A person sets up every card by hand, so there is no stock turnaround time printed here — it would be the one line we could not keep for every order. What is fixed is the sequence: you see the draft and approve it before it goes to anybody.',
    },
  ]
}

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
  /** For 'image', the file to show — a direct image/GIF, or a thumbnail derived from a link. */
  imageUrl: string | null
  /** True when this row came from the demo set rather than the database. */
  isDemo: boolean
}

/**
 * Everything the storefront shows. Active rows for a visitor, all rows for staff.
 *
 * getPublicReadClient() rather than getServerClientOrNull(), for the reason spelled out in
 * the block below: /invitation is statically generated, cookies() does not exist during a
 * prerender, and a null client here means the demo set gets baked into the page. Staff
 * still get their session — the fallback only fires when there is no request at all — so
 * the console keeps seeing inactive rows.
 */
export async function getInvitationTemplates(): Promise<InvitationTemplate[]> {
  const supabase = await getPublicReadClient()
  if (!supabase) return DEMO

  const { data, error } = await supabase
    .from('invitation_templates')
    .select('id, slug, name, tags, price, video_url, poster_url, is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  /*
   * DEMO IS FOR "NO DATABASE", NOT FOR "NO ROWS" AND NOT FOR "READ FAILED".
   *
   * This used to be `if (error || !data || data.length === 0) return DEMO`, and that was a real
   * defect rather than a stylistic one. invitation_templates is not seeded, so a freshly migrated
   * project has an empty table — and the storefront would then show eight designs that exist
   * nowhere, take real orders against them, and write order rows whose price came from a
   * TypeScript literal and whose template_id was null and unjoinable. The same substitution fired
   * on any transient read error, and on the ordinary act of unpublishing the last live template:
   * the console said "off the home page but not deleted" while the demo set quietly took its place
   * and kept selling.
   *
   * An empty catalogue is a real answer. Nothing to sell is a correct thing to render.
   */
  if (error) throw new Error(`Could not read invitation templates: ${error.message}`)
  if (!data) return []

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
const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i
/** GIF included deliberately — an animated GIF in an <img> is a perfectly good preview. */
const IMAGE_EXT = /\.(gif|webp|png|jpe?g|avif)$/i

export function classifyPreview(url: string | null): {
  kind: PreviewKind
  imageUrl: string | null
} {
  if (!url) return { kind: 'none', imageUrl: null }

  /*
   * A PATH THIS APP SERVES — /clip.webm, /preview.gif, and so on.
   *
   * A path that is NOT a media file is a page, and a page is no longer a preview. This used to
   * return `embed` and put /invitation in an iframe; see the note on PreviewKind for why that
   * had to go. It falls through to 'none', so the card shows its poster instead.
   *
   * The single-leading-slash test is the database constraint's own (20260731150000):
   * '//host/x' is protocol-relative, belongs to somebody else, and is handled by the URL
   * parsing below rather than treated as local.
   */
  if (url.startsWith('/') && !url.startsWith('//')) {
    if (VIDEO_EXT.test(url)) return { kind: 'video', imageUrl: null }
    if (IMAGE_EXT.test(url)) return { kind: 'image', imageUrl: url }
    return { kind: 'none', imageUrl: null }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    // Neither an absolute URL nor an app path. The column constraint refuses both, so this
    // is a row written before it existed or edited straight in the database.
    return { kind: 'none', imageUrl: null }
  }

  // Query strings are normal on storage URLs (tokens, cache busters), so test the path only.
  if (VIDEO_EXT.test(parsed.pathname)) return { kind: 'video', imageUrl: null }
  if (IMAGE_EXT.test(parsed.pathname)) return { kind: 'image', imageUrl: url }

  const host = parsed.hostname.replace(/^www\./, '')

  /*
   * YOUTUBE BECOMES A STILL, NOT A PLAYER.
   *
   * The old behaviour was an iframe with an autoplaying, chrome-stripped player. What it
   * actually put in the phone mockup was a third party's video element with a third party's
   * cookies, four of them on one screen. Now the id is turned into YouTube's own thumbnail —
   * a plain image, on the same terms as every other preview.
   *
   * hqdefault and not maxresdefault: maxres only exists for videos uploaded above 720p, and
   * when it does not exist YouTube serves a 404 placeholder rather than an error, so the card
   * would show a grey thumbnail with no way to tell it had failed. hqdefault always exists.
   */
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    // /watch?v=ID, and /shorts/ID for the vertical clips these previews usually are.
    const id = parsed.searchParams.get('v') ?? parsed.pathname.match(/^\/shorts\/([\w-]+)/)?.[1]
    return id ? { kind: 'image', imageUrl: youtubeThumb(id) } : { kind: 'none', imageUrl: null }
  }

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1)
    return id ? { kind: 'image', imageUrl: youtubeThumb(id) } : { kind: 'none', imageUrl: null }
  }

  /*
   * Vimeo falls through to the poster on purpose.
   *
   * Vimeo thumbnails are not derivable from the video id — they need an oEmbed call, which is a
   * network round trip on a path that renders eight cards. A staff member who wants a Vimeo clip
   * in a card can paste the poster image alongside it; the console says so.
   */
  return { kind: 'none', imageUrl: null }
}

/**
 * YouTube's own thumbnail for a video id.
 *
 * i.ytimg.com rather than img.youtube.com — same images, but the ytimg host is the CDN and does
 * not carry the youtube.com cookie domain. This is a plain <img>, so nothing is executing; the
 * only thing crossing to a third party is an image request.
 */
function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
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
  const { kind, imageUrl } = classifyPreview(r.video_url)
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
    imageUrl,
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
  raw(
    'vibrant-heritage',
    'Vibrant Heritage',
    ['Royal', 'Vibrant', 'New'],
    149_900,
    '/invitation.webp',
  ),
  raw(
    'divine-kedarnath',
    'Divine Kedarnath Elegance',
    ['Temple', 'New', 'Shiva'],
    149_900,
    '/mountain-1280.webp',
  ),
  raw(
    'taj-mahal-elegance',
    'Taj Mahal Elegance',
    ['New', 'Royal', 'Tajmahal'],
    149_900,
    '/historical-1280.webp',
  ),
  raw(
    'modern-rajputana',
    'The Modern Rajputana',
    ['Modern', 'Royalty', 'New'],
    149_900,
    '/luck-3-1280.webp',
  ),
  raw(
    'divine-prem-radha-krishna',
    'Divine Prem: The Radha-Krishna Edition',
    ['Radha', 'Temple', 'Krishna'],
    149_900,
    '/temple-1280.webp',
  ),
  raw(
    'marathi-shalu',
    'Marathi Shalu & Mundavalya',
    ['Marathi', 'Classic', 'New'],
    149_900,
    '/marathi-1280.webp',
  ),
  raw(
    'punjabi-phulkari',
    'Punjabi Phulkari',
    ['Punjabi', 'Vibrant', 'Dhol'],
    149_900,
    '/punjabi-1280.webp',
  ),
  raw(
    'kanjivaram-classic',
    'Kanjivaram Classic',
    ['South', 'Temple', 'Silk'],
    149_900,
    '/tamil-1280.webp',
  ),
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

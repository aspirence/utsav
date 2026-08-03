import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { formatPaise } from '@/lib/db'
import { Container } from '@/components/ui'

import { HowItWorks } from '@/components/how-it-works'
import { InvitationFaq } from '@/components/invitation-faq'
import { ReviewsMarquee } from '@/components/reviews-marquee'
import { TemplatePhone } from '@/components/template-phone'
import {
  getInvitationTemplate,
  invitationFaqs,
  orderLegs,
  getLiveInvitationTemplates,
  INVITATION_FEATURES,
  INVITATION_REVIEWS,
  INVITATION_STEPS,
} from '@/lib/invitation-templates'

/**
 * One invitation template, and the decision to buy it.
 *
 * Reached from the "Order now" on the home-page slider and from /invitations. Copy and price on
 * the left, the same phone from the slider on the right — literally the same component, so what a
 * customer taps is what they then look at. Rendering a second, prettier mock here would mean two
 * previews that can disagree about what they are selling.
 *
 * WHAT "ORDER NOW" LEADS TO, kept current because this paragraph was wrong for a while. It used
 * to say the page was "not a checkout" and that the button opened an enquiry form with the
 * template attached. The booking page now writes a real invitation_orders row, collects the
 * wording of the card, and its own button reads "Pay … & continue"; lib/cashfree.ts and
 * app/api/webhooks/cashfree exist and are inert only while CASHFREE_APP_ID and
 * CASHFREE_SECRET_KEY are unset. So the honest description today is: the button leads to a short
 * form and a payment step, this page itself takes nothing, and the copy here promises neither
 * more nor less than that.
 *
 * NOTHING ON THIS PAGE MAY ASSERT A NUMBER NOBODY MEASURED. See the note further down about the
 * three tiles that were deleted, and the note on invitationFaqs() about the four questions it
 * deliberately does not answer.
 */

/**
 * `revalidate = 3600`, matching /stories and /invitations. Templates are national storefront copy
 * edited by staff in the console, not per-request data — an hour-old price on a product page is
 * fine, and a per-request render of five phone previews is not.
 */
export const revalidate = 3600

/**
 * The whole catalogue is eight rows, so every one of them can be a static file. Plan §13 gates
 * launch on LCP and this is the page a customer lands on from search.
 *
 * Only the live set is listed, and this is the warm set rather than an allow-list: `dynamicParams`
 * defaults to true, so a template published between builds still renders on demand through ISR,
 * and an unpublished slug still 404s in the body below.
 *
 * The trade the other six prerendered routes already take applies here too — getInvitationTemplates()
 * throws on a read error, so a database that is down now fails the build instead of 500ing one
 * request.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const templates = await getLiveInvitationTemplates()
  return templates.map((template) => ({ slug: template.slug }))
}

/**
 * Absolute URLs, because JSON-LD is not resolved against metadataBase the way Next's own metadata
 * is. Same env and same fallback as app/sitemap.ts and app/robots.ts.
 */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** poster_url is either an https:// URL or a root-relative path — migration 20260731150000. */
function absoluteUrl(path: string): string {
  return path.startsWith('http') ? path : `${siteUrl}${path}`
}

/**
 * Paise to the decimal string schema.org wants, by integer arithmetic.
 *
 * paiseToRupees() would hand this a float and plan §5 says money never becomes one: 149900 has to
 * print as "1499.00", not as whatever a float division happens to format to.
 */
function rupeeAmount(paise: number): string {
  return `${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, '0')}`
}

/**
 * The share card when a template has no artwork of its own. 1920x640, already in public/.
 *
 * IT IS NOT THIS DESIGN AND MUST NOT BE LABELLED AS ONE. This is the photograph behind the
 * reviews band — a couple holding a phone — and the fallback is reachable rather than theoretical:
 * poster_url is nullable (20260730000100) and the console only requires a video OR a poster
 * (admin/templates/actions.ts), so a template uploaded as an .mp4 with no still has no artwork
 * here at all. It went out with `alt="<Template name> digital wedding invitation"` and as the
 * Product node's `image`, which made one stock marketing photograph the picture of whichever
 * specific design somebody was about to buy — a small fabrication, but a fabrication about the
 * one thing a share card exists to show.
 *
 * So the fallback now carries a caption about Fremmo rather than about the template, and the
 * Product node omits `image` rather than pointing at it. That is the same call the metadata block
 * below makes about width and height: no claim beats a wrong one. `image` is a recommended
 * property on Product, not a required one — Google drops the rich result and keeps the page.
 */
const FALLBACK_SHARE_IMAGE = '/invitation-review-1920.webp'
const FALLBACK_SHARE_ALT = 'Fremmo digital wedding invitations'

/**
 * The one image that represents this template off-site: og:image, the Twitter card and
 * Product.image.
 *
 * THE POSTER, OR OUR OWN FALLBACK — never `imageUrl`, and that exclusion is the point of this
 * function. `imageUrl` reads as "the picture the card shows" and it used to be safe here because
 * it held an embed URL nothing rendered as an image. It does not any more: classifyPreview() now
 * derives it from video_url, so for a row whose preview link is a YouTube video it is
 * `https://i.ytimg.com/vi/<id>/hqdefault.jpg` — a 480x360 letterboxed still on a third party's
 * CDN, which we cannot resize, cannot guarantee stays up, and did not author. Publishing that as
 * the product's share card and as its schema.org image is worse than publishing nothing of the
 * sort. The other thing it can hold is a GIF, which most share-card renderers show as a single
 * frame at whatever weight the file happens to be.
 *
 * poster_url is the column whose declared job is "the art", it is ours, and it is what the phone
 * preview falls back to — so the share card and the page agree. With no poster the generic
 * invitation photograph is the honest answer.
 */
function shareImagePath(posterUrl: string | null): string {
  return posterUrl ?? FALLBACK_SHARE_IMAGE
}

/**
 * JSON for a <script> block, with `<` escaped.
 *
 * NOT DECORATION. JSON.stringify escapes quotes and backslashes and leaves `<` alone, so any
 * string that reaches this graph containing `</script>` closes the tag early and everything after
 * it is parsed as HTML. Every input here is admin-editable free text from invitation_templates —
 * app/admin/(console)/templates/actions.ts validates `name` as `z.string().trim().max(120)` and
 * tags as short strings, neither of which excludes a single angle bracket — and it lands in the
 * Product name, the description, three breadcrumb entries and `keywords`.
 *
 * This is the difference between here and components/category-seo-block.tsx, which does the same
 * dangerouslySetInnerHTML without the escape: everything in that block is seeded taxonomy copy.
 * `<` is valid JSON and parses back to `<`, so the structured data is unchanged.
 */
function ldJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/** One sentence, shared by the meta description, the OG description and the Product node. */
function templateDescription(name: string, pricePaise: number): string {
  return (
    `${name} — an animated digital wedding invitation at ${formatPaise(pricePaise)}. ` +
    'RSVP, ceremony timeline, photo gallery and venue maps included; one link, any phone.'
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const template = await getInvitationTemplate(slug)

  /*
   * The isActive test is here as well as in the body, and that is the point: without it an
   * unpublished template answered 404 while still emitting a title, a description and a canonical
   * pointing at itself. A self-canonical on a URL that 404s is a claim the page contradicts.
   */
  if (!template || !template.isActive) {
    return { title: 'Invitation not found', robots: { index: false, follow: false } }
  }

  const title = `${template.name} — digital wedding invitation`
  const description = templateDescription(template.name, template.pricePaise)
  const path = `/invitations/${template.slug}`

  /*
   * The template's own poster, which is the art the phone preview shows, so the share card and the
   * page agree about what is being sold. Relative paths resolve against the metadataBase set in
   * app/layout.tsx. No width/height: the posters range from 461x499 to 1280x853 and a declared
   * size that disagrees with the file is worse than none.
   *
   * See shareImagePath() for why template.imageUrl is not in that chain — it can be somebody
   * else's thumbnail.
   *
   * og:type is left alone deliberately. It inherits 'website' from the root layout and Next's
   * OpenGraph union has no 'product' member — the Product JSON-LD in the body carries that claim.
   */
  const image = shareImagePath(template.posterUrl)
  /* The alt names the template only when the image IS the template — see FALLBACK_SHARE_IMAGE. */
  const imageAlt = template.posterUrl
    ? `${template.name} digital wedding invitation`
    : FALLBACK_SHARE_ALT

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      images: [{ url: image, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default async function InvitationTemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const template = await getInvitationTemplate(slug)

  // An unpublished template is a 404 for a visitor, which is what the RLS policy would give a
  // direct query anyway. Staff see drafts in the console, not here.
  if (!template || !template.isActive) notFound()

  // One derivation for both numbers, matching the booking page and the action.
  const { bookingPaise, balancePaise } = orderLegs(template.pricePaise)

  const others = (await getLiveInvitationTemplates())
    .filter((t) => t.slug !== template.slug)
    .slice(0, 4)

  const faqs = invitationFaqs(template.pricePaise)

  const canonicalUrl = `${siteUrl}/invitations/${template.slug}`
  /*
   * The Product node's image, and null when there is none of this template's own — the OG card
   * still falls back to the house photograph under a caption that does not name the template, but
   * structured data has no room for that distinction. See FALLBACK_SHARE_IMAGE.
   */
  const productImage = template.posterUrl ? absoluteUrl(template.posterUrl) : null

  /*
   * WHAT IS DELIBERATELY NOT IN HERE, recorded so it is not added later without the data behind it:
   *
   *   aggregateRating / review — INVITATION_REVIEWS is placeholder copy carrying verified: false
   *     and there is no invitation review table. A rating in structured data is the same invented
   *     number as the "4.9 / 5 · 56+ couples" tile deleted from this page, except a crawler
   *     believes it and prints stars in the result. It is also a Google policy violation that
   *     risks a manual action against the whole domain, not just this URL.
   *   priceValidUntil — nothing in the repo gives a template price an expiry. Google warns about
   *     the missing field and carries on; a guessed date silently expires the whole offer.
   *   hasMerchantReturnPolicy / shippingDetails — there is no written refund policy to point at,
   *     and nothing ships.
   *
   * availability IS assertable: this page renders only when template.isActive, and
   * /invitations/[slug]/book takes a real order today. The price is the full template price shown
   * as "Available at" — an Offer quoting the booking leg beside a page reading the total would be
   * a structured-data claim the page itself contradicts.
   *
   * ONE ld+json BLOCK FOR THE ROUTE. The FAQPage node is here rather than inside InvitationFaq so
   * the page does not emit two competing graphs; both read the same `faqs` array.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${canonicalUrl}#product`,
        name: template.name,
        description: templateDescription(template.name, template.pricePaise),
        ...(productImage ? { image: productImage } : {}),
        url: canonicalUrl,
        sku: template.slug,
        brand: { '@type': 'Brand', name: 'Fremmo' },
        ...(template.tags.length > 0 ? { keywords: template.tags.join(', ') } : {}),
        offers: {
          '@type': 'Offer',
          url: canonicalUrl,
          price: rupeeAmount(template.pricePaise),
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: 'Fremmo' },
        },
      },
      {
        // Mirrors the visible crumb below, item for item. If one changes, change both.
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Invitations', item: `${siteUrl}/invitations` },
          { '@type': 'ListItem', position: 3, name: template.name, item: canonicalUrl },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl}#faq`,
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- structured data; ldJson() escapes `<`, see its note
        dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }}
      />

      {/*
        THE HERO GETS ITS OWN SURFACE, in CSS rather than an image.
        
        It sat on the site's plain #fffcf9 and read as an empty page with a phone on it. Two soft
        radial washes in the brand's own accent and primary tints, plus a faint diagonal weave, give
        it a warm paper feel that costs one gradient declaration — no asset, no request, nothing for
        plan §13's LCP gate to pay for.
        
        THE TINTS WERE MEASURED, NOT EYEBALLED. At their strongest point the wash blends to about
        #fdf5df, where ink-500 — the lightest ink used here, on the 11px pill labels — comes in at
        5.07:1. Everything larger is far above. Nothing on this section drops below AA because of
        the background.
        
        `isolate` so the -z-10 layer cannot escape behind the page, and the whole thing is
        aria-hidden: it carries no information.
      */}
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_18%_15%,var(--color-accent-100)_0%,transparent_60%),radial-gradient(55%_65%_at_88%_60%,var(--color-primary-100)_0%,transparent_62%)] opacity-70"
        />
        {/* A 6px diagonal weave at 3% — visible as texture, invisible as lines. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-[0.035] [background-image:repeating-linear-gradient(45deg,var(--color-ink-900)_0px,var(--color-ink-900)_1px,transparent_1px,transparent_6px)]"
        />
        {/* Hairline where the section hands over to the one below. */}
        <div aria-hidden="true" className="bg-ink-200/60 absolute inset-x-0 bottom-0 -z-10 h-px" />

        <Container className="py-12 sm:py-16">
          {/*
            "Invitations" is a link now. It was plain text because there was no listing page to
            point at — the catalogue lived only in a home-page carousel. /invitations exists, so
            the crumb does what a crumb is for.

            The template's own name is the last crumb and stays unlinked: a link to the page you
            are on is a link that does nothing. `min-h-11` on the links keeps them past a thumb
            target; at 14px text a bare anchor is about 20px tall.
          */}
          <nav aria-label="Breadcrumb" className="text-ink-600 mb-6 text-sm sm:mb-8">
            <ol className="flex flex-wrap items-center gap-x-1">
              <li>
                <Link href="/" className="hover:text-ink-900 inline-flex min-h-11 items-center pr-1">
                  Home
                </Link>
              </li>
              <li aria-hidden="true" className="text-ink-400">
                /
              </li>
              <li>
                <Link
                  href="/invitations"
                  className="hover:text-ink-900 inline-flex min-h-11 items-center px-1"
                >
                  Invitations
                </Link>
              </li>
              <li aria-hidden="true" className="text-ink-400">
                /
              </li>
              {/* Truncated rather than wrapped: a long name pushing the crumb onto three lines
                  costs more than it tells you, and the <h1> underneath says it in full. */}
              <li className="text-ink-900 min-w-0 max-w-[14rem] truncate" aria-current="page">
                {template.name}
              </li>
            </ol>
          </nav>

          {/*
        Copy left, phone right, and the phone is `lg:order-2` rather than second in the DOM —
        it stays first in source order so a phone-sized screen shows the thing being sold before
        a list of features about it.
      */}
          {/*
            TWO COLUMNS ON A PHONE TOO, and this is the fix for a first fold that showed nothing
            but a picture.

            The phone was full width and stacked above the copy, so on a 390×844 screen the
            breadcrumb and a 478px-tall device used about 590px of roughly 700 usable — the name,
            the price and the only button were all below the fold. Somebody landing from search
            saw a product and no reason to buy it without scrolling.

            The phone now takes 40% of the row and the name, tags and price sit beside it, with
            the button and the inclusions full width underneath. Explicit `col-start` / `row-start`
            from `lg` rather than `order`, because the desktop arrangement is not a reordering of
            this one: there the phone spans both rows on the right so it can be sticky against the
            whole column.
          */}
          <div className="grid grid-cols-[40%_minmax(0,1fr)] items-start gap-x-4 gap-y-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-14 lg:gap-y-10">
            {/*
              THE PHONE IS FIRST IN SOURCE, and this is the fix for a comment that described
              behaviour the file did not have. It read "it stays first in source order so a
              phone-sized screen shows the thing being sold before a list of features about it"
              — while the copy column was actually first, so a phone showed roughly a screen and
              a half of tags, price, seven features and a button before the product appeared.
              Somebody deciding whether they liked the design had to scroll past the argument for
              buying it.

              `lg:order-2` puts it back on the right on a wide screen, so the desktop layout is
              unchanged. Order classes are the right tool precisely because they let source order
              serve the small screen while the large one is arranged visually.
            */}
            <div className="min-w-0 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <TemplatePhone
                item={template}
                // The LCP element on this route, so its still is fetched with the document rather
                // than behind an observer that cannot fire until hydration. The four phones in
                // "Other collections" stay lazy — that is what the observer is for.
                eager
                // Narrower on a phone. 268px inside a 390px viewport with the container's own
                // 16px gutters left the frame almost edge to edge, which reads as a screenshot of
                // a phone rather than as a device sitting on the page.
                // Fills its 40% column on a phone rather than a fixed 220px, so the split holds
                // at every width; capped at 268px so it stops growing once the column does.
                className="mx-auto w-full max-w-[268px]"
              />
            </div>

            {/*
              LAID OUT LIKE AN INVITATION, NOT LIKE A PRODUCT PAGE.

              The previous version was dark pills, a boxed feature card and three bordered tiles —
              the default shape of every SaaS product page, and interchangeable with the reference
              it was built from. This borrows the typographic conventions of the thing actually
              being sold: letter-spaced small caps, a rule with a centred diamond, a price set as
              display type rather than a badge, and facts separated by hairlines instead of boxed up.

              Nothing was dropped to achieve it — every element that went was replaced by a quieter
              one carrying the same information.
            */}
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              {template.tags.length > 0 && (
                <ul className="text-primary-700 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                  {template.tags.map((tag, i) => (
                    <li key={tag} className="flex items-center gap-3">
                      {i > 0 && (
                        <span aria-hidden="true" className="text-primary-700/40">
                          &#9670;
                        </span>
                      )}
                      {tag}
                    </li>
                  ))}
                </ul>
              )}

              {/* 1.5rem beside the phone, where the column is about 200px. At 2rem a three-word
                  name wrapped to four lines and pushed the price out of the fold — which is the
                  thing this layout exists to prevent. */}
              <h1 className="font-display text-ink-900 mt-3 text-2xl leading-[1.15] sm:mt-4 sm:text-[2.2rem] sm:leading-[1.1] lg:text-[3.4rem]">
                {template.name}
              </h1>

              <Ornament />

              {/*
                THE ONE SENTENCE THAT SAYS WHAT THIS IS.

                The page had a name, a price and seven bullets and never actually stated the
                product — a gap for a first-time reader, and the reason the phrase "digital wedding
                invitation" appeared nowhere in the rendered page while being the thing it sells.
                Every clause traces to INVITATION_STEPS: one link and any phone from step 4, RSVPs
                coming back to you from step 4 and the feature list, your own names and events from
                step 2. Deliberately no turnaround promise — nothing behind this is automated and
                INVITATION_STEPS says so.
              */}
              <p className="font-display text-ink-700 mt-6 max-w-xl text-[17px] leading-relaxed">
                A digital wedding invitation you send as one link. It opens on any phone with your
                names, your events and your photographs in it, and the RSVPs come back to you.
              </p>

              {/*
                The price as display type with the payment schedule beside it, the way an invitation
                sets a date. A vertical hairline rather than a second capsule: two bordered pills
                side by side is exactly the shape this is trying to get away from.
              */}
              {/*
                THE RIGHT-HAND CELL USED TO READ "One-time payment", and that was the one false
                line on the page. The order has two legs — the paragraph under the button already
                said so, and the mobile bar quoted a third number — so a reader who noticed the
                disagreement had no way to tell which half was the mistake. Both numbers now come
                from orderLegs(), the same derivation the booking page and the server action use,
                so this cell cannot drift from the row that eventually gets written.
              */}
              {/*
                `flex-nowrap` with a smaller gap rather than letting these two wrap.

                Wrapped, the second cell's left border became a vertical rule hanging under the
                price with nothing to its left — the divider drew itself in the wrong place the
                moment the row broke. The pair fits at 390px once the gap comes down; keeping
                them on one line is also what makes the divider mean "these two belong together".
                The second cell's own text wraps inside its cell, which is fine.
              */}
              <div className="mt-6 flex flex-nowrap items-end gap-x-5 sm:mt-7 sm:gap-x-7">
                <div className="min-w-0">
                  <p className="text-ink-500 text-[10px] font-semibold uppercase tracking-[0.2em]">
                    Available at
                  </p>
                  <p className="font-display text-ink-900 mt-1 text-[2rem] leading-none tabular-nums sm:text-4xl">
                    {formatPaise(template.pricePaise)}
                  </p>
                </div>
                <div className="border-ink-300/70 min-w-0 self-stretch border-l pl-5 sm:pl-7">
                  <p className="text-ink-500 text-[10px] font-semibold uppercase tracking-[0.2em]">
                    You pay
                  </p>
                  <p className="font-display text-ink-800 mt-1 text-[15px] leading-snug tabular-nums">
                    {balancePaise > 0 ? (
                      <>
                        {formatPaise(bookingPaise)} today
                        <span className="block">{formatPaise(balancePaise)} after you approve</span>
                      </>
                    ) : (
                      /* orderLegs() charges a template cheaper than the booking amount in full up
                         front, and "₹0 after you approve" is not a sentence. */
                      <>
                        {formatPaise(bookingPaise)} today
                        <span className="block">Nothing after that</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/*
              EVERYTHING BELOW THE IDENTITY, full width on a phone.

              Row 2 of the grid, spanning both columns, so the button and the seven inclusions get
              the whole width rather than the 60% the identity block sits in.
            */}
            <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-1 lg:row-start-2">

              {/*
                THE BUTTON COMES BEFORE THE FEATURE LIST.

                It used to sit under the seven inclusions, which put roughly a phone screen of
                reading between "I want this" and the only way to say so. The list is a reason to
                keep reading rather than a precondition for buying, so it reads better underneath:
                price, how you pay it, the button, and then what you get for it.
              */}
              <div className="mt-10">
                {/*
                  A rectangle with an offset rule, not a pill. rounded-full is what every checkout
                  on the internet looks like; a bordered block reads like the panel on a letterpress
                  card, which is what the rest of this column is now doing.
                */}
                {/*
                  Full width on a phone, sized to its text from `sm`.

                  A 200px button floating in a 358px column is a smaller target than the column
                  can afford, and it sits off to one side of a page whose every other element is
                  full-bleed. `justify-center` matters only in the full-width state — without it
                  the label hugs the left edge of a wide button.
                */}
                <Link
                  href={`/invitations/${template.slug}/book`}
                  className="bg-primary-700 hover:bg-primary-800 ring-primary-700/25 group inline-flex h-14 w-full items-center justify-center gap-3 px-9 text-[13px] font-semibold uppercase tracking-[0.2em] text-white ring-1 ring-offset-2 transition-colors active:scale-[0.99] sm:w-auto sm:justify-start"
                >
                  Order now
                  <span
                    aria-hidden="true"
                    className="transition-transform group-hover:translate-x-1"
                  >
                    &rarr;
                  </span>
                </Link>
                {/* The booking page says the rest. Two numbers here rather than a vague "payment is
                  arranged later": what it costs to start, and when the remainder falls due. The
                  branch is orderLegs' own case — a template cheaper than the booking amount has no
                  balance, and "The ₹0 balance is due only after…" is not a sentence. */}
                <p className="font-display text-ink-600 mt-3 max-w-md text-[13px] leading-relaxed">
                  {balancePaise > 0 ? (
                    <>
                      Start with {formatPaise(bookingPaise)} to book a design slot. The{' '}
                      {formatPaise(balancePaise)} balance is due only after you have seen the draft
                      and approved it.
                    </>
                  ) : (
                    <>
                      {formatPaise(bookingPaise)} books your design slot and covers the whole thing.
                      There is nothing to pay afterwards.
                    </>
                  )}
                </p>

                {/*
                  WHAT THE NEXT PAGE ACTUALLY ASKS FOR.

                  "Order now" is a hard-edged block button and the page behind it opens with an
                  offer banner and a button reading "Pay … & continue", so it is worth saying out
                  loud that the step in between is three fields. Naming them is also the honest
                  version: the wording of the card is collected there too and it is optional, which
                  is the part somebody stalling over an unfixed date needs to know. Both facts are
                  the booking form's, not a promise invented here — see its fieldsets.
                */}
                <p className="text-ink-600 mt-2 max-w-md text-[13px] leading-relaxed">
                  Next page: your name, email and WhatsApp number. The wording of the card is
                  optional there &mdash; leave it blank and we collect it later.
                </p>

                {/*
                  A LIVE ONE, BECAUSE THE PREVIEW ABOVE DOES NOT MOVE.

                  No template row carries a video_url yet, so every phone on this site is showing a
                  still poster and somebody deciding whether an animated invitation is worth paying
                  for has never seen one run. /invitation is where it actually runs, and the home
                  page already links to it.

                  prefetch={false} IS NOT OPTIONAL. That route's own header comment records that
                  three.js and five textures are reached only by navigating there and that nothing
                  on the marketing site pays for it. A default <Link> prefetches on viewport, which
                  would hand plan §13's LCP budget the bill for a page most visitors never open.

                  The label says "a live invitation", not "preview this design": the demo is built
                  on one couple's artwork and is not this collection. Claiming otherwise would be
                  the same defect class as the tiles deleted below.
                */}
                <Link
                  href="/invitation"
                  prefetch={false}
                  className="border-ink-300 hover:border-ink-900 text-ink-900 mt-5 inline-flex items-center gap-2 border-b pb-1 text-sm font-semibold transition-colors"
                >
                  Open a live invitation
                  <span aria-hidden="true">&rarr;</span>
                </Link>
                <p className="text-ink-500 mt-2 text-[12px] leading-relaxed">
                  A working invitation, opened the way a guest opens it. Different artwork, same
                  format.
                </p>
              </div>

              {/*
                A ruled list, not a card. The white panel was the heaviest object on the page and it
                was holding the lightest content — seven short phrases. Hairlines group them just as
                well without the weight, and the diamond bullet ties back to the rule above.
              */}
              <section className="mt-10">
                <h2 className="text-ink-500 border-ink-300/70 border-t pt-3 text-[10px] font-semibold uppercase tracking-[0.2em]">
                  What is included
                </h2>
                <ul className="mt-1 grid sm:grid-cols-2 sm:gap-x-10">
                  {INVITATION_FEATURES.map((feature) => (
                    <li
                      key={feature}
                      className="border-ink-200/70 text-ink-800 flex items-baseline gap-3 border-b py-2.5"
                    >
                      <span aria-hidden="true" className="text-primary-600/60 text-[8px]">
                        &#9670;
                      </span>
                      {/* 15px, not 14. Playfair is a high-contrast face — its thin strokes go
                          spindly a size below where the sans body face is still solid. */}
                      <span className="font-display text-[15px] leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/*
              THE THREE INVENTED TILES ARE GONE, and this comment is here so they are not put back
              without the data behind them.

              "4.9 / 5 · 56+ couples" was a rating on a product with zero orders and no invitation
              review table — a fabricated number, which is the same defect class as printing a
              "Verified booking" badge on an unverified review. "100% Satisfaction" is a guarantee
              with no written terms and no refund path. "Secure / Safe checkout" claimed checkout
              security one click before a form that takes no payment.

              What replaces them is true today, and it is now one ruled row rather than three
              bordered boxes — the boxes were three more rectangles on a page that already had
              enough of them.
            */}
              {/*
                Across from `sm`, one per row below it.

                At 390px each cell was about 110px wide holding display type — "All-inclusive"
                broke across two lines and the vertical rules cut through the wrap. Stacked, each
                fact gets the full width and the rules run horizontally instead, which is the same
                grouping without the collisions.

                THE "₹99 · To start" CELL WENT WHEN THE PRICE ROW GAINED THE SCHEDULE. The booking
                amount is now stated in the price row, in the paragraph under the button and in the
                order bar; a fourth printing of the same number in the same column is noise, not
                reassurance. Two cells, so `sm:grid-cols-2`.
              */}
              <dl className="border-ink-300/70 mt-10 grid max-w-lg grid-cols-1 border-t pt-5 sm:mt-12 sm:grid-cols-2">
                <Fact label="All-inclusive" note="No add-ons" />
                <Fact label="One link" note="Works on any phone" divided />
              </dl>
            </div>

          </div>
        </Container>
      </section>

      {/*
        EVERYTHING BELOW THE HERO, WITH BOTH ORDER BARS STUCK TO ITS FOOT.

        The two bars at the end of this wrapper are `sticky` and they are its LAST CHILDREN, and
        that pair of facts is the whole mechanism. While any part of this wrapper is on screen the
        bar is pinned near the bottom of the viewport; at the true end of the page it unsticks and
        sits in flow, above the footer rather than over it. So it does not exist while the hero
        fills the screen — where the in-page "Order now" is already visible — and it arrives
        exactly as that button leaves. A bar that appears once the main button scrolls away is
        usually an observer and a client component; `position: sticky` needs neither, and this page
        stays entirely server-rendered.

        THE PHONE BAR IS IN HERE FOR A CORRECTNESS REASON, not for symmetry. It was `fixed` and a
        sibling of this wrapper, which meant it covered the last ~75px of the document at full
        scroll — the footer's copyright line and legal links — with no scroll position that would
        reveal them. Nothing inside `children` can reserve space at the end of the document,
        because SiteFooter renders after `children`. See its own note below.

        WHY NOT A BUY BOX IN THE HERO'S STICKY PHONE COLUMN. `lg:sticky` is scoped to the hero's
        own grid, so it stops travelling the moment HowItWorks begins — and the four sections in
        here are more than half the page. It also does not fit: TemplatePhone is aspect-[1206/2622],
        about 583px at its 268px width, so `top-24` plus a buy box under it runs past the bottom of
        a 1280x720 laptop viewport and parks the button permanently out of reach.

        This works only because app/globals.css sets `overflow-x: clip` on the body rather than
        `hidden` — see the note there. `hidden` would make the body a scroll container and kill
        every sticky on the site, this one included.
      */}
      <div>
        {/*
          Both new sections sit outside the Container above, and for different reasons: HowItWorks
          brings its own so its beaded frame lines up with the copy, and ReviewsMarquee is a
          full-bleed photographic band that a container would inset into a stripe.
        */}
        <HowItWorks
          eyebrow="How it works"
          title="Four steps, and one of them is yours"
          description="No software to learn and nothing to design yourself. Pick the look, send us the details, approve the preview."
          steps={INVITATION_STEPS}
        />

        {/*
          The same component the home page uses. One difference that matters: every quote here
          carries verified: false, so the "Verified booking" badge does not print — plan §2 ties that
          badge to a completed booking, and no invitation has been ordered yet. See the note on
          INVITATION_REVIEWS.
        */}
        <ReviewsMarquee
          reviews={INVITATION_REVIEWS.map((r) => ({ ...r }))}
          eyebrow="Loved by couples across India"
          heading="One link, and the whole family opened it."
          description="What couples told us after sending theirs out. Invitation reviews are not booking-verified yet — the badge on our vendor reviews means something these do not."
          /*
           * This page's own photograph. The home page keeps bg-image — the component's default — so
           * changing one does not change the other.
           *
           * 1920w, and it says 1920 because the file IS 1920: the source is 2172px wide, so
           * optimize-images.mjs has room to produce a true 1920 variant. The previous photograph was
           * 1912px and this said 1912w for the same reason — the descriptor tracks the file, not the
           * filename, because withoutEnlargement means the two can disagree.
           *
           * object-top, not object-center. At 2172x724 this is a 3:1 frame in a band that renders
           * shorter than that, so something gets cropped: the couple and the phone they are holding
           * sit in the upper-middle band and the bottom third is petals and diyas. Anchoring to the
           * top takes the crop off the foreground and keeps the subject. (The previous photograph was
           * 2.32:1 with the couple centred, which is why it wanted object-center — the anchor belongs
           * to the image, not to the section.)
           */
          background={{
            src: '/invitation-review-1920.webp',
            variants: [
              ['/invitation-review-768.webp', 768],
              ['/invitation-review-1280.webp', 1280],
              ['/invitation-review-1920.webp', 1920],
            ],
            position: 'object-top',
          }}
          wide
        />

        {/*
          The last objection-killer before the links that navigate away. Every answer is derived from
          orderLegs() and INVITATION_FEATURES rather than typed out — see the note on invitationFaqs()
          for the four questions it refuses to answer and why.

          Its FAQPage structured data is in this page's own @graph above, not in the component, so the
          route emits one ld+json block instead of two.
        */}
        <InvitationFaq faqs={faqs} />

        {/*
          White, not the site's warm #fffcf9.

          The band above it is a full-bleed photograph, so this one has to declare a surface of its
          own or it inherits the body's paper tone and the two read as one long fade. bg-surface-raised
          is the token for true white — a literal bg-white would be the same pixels today and the
          wrong thing the day the palette moves.

          The wrapper carries the colour rather than the Container, so the fill runs edge to edge
          while the content stays inside the same gutter as every other section.
        */}
        {others.length > 0 && (
          <section className="bg-surface-raised">
            {/* Both bars are `sticky` and both are children of this wrapper, so at the end of the
                page each one drops into flow above the footer rather than covering anything. This
                padding is therefore plain breathing room between the last row of phones and the
                bar — not clearance for it. */}
            <Container className="py-10">
              {/* The crumb at the very top is otherwise this page's only link back to the hub, and
                  nobody on a phone finishes there. "Other collections" also shows four of seven. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="font-display text-ink-900 text-2xl">Other collections</h2>
                <Link
                  href="/invitations"
                  className="text-primary-700 hover:text-primary-800 text-sm font-medium underline-offset-4 hover:underline"
                >
                  See all invitations &rarr;
                </Link>
              </div>
              <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {others.map((other) => (
                  <li key={other.slug}>
                    <Link href={`/invitations/${other.slug}`} className="group block">
                      <TemplatePhone
                        item={other}
                        className="mx-auto w-full max-w-[180px] transition-transform duration-500 group-hover:-translate-y-1.5"
                      />
                      {/* Centred on the phone, not on the grid cell. The frame is mx-auto and
                          capped at 180px, so a full-width caption reads as left-of-centre against
                          the thing it labels. */}
                      <p className="font-display text-ink-900 mt-3 text-center text-base leading-snug">
                        {other.name}
                      </p>
                      <p className="text-ink-600 mt-0.5 text-center text-sm tabular-nums">
                        {formatPaise(other.pricePaise)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Container>
          </section>
        )}

        {/*
          THE PHONE ORDER BAR.

          This page is long: hero, seven features, four how-it-works steps, a reviews band and a
          related grid. On a phone the only way to buy was to scroll back up to a button somewhere
          near the top, and the further somebody read — which is to say, the more interested they
          got — the further they were from acting on it.

          IT IS STICKY, NOT FIXED, AND THAT IS A BUG FIX RATHER THAN A PREFERENCE. It was `fixed`
          at this same offset and a sibling of this wrapper, which put it in the viewport at every
          scroll position — including the last one. The document ends with the layout's
          BottomNavSpacer, so at full scroll the bottom 3.25rem of the viewport is that spacer and
          this bar sat on the ~75px directly above it: the footer's copyright line and, from `sm`,
          its "Privacy policy" and "Terms & conditions" links. Padding inside `children` cannot
          reach them — SiteFooter renders after `children` — so the bar could not be scrolled off
          them and those links were unreachable on every phone. app/(site)/layout.tsx has a comment
          naming exactly that requirement.

          Sticky is the mechanism the desktop bar below already proves: pinned while any of this
          wrapper is on screen, back into flow at the end of it, above the footer. So the fix costs
          no JavaScript and no client component, and it also gives the phone the desktop's better
          behaviour — the bar is absent while the hero and its own "Order now" fill the screen, and
          arrives as that button leaves.

          WHY IT SITS ABOVE THE TAB BAR RATHER THAN REPLACING IT. The site bottom nav is 3.25rem
          plus the home-indicator inset, and it is the way off this page. A bar that covered it
          would trade "cannot buy from here" for "cannot leave from here". So this pins on top of
          it, and `z-30` keeps it under the nav's `z-40` — if they ever overlap by a pixel, the nav
          wins, because navigation losing to an advert is the worse failure.

          `md:hidden` mirrors the desktop bar's `hidden md:block` exactly, so the two can never
          both be on screen — and a display:none sibling occupies no flow, which is why both can be
          the last thing in this wrapper at their own breakpoint.
        */}
        <div className="border-ink-200 sticky bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-30 border-t bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-ink-500 text-[10px] font-semibold uppercase tracking-[0.16em]">
                Pay today
              </p>
              <p className="font-display text-ink-900 truncate text-lg leading-tight tabular-nums">
                {formatPaise(bookingPaise)}
              </p>
              {/*
                THE TOTAL, IN THE SAME BREATH.

                This showed the booking leg alone under "Starts at", to avoid implying that tapping
                the button charges the whole price. It avoided that and bought an ambiguity instead:
                somebody who arrived mid-page saw one number under an open-ended label and no idea
                what the invitation costs. Naming both, labelled, neither overstates what the tap
                does nor hides what the thing costs — and it is what the desktop bar says, so the
                two cannot disagree about how much a buyer is told.
              */}
              {balancePaise > 0 && (
                <p className="text-ink-500 truncate text-[10px] leading-tight tabular-nums">
                  of {formatPaise(template.pricePaise)} &middot; rest after you approve
                </p>
              )}
            </div>
            <Link
              href={`/invitations/${template.slug}/book`}
              aria-label={`Order ${template.name}`}
              className="bg-primary-700 hover:bg-primary-800 ml-auto inline-flex min-h-12 flex-1 items-center justify-center gap-2 px-6 text-[13px] font-semibold uppercase tracking-[0.16em] text-white transition-transform active:scale-[0.98]"
            >
              Order now
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>

        {/*
          THE DESKTOP AND TABLET ORDER BAR. See the note at the top of this wrapper for why it is
          sticky rather than fixed, and why it is the last child.

          `hidden md:block` mirrors the phone bar's `md:hidden` exactly, so the two can never both be
          on screen. `md` and not `lg` is the point: the phone bar stops at 768px and the hero's
          sticky phone column does not begin until 1024px, so tablets had no persistent CTA at all.

          `z-30` for the same reason the phone bar uses it — the site nav is z-40 and navigation
          losing to an advert is the worse failure. ReviewsMarquee is `relative isolate` with no
          z-index of its own, so a positioned sibling after it paints above.

          It carries both legs of the price, which the phone bar has no room for: a bar showing one
          number beside a button called "Order now" invites the reader to guess which number it is.
        */}
        <div className="border-ink-200 sticky bottom-0 z-30 hidden border-t bg-white/95 backdrop-blur md:block">
          <Container className="flex items-center gap-6 py-3">
            <div className="min-w-0">
              <p className="font-display text-ink-900 truncate text-base leading-tight">
                {template.name}
              </p>
              <p className="text-ink-600 mt-0.5 text-[13px] leading-tight tabular-nums">
                {balancePaise > 0 ? (
                  <>
                    <span className="text-ink-900 font-semibold">
                      {formatPaise(bookingPaise)} today
                    </span>
                    {' · '}
                    {formatPaise(balancePaise)} after you approve the draft
                  </>
                ) : (
                  /* orderLegs() charges a template cheaper than the booking amount in full up front,
                     and "₹0 after you approve" is not a sentence. */
                  <>{formatPaise(bookingPaise)} — paid in full, everything included</>
                )}
              </p>
            </div>
            {/* An explicit label, because this is the third link on the page to the same href and
                "Order now, Order now, Order now" in a link list tells a screen-reader user nothing. */}
            <Link
              href={`/invitations/${template.slug}/book`}
              aria-label={`Order ${template.name}`}
              className="bg-primary-700 hover:bg-primary-800 ml-auto inline-flex h-12 shrink-0 items-center gap-2 px-8 text-[13px] font-semibold uppercase tracking-[0.16em] text-white transition-colors active:scale-[0.99]"
            >
              Order now
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </Container>
        </div>
      </div>
    </>
  )
}

/*
 * AUDITED AND ALREADY CORRECT — do not "fix" these:
 *
 *   Heading hierarchy. Exactly one <h1>, the template name. Every section heading is an <h2>:
 *     "What is included", HowItWorks' title, ReviewsMarquee's heading, the FAQ's, "Other
 *     collections". HowItWorks' per-step titles are <h3>. "What is included" is styled at 10px
 *     uppercase but is a real <h2> — the styling is not the semantics.
 *   Image alt text. TemplatePhone renders `${item.name} invitation preview` on both the still and
 *     the poster branches; the wash layers and the diamond bullets are aria-hidden.
 *   Sitemap. lib/queries.ts getSeoRoutes() already pushes /invitations at 0.8 and every live
 *     /invitations/<slug> at 0.6.
 *   No cannibalisation. /invitations/[slug]/book, /invitation (the full-screen demo) and
 *     /invite/[slug] (a customer's finished card) all set robots index: false already.
 *
 * NOT ADDABLE WITHOUT DATA THAT DOES NOT EXIST — do not invent these:
 *   a turnaround or delivery promise (a person answers each order; INVITATION_STEPS says so)
 *   an order count, customer count or "N couples chose this" (bookings has never had a row)
 *   a refund, return or satisfaction guarantee (no written terms anywhere in this repo — the only
 *     place the promise exists is the booking card's own copy, which cites itself)
 *   the launch offer's "first 20 couples" cap as scarcity (BOOKING.offerSeats is copy only;
 *     nothing counts orders against it)
 *   BOOKING.regularAmountPaise struck through as a discount anchor (it is what the price WILL be,
 *     not what it was, and a strikethrough asserts a price previously charged)
 *   anything derived from INVITATION_REVIEWS (every entry is verified: false placeholder copy)
 */

/**
 * A plain rule under the title.
 *
 * It had a diamond set into its middle — the device printed invitations use to separate the names
 * from the date — and that came out on request. One element now instead of three, since with
 * nothing to sit either side of there is no reason for two half-lines and a gap between them.
 *
 * It still fades at both ends rather than stopping square, which is what keeps it reading as a
 * flourish rather than as a border somebody forgot to finish.
 */
function Ornament() {
  return (
    <div
      aria-hidden="true"
      className="via-ink-300 mt-6 h-px max-w-sm bg-gradient-to-r from-transparent to-transparent"
    />
  )
}

/**
 * One fact in the ruled row.
 *
 * `divided` draws the hairline on its own left edge, so the first cell has none and the three read
 * as columns of one row rather than as three separate objects — which is the whole difference
 * between this and the bordered tiles it replaced.
 */
function Fact({ label, note, divided }: { label: string; note: string; divided?: boolean }) {
  return (
    /*
     * The rule turns with the layout.
     *
     * `divided` used to mean "border-left", which was right while this was always three columns
     * and wrong the moment it stacked on a phone — a left border on a full-width row draws a
     * short vertical tick floating beside the text. Below `sm` the separator is the top edge;
     * from `sm` it is the left edge, and the paddings swap with it.
     */
    <div
      className={
        divided
          ? 'border-ink-200 border-t pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0'
          : ''
      }
    >
      <dt className="font-display text-ink-900 text-lg leading-none">{label}</dt>
      <dd className="text-ink-600 mt-1.5 text-[10px] uppercase tracking-[0.16em]">{note}</dd>
    </div>
  )
}

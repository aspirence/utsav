import Link from 'next/link'

import { formatPaise } from '@/lib/db'
import { Card, CardBody, Container, LinkButton, SectionHeading } from '@/components/ui'

import { DestinationSlider } from '@/components/destination-slider'
import { ExplorePlaces, type PlaceCard } from '@/components/explore-places'
import { FeaturedVendorsPanel } from '@/components/featured-vendors-panel'
import { HeroBackground } from '@/components/hero-background'
import { InvitationFeature } from '@/components/invitation-feature'
import { PackageSlider } from '@/components/package-slider'
import { QuotationCta } from '@/components/quotation-cta'
import { ReviewsMarquee } from '@/components/reviews-marquee'
import { TemplateGrid } from '@/components/template-grid'
import { TypeSlider } from '@/components/type-slider'
import { WeddingExplainer } from '@/components/wedding-explainer'
import { getCategoryContent } from '@/lib/category-content'
import { getDestinationTypes } from '@/lib/destination-types'
import { getLiveInvitationTemplates } from '@/lib/invitation-templates'
import { getWeddingPackages } from '@/lib/packages'
import { PLACE_ART } from '@/lib/place-art'
import {
  discoverVendors,
  getLaunchedCities,
  getLocalityCounts,
  getRecentReviews,
} from '@/lib/queries'
import { getWeddingTypes } from '@/lib/wedding-types'

/**
 * Homepage. Seven sections, in the order a couple actually needs them:
 *
 *   1. Hero              - the photograph, the promise, two ways in
 *   2. Traditions        - plan section 1: an all-events marketplace for India, and India
 *                          does not have one wedding
 *   3. What a wedding is - the editorial breather, with the video
 *   4. Featured vendors  - plan section 11: photography leads, it is the wedge
 *   5. Destinations      - the browse band
 *   6. Reviews           - plan section 2: booking-gated, which is the whole claim
 *   7. Locality + budget - plan section 12 internal linking for the SEO engine
 *   8. Vendor CTA        - plan section 1: supply tooling before demand product
 *
 * Two sections were removed from here on request, and both are worth knowing about:
 *
 *  · **"How it works"** walked through the date/budget form, the OTP and the five-vendor
 *    cap. Those promises are load-bearing - the cap is a database constraint, and the OTP
 *    gate is the reason vendors reply at all - so /about and the enquiry flow still carry
 *    them. Restate them rather than assume a couple has met them elsewhere.
 *
 *  · **The category grid.** Plan section 12 leans on internal linking, so this is worth
 *    stating: nothing was orphaned. SiteFooter renders every category on every page, the
 *    city hub at /[city] links them all again, and all five are in the sitemap. The grid
 *    was a third path to the same routes, not the only one.
 *
 * Deliberately absent: app-download badges (plan section 2 puts a customer app in the
 * Won't tier), a blog strip with no posts behind it, and any testimonial not tied to a
 * completed booking.
 */
export const revalidate = 3600

/**
 * Locality counts -> cards for the explore band.
 *
 * The busiest locality is flagged rather than every card carrying a badge: the panel shows
 * one place at a time, so a label on all of them says nothing. `localities` arrives sorted
 * by count, so the first row is the one to mark.
 */
function toPlaces(
  localities: { slug: string; name: string; count: number }[],
  citySlug: string,
  cityName: string,
  state: string | null,
): PlaceCard[] {
  const region = state ? `${cityName}, ${state}` : cityName
  return localities.map((l, i) => ({
    slug: l.slug,
    name: l.name,
    region,
    count: l.count,
    href: `/${citySlug}/photography/${l.slug}`,
    ...PLACE_ART[l.slug],
    ...(i === 0 ? { badge: 'Most photographers' } : {}),
  }))
}

export default async function HomePage() {
  const cities = await getLaunchedCities()

  const city = cities[0]
  const citySlug = city?.slug ?? 'lucknow'
  const cityName = city?.name ?? 'your city'

  const [featured, localities, reviews, templates] = await Promise.all([
    discoverVendors({ citySlug, categorySlug: 'photography', perPage: 6 }),
    getLocalityCounts(citySlug, 'photography'),
    getRecentReviews(3),
    getLiveInvitationTemplates(),
  ])

  const photographyRungs = getCategoryContent('photography').priceRungs

  return (
    <>
      {/* 1. Hero.
             min-h rather than padding alone: the header floats over this section (see
             SiteHeaderShell), so the photograph has to reach the top of the viewport and
             be tall enough that the copy is not crowded against the nav bar. Viewport
             units with a floor, so a short laptop window still gets a real hero and a
             phone in landscape does not get a 500px one. The pt clears the 112px bar. */}
      <section className="border-ink-100 bg-surface relative isolate flex min-h-[640px] items-center border-b lg:min-h-[88vh]">
        <HeroBackground />

        <Container className="relative w-full pt-40 pb-20 sm:pt-44 sm:pb-28">
          <div className="max-w-3xl">
            {/* font-normal, against the 500 that h1/h2/h3 get globally. Playfair is a
                high-contrast face and this is the largest type on the site, so it is the
                one place the thin strokes actually read - anything heavier here loses the
                thing the face was chosen for. */}
            <h1
              className="text-4xl leading-[1.08] font-normal text-white sm:text-5xl lg:text-6xl xl:text-7xl"
              style={{
                textShadow: '0 2px 18px rgb(15 12 11 / 0.75), 0 1px 3px rgb(15 12 11 / 0.6)',
              }}
            >
              Find the people who will make your celebration.
            </h1>
            {/* White on a bright photograph with no scrim behind it, so the shadow is not
                decoration - it is the only thing separating the type from the image. Two
                layers: a wide soft one to lift the glyph off the highlights, and a tight
                one to keep the edges crisp. See components/hero-background.tsx for why
                there is no overlay to lean on. */}
            <p
              className="mt-5 max-w-2xl text-lg font-medium text-white"
              style={{
                textShadow: '0 1px 14px rgb(15 12 11 / 0.8), 0 1px 2px rgb(15 12 11 / 0.7)',
              }}
            >
              Real portfolios, honest price bands, and packages you can actually compare. See who is
              free on your date before you send a single message.
            </p>
          </div>

          {/* The inline search widget lived here and was removed. home-search.tsx is kept,
              unused, so it can be dropped back in - the discovery page still accepts every
              parameter it used to set (freeOn, budgetMax, sort). */}
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href={`/${citySlug}/photography`} size="lg">
              Browse photographers
            </LinkButton>
            <LinkButton href={`/${citySlug}/venues`} variant="outline" size="lg">
              Browse venues
            </LinkButton>
          </div>
        </Container>
      </section>

      {/* 2. Wedding traditions - plan section 1 calls this an all-events marketplace for
             India, and India does not have one wedding. White rather than the page's warm
             surface, so the band reads as its own thing between two sections that both
             sit on the warm paper. */}
      <section className="bg-surface-raised">
        <Container className="py-14">
          {/* The thread that ties these together is the saptapadi - every Hindu wedding
              here walks the same seven steps around the same fire. Everything around it
              is completely different, which is exactly the point the heading makes. */}
          <SectionHeading
            eyebrow="Rituals across India"
            title="The same seven steps, a dozen different ways"
            description="Every wedding here ends with the pheras. Getting there takes a haldi in Amritsar, a kashi yatra in Chennai, a gaye holud in Kolkata or an antarpat in Pune. Tell us which one is yours and we will find people who have shot it a hundred times."
          />
          {/* Inside the container. This was full-bleed while it was a continuous marquee,
              where running off both edges was the point. Now that it pages, the track has
              to line up with the heading above it or the pairing reads as an accident. */}
          <div className="mt-8">
            <TypeSlider items={getWeddingTypes(citySlug)} label="Wedding traditions" />
          </div>
        </Container>
      </section>

      {/* 3. The invitation storefront - plan section 2 counts digital invitations as a revenue
             line, and this is the thing being sold. Above the invitation feature on purpose:
             the products come first, and the section below then explains what they are. */}
      <Container className="py-16">
        <SectionHeading
          eyebrow="Digital invitations"
          title="Curated Collections"
          description="Hand-crafted templates, each one a blank canvas for your own names, dates and traditions. Tap any card to see it running on a phone."
        />
        {/*
          Six in a grid, then the way to the rest.

          This was a four-up auto-rotating carousel. It hid everything past the fourth card
          behind a timer, and below 640px its arrows were not rendered at all — a phone got a
          row that moved on its own and took no input. The grid shows more, moves less, and
          ships no JavaScript: TemplateGrid is a Server Component where the carousel could not
          be.

          Six rather than all of them, because this is the home page and the section after it
          still has to be reached. /invitations carries the full catalogue with filters.
        */}
        <div className="mt-10">
          <TemplateGrid items={templates} limit={6} />
        </div>

        {templates.length > 6 && (
          <div className="mt-10 flex justify-center">
            <Link
              href="/invitations"
              // The visible label is two words; the accessible name says what "all" is. A
              // screen reader reads links out of their surrounding section, so "View all" on
              // its own lands with no idea what it leads to.
              aria-label={`View all ${templates.length} invitations`}
              className="bg-ink-900 hover:bg-ink-800 inline-flex min-h-11 items-center rounded-full px-7 text-sm font-semibold text-white transition-colors"
            >
              View all
            </Link>
          </div>
        )}
      </Container>

      {/* 4. Wedding invitations - illustration left, the argument right */}
      <Container className="py-16">
        <InvitationFeature imageUrl="/invitation.webp" />
      </Container>

      {/* 4. What an Indian wedding actually is - copy left, video right */}
      <WeddingExplainer />

      {/* 5. Featured photographers - the wedge (plan section 11) */}
      {featured.vendors.length > 0 && (
        <Container className="py-16">
          {/* Back on `cityName`. This was hardcoded while the launch city was still
              Bengaluru; Lucknow is now the real first entry in CITIES with its own
              localities and vendors, so the whole page follows the data again. */}
          <FeaturedVendorsPanel
            vendors={featured.vendors}
            cityName={cityName}
            seeAllHref={`/${citySlug}/photography`}
            totalCount={featured.total}
          />
        </Container>
      )}

      {/* 6. Destination weddings.
             This replaced the real-weddings strip. Those stories are not gone - /stories
             is still built, still in the sitemap and still linked from the footer - but
             the homepage only has room for one editorial band and a destination is the
             thing a couple is actually choosing between at this point in the page. */}
      <section className="border-ink-100 bg-surface-raised border-y">
        {/* Inside the container, unlike the marquee sliders above: this one pages, and a
            page has to align to the same gutters as the heading or the pairs land
            half-off the screen. Wider than the page default (max-w-7xl) because the
            photographs are the content here and 1280px was cropping them hard. */}
        <Container className="max-w-[1520px] py-14">
          <p className="text-ink-600 text-sm">
            Discover curated wedding packages across India&rsquo;s most stunning destinations.
          </p>
          <h2 className="text-ink-900 mt-2 text-3xl leading-tight sm:text-4xl">
            Destinations beyond ordinary
          </h2>

          <div className="mt-6">
            <DestinationSlider items={getDestinationTypes(citySlug)} />
          </div>
        </Container>
      </section>

      {/* 7. Reviews - plan section 2: booking-gated is the entire claim.
             Every one of these is backed by a completed booking, which is what earns the
             badge — so the section renders only when there are some. A marketplace before
             its first review has nothing to show here, and showing nothing is the honest
             version of that. getRecentReviews() no longer substitutes samples. */}
      {reviews.length > 0 && (
        <ReviewsMarquee
          reviews={reviews.map((r) => ({
            rating: r.rating,
            title: r.title,
            body: r.body,
            authorName: r.authorName,
            sourceName: r.vendorName,
            sourceHref: `/vendor/${r.vendorSlug}`,
            verified: true,
          }))}
        />
      )}

      {/* 8. Explore the place - plan section 12 internal linking.
             This band used to be two rows of pill links, localities and budget rungs. The
             locality links are all still here, one per row, so the internal-linking job is
             unchanged and every /[city]/photography/[locality] URL is still on the page.

             The budget rungs are NOT. If "under ₹1 L" traffic matters, they need a home -
             the category page's own filters carry the same `?budgetMax=` parameters, so a
             row of them there is the natural place rather than back on the homepage. */}
      {localities.length > 0 && (
        <section className="border-ink-100 bg-surface-sunken/40 border-t">
          <Container className="py-16">
            <ExplorePlaces
              places={toPlaces(localities, citySlug, cityName, city?.state ?? null)}
              eyebrow="Explore the place"
              title={`Every corner of ${cityName}`}
              description="Photographers who actually work in your area — and know which venue needs a permit before the shoot."
            />
          </Container>
        </section>
      )}

      {/* 9. Quotation CTA.
             This replaced the flat dark vendor card that stood here. What it does instead is
             give the couple a single next action at the foot of the page.

             THE VENDOR ENTRY POINT IS NOW THINNER THAN PLAN §1 ASKS FOR, and this is the
             comment that used to say otherwise. "List your business" was removed from the
             header, so /partner is reached from the footer and from the stories page rather
             than from every page's top bar. Plan §1 puts supply tooling ahead of demand
             product; if vendor signups matter more than the header's calm, this is the first
             place to look. */}
      <Container className="py-14">
        <QuotationCta />
      </Container>

      {/* 10. Wedding packages - Lucknow only, by area within the city.
             pb is lighter than pt: the footer frieze sits directly under this section and
             brings its own air, so a full py-16 underneath stacked two gaps into one. */}
      <section className="border-ink-100 bg-surface-raised border-t">
        <Container className="pt-16 pb-8">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-ink-600 text-sm">Explore the packages</p>
              <h2 className="text-ink-900 mt-2 text-3xl leading-tight sm:text-4xl">
                Discover our wedding packages
              </h2>
            </div>

            <Link
              href="/lucknow/photography"
              className="bg-ink-900 hover:bg-ink-800 hidden shrink-0 items-center gap-3 rounded-md py-3 pr-3 pl-6 text-sm font-semibold text-white transition-colors sm:inline-flex"
            >
              View all
              <span
                aria-hidden="true"
                className="text-ink-900 flex h-8 w-8 items-center justify-center rounded-md bg-white"
              >
                &rarr;
              </span>
            </Link>
          </div>

          <div className="mt-8">
            <PackageSlider items={getWeddingPackages()} />
          </div>
        </Container>
      </section>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  Badge,
  Card,
  CardBody,
  Container,
  LinkButton,
  MediaFrame,
  Rating,
  SectionHeading,
} from '@utsava/ui'

import { ShortlistButton } from '@/components/shortlist-button'
import { getLiveVendorSlugs, getVendorBySlug } from '@/lib/queries'

type Props = { params: Promise<{ slug: string }> }

export const revalidate = 3600

/**
 * Plan §13 gates launch on LCP < 2.5 s on 4G mid-range Android, and the profile is the
 * page a customer lands on from search. Prerendering the indexed set means the common
 * path is a static file; anything not listed here still renders on demand via ISR.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await getLiveVendorSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const vendor = await getVendorBySlug(slug)
  if (!vendor) return {}

  const where = [vendor.localityName, vendor.cityName].filter(Boolean).join(', ')

  return {
    title: `${vendor.displayName} — ${vendor.categoryName} in ${where}`,
    description: vendor.about.slice(0, 155),
    alternates: { canonical: `/vendor/${vendor.slug}` },
    openGraph: { title: vendor.displayName, description: vendor.about.slice(0, 200) },
  }
}

export default async function VendorPage({ params }: Props) {
  const { slug } = await params
  const vendor = await getVendorBySlug(slug)
  if (!vendor) notFound()

  const [cover, ...rest] = vendor.gallery

  return (
    <>
      {/*
        Plan §2/§S3: portfolio-first. The work fills the screen before any copy,
        because the photograph is what a couple actually decides on.
      */}
      <section className="border-b border-ink-100 bg-surface-sunken/40">
        <Container className="py-8">
          <nav aria-label="Breadcrumb" className="mb-5 text-sm text-ink-500">
            <Link href="/" className="hover:text-ink-800">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <Link
              href={`/${vendor.citySlug}/${vendor.categorySlug}`}
              className="hover:text-ink-800"
            >
              {vendor.categoryName}s in {vendor.cityName}
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-ink-700">{vendor.displayName}</span>
          </nav>

          <div className="grid gap-3 sm:grid-cols-4 sm:grid-rows-2">
            <MediaFrame
              src={cover?.url ?? null}
              alt={cover?.alt ?? `Work by ${vendor.displayName}`}
              aspect="4/3"
              priority
              className="sm:col-span-2 sm:row-span-2 sm:h-full"
              sizes="(min-width: 640px) 50vw, 100vw"
            />
            {rest.slice(0, 4).map((image, i) => (
              <MediaFrame
                key={i}
                src={image.url}
                alt={image.alt}
                aspect="4/3"
                sizes="(min-width: 640px) 25vw, 50vw"
              />
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          {/* ---------------- Main column ---------------- */}
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl text-ink-900 sm:text-4xl">{vendor.displayName}</h1>
                <p className="mt-1.5 text-ink-600">
                  {vendor.categoryName}
                  {vendor.localityName ? ` · ${vendor.localityName}` : ''}
                  {vendor.cityName ? `, ${vendor.cityName}` : ''}
                </p>
              </div>
              <Rating value={vendor.ratingAvg} count={vendor.ratingCount} />
            </div>

            {/* Plan §11/§12: the disclosure sits at the top of the profile, not in
                small print, and links to the published policy. */}
            {vendor.isAnchorStudio && (
              <div className="mt-5 rounded-lg border border-accent-200 bg-accent-50 p-4">
                <p className="text-sm font-semibold text-accent-900">
                  This studio is owned by Utsava
                </p>
                <p className="mt-1 text-sm text-accent-800">
                  It is ranked by exactly the same algorithm as every other listing, with no
                  preference of any kind. It takes overflow bookings only and is capped at
                  roughly 5% of bookings in this category.{' '}
                  <Link href="/p/anchor-studio-policy" className="underline underline-offset-2">
                    Read the policy
                  </Link>
                  .
                </p>
              </div>
            )}

            {vendor.styleTags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {vendor.styleTags.map((tag) => (
                  <Badge key={tag} tone="neutral" className="capitalize">
                    {tag.replace(/-/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}

            <div className="mt-7 max-w-2xl">
              <p className="whitespace-pre-line leading-relaxed text-ink-700">{vendor.about}</p>
            </div>

            <dl className="mt-8 grid grid-cols-2 gap-6 border-y border-ink-100 py-6 sm:grid-cols-4">
              {[
                vendor.establishedYear && ['Since', String(vendor.establishedYear)],
                vendor.teamSize && ['Team', `${vendor.teamSize} people`],
                vendor.completedBookings > 0 && [
                  'Events done',
                  String(vendor.completedBookings),
                ],
                // Plan §2 "honest vendor dashboards": customers see the same response
                // figure the vendor sees, computed once in app.refresh_vendor_response_metrics.
                vendor.medianResponseMins != null && [
                  'Usually replies',
                  vendor.medianResponseMins <= 60
                    ? `in ${vendor.medianResponseMins} min`
                    : `in ${Math.round(vendor.medianResponseMins / 60)} h`,
                ],
              ]
                .filter((x): x is [string, string] => Array.isArray(x))
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
                    <dd className="mt-1 font-display text-xl text-ink-900">{value}</dd>
                  </div>
                ))}
            </dl>

            {/* Plan §2: package cards, normalised to per-day pricing. */}
            {vendor.packages.length > 0 && (
              <section className="mt-10">
                <SectionHeading
                  title="Packages"
                  description="Every package shows a per-day figure so you can compare a three-day quote against a one-day one."
                />
                <div className="mt-6 space-y-4">
                  {vendor.packages.map((pkg) => (
                    <Card key={pkg.name}>
                      <CardBody>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-display text-xl text-ink-900">{pkg.name}</h3>
                            {pkg.description && (
                              <p className="mt-1.5 text-sm text-ink-600">{pkg.description}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-display text-2xl text-ink-900">{pkg.priceLabel}</p>
                            <p className="text-xs text-ink-500">{pkg.perDayLabel}</p>
                          </div>
                        </div>

                        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-600">
                          {pkg.durationDays !== 1 && <li>{pkg.durationDays} days</li>}
                          {pkg.crewSize && <li>{pkg.crewSize} crew</li>}
                          {pkg.editedPhotoCount && <li>{pkg.editedPhotoCount}+ edited photos</li>}
                          {pkg.deliveryDays && <li>Delivered in {pkg.deliveryDays} days</li>}
                        </ul>

                        {pkg.inclusions.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-1.5">
                            {pkg.inclusions.map((item) => (
                              <Badge key={item} tone="neutral">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Plan §2: booking-gated reviews. */}
            <section className="mt-12">
              <SectionHeading
                title="Reviews"
                description="Only customers with a completed booking on Utsava can leave a review."
              />
              {vendor.reviews.length === 0 ? (
                <p className="mt-5 rounded-lg border border-dashed border-ink-200 p-6 text-sm text-ink-600">
                  No reviews yet. This listing is new to Utsava.
                </p>
              ) : (
                <div className="mt-6 space-y-5">
                  {vendor.reviews.map((review, i) => (
                    <Card key={i}>
                      <CardBody>
                        <div className="flex items-center justify-between gap-3">
                          <Rating value={review.rating} count={1} size="sm" />
                          <Badge tone="success">Verified booking</Badge>
                        </div>
                        {review.title && (
                          <h3 className="mt-3 font-display text-lg text-ink-900">{review.title}</h3>
                        )}
                        {review.body && (
                          <p className="mt-2 leading-relaxed text-ink-700">{review.body}</p>
                        )}
                        <p className="mt-3 text-sm text-ink-500">
                          {review.authorName}
                          {review.publishedAt
                            ? ` · ${new Date(review.publishedAt).toLocaleDateString('en-IN', {
                                month: 'long',
                                year: 'numeric',
                              })}`
                            : ''}
                        </p>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {vendor.gallery.length > 5 && (
              <section className="mt-12">
                <SectionHeading title="More work" />
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {vendor.gallery.slice(5).map((image, i) => (
                    <MediaFrame
                      key={i}
                      src={image.url}
                      alt={image.alt}
                      aspect="4/3"
                      sizes="(min-width: 640px) 33vw, 100vw"
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ---------------- Enquiry rail ---------------- */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardBody>
                <p className="text-xs uppercase tracking-wide text-ink-500">Starting from</p>
                <p className="mt-1 font-display text-3xl text-ink-900">{vendor.priceBandLabel}</p>

                <LinkButton
                  href={`/enquire?vendor=${vendor.slug}`}
                  size="lg"
                  fullWidth
                  className="mt-5"
                >
                  Check availability
                </LinkButton>

                {/*
                  The shortlist button and its action already existed and were rendered
                  nowhere - the feature had no entry point at all, so rows could only ever
                  have been written by calling the action directly.

                  No `initialSaved` here on purpose. This page is statically generated and
                  heavily crawled (plan §12), so baking one visitor's shortlist state into it
                  would show that state to everyone. The button reads localStorage instead and
                  the account page is where the database's answer is authoritative.
                */}
                <div className="mt-3">
                  <ShortlistButton
                    vendorSlug={vendor.slug}
                    vendorName={vendor.displayName}
                    className="w-full [&>button]:w-full [&>button]:justify-center"
                  />
                </div>

                {/* Plan §1/§2: the promises that make the enquiry worth completing —
                    and that make the resulting lead worth paying for. */}
                <ul className="mt-5 space-y-2.5 text-sm text-ink-600">
                  <li className="flex gap-2">
                    <Check /> Your number is verified once, then shared with at most 5 vendors
                  </li>
                  <li className="flex gap-2">
                    <Check /> No call centre, no reselling your details
                  </li>
                  <li className="flex gap-2">
                    <Check /> Free — you pay the vendor directly
                  </li>
                </ul>

                <p className="mt-5 border-t border-ink-100 pt-4 text-xs text-ink-500">
                  Contact details are shared with {vendor.displayName} only after you send an
                  enquiry, and only for responding to it.
                </p>
              </CardBody>
            </Card>
          </aside>
        </div>
      </Container>
    </>
  )
}

function Check() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 fill-success-600"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path d="M8.1 13.4L4.7 10l-1.2 1.2 4.6 4.6 9-9-1.2-1.2z" />
    </svg>
  )
}

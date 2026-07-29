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

import { StoryCard } from '@/components/story-card'
import { getVendorBySlug } from '@/lib/queries'
import { EVENT_TYPE_LABEL, formatEventDate, getStories, getStoryBySlug } from '@/lib/stories'

type Params = { slug: string }
type Props = { params: Promise<Params> }

export const revalidate = 3600

export async function generateStaticParams(): Promise<Params[]> {
  const stories = await getStories()
  return stories.map((story) => ({ slug: story.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const story = await getStoryBySlug(slug)
  if (!story) return {}

  const where = [story.localityName, story.cityName].filter(Boolean).join(', ')
  const description = story.subtitle ?? story.body.split('\n\n')[0] ?? ''

  return {
    title: where ? `${story.title} — ${where}` : story.title,
    description: description.slice(0, 155),
    alternates: { canonical: `/stories/${story.slug}` },
    openGraph: {
      title: story.title,
      description: description.slice(0, 200),
      type: 'article',
    },
  }
}

export default async function StoryPage({ params }: Props) {
  const { slug } = await params
  const story = await getStoryBySlug(slug)
  if (!story) notFound()

  // Plan §11: the story exists to send the reader to the vendor who shot it, so the
  // vendor's real price band and rating travel with it rather than a marketing blurb.
  const [vendor, allStories] = await Promise.all([
    story.vendorSlug ? getVendorBySlug(story.vendorSlug) : Promise.resolve(null),
    getStories(),
  ])

  const related = allStories.filter((s) => s.slug !== story.slug).slice(0, 3)
  const when = formatEventDate(story.eventDate)
  const where = [story.localityName, story.cityName].filter(Boolean).join(', ')
  const paragraphs = story.body.split('\n\n').filter((p) => p.trim().length > 0)
  const [cover, ...restImages] = story.gallery

  return (
    <>
      <section className="border-b border-ink-100 bg-surface-sunken/40">
        <Container className="py-8">
          <nav aria-label="Breadcrumb" className="mb-5 text-sm text-ink-500">
            <Link href="/" className="hover:text-ink-800">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <Link href="/stories" className="hover:text-ink-800">
              Real weddings
            </Link>
            {story.citySlug && story.cityName && (
              <>
                <span className="mx-1.5">/</span>
                <Link href={`/stories?city=${story.citySlug}`} className="hover:text-ink-800">
                  {story.cityName}
                </Link>
              </>
            )}
          </nav>

          <MediaFrame
            src={story.coverUrl ?? cover?.url ?? null}
            alt={cover?.alt ?? story.title}
            aspect="16/9"
            priority
            sizes="(min-width: 1280px) 1200px, 100vw"
          />
        </Container>
      </section>

      <Container className="py-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
          {/* ---------------- Story ---------------- */}
          <article>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
              {EVENT_TYPE_LABEL[story.eventType]}
              {story.coupleNames ? ` · ${story.coupleNames}` : ''}
            </p>

            <h1 className="mt-3 max-w-3xl text-3xl leading-[1.15] text-ink-900 sm:text-4xl">
              {story.title}
            </h1>

            {story.subtitle && (
              <p className="mt-4 max-w-2xl text-lg text-ink-600">{story.subtitle}</p>
            )}

            <p className="mt-4 text-sm text-ink-500">
              {[where, when].filter(Boolean).join(' · ')}
            </p>

            {story.styleTags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {story.styleTags.map((tag) => (
                  <Badge key={tag} tone="neutral" className="capitalize">
                    {tag.replace(/-/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}

            <div className="mt-8 max-w-2xl space-y-5">
              {paragraphs.map((paragraph, i) => (
                <p key={i} className="leading-relaxed text-ink-700">
                  {paragraph}
                </p>
              ))}
            </div>

            {restImages.length > 0 && (
              <section className="mt-12">
                <SectionHeading title="From the gallery" />
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {restImages.map((image, i) => (
                    <MediaFrame
                      key={i}
                      src={image.url}
                      alt={image.alt}
                      aspect="4/3"
                      sizes="(min-width: 640px) 45vw, 100vw"
                    />
                  ))}
                </div>
              </section>
            )}

            <p className="mt-10 border-t border-ink-100 pt-6 text-xs text-ink-500">
              Published with the couple&apos;s written consent. Names are used as the couple
              supplied them; no contact details appear in any story.
            </p>
          </article>

          {/* ---------------- Vendor rail ---------------- */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            {vendor ? (
              <Card>
                <CardBody>
                  <p className="text-xs uppercase tracking-wide text-ink-500">Shot by</p>
                  <h2 className="mt-1 font-display text-2xl leading-tight text-ink-900">
                    {vendor.displayName}
                  </h2>
                  <p className="mt-1 text-sm text-ink-600">
                    {vendor.categoryName}
                    {vendor.localityName ? ` · ${vendor.localityName}` : ''}
                    {vendor.cityName ? `, ${vendor.cityName}` : ''}
                  </p>

                  <div className="mt-3">
                    <Rating value={vendor.ratingAvg} count={vendor.ratingCount} size="sm" />
                  </div>

                  <p className="mt-5 text-xs uppercase tracking-wide text-ink-500">Price band</p>
                  <p className="mt-1 font-display text-2xl text-ink-900">{vendor.priceBandLabel}</p>

                  <LinkButton
                    href={`/enquire?vendor=${vendor.slug}`}
                    size="lg"
                    fullWidth
                    className="mt-5"
                  >
                    Check their availability
                  </LinkButton>
                  <LinkButton
                    href={`/vendor/${vendor.slug}`}
                    variant="outline"
                    size="md"
                    fullWidth
                    className="mt-2.5"
                  >
                    See the full portfolio
                  </LinkButton>

                  {/* Plan §11/§12: the disclosure follows the studio everywhere it appears. */}
                  {vendor.isAnchorStudio && (
                    <p className="mt-5 border-t border-ink-100 pt-4 text-xs text-ink-500">
                      This studio is owned by Utsava and ranked with no preference of any kind.{' '}
                      <Link href="/p/anchor-studio-policy" className="underline underline-offset-2">
                        Read the policy
                      </Link>
                      .
                    </p>
                  )}
                </CardBody>
              </Card>
            ) : (
              <Card>
                <CardBody>
                  <p className="font-display text-xl text-ink-900">Planning something similar?</p>
                  <p className="mt-2 text-sm text-ink-600">
                    Send one enquiry and it reaches at most five vendors who are free on your date.
                  </p>
                  <LinkButton href="/enquire" size="lg" fullWidth className="mt-5">
                    Start an enquiry
                  </LinkButton>
                </CardBody>
              </Card>
            )}

            {story.citySlug && (
              <Card className="mt-4">
                <CardBody>
                  <p className="text-sm text-ink-700">
                    Browsing {story.cityName ?? 'this city'}? Start with the photographers, then
                    narrow by locality.
                  </p>
                  <Link
                    href={`/${story.citySlug}/photography`}
                    className="mt-3 inline-block text-sm font-medium text-primary-700 hover:text-primary-800"
                  >
                    Photographers in {story.cityName ?? 'this city'} →
                  </Link>
                </CardBody>
              </Card>
            )}
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-16 border-t border-ink-100 pt-10">
            <SectionHeading eyebrow="Keep reading" title="Other real weddings" />
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <StoryCard key={item.slug} story={item} />
              ))}
            </div>
          </section>
        )}
      </Container>
    </>
  )
}

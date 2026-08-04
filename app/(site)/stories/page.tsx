import type { Metadata } from 'next'
import Link from 'next/link'

import { cn, Container, LinkButton } from '@/components/ui'

import { StoryCard } from '@/components/story-card'
import { getLaunchedCities } from '@/lib/queries'
import { filterStories, getStories, storyStyleTags } from '@/lib/stories'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Real weddings. Plan §11: the wedge category produces the content that markets every
 * other category, and this is where it lands. Each story is a published, vendor-credited
 * account of one event — never stock imagery, never a listing in disguise.
 */
export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Real weddings on Fremmo',
  description:
    'Full accounts of real weddings and celebrations across India — the brief, the crew, ' +
    'what was delivered and when, with the vendor who shot it named on every one.',
  alternates: { canonical: '/stories' },
  openGraph: { title: 'Real weddings on Fremmo', type: 'website' },
}

export default async function StoriesPage({ searchParams }: Props) {
  const params = await searchParams
  const citySlug = typeof params.city === 'string' ? params.city : undefined
  const styleTag = typeof params.style === 'string' ? params.style : undefined

  const [allStories, cities] = await Promise.all([getStories(), getLaunchedCities()])

  const stories = filterStories(allStories, { citySlug, styleTag })
  const styles = storyStyleTags(allStories)
  const cityHasStories = cities.filter((city) =>
    allStories.some((story) => story.citySlug === city.slug),
  )

  const [lead, ...rest] = stories

  return (
    <>
      <div className="border-ink-100 bg-surface-sunken/60 border-b">
        <Container className="py-8 sm:py-10">
          <nav aria-label="Breadcrumb" className="text-ink-500 mb-3 text-sm">
            <Link href="/" className="hover:text-ink-800">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-ink-700">Real weddings</span>
          </nav>

          <h1 className="text-ink-900 text-3xl sm:text-4xl">Real weddings</h1>
          <p className="text-ink-600 mt-2.5 max-w-2xl">
            What was actually asked for, who shot it, how big the crew was and when the gallery
            arrived. Every story names the vendor and links to their profile.
          </p>

          {cityHasStories.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              <Chip href={buildHref({ style: styleTag })} active={!citySlug} label="All cities" />
              {cityHasStories.map((city) => (
                <Chip
                  key={city.slug}
                  href={buildHref({ city: city.slug, style: styleTag })}
                  active={citySlug === city.slug}
                  label={city.name}
                />
              ))}
            </div>
          )}

          {styles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip href={buildHref({ city: citySlug })} active={!styleTag} label="All styles" />
              {styles.map((style) => (
                <Chip
                  key={style.slug}
                  href={buildHref({ city: citySlug, style: style.slug })}
                  active={styleTag === style.slug}
                  label={`${style.slug.replace(/-/g, ' ')} (${style.count})`}
                  className="capitalize"
                />
              ))}
            </div>
          )}
        </Container>
      </div>

      <Container className="py-10">
        {!lead ? (
          <div className="border-ink-200 rounded-xl border border-dashed p-12 text-center">
            <p className="font-display text-ink-900 text-xl">No stories under those filters yet</p>
            <p className="text-ink-600 mx-auto mt-2 max-w-md text-sm">
              We publish a story only once the couple and the vendor have both signed off on it, so
              this list grows slowly on purpose.
            </p>
            <Link
              href="/stories"
              className="text-primary-700 hover:text-primary-800 mt-5 inline-block text-sm font-medium"
            >
              See every story →
            </Link>
          </div>
        ) : (
          <>
            <p className="text-ink-500 text-sm">
              {stories.length} {stories.length === 1 ? 'story' : 'stories'}
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <StoryCard story={lead} priority />
              {rest.map((story) => (
                <StoryCard key={story.slug} story={story} />
              ))}
            </div>
          </>
        )}

        <section className="border-ink-100 bg-surface-raised mt-14 rounded-xl border p-6 sm:p-8">
          <h2 className="font-display text-ink-900 text-xl">
            Had your wedding shot through Fremmo?
          </h2>
          <p className="text-ink-600 mt-2 max-w-2xl text-sm">
            Tell us about it. Stories are published only with the couple&apos;s written consent, and
            the vendor sees the draft before it goes live.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <LinkButton href="/enquire" size="md">
              Start an enquiry
            </LinkButton>
            <LinkButton href="/partner" variant="outline" size="md">
              List your business
            </LinkButton>
          </div>
        </section>
      </Container>
    </>
  )
}

function Chip({
  href,
  active,
  label,
  className,
}: {
  href: string
  active: boolean
  label: string
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        active
          ? 'bg-ink-900 rounded-full px-3.5 py-1.5 text-sm font-medium text-white'
          : 'border-ink-200 bg-surface-raised text-ink-700 hover:border-ink-300 hover:text-ink-900 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
        className,
      )}
    >
      {label}
    </Link>
  )
}

function buildHref(params: { city?: string; style?: string }): string {
  const search = new URLSearchParams()
  if (params.city) search.set('city', params.city)
  if (params.style) search.set('style', params.style)
  const qs = search.toString()
  return qs ? `/stories?${qs}` : '/stories'
}

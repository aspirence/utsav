import type { Metadata } from 'next'
import Link from 'next/link'

import { cn, Container, LinkButton } from '@utsava/ui'

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
  title: 'Real weddings on Utsava',
  description:
    'Full accounts of real weddings and celebrations across India — the brief, the crew, ' +
    'what was delivered and when, with the vendor who shot it named on every one.',
  alternates: { canonical: '/stories' },
  openGraph: { title: 'Real weddings on Utsava', type: 'website' },
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
      <div className="border-b border-ink-100 bg-surface-sunken/60">
        <Container className="py-8 sm:py-10">
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-500">
            <Link href="/" className="hover:text-ink-800">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-ink-700">Real weddings</span>
          </nav>

          <h1 className="text-3xl text-ink-900 sm:text-4xl">Real weddings</h1>
          <p className="mt-2.5 max-w-2xl text-ink-600">
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
          <div className="rounded-xl border border-dashed border-ink-200 p-12 text-center">
            <p className="font-display text-xl text-ink-900">No stories under those filters yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
              We publish a story only once the couple and the vendor have both signed off on it,
              so this list grows slowly on purpose.
            </p>
            <Link
              href="/stories"
              className="mt-5 inline-block text-sm font-medium text-primary-700 hover:text-primary-800"
            >
              See every story →
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-500">
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

        <section className="mt-14 rounded-xl border border-ink-100 bg-surface-raised p-6 sm:p-8">
          <h2 className="font-display text-xl text-ink-900">Had your wedding shot through Utsava?</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">
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
          ? 'rounded-full bg-ink-900 px-3.5 py-1.5 text-sm font-medium text-white'
          : 'rounded-full border border-ink-200 bg-surface-raised px-3.5 py-1.5 text-sm text-ink-700 transition-colors hover:border-ink-300 hover:text-ink-900',
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

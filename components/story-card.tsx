import Link from 'next/link'

import { Badge, MediaFrame } from '@/components/ui'

import { EVENT_TYPE_LABEL, formatEventDate, type Story } from '@/lib/stories'

/**
 * The unit of the stories surface. Deliberately shaped like VendorCard — same rounded
 * card, same overlay link, same warm media placeholder — because a story and a listing
 * sit next to each other on the city page and should read as one system.
 *
 * Plan §11: the vendor credit is not a caption, it is the point. Every story links to
 * the profile that shot it.
 */
export function StoryCard({
  story,
  priority,
}: {
  story: Story
  priority?: boolean
}) {
  const where = [story.localityName, story.cityName].filter(Boolean).join(', ')
  const when = formatEventDate(story.eventDate)

  return (
    <article className="group relative overflow-hidden rounded-xl border border-ink-100 bg-surface-raised shadow-sm transition-shadow hover:shadow-lg">
      <MediaFrame
        src={story.coverUrl}
        alt={story.coupleNames ? `${story.coupleNames} — ${story.title}` : story.title}
        aspect="3/2"
        priority={priority}
        sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 92vw"
        className="rounded-none"
      />

      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
          {EVENT_TYPE_LABEL[story.eventType]}
          {story.coupleNames ? ` · ${story.coupleNames}` : ''}
        </p>

        <h3 className="mt-2 font-display text-lg leading-tight text-ink-900">
          <Link href={`/stories/${story.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {story.title}
          </Link>
        </h3>

        {story.subtitle && <p className="mt-2 text-sm text-ink-600">{story.subtitle}</p>}

        {(where || when) && (
          <p className="mt-2 text-sm text-ink-500">{[where, when].filter(Boolean).join(' · ')}</p>
        )}

        {story.styleTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {story.styleTags.slice(0, 3).map((tag) => (
              <Badge key={tag} tone="neutral" className="capitalize">
                {tag.replace(/-/g, ' ')}
              </Badge>
            ))}
          </div>
        )}

        {story.vendorSlug && story.vendorName && (
          <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">
            Shot by{' '}
            <Link
              href={`/vendor/${story.vendorSlug}`}
              className="relative z-10 font-medium text-ink-700 underline decoration-ink-300 underline-offset-2 hover:text-ink-900"
            >
              {story.vendorName}
            </Link>
          </p>
        )}
      </div>
    </article>
  )
}

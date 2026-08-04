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
export function StoryCard({ story, priority }: { story: Story; priority?: boolean }) {
  const where = [story.localityName, story.cityName].filter(Boolean).join(', ')
  const when = formatEventDate(story.eventDate)

  return (
    <article className="group border-ink-100 bg-surface-raised hover:border-ink-300 relative overflow-hidden rounded-xl border transition-colors">
      <MediaFrame
        src={story.coverUrl}
        alt={story.coupleNames ? `${story.coupleNames} — ${story.title}` : story.title}
        aspect="3/2"
        priority={priority}
        sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 92vw"
        className="rounded-none"
      />

      <div className="p-4">
        <p className="text-primary-600 text-xs font-semibold tracking-[0.14em] uppercase">
          {EVENT_TYPE_LABEL[story.eventType]}
          {story.coupleNames ? ` · ${story.coupleNames}` : ''}
        </p>

        <h3 className="font-display text-ink-900 mt-2 text-lg leading-tight">
          <Link
            href={`/stories/${story.slug}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {story.title}
          </Link>
        </h3>

        {story.subtitle && <p className="text-ink-600 mt-2 text-sm">{story.subtitle}</p>}

        {(where || when) && (
          <p className="text-ink-500 mt-2 text-sm">{[where, when].filter(Boolean).join(' · ')}</p>
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
          <p className="border-ink-100 text-ink-500 mt-3 border-t pt-3 text-xs">
            Shot by{' '}
            <Link
              href={`/vendor/${story.vendorSlug}`}
              className="text-ink-700 decoration-ink-300 hover:text-ink-900 relative z-10 font-medium underline underline-offset-2"
            >
              {story.vendorName}
            </Link>
          </p>
        )}
      </div>
    </article>
  )
}

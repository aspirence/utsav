import Link from 'next/link'

import { formatPaise } from '@/lib/db'

/**
 * The long-tail SEO block on a discovery page. Plan §2 Must-tier: "programmatic SEO
 * pages + sitemaps"; plan §12 mitigates "SEO indexing lags launch" with the page engine
 * live six months early.
 *
 * Three jobs, in order of value:
 *   1. Internal links to every locality page WITH its live count, so crawl budget goes
 *      to pages that actually have supply — and so a thin locality is visibly thin.
 *   2. Budget-scoped links ("under ₹1 L"), which is how people actually search.
 *   3. A real FAQ with FAQPage structured data, answering the questions a couple types
 *      into Google rather than the ones we wish they asked.
 *
 * The copy is category-specific and factual. Generic filler would rank for nothing and
 * would make the page worse for the person reading it.
 */

export interface LocalityLink {
  slug: string
  name: string
  count: number
}

export function CategorySeoBlock({
  citySlug,
  cityName,
  categorySlug,
  categoryName,
  categoryPlural,
  localities,
  priceRungs,
  faqs,
}: {
  citySlug: string
  cityName: string
  categorySlug: string
  categoryName: string
  categoryPlural: string
  localities: LocalityLink[]
  priceRungs: { label: string; value: number }[]
  faqs: { q: string; a: string }[]
}) {
  const base = `/${citySlug}/${categorySlug}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <section className="mt-14 border-t border-ink-100 pt-10">
      {localities.length > 0 && (
        <div>
          <h2 className="font-display text-xl text-ink-900">
            {categoryPlural} by locality in {cityName}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {localities.map((l) => (
              <Link
                key={l.slug}
                href={`${base}/${l.slug}`}
                className="rounded-full border border-ink-200 bg-surface-raised px-3.5 py-1.5 text-sm text-ink-700 transition-colors hover:border-ink-300 hover:text-ink-900"
              >
                {l.name}
                {/* The count is the honest signal. A locality with two listings says so
                    rather than promising a choice it cannot deliver. */}
                <span className="ml-1.5 text-ink-400">{l.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-display text-xl text-ink-900">
          {categoryPlural} in {cityName} by budget
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {priceRungs.map((r) => (
            <Link
              key={r.value}
              href={`${base}?budgetMax=${r.value}`}
              className="rounded-full border border-ink-200 bg-surface-raised px-3.5 py-1.5 text-sm text-ink-700 transition-colors hover:border-ink-300 hover:text-ink-900"
            >
              {categoryName} under {formatPaise(r.value, { compact: true })}
            </Link>
          ))}
        </div>
      </div>

      {faqs.length > 0 && (
        <div className="mt-10 max-w-3xl">
          <h2 className="font-display text-xl text-ink-900">
            Booking {categoryPlural.toLowerCase()} in {cityName}
          </h2>
          <div className="mt-4 divide-y divide-ink-100 border-y border-ink-100">
            {faqs.map((f) => (
              <details key={f.q} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink-900">
                  {f.q}
                  <span className="shrink-0 text-ink-400 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2 leading-relaxed text-ink-600">{f.a}</p>
              </details>
            ))}
          </div>

          <script
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger -- structured data, generated from our own copy above
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </div>
      )}
    </section>
  )
}

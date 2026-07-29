import Link from 'next/link'

/**
 * The vendor CTA that used to sit here was a flat dark card. This is the same idea as a
 * full-bleed banner: photograph behind, copy left, one action right.
 *
 * The scrim is heavier on the left, where the copy sits, and clears towards the right so
 * the photograph is actually visible under the button. White text on a photograph needs
 * that - there is no way to know in advance whether the frame behind a given word is sky
 * or shadow.
 *
 * Artwork is a placeholder until it is supplied - pass `imageUrl`.
 */
export function QuotationCta({ imageUrl }: { imageUrl?: string | null }) {
  return (
    <section className="relative isolate overflow-hidden rounded-2xl">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- plan section 12: Storage CDN
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="u-media-fallback absolute inset-0" aria-hidden="true" />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-ink-950/85 via-ink-950/60 to-ink-950/30" />

      <div className="relative grid items-center gap-6 px-8 py-14 sm:px-12 lg:grid-cols-[1fr_auto] lg:py-16">
        <div>
          <h2 className="text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
            Plan Your <span className="text-white/55">Perfect Celebration</span>
          </h2>
          <p className="mt-3 max-w-2xl text-white/85">
            Tell us about your event, and we&rsquo;ll create a personalized quotation with the
            best venues and vendors.
          </p>
        </div>

        <Link
          href="/enquire"
          className="inline-flex shrink-0 items-center gap-3 rounded-md bg-surface-raised py-3 pl-6 pr-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Get My Quotation
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 text-white"
          >
            &rarr;
          </span>
        </Link>
      </div>
    </section>
  )
}

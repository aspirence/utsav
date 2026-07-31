/**
 * The editorial breather on the homepage: a deep wedding-red panel on the left, the
 * video running full-bleed on the right.
 *
 * Everything else on this page is transactional - cards, filters, prices. This section
 * exists to say what the product is actually for, in the terms a family planning a
 * wedding would use rather than the terms a marketplace would.
 *
 * The copy is deliberately specific to an Indian wedding - the functions by name, the
 * real vendor count, the real booking lead time - because a generic "plan your dream
 * day" paragraph would be true of nothing and land with nobody.
 *
 * Two layout decisions worth knowing:
 *
 *  · The red panel and the video are both positioned against the section, not inside the
 *    centred container, so each runs to its own edge of the viewport. The copy stays
 *    inside the container so it still lines up with every other section on the page.
 *
 *  · Nothing is laid over the video. Text sits on solid colour instead, which means the
 *    footage is exactly as sharp as it was shot - no scrim, no gradient, no wash.
 */

/** Plan section 5's event_type enum, in the order they actually happen. */
const FUNCTIONS = ['Haldi', 'Mehendi', 'Sangeet', 'Wedding', 'Reception']

export function WeddingExplainer({
  videoSrc = '/wedding-video.mp4',
  posterSrc = '/wedding-video-poster.webp',
}: {
  videoSrc?: string | null
  posterSrc?: string | null
}) {
  return (
    <section className="relative isolate overflow-hidden bg-primary-800">
      {/* Left panel: solid wedding red, running to the left edge of the viewport.
          Only rendered as a separate block on large screens - below that the section
          background colour already covers the whole width. */}
      <div className="absolute inset-y-0 left-0 hidden w-1/2 bg-primary-800 lg:block" aria-hidden="true" />

      {/* Right: the video, untouched. No scrim, no gradient. */}
      <div className="absolute inset-y-0 right-0 hidden w-1/2 lg:block" aria-hidden="true">
        {videoSrc ? (
          <video
            className="h-full w-full object-cover"
            // Decorative background loop, so it behaves like one: no sound, no controls,
            // no fullscreen-on-tap on iOS. muted is what makes autoplay legal at all.
            autoPlay
            muted
            loop
            playsInline
            // The poster paints immediately at 79 KB while the 1.2 MB clip streams in,
            // so this band is never empty. preload="metadata" keeps it from competing
            // with above-the-fold work - plan section 13 gates LCP on 4G.
            preload="metadata"
            {...(posterSrc ? { poster: posterSrc } : {})}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        ) : (
          <div className="u-media-fallback h-full w-full" />
        )}

        {/*
          No overlay of any kind here, deliberately.

          The source clip carried a generator watermark near the bottom-right. That is
          removed in the asset itself rather than covered in CSS - see the delogo step in
          scripts/optimize-images.mjs notes. A CSS patch would have drifted: the video is
          object-cover, so how much of the frame is cropped changes with the viewport,
          and a fixed tile would slide off the mark at other window sizes.
        */}
      </div>

      {/* Wider than the default container: the copy needs room now that it only gets the
          left half, and a 7xl container would squeeze it into a narrow ribbon. */}
      <div className="relative mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 py-14 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <div className="order-2 max-w-xl lg:order-none">
            {/* Marigold on red - the design system's celebration colour, and the only
                thing in the palette that holds its own against primary-800. */}
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-300">
              Planning a wedding in India
            </p>

            <h2 className="mt-3 text-3xl leading-[1.12] text-white sm:text-4xl">
              It was never just one day.
            </h2>

            <div className="mt-5 space-y-4 leading-relaxed text-white/85">
              <p>
                A wedding here is a week. Haldi in the morning light. Mehendi that runs
                past midnight. A sangeet everybody rehearses for and nobody quite gets
                right. The muhurtham itself, before the sun is properly up. And a
                reception where the same four hundred people arrive again, in different
                clothes.
              </p>
              <p>
                Each of those needs different people. Most families end up booking eight
                to twelve vendors across six months, usually while holding down a job, and
                usually on a WhatsApp thread with forty relatives in it. The photographer
                tends to go first, because the good ones are gone eleven months out.
              </p>
              <p className="font-medium text-white">
                That is the whole job we do: get you to the right five, free on your date
                and inside your budget, so the rest of the year is about the wedding
                rather than the spreadsheet.
              </p>
            </div>

            {/* One row on a phone, not a wrapped block. Five functions in order is a
                sequence - broken across two lines with "Reception" stranded underneath, it
                stops reading as one. Type and padding step down on mobile so all five fit
                a 375px screen; `whitespace-nowrap` keeps a chip from breaking inside
                itself when they get tight. */}
            <ul className="mt-7 flex flex-nowrap gap-1.5 sm:flex-wrap sm:gap-2">
              {FUNCTIONS.map((f) => (
                <li
                  key={f}
                  className="whitespace-nowrap rounded-full border border-white/30 px-2 py-1 text-[11px] text-white/90 sm:px-3.5 sm:py-1.5 sm:text-sm"
                >
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* On phones the video cannot bleed off a half-width column, so it renders
              inline here instead and the absolute one above is hidden - and it goes first,
              because a wall of copy is a poor thing to meet before you know what the
              section is about. `order` rather than a second element, so the video only
              exists once in the document. */}
          <div className="relative order-1 lg:hidden">
            {videoSrc ? (
              <video
                className="aspect-video w-full rounded-xl object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                {...(posterSrc ? { poster: posterSrc } : {})}
              >
                <source src={videoSrc} type="video/mp4" />
              </video>
            ) : (
              <div className="u-media-fallback aspect-video w-full rounded-xl" />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

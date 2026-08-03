import { Container } from '@/components/ui'

/**
 * The objections, answered on the page instead of over WhatsApp.
 *
 * A Server Component and plain <details> elements: the disclosure behaviour is native, so this
 * costs no JavaScript and the invitation product page stays entirely server-rendered.
 *
 * The first one is open on load because it is the money question, and a reader who has to click
 * to find out what they are being charged has already been given a reason to hesitate. Setting
 * `open` from a Server Component is safe — it renders as an attribute on static HTML and there is
 * no hydration to disagree with it.
 *
 * NO STRUCTURED DATA IN HERE, ON PURPOSE. The FAQPage node lives in the page's own @graph script,
 * next to the Product and the BreadcrumbList, so the route emits one ld+json block rather than
 * two competing ones. Copy the same `faqs` array into both or they will drift.
 */
export function InvitationFaq({
  faqs,
  heading = 'Before you order',
}: {
  faqs: { q: string; a: string }[]
  heading?: string
}) {
  if (faqs.length === 0) return null

  return (
    /* No surface of its own: it sits between a full-bleed photograph and the white "Other
       collections" band, so the body's paper tone is what separates the two. */
    <section>
      <Container className="py-14 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-ink-900 text-2xl sm:text-3xl">{heading}</h2>
          <div className="border-ink-200 divide-ink-100 mt-6 divide-y border-y">
            {faqs.map((f, i) => (
              <details key={f.q} className="group py-4" open={i === 0}>
                <summary className="font-display text-ink-900 flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] leading-snug">
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="text-ink-400 shrink-0 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="text-ink-700 mt-3 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}

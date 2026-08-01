import { Container } from '@/components/ui'

/**
 * Four numbered steps inside a beaded frame.
 *
 * A Server Component — it renders four strings and no state.
 *
 * THE FRAME IS TWO BORDERS, NOT AN IMAGE. A beaded edge as a PNG would be another asset to ship,
 * another thing to go blurry on a retina screen, and another file whose alpha channel someone has
 * to get right (this project has already lost an afternoon to exactly that). A dotted outer ring
 * around an inset panel reads the same at every size and weighs nothing.
 *
 * THE CONNECTING LINE IS ABSOLUTE, AND ITS INSETS ARE ARITHMETIC. With four columns the circle
 * centres sit at 12.5%, 37.5%, 62.5% and 87.5% — so the line runs from the first centre to the
 * last, not edge to edge, or it sticks out past the end circles. `top` matches half the circle's
 * height. Below `sm` it is hidden: the steps stack into two columns there and a horizontal line
 * across a wrapped grid connects the wrong things.
 */
export function HowItWorks({
  eyebrow,
  title,
  description,
  steps,
}: {
  eyebrow?: string
  title: string
  description: string
  steps: readonly { readonly title: string; readonly body: string }[]
}) {
  return (
    <Container className="py-14 sm:py-16">
      <div className="rounded-3xl border-2 border-dotted border-primary-300/70 p-2 sm:p-2.5">
        <div className="rounded-3xl bg-surface-raised px-5 py-12 sm:px-10 sm:py-14">
          <div className="mx-auto max-w-2xl text-center">
            {eyebrow && (
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700/80">
                {eyebrow}
              </p>
            )}
            <h2 className="mt-3 font-display text-3xl leading-tight text-ink-900 sm:text-4xl">
              {title}
            </h2>
            <p className="mt-4 leading-relaxed text-ink-700">{description}</p>
          </div>

          <ol className="relative mt-12 grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-4 sm:gap-x-4">
            {/* Behind the circles: -z-0 would put it behind the panel, so the circles carry an
                opaque background and sit above it in source order instead. */}
            <span
              aria-hidden="true"
              className="absolute left-[12.5%] right-[12.5%] top-9 hidden h-px bg-gradient-to-r from-primary-300 via-accent-400 to-primary-300 sm:block"
            />

            {steps.map((step, i) => (
              <li key={step.title} className="relative text-center">
                <span
                  className="relative z-10 mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-surface-raised font-display text-xl text-ink-800 ring-1 ring-primary-300/70 shadow-[0_2px_10px_rgba(24,17,12,0.06)]"
                  // The number is decoration over an ordered list — the list already carries the
                  // order, and a screen reader announcing "01" before "Pick a design" says it twice.
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>

                <h3 className="mt-5 font-display text-lg leading-snug text-ink-900">
                  {step.title}
                </h3>
                <p className="mx-auto mt-2 max-w-[22ch] text-sm leading-relaxed text-ink-600">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Container>
  )
}

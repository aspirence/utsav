import { PageHeader, Panel, Pill } from '@/components/admin-ui'
import { getPipeline, type PipelineCard, type PipelineStage } from '@/lib/admin-data'

export const metadata = { title: 'Onboarding pipeline' }

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: 'prospect', label: 'Prospect' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'shooting_scheduled', label: 'Shoot booked' },
  { key: 'media_captured', label: 'Media captured' },
  { key: 'profile_drafted', label: 'Profile drafted' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'live', label: 'Live' },
  { key: 'dropped', label: 'Dropped' },
]

/**
 * The field team's board. Plan §1: "Supply tooling before demand product … 3,000
 * concierge-quality listings are the launch asset", built from Sep 2026 — seven months
 * before any customer arrives. This is where that work is tracked.
 */
export default function PipelinePage() {
  const cards = getPipeline()
  const live = cards.filter((c) => c.stage === 'live').length
  const active = cards.filter((c) => !['live', 'dropped'].includes(c.stage)).length
  const overdue = cards.filter((c) => c.nextActionInDays != null && c.nextActionInDays < 0).length

  return (
    <>
      <PageHeader
        title="Onboarding pipeline"
        description="Every listing on Fremmo starts here. A vendor is never asked to fill in a form — a field agent visits, shoots their work, and drafts the profile with them."
        action={
          <div className="flex gap-2">
            <Pill tone="blue">{active} active</Pill>
            <Pill tone="green">{live} live</Pill>
            {overdue > 0 && <Pill tone="red">{overdue} overdue</Pill>}
          </div>
        }
      />

      {/* Horizontal scroll rather than a squashed grid — eight stages will never fit
          comfortably on a laptop, and a cramped board does not get used. */}
      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-3">
          {STAGES.map((stage) => {
            const items = cards.filter((c) => c.stage === stage.key)
            return (
              <section key={stage.key} className="w-[260px] shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-ink-800">{stage.label}</h2>
                  <span className="rounded-full bg-ink-200 px-2 py-0.5 text-xs tabular-nums text-ink-700">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-ink-200 p-4 text-center text-xs text-ink-400">
                      Empty
                    </div>
                  ) : (
                    items.map((card) => <PipelineCardView key={card.id} card={card} />)
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      <Panel className="mt-5 p-4">
        <h2 className="font-display text-base text-ink-900">Why the shoot comes first</h2>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-600">
          A listing cannot go live below 5 photos and a price band, and it will not receive
          routed leads until its profile score clears 60. That is why the board is
          organised around the shoot rather than around the signup: capturing the work is
          the step that unblocks everything else.
        </p>
      </Panel>
    </>
  )
}

function PipelineCardView({ card }: { card: PipelineCard }) {
  const overdue = card.nextActionInDays != null && card.nextActionInDays < 0
  const dueToday = card.nextActionInDays === 0

  return (
    <article
      className={`rounded-lg border bg-white p-3 ${
        overdue ? 'border-danger-500/40' : 'border-ink-200'
      }`}
    >
      <p className="text-sm font-medium text-ink-900">{card.business}</p>
      <p className="mt-0.5 text-xs text-ink-500">
        {card.locality}, {card.city}
      </p>
      <p className="mt-0.5 text-xs text-ink-500">{card.category}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {card.photos > 0 && (
          <Pill tone={card.photos >= 5 ? 'green' : 'amber'}>{card.photos} photos</Pill>
        )}
        {card.priceBandCaptured && <Pill tone="green">price band</Pill>}
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-ink-100 pt-2 text-xs">
        <span className="text-ink-500">{card.agent}</span>
        {card.nextActionInDays == null ? (
          <span className="text-ink-400">—</span>
        ) : overdue ? (
          <span className="font-medium text-danger-700">
            {Math.abs(card.nextActionInDays)}d overdue
          </span>
        ) : dueToday ? (
          <span className="font-medium text-warning-700">Today</span>
        ) : (
          <span className="text-ink-500">in {card.nextActionInDays}d</span>
        )}
      </div>
    </article>
  )
}

import { formatPaise } from '@utsava/db'

import { AdminTable, PageHeader, Panel, Pill } from '@/components/admin-ui'
import { getInvitationTemplates, type InvitationTemplate } from '@/lib/invitation-templates'

import { TemplateForm } from './template-form'

export const metadata = { title: 'Invitation templates' }

/**
 * The invitation storefront, from the staff side.
 *
 * One screen rather than list-plus-detail-plus-new. There are five rows and they will not grow
 * fast; three navigations to change a price would be three more than this needs.
 *
 * Rows come from the same reader the home page uses, so what is listed here is what a visitor
 * gets — with one difference that is RLS doing its job: `invitation_templates_select_staff`
 * adds the unpublished drafts, which `_select_active` hides from anon.
 */
export default async function AdminTemplatesPage() {
  const templates = await getInvitationTemplates()
  const live = templates.filter((t) => t.isActive).length
  const playable = templates.filter((t) => t.preview !== 'none').length
  const isDemo = templates.some((t) => t.isDemo)

  return (
    <>
      <PageHeader
        title="Invitation templates"
        description="The Curated Collections row on the home page. Each row is one phone-shaped card: a looping preview, a few tag words, and a price that flips to Order now under the cursor."
      />

      {isDemo && (
        <p className="mb-5 rounded-md border border-warning-500/40 bg-warning-50 px-3 py-2.5 text-sm leading-relaxed text-warning-700">
          These are the demo templates, not database rows — no Supabase instance is attached, so
          saving will not write anything. They deliberately carry no preview videos: there is
          nothing to point at until you paste real links here.
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <Pill tone={live > 0 ? 'green' : 'neutral'}>{live} published</Pill>
        <Pill tone="neutral">{templates.length - live} draft</Pill>
        {/* The count that actually answers "does the section look right?" — a published card
            with no playable preview is a still image where a video was promised. */}
        <Pill tone={playable === templates.length ? 'green' : 'amber'}>
          {playable} of {templates.length} with a playable preview
        </Pill>
      </div>

      <Panel className="mb-6">
        <div className="border-b border-ink-200 px-4 py-3">
          <h2 className="font-display text-lg text-ink-900">Current templates</h2>
        </div>
        <AdminTable
          rowKey={(r: InvitationTemplate) => r.slug}
          rows={templates}
          empty="No templates yet. Add the first one below."
          columns={[
            {
              key: 'name',
              header: 'Template',
              render: (r) => (
                <div>
                  <p className="font-medium text-ink-900">{r.name}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    /{r.slug}
                    {r.tags.length > 0 && ` · ${r.tags.join(' · ')}`}
                  </p>
                </div>
              ),
            },
            {
              key: 'preview',
              header: 'Preview',
              render: (r) => <PreviewCell template={r} />,
            },
            {
              key: 'price',
              header: 'Price',
              align: 'right',
              render: (r) => <span className="tabular-nums">{formatPaise(r.pricePaise)}</span>,
            },
            {
              key: 'state',
              header: 'On the home page',
              render: (r) =>
                r.isActive ? <Pill tone="green">published</Pill> : <Pill tone="neutral">draft</Pill>,
            },
          ]}
        />
      </Panel>

      <Panel className="p-5">
        <h2 className="font-display text-lg text-ink-900">Add a template</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-600">
          Paste a link to the preview — a direct video file, or a YouTube or Vimeo URL. Saving
          with an existing URL name edits that template instead of adding a second one.
        </p>
        <div className="mt-5">
          <TemplateForm />
        </div>
      </Panel>
    </>
  )
}

/**
 * What the card will actually render, named plainly.
 *
 * "Video" / "Embed" / "Poster only" rather than a green tick, because the interesting case is
 * the third one — a link that saved fine and still does not move. A tick would call that
 * success.
 */
function PreviewCell({ template }: { template: InvitationTemplate }) {
  if (template.preview === 'video') {
    return (
      <div>
        <Pill tone="green">video</Pill>
        <p className="mt-1 max-w-[22rem] truncate text-xs text-ink-500">{template.videoUrl}</p>
      </div>
    )
  }

  if (template.preview === 'embed') {
    return (
      <div>
        <Pill tone="blue">embed</Pill>
        <p className="mt-1 max-w-[22rem] truncate text-xs text-ink-500">{template.videoUrl}</p>
      </div>
    )
  }

  return (
    <div>
      <Pill tone={template.posterUrl ? 'amber' : 'red'}>
        {template.posterUrl ? 'poster only' : 'nothing'}
      </Pill>
      <p className="mt-1 max-w-[22rem] text-xs text-ink-500">
        {template.videoUrl
          ? 'That link is not a video file or a YouTube/Vimeo URL, so it cannot play.'
          : template.posterUrl
            ? 'No video link — the card shows a still image.'
            : 'No video and no poster: this card renders an empty phone.'}
      </p>
    </div>
  )
}

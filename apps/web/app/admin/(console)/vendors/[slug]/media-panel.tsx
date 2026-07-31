import { AdminModal } from '@/components/admin-modal'
import { Panel, Pill } from '@/components/admin-ui'
import { getVendorMedia, type AdminMediaItem } from '@/lib/admin-media'

import { MediaForm } from './media-form'
import { RemoveMediaButton } from './remove-media-button'

/**
 * The listing's gallery — the photographs that become the cards on the discovery pages.
 *
 * A Server Component that reads and lays out; every write is behind a dialog, matching the rest of
 * the console. The "Add photograph" trigger sits in the panel header rather than under the grid,
 * for the reason the templates screen was rebuilt: a list and its create form stacked on each other
 * read as one long muddle.
 *
 * THE MODERATION STATE IS ON EVERY TILE, not in a footnote. `media_select_live` requires
 * `approved`, so a pending photograph is invisible to customers — and the single most confusing
 * thing this screen could do is show a full gallery to staff while the public card sits empty.
 */
export async function VendorMediaPanel({ vendorSlug }: { vendorSlug: string }) {
  const media = await getVendorMedia(vendorSlug)
  const isDemo = media.some((m) => m.isDemo)
  const live = media.filter((m) => m.moderation === 'approved').length
  const missingAlt = media.filter((m) => !m.altText?.trim()).length

  return (
    <Panel className="mt-5">
      <div className="border-ink-200 flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-display text-ink-900 text-lg">Photographs</h2>
          <p className="text-ink-600 mt-0.5 text-sm">
            These are the images on this listing&rsquo;s cards. Plan §13 gates going live on five.
          </p>
        </div>
        <AdminModal
          trigger="Add photograph"
          title="Add a photograph"
          description="Give it a path or a link, then the details that travel with it — alt text, a caption and its style tags."
          width="lg"
        >
          <MediaForm vendorSlug={vendorSlug} />
        </AdminModal>
      </div>

      <div className="border-ink-100 flex flex-wrap gap-2 border-b px-4 py-3 text-sm">
        <Pill tone={media.length >= 5 ? 'green' : 'amber'}>
          {media.length} of 5 for the go-live gate
        </Pill>
        <Pill tone={live === media.length ? 'green' : 'amber'}>{live} approved and public</Pill>
        {/* The count that a moderator can actually act on — an unlabelled photograph is one a
            screen-reader user cannot shop from. */}
        <Pill tone={missingAlt === 0 ? 'green' : 'red'}>
          {missingAlt} without alt text
        </Pill>
      </div>

      {isDemo && (
        <p className="border-warning-500/40 bg-warning-50 text-warning-700 m-4 rounded-md border px-3 py-2.5 text-sm leading-relaxed">
          These are sample photographs, not database rows — no Supabase instance is attached, so
          adding or editing will not write anything.
        </p>
      )}

      {media.length === 0 ? (
        <p className="text-ink-500 p-8 text-center text-sm">
          No photographs yet. This listing cannot go live until it has five.
        </p>
      ) : (
        <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((m) => (
            <MediaTile key={m.id} item={m} vendorSlug={vendorSlug} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function MediaTile({ item, vendorSlug }: { item: AdminMediaItem; vendorSlug: string }) {
  return (
    <li className="border-ink-200 overflow-hidden rounded-lg border">
      <div className="bg-ink-100 relative aspect-[4/3]">
        {item.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- plan §12: no Vercel optimizer
          <img
            src={item.url}
            alt={item.altText ?? ''}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          /* storageImageUrl returned null: no Supabase configured and not a local path. Naming the
             stored value is more useful than a grey rectangle, because the stored value is the
             thing that needs fixing. */
          <p className="text-ink-500 absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] leading-relaxed">
            Cannot resolve
            <br />
            <span className="text-ink-700 break-all">{item.storagePath}</span>
          </p>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {item.isCover && <Pill tone="blue">cover</Pill>}
          {item.moderation !== 'approved' && (
            <Pill tone={item.moderation === 'rejected' ? 'red' : 'amber'}>{item.moderation}</Pill>
          )}
        </div>
      </div>

      <div className="p-3">
        <p className={'text-sm ' + (item.altText?.trim() ? 'text-ink-800' : 'text-danger-700')}>
          {item.altText?.trim() || 'No alt text'}
        </p>
        {item.caption && <p className="text-ink-500 mt-0.5 text-xs">{item.caption}</p>}
        {item.styleTags.length > 0 && (
          <p className="text-ink-500 mt-1.5 text-xs">{item.styleTags.join(' · ')}</p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <AdminModal
            trigger="Edit"
            variant="quiet"
            title="Edit photograph"
            description="Changes appear on the public card as soon as they are saved, provided the photograph is approved."
            width="lg"
          >
            <MediaForm
              vendorSlug={vendorSlug}
              initial={{
                id: item.id,
                storagePath: item.storagePath,
                altText: item.altText,
                caption: item.caption,
                styleTags: item.styleTags,
                sortOrder: item.sortOrder,
                isCover: item.isCover,
              }}
            />
          </AdminModal>

          <RemoveMediaButton vendorSlug={vendorSlug} mediaId={item.id} />
        </div>
      </div>
    </li>
  )
}

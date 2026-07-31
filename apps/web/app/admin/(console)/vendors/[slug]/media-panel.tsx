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
        /*
          Denser than it was. Three columns of 4:3 on a wide screen made each photograph about
          400px across — a size that shows off the picture and buries the job, which is scanning a
          gallery for the one tile that is pending or has no alt text. Six columns puts the whole
          set on one screen, which is what a check needs.
        */
        <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {media.map((m) => (
            <MediaTile key={m.id} item={m} vendorSlug={vendorSlug} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

/**
 * One thumbnail.
 *
 * Compact enough that a gallery fits on a screen. Caption and style tags moved into the tile's
 * `title` rather than staying on their own lines — at this width they truncated to nothing useful
 * anyway, and the alt-text line is the one that carries a fault worth spotting. Hover or focus the
 * tile and the full detail is there.
 */
function MediaTile({ item, vendorSlug }: { item: AdminMediaItem; vendorSlug: string }) {
  const detail = [item.caption, item.styleTags.join(' · ')].filter(Boolean).join(' — ')

  return (
    <li
      className="border-ink-200 overflow-hidden rounded-lg border"
      title={detail || undefined}
    >
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
          <p className="text-ink-600 absolute inset-0 flex items-center justify-center break-all px-2 text-center text-[10px] leading-tight">
            {item.storagePath}
          </p>
        )}

        {/* Badges overlay the image rather than taking a row of their own — at this size a row is
            most of the tile. */}
        <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
          {item.isCover && <Pill tone="blue">cover</Pill>}
          {item.moderation !== 'approved' && (
            <Pill tone={item.moderation === 'rejected' ? 'red' : 'amber'}>{item.moderation}</Pill>
          )}
        </div>
      </div>

      <div className="p-2">
        {/* One line, clamped. The red state is the point: an unlabelled photograph is a listing a
            screen-reader user cannot shop from, and it has to be visible at a glance. */}
        <p
          className={
            'truncate text-xs ' + (item.altText?.trim() ? 'text-ink-700' : 'text-danger-700')
          }
        >
          {item.altText?.trim() || 'No alt text'}
        </p>

        <div className="mt-1.5 flex items-center gap-1">
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

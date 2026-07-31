'use client'

import { useState, useTransition } from 'react'

import { deleteVendorMedia } from './media-actions'

/**
 * Remove a photograph from a listing.
 *
 * TWO CLICKS, NOT ONE, and no browser confirm(). This deletes a row somebody's listing depends on,
 * and confirm() cannot be styled, cannot be dismissed by clicking away, and is blocked outright in
 * some embedded browsers — a destructive action behind a dialog that might not appear is a
 * destructive action behind nothing. The button becoming its own confirmation is smaller and works
 * everywhere.
 *
 * It says what it actually does. The row goes; the file does not — deleting the object needs the
 * service-role key and a bucket we may not own, and a pasted https:// link is somebody else's file
 * entirely.
 */
export function RemoveMediaButton({
  vendorSlug,
  mediaId,
}: {
  vendorSlug: string
  mediaId: string
}) {
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-ink-500 hover:text-danger-700 inline-flex h-8 items-center px-2 text-xs font-medium transition-colors"
      >
        Remove
      </button>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await deleteVendorMedia(vendorSlug, mediaId)
            // Only an unhappy result needs saying — a success removes the tile it was attached to.
            if (result.status === 'error' || result.status === 'unconfigured') {
              setError(result.message)
              setArmed(false)
            }
          })
        }
        className="bg-danger-600 hover:bg-danger-700 inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-white transition-colors disabled:opacity-60"
      >
        {pending ? 'Removing…' : 'Confirm'}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-ink-600 hover:text-ink-900 inline-flex h-8 items-center px-2 text-xs"
      >
        Cancel
      </button>
      {error && (
        <span role="alert" className="text-danger-700 w-full text-xs leading-relaxed">
          {error}
        </span>
      )}
    </span>
  )
}

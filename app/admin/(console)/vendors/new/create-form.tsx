'use client'

import Link from 'next/link'
import { useActionState, useEffect, useMemo, useState } from 'react'

import { useAdminModalClose } from '@/components/admin-modal'
import type { RefCategory, RefCity } from '@/lib/admin-reference'

import { createVendorListing, type CreateVendorState } from './actions'

/**
 * File a new listing.
 *
 * A client component for three reasons, all of them real state rather than decoration:
 * the locality list depends on the chosen city, the URL slug is derived from the name until
 * someone overrides it, and the whole form has to survive a failed submit with what was typed
 * still in it.
 *
 * The slug behaviour is worth being deliberate about. It follows the name while untouched and
 * stops the moment the operator edits it — a field that keeps overwriting what you typed is
 * worse than one that never helped. `slugTouched` is what draws that line.
 *
 * NO STATUS CONTROL. Every listing starts as a draft because vendors_insert_field's WITH
 * CHECK says `status = 'draft'`, and going live carries §13's gates. Rendering a status
 * dropdown here would offer a choice the database refuses.
 */
export function CreateVendorForm({
  cities,
  categories,
  isLive,
}: {
  cities: RefCity[]
  categories: RefCategory[]
  isLive: boolean
}) {
  const [state, act, pending] = useActionState<CreateVendorState, FormData>(createVendorListing, {
    status: 'idle',
  })

  /**
   * Non-null inside a dialog, null on the standalone /admin/vendors/new page.
   *
   * That is how one implementation serves both: in a dialog it closes on success, because the
   * panel's three links are all redundant when the roster underneath already has the new draft in
   * it. On its own page there is nothing underneath, so the panel is the only feedback there is.
   */
  const closeDialog = useAdminModalClose()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [citySlug, setCitySlug] = useState(cities[0]?.slug ?? '')

  const localities = useMemo(
    () => cities.find((c) => c.slug === citySlug)?.localities ?? [],
    [cities, citySlug],
  )

  // Mirrors slugify() in actions.ts. The server still derives its own — this is a preview of
  // what will happen, not the value of record.
  const effectiveSlug = slugTouched ? slug : slugify(name)

  // In an effect, not inline: calling a parent's setState during render is the classic "cannot
  // update a component while rendering a different component".
  useEffect(() => {
    if (state.status === 'done') closeDialog?.()
  }, [state, closeDialog])

  if (state.status === 'done') {
    return closeDialog ? null : <Created message={state.message} slug={state.slug} />
  }

  return (
    <form action={act} className="space-y-6">
      <Section
        title="Who this is"
        note="The name is what customers see. The URL is permanent once the listing goes live — changing it later breaks every link and every indexed page."
      >
        <Field label="Listing name" htmlFor="displayName" required>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lightleak Studio"
            className={INPUT}
          />
        </Field>

        <Field label="Profile URL" htmlFor="slug" required>
          <div className="flex items-center gap-0 overflow-hidden rounded-md border border-ink-200 focus-within:border-ink-400">
            <span className="shrink-0 border-r border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-500">
              /vendor/
            </span>
            <input
              id="slug"
              name="slug"
              type="text"
              required
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(e.target.value)
              }}
              placeholder="lightleak-studio"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              className="w-full px-3 py-2 text-sm text-ink-900 outline-none"
            />
          </div>
          <Hint>
            {slugTouched
              ? 'Lowercase letters, numbers and single hyphens only.'
              : 'Following the name. Edit it and it stops.'}
          </Hint>
        </Field>

        <Field label="Legal name" htmlFor="legalName">
          <input
            id="legalName"
            name="legalName"
            type="text"
            placeholder="Lightleak Studios LLP"
            className={INPUT}
          />
          <Hint>
            Only if it differs from the listing name. Used on invoices and for KYC, never shown
            publicly.
          </Hint>
        </Field>
      </Section>

      <Section
        title="Where they work"
        note="Both are foreign keys, so this list is what the database actually holds. A field agent can only file a listing in a city their role covers — the save is what checks that."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="City" htmlFor="citySlug" required>
            <select
              id="citySlug"
              name="citySlug"
              required
              value={citySlug}
              onChange={(e) => setCitySlug(e.target.value)}
              className={INPUT}
            >
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}, {c.state}
                  {c.isLaunched ? '' : ' — not launched yet'}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Locality" htmlFor="localitySlug">
            <select id="localitySlug" name="localitySlug" className={INPUT}>
              <option value="">Not sure yet</option>
              {localities.map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.name}
                </option>
              ))}
            </select>
            <Hint>
              {localities.length === 0
                ? 'No localities recorded for this city yet — leave it blank.'
                : 'Drives the locality landing pages and distance-based ranking.'}
            </Hint>
          </Field>
        </div>

        <Field label="Address" htmlFor="addressLine">
          <input
            id="addressLine"
            name="addressLine"
            type="text"
            placeholder="2nd Floor, Vipul Khand, Gomti Nagar"
            className={INPUT}
          />
        </Field>
      </Section>

      <Section
        title="What they do"
        note="The category decides which enquiries this listing can ever be routed. It becomes the primary category, which is what the canonical profile URL is built from."
      >
        <Field label="Category" htmlFor="categorySlug" required>
          <select id="categorySlug" name="categorySlug" required className={INPUT} defaultValue="">
            <option value="" disabled>
              Choose one
            </option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <Hint>
            One to start with. More can be added from the listing afterwards — a caterer who
            also does decor is two categories, not one merged listing.
          </Hint>
        </Field>

        <Field label="About" htmlFor="about">
          <textarea
            id="about"
            name="about"
            rows={4}
            placeholder="What they do, how they work, how long they have been at it."
            className={INPUT}
          />
          <Hint>Shown on the public profile. Going live is gated on this being filled in.</Hint>
        </Field>

        <Field label="Price band, in rupees" htmlFor="priceBandMin">
          <div className="flex items-center gap-2">
            <input
              id="priceBandMin"
              name="priceBandMin"
              type="text"
              inputMode="numeric"
              placeholder="120000"
              className={INPUT}
            />
            <span className="shrink-0 text-sm text-ink-500">to</span>
            <input
              name="priceBandMax"
              type="text"
              inputMode="numeric"
              aria-label="Upper price band, in rupees"
              placeholder="350000"
              className={INPUT}
            />
          </div>
          <Hint>
            Typed in rupees, stored as integer paise. A launch gate and one of the most-used
            discovery filters — a listing without one is much harder to publish.
          </Hint>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Established" htmlFor="establishedYear">
            <input
              id="establishedYear"
              name="establishedYear"
              type="number"
              min={1900}
              max={new Date().getFullYear()}
              placeholder="2016"
              className={INPUT}
            />
          </Field>
          <Field label="Team size" htmlFor="teamSize">
            <input id="teamSize" name="teamSize" type="number" min={1} placeholder="4" className={INPUT} />
          </Field>
        </div>

        <label className="flex flex-wrap items-center gap-2 text-sm text-ink-800">
          <input type="checkbox" name="travelsOutstation" className="h-4 w-4" />
          Travels outstation
          <span className="text-xs text-ink-500">— what the destination-wedding filters search on</span>
        </label>
      </Section>

      <Section
        title="Where to find them online"
        note="Public links only. The vendor's phone number, email and WhatsApp are not on this form — see the note at the bottom of the page."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Website" htmlFor="websiteUrl">
            <input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              placeholder="https://lightleak.studio"
              className={INPUT}
            />
          </Field>
          <Field label="Instagram" htmlFor="instagramHandle">
            <input
              id="instagramHandle"
              name="instagramHandle"
              type="text"
              placeholder="lightleak.studio"
              className={INPUT}
            />
            <Hint>Handle only. The @ is stripped.</Hint>
          </Field>
        </div>
      </Section>

      {(state.status === 'error' || state.status === 'unconfigured') && (
        <p
          role="alert"
          className={
            'rounded-md border px-3 py-2.5 text-sm ' +
            (state.status === 'unconfigured'
              ? 'border-warning-500/40 bg-warning-50 text-warning-700'
              : 'border-danger-500/30 bg-danger-50 text-danger-700')
          }
        >
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
        >
          {pending ? 'Filing…' : 'Create as draft'}
        </button>
        <Link href="/admin/vendors" className="text-sm text-ink-600 hover:text-ink-900">
          Cancel
        </Link>
        {!isLive && (
          <span className="text-xs text-warning-700">
            No database attached — this will not write anything.
          </span>
        )}
      </div>
    </form>
  )
}

function Created({ message, slug }: { message: string; slug: string }) {
  return (
    <div className="rounded-lg border border-success-500/40 bg-success-50 p-5">
      <h2 className="font-display text-lg text-ink-900">Draft created</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700">{message}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`/admin/vendors/${slug}`}
          className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800"
        >
          Open the listing
        </Link>
        {/* A fresh mount, so every field is empty — a "create another" that keeps the last
            vendor's price band in the box is how two studios end up with one band. */}
        <Link
          href="/admin/vendors/new"
          className="rounded-md border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink-800 hover:bg-ink-50"
        >
          Create another
        </Link>
        <Link
          href="/admin/vendors?status=draft&category=all"
          className="rounded-md px-4 py-2 text-sm text-ink-600 hover:text-ink-900"
        >
          All drafts
        </Link>
      </div>
    </div>
  )
}

const INPUT =
  'w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-ink-400'

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="rounded-lg border border-ink-200 bg-white p-5">
      <legend className="px-1 font-display text-base text-ink-900">{title}</legend>
      {note && <p className="mb-5 max-w-2xl text-xs leading-relaxed text-ink-500">{note}</p>}
      <div className="space-y-5">{children}</div>
    </fieldset>
  )
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-500"
      >
        {label}
        {required && (
          <span className="ml-1 font-normal normal-case tracking-normal text-danger-700">
            required
          </span>
        )}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{children}</p>
}

/** Mirrors slugify() in actions.ts. Preview only — the server derives its own. */
function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

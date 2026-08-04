import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader, Panel, Pill } from '@/components/admin-ui'
import { getAdminVendors } from '@/lib/admin-data'

import { getVendorCategoryDetails } from '@/lib/admin-vendor-attributes'

import { VendorDetailsForm } from '../details-form'
import { VendorStatusControls } from '../status-controls'
import { VendorAttributesForm } from './attributes-form'
import { VendorMediaPanel } from './media-panel'

export const metadata = { title: 'Vendor' }

export default async function AdminVendorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const vendor = getAdminVendors().find((v) => v.slug === slug)
  if (!vendor) notFound()

  // The listing's primary category decides which questions the section below asks.
  const details = await getVendorCategoryDetails(vendor.slug, vendor.category)

  const blockers = [
    vendor.mediaCount < 5 ? `Only ${vendor.mediaCount} photos — needs 5` : null,
    vendor.profileScore < 60 ? `Profile score ${vendor.profileScore} — needs 60` : null,
    vendor.kyc !== 'verified' ? `KYC is ${vendor.kyc.replace(/_/g, ' ')} — payouts blocked` : null,
  ].filter(Boolean) as string[]

  return (
    <>
      <Link
        href="/admin/vendors"
        className="text-ink-500 hover:text-ink-800 mb-4 inline-block text-sm"
      >
        ← Back to vendors
      </Link>

      <PageHeader
        title={vendor.name}
        description={`${vendor.locality}, ${vendor.city} · ${vendor.category}`}
        action={
          <div className="flex gap-2">
            {vendor.isAnchor && <Pill tone="amber">Fremmo-owned studio</Pill>}
            <Pill tone={vendor.status === 'live' ? 'green' : 'neutral'}>
              {vendor.status.replace(/_/g, ' ')}
            </Pill>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Panel className="p-5">
            <h2 className="font-display text-ink-900 text-lg">Listing quality</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                ['Profile score', `${vendor.profileScore}/100`],
                ['Photos', String(vendor.mediaCount)],
                ['Receives leads', vendor.seoEligible ? 'Yes' : 'No'],
                ['KYC', vendor.kyc.replace(/_/g, ' ')],
                [
                  'Rating',
                  vendor.ratingAvg == null
                    ? 'No reviews'
                    : `${vendor.ratingAvg.toFixed(1)} (${vendor.ratingCount})`,
                ],
                ['Category', vendor.category],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-ink-500 text-xs tracking-wide uppercase">{k}</dt>
                  <dd className="text-ink-900 mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            {blockers.length > 0 && (
              <div className="border-warning-500/30 bg-warning-50 mt-5 rounded-lg border p-3">
                <p className="text-warning-700 text-sm font-semibold">Blocking go-live</p>
                <ul className="text-warning-700 mt-1.5 list-inside list-disc text-sm">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          {/* The only form in this console that edits the listing rather than moving its
              state. It goes through the same audit path, so the change lands on record with
              the patch that was applied — plan §3 makes that log the point of the console. */}
          <Panel className="p-5">
            <h2 className="font-display text-ink-900 text-lg">Listing details</h2>
            <p className="text-ink-600 mt-1 text-sm">
              Editable copy. Status, scores and ratings are not here — the first moves through the
              controls on the right so every change carries a reason, and the rest are derived
              columns the database refuses a write to.
            </p>
            <div className="mt-5">
              <VendorDetailsForm
                slug={vendor.slug}
                displayName={vendor.name}
                about={vendor.about ?? null}
                priceBandMinPaise={vendor.priceBandMinPaise ?? null}
                priceBandMaxPaise={vendor.priceBandMaxPaise ?? null}
                establishedYear={vendor.establishedYear ?? null}
                teamSize={vendor.teamSize ?? null}
                travelsOutstation={vendor.travelsOutstation ?? false}
              />
            </div>
          </Panel>

          {/*
            The half of a listing that differs by what it actually is.

            Everything in the panel above is true of a photographer, a caterer and a banquet lawn
            alike. This one asks a venue for its seated capacity, a caterer for its per-plate rates,
            a makeup artist whether she travels to the venue on the morning — the questions a
            customer decides on, which the generic fields cannot express.
          */}
          <Panel className="p-5">
            <h2 className="font-display text-ink-900 text-lg">{details.categoryName} details</h2>
            {details.isDemo && (
              <p className="border-warning-500/40 bg-warning-50 text-warning-700 mt-3 rounded-md border px-3 py-2.5 text-sm leading-relaxed">
                Sample answers — no Supabase instance is attached, so saving will not write
                anything.
              </p>
            )}
            <div className="mt-4">
              <VendorAttributesForm
                vendorSlug={vendor.slug}
                categorySlug={details.categorySlug}
                categoryName={details.categoryName}
                values={details.values}
              />
            </div>
          </Panel>

          {vendor.isAnchor && (
            <Panel className="border-accent-300 bg-accent-50 p-5">
              <h2 className="font-display text-accent-900 text-base">
                This is the founder&rsquo;s studio
              </h2>
              <p className="text-accent-800 mt-1.5 text-sm">
                It is ranked by the same SQL as every other listing, carries a public disclosure
                badge, and is capped at roughly 5% of category bookings. Any moderation decision
                affecting it should be escalated rather than taken by whoever happens to pick it up.
              </p>
            </Panel>
          )}
        </div>

        <Panel className="h-fit p-5">
          <h2 className="font-display text-ink-900 text-lg">Status</h2>
          <p className="text-ink-600 mt-1 text-sm">
            Transitions are recorded in the audit log with your identity.
          </p>

          {/*
            The buttons live in a client component because they carry the reason text and
            the suspension confirmation. Every branch they render is re-checked server-side
            against the row as it stands at write time — see ../actions.ts.
          */}
          <VendorStatusControls
            slug={vendor.slug}
            displayName={vendor.name}
            status={vendor.status}
            isAnchor={vendor.isAnchor}
          />
        </Panel>
      </div>

      {/*
        Full width, below the two columns. The gallery is the widest thing on this screen — a grid
        of image tiles squeezed into the left column would show two per row and turn a five-photo
        check into scrolling.

        It takes the same categorySlug as the details form above, so a venue's gallery asks for
        venue photos and which space each one shows, not "photographs" and "style tags".
      */}
      <VendorMediaPanel vendorSlug={vendor.slug} categorySlug={details.categorySlug} />
    </>
  )
}

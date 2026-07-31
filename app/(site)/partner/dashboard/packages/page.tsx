import type { Metadata } from 'next'
import Link from 'next/link'

import { formatPaise, formatPerDay, type UtsavaClient } from '@/lib/db'
import { Badge, Card, CardBody } from '@/components/ui'

import { PACKAGES } from '@/lib/fixtures'
import { getCategories } from '@/lib/queries'
import { getServerClientOrNull } from '@/lib/supabase'

// Only components and types are imported from the client module. A server component
// cannot dot into a plain object exported from a 'use client' file — React hands it a
// client reference, not the value — so the blank package below is built here instead.
import {
  DeactivatePackageButton,
  PackageForm,
  type PackageCategoryOption,
  type PackageFormValues,
} from './package-form'

export const metadata: Metadata = {
  title: 'Packages',
  robots: { index: false, follow: false },
}

/**
 * Package editor. Plan §S4: "package cards"; plan §2 requires them "normalised to
 * per-day pricing" so a three-day quote and a single day can be compared honestly.
 *
 * A vendor's own packages are read through the same `packages_manage` policy that lets
 * them write — which is why inactive rows appear here and nowhere on the public site.
 * Nothing on this screen bypasses RLS.
 */
export default async function PartnerPackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const edit = typeof params.edit === 'string' ? params.edit : undefined

  const [categories, load] = await Promise.all([getCategories(), loadPackages()])

  const categoryOptions: PackageCategoryOption[] = categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    pricingUnit: c.pricingUnit,
    styleTags: c.styleTags,
  }))

  if (load.kind === 'unlinked') {
    return (
      <Notice
        title="No listing linked to this account yet"
        body="Packages belong to a listing. Ask whoever set up your studio on Utsava to invite this number as an owner or manager, then this screen will open."
      />
    )
  }

  if (load.kind === 'error') {
    return <Notice title="Could not load your packages" body={load.message} />
  }

  const packages = load.packages

  // ---- One package, open for editing ----
  if (edit && edit !== 'new') {
    const target = packages.find((p) => p.id === edit)
    if (!target) {
      return (
        <Notice
          title="That package is no longer on your listing"
          body="It may have been removed from another device."
          backLink
        />
      )
    }

    return (
      <div className="space-y-6">
        <Header
          title={target.name}
          description="Changes appear on your listing as soon as you save."
          backLink
        />
        <PackageForm mode="edit" values={toFormValues(target)} categories={categoryOptions} />
      </div>
    )
  }

  // ---- A new package ----
  if (edit === 'new') {
    return (
      <div className="space-y-6">
        <Header
          title="Add a package"
          description="Two or three packages is plenty. Couples compare the per-day figure, so a longer package priced well tends to win."
          backLink
        />
        <PackageForm
          mode="create"
          values={blankPackage(categoryOptions[0]?.slug ?? '')}
          categories={categoryOptions}
        />
      </div>
    )
  }

  // ---- The list ----
  const active = packages.filter((p) => p.isActive)
  const hidden = packages.filter((p) => !p.isActive)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink-900">Packages</h1>
          <p className="mt-1.5 max-w-2xl text-ink-600">
            Every package shows a per-day price alongside the total, because that is what a
            couple compares you on when your quote covers three days and someone else&rsquo;s
            covers one.
          </p>
        </div>
        <Link
          href="/partner/dashboard/packages?edit=new"
          className="inline-flex h-11 items-center rounded-lg bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700"
        >
          Add a package
        </Link>
      </div>

      {load.kind === 'demo' && (
        <p className="rounded-lg border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-700">
          These are sample packages. Connect a Supabase instance to edit your real ones.
        </p>
      )}

      {packages.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <p className="font-display text-lg text-ink-900">No packages yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-600">
              A listing with at least one package earns 15 points towards the completeness
              score, and enquiries mentioning a package convert roughly twice as often.
            </p>
            <Link
              href="/partner/dashboard/packages?edit=new"
              className="mt-5 inline-flex h-11 items-center rounded-lg bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700"
            >
              Add your first package
            </Link>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {active.map((p) => (
            <PackageRow key={p.id} pkg={p} />
          ))}

          {hidden.length > 0 && (
            <div className="pt-4">
              <h2 className="mb-3 text-xs uppercase tracking-[0.14em] text-ink-500">
                Hidden from customers
              </h2>
              <div className="space-y-3">
                {hidden.map((p) => (
                  <PackageRow key={p.id} pkg={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PackageRow({ pkg }: { pkg: PartnerPackage }) {
  const days = pkg.durationDays === 1 ? '1 day' : `${pkg.durationDays} days`

  return (
    <Card className={pkg.isActive ? undefined : 'opacity-70'}>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg text-ink-900">{pkg.name}</h3>
              {!pkg.isActive && <Badge tone="neutral">Hidden</Badge>}
            </div>

            {pkg.description && (
              <p className="mt-1 line-clamp-2 text-sm text-ink-600">{pkg.description}</p>
            )}

            <p className="mt-2 text-sm text-ink-500">
              {days}
              {pkg.crewSize ? ` · ${pkg.crewSize} crew` : ''}
              {pkg.editedPhotoCount ? ` · ${pkg.editedPhotoCount} edited photos` : ''}
              {pkg.deliveryDays ? ` · delivered in ${pkg.deliveryDays} days` : ''}
            </p>

            {pkg.styleTags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {pkg.styleTags.map((t) => (
                  <Badge key={t} tone="accent" className="capitalize">
                    {t.replace(/-/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 text-right">
            <p className="font-display text-xl text-ink-900">
              {formatPaise(pkg.price, { compact: false })}
            </p>
            <p className="text-xs text-ink-500">{formatPerDay(pkg.pricePerDay)}</p>

            <div className="mt-3 flex flex-col items-end gap-1">
              <Link
                href={`/partner/dashboard/packages?edit=${pkg.id}`}
                className="inline-flex h-9 items-center rounded-lg border border-ink-200 bg-surface-raised px-4 text-sm font-medium text-ink-800 hover:border-ink-300"
              >
                Edit
              </Link>
              {pkg.isActive && (
                <DeactivatePackageButton packageId={pkg.id} packageName={pkg.name} />
              )}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function Header({
  title,
  description,
  backLink,
}: {
  title: string
  description: string
  backLink?: boolean
}) {
  return (
    <div>
      {backLink && (
        <Link
          href="/partner/dashboard/packages"
          className="text-sm text-ink-600 hover:text-ink-900"
        >
          ← All packages
        </Link>
      )}
      <h1 className="mt-1 font-display text-2xl text-ink-900">{title}</h1>
      <p className="mt-1.5 max-w-2xl text-ink-600">{description}</p>
    </div>
  )
}

function Notice({
  title,
  body,
  backLink,
}: {
  title: string
  body: string
  backLink?: boolean
}) {
  return (
    <Card>
      <CardBody className="py-12 text-center">
        <p className="font-display text-lg text-ink-900">{title}</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-600">{body}</p>
        {backLink && (
          <Link
            href="/partner/dashboard/packages"
            className="mt-4 inline-block text-sm text-primary-700 hover:text-primary-800"
          >
            ← All packages
          </Link>
        )}
      </CardBody>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface PartnerPackage {
  id: string
  name: string
  description: string
  categorySlug: string
  styleTags: string[]
  /** Paise, both of them. price_per_day is generated by the database (plan §2). */
  price: number
  pricePerDay: number
  pricingUnit: string
  durationDays: number
  crewSize: number | null
  editedPhotoCount: number | null
  deliveryDays: number | null
  deliverables: string[]
  inclusions: string[]
  exclusions: string[]
  isActive: boolean
}

type PackageLoad =
  | { kind: 'live' | 'demo'; packages: PartnerPackage[] }
  | { kind: 'unlinked' }
  | { kind: 'error'; message: string }

async function loadPackages(): Promise<PackageLoad> {
  const supabase = await getServerClientOrNull()
  // No instance configured: the layout already says so, and the sample rows keep the
  // screen reviewable. Saving from here returns an 'unconfigured' state rather than
  // pretending to write.
  if (!supabase) return { kind: 'demo', packages: demoPackages() }

  const vendorId = await activeVendorId(supabase)
  if (!vendorId) return { kind: 'unlinked' }

  const [{ data: rows, error }, { data: cats }] = await Promise.all([
    supabase
      .from('packages')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('sort_order')
      .order('price'),
    supabase.from('categories').select('id, slug'),
  ])

  if (error) return { kind: 'error', message: error.message }

  const slugById = new Map((cats ?? []).map((c) => [c.id, c.slug]))

  return {
    kind: 'live',
    packages: (rows ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      categorySlug: slugById.get(p.category_id) ?? '',
      styleTags: p.style_tags ?? [],
      price: p.price,
      pricePerDay: p.price_per_day,
      pricingUnit: p.pricing_unit,
      durationDays: Number(p.duration_days),
      crewSize: p.crew_size,
      editedPhotoCount: p.edited_photo_count,
      deliveryDays: p.delivery_days,
      deliverables: p.deliverables ?? [],
      inclusions: p.inclusions ?? [],
      exclusions: p.exclusions ?? [],
      isActive: p.is_active,
    })),
  }
}

/** The same demo studio the rest of the partner dashboard shows. */
function demoPackages(): PartnerPackage[] {
  return PACKAGES.filter((p) => p.vendorSlug === 'lightleak-studio').map((p, i) => ({
    id: `demo-package-${i + 1}`,
    name: p.name,
    description: p.description,
    categorySlug: 'photography',
    styleTags: [],
    price: p.price,
    pricePerDay: p.pricePerDay,
    pricingUnit: 'per_day',
    durationDays: p.durationDays,
    crewSize: p.crewSize,
    editedPhotoCount: p.editedPhotoCount,
    deliveryDays: p.deliveryDays,
    deliverables: p.deliverables,
    inclusions: p.inclusions,
    exclusions: [],
    isActive: true,
  }))
}

function blankPackage(categorySlug: string): PackageFormValues {
  return {
    id: null,
    name: '',
    description: '',
    categorySlug,
    styleTags: [],
    price: null,
    pricingUnit: 'per_day',
    durationDays: 1,
    crewSize: null,
    editedPhotoCount: null,
    deliveryDays: null,
    deliverables: [],
    inclusions: [],
    exclusions: [],
    isActive: true,
  }
}

function toFormValues(pkg: PartnerPackage): PackageFormValues {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    categorySlug: pkg.categorySlug,
    styleTags: pkg.styleTags,
    price: pkg.price,
    pricingUnit: pkg.pricingUnit,
    durationDays: pkg.durationDays,
    crewSize: pkg.crewSize,
    editedPhotoCount: pkg.editedPhotoCount,
    deliveryDays: pkg.deliveryDays,
    deliverables: pkg.deliverables,
    inclusions: pkg.inclusions,
    exclusions: pkg.exclusions,
    isActive: pkg.isActive,
  }
}

interface VendorMembershipRow {
  vendor_id: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}

/**
 * public.vendor_members is absent from packages/db's hand-authored database.types.ts,
 * which covers only the read surface apps/web needed until now. Narrowing the client
 * here keeps the lookup typed without editing a file `pnpm db:types` will regenerate
 * wholesale — the same workaround app/enquire/otp-actions.ts uses for the `app` schema.
 * RLS (vendor_members_select_member) still decides which rows come back.
 */
interface MembershipClient {
  from(table: 'vendor_members'): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): PromiseLike<{
        data: VendorMembershipRow[] | null
        error: { message: string } | null
      }>
    }
  }
}

/** Plan §3: one human, many contexts — oldest accepted membership until a switcher exists. */
async function activeVendorId(supabase: UtsavaClient): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const { data } = await (supabase as unknown as MembershipClient)
    .from('vendor_members')
    .select('vendor_id, accepted_at, revoked_at, created_at')
    .eq('profile_id', auth.user.id)

  const active = (data ?? [])
    .filter((m) => m.revoked_at === null && m.accepted_at !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  return active[0]?.vendor_id ?? null
}

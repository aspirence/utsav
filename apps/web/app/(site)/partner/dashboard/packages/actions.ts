'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { packageSchema, rupeesToPaise, type UtsavaClient } from '@utsava/db'

import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/supabase'

/**
 * Package editor. Plan §S4 ships package cards; plan §2 requires them "normalised to
 * per-day pricing" so a one-day quote and a three-day quote can be compared honestly.
 *
 * packages.price_per_day does that normalisation and is a GENERATED ALWAYS column:
 *
 *     price_per_day bigint generated always as
 *                   ((price / greatest(duration_days, 0.5))::bigint) stored
 *
 * It is never written from here — Postgres rejects the attempt, and the generated
 * Insert type for `packages` omits it so the mistake fails at build time instead. The
 * form shows the same figure live while the vendor types, computed with the identical
 * expression, so nobody is surprised by the number customers end up comparing.
 *
 * Everything else is ordinary RLS: `packages_manage` lets a manager or owner write rows
 * for their own vendor, and nothing else.
 */

export interface PackageState {
  status: 'idle' | 'created' | 'saved' | 'deactivated' | 'error' | 'unconfigured'
  message?: string
  fieldErrors?: Record<string, string[]>
  packageId?: string
}

const packageIdSchema = z.string().uuid('That package no longer exists.')

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createPackage(
  _prev: PackageState,
  formData: FormData,
): Promise<PackageState> {
  const parsed = packageSchema.safeParse(readPackageForm(formData))
  if (!parsed.success) return fieldErrorState(parsed.error)

  const ready = await prepare()
  if ('state' in ready) return ready.state
  const { supabase, vendorId } = ready

  const category = await categoryId(supabase, parsed.data.categorySlug)
  if (!category) {
    return { status: 'error', message: 'That category is no longer available.' }
  }

  const { data, error } = await supabase
    .from('packages')
    .insert({
      vendor_id: vendorId,
      category_id: category,
      // price_per_day is absent on purpose — see the note at the top of this file.
      ...columnsFrom(parsed.data),
      is_active: true,
    })
    .select('id')
    .maybeSingle()

  if (error) return { status: 'error', message: writeErrorMessage(error) }
  if (!data) {
    return {
      status: 'error',
      message: 'Nothing was saved — your account may no longer manage this listing.',
    }
  }

  revalidateVendorSurfaces()
  return {
    status: 'created',
    packageId: data.id,
    message: `“${parsed.data.name}” is on your listing.`,
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updatePackage(
  _prev: PackageState,
  formData: FormData,
): Promise<PackageState> {
  const id = packageIdSchema.safeParse(String(formData.get('packageId') ?? ''))
  if (!id.success) {
    return { status: 'error', message: 'That package could not be found. Try reloading.' }
  }

  const parsed = packageSchema.safeParse(readPackageForm(formData))
  if (!parsed.success) return fieldErrorState(parsed.error)

  const ready = await prepare()
  if ('state' in ready) return ready.state
  const { supabase, vendorId } = ready

  const category = await categoryId(supabase, parsed.data.categorySlug)
  if (!category) {
    return { status: 'error', message: 'That category is no longer available.' }
  }

  const { data, error } = await supabase
    .from('packages')
    .update({
      category_id: category,
      ...columnsFrom(parsed.data),
      // The edit form carries this checkbox explicitly, so an unticked box is a
      // deliberate "stop showing this", not an accident of the payload shape.
      is_active: formData.get('isActive') === 'on',
    })
    .eq('id', id.data)
    .eq('vendor_id', vendorId)
    .select('id')
    .maybeSingle()

  if (error) return { status: 'error', message: writeErrorMessage(error) }
  if (!data) {
    return { status: 'error', message: 'That package is not on your listing any more.' }
  }

  revalidateVendorSurfaces()
  return { status: 'saved', packageId: data.id, message: `“${parsed.data.name}” is updated.` }
}

// ---------------------------------------------------------------------------
// Deactivate. Soft, never a delete: quotes and bookings reference this row.
// ---------------------------------------------------------------------------

export async function deactivatePackage(
  _prev: PackageState,
  formData: FormData,
): Promise<PackageState> {
  const id = packageIdSchema.safeParse(String(formData.get('packageId') ?? ''))
  if (!id.success) {
    return { status: 'error', message: 'That package could not be found. Try reloading.' }
  }

  const ready = await prepare()
  if ('state' in ready) return ready.state
  const { supabase, vendorId } = ready

  const { data, error } = await supabase
    .from('packages')
    .update({ is_active: false })
    .eq('id', id.data)
    .eq('vendor_id', vendorId)
    .select('id, name')
    .maybeSingle()

  if (error) return { status: 'error', message: writeErrorMessage(error) }
  if (!data) {
    return { status: 'error', message: 'That package is not on your listing any more.' }
  }

  revalidateVendorSurfaces()
  return {
    status: 'deactivated',
    packageId: data.id,
    message: `“${data.name}” is hidden from customers. Nothing already quoted is affected.`,
  }
}

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

type PackageInput = z.infer<typeof packageSchema>

/** Everything except vendor_id, category_id and is_active — and never price_per_day. */
function columnsFrom(p: PackageInput) {
  return {
    name: p.name,
    description: p.description ?? null,
    style_tags: p.styleTags,
    price: p.price,
    pricing_unit: p.pricingUnit,
    duration_days: p.durationDays,
    crew_size: p.crewSize ?? null,
    edited_photo_count: p.editedPhotoCount ?? null,
    delivery_days: p.deliveryDays ?? null,
    deliverables: p.deliverables,
    inclusions: p.inclusions,
    exclusions: p.exclusions,
  }
}

function readPackageForm(formData: FormData) {
  return {
    name: String(formData.get('name') ?? ''),
    description: str(formData.get('description')),
    categorySlug: String(formData.get('categorySlug') ?? ''),
    styleTags: formData.getAll('styleTags').map(String),
    // The form collects rupees; the database stores paise (plan §5).
    price: rupeesField(formData.get('price')),
    pricingUnit: String(formData.get('pricingUnit') ?? 'per_day'),
    durationDays: num(formData.get('durationDays')) ?? 1,
    crewSize: num(formData.get('crewSize')),
    editedPhotoCount: num(formData.get('editedPhotoCount')),
    deliveryDays: num(formData.get('deliveryDays')),
    deliverables: lines(formData.get('deliverables')),
    inclusions: lines(formData.get('inclusions')),
    exclusions: lines(formData.get('exclusions')),
  }
}

interface Ready {
  supabase: UtsavaClient
  vendorId: string
}

/** Env check, client, and "which listing is this?" — the same preamble for all three. */
async function prepare(): Promise<Ready | { state: PackageState }> {
  if (!hasSupabaseEnv()) {
    return {
      state: {
        status: 'unconfigured',
        message:
          'The package validated correctly, but no Supabase instance is connected yet, so ' +
          'nothing was saved. Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to edit ' +
          'the real listing.',
      },
    }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { state: { status: 'error', message: 'Could not reach the database. Please try again.' } }
  }

  const membership = await activeMembership(supabase)
  if (!membership) {
    return {
      state: {
        status: 'error',
        message: 'This account is not linked to a listing yet. Ask your team owner for an invite.',
      },
    }
  }
  if (membership.role === 'responder') {
    return {
      state: {
        status: 'error',
        message:
          'Responders can reply to leads but cannot change packages. Ask an owner or manager.',
      },
    }
  }

  return { supabase, vendorId: membership.vendorId }
}

async function categoryId(supabase: UtsavaClient, slug: string): Promise<string | null> {
  const { data } = await supabase.from('categories').select('id').eq('slug', slug).maybeSingle()
  return data?.id ?? null
}

function revalidateVendorSurfaces(): void {
  revalidatePath('/partner/dashboard/packages')
  revalidatePath('/partner/dashboard/profile')
}

interface VendorMembershipRow {
  vendor_id: string
  role: 'owner' | 'manager' | 'responder'
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
async function activeMembership(
  supabase: UtsavaClient,
): Promise<{ vendorId: string; role: VendorMembershipRow['role'] } | null> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const { data } = await (supabase as unknown as MembershipClient)
    .from('vendor_members')
    .select('vendor_id, role, accepted_at, revoked_at, created_at')
    .eq('profile_id', auth.user.id)

  const active = (data ?? [])
    .filter((m) => m.revoked_at === null && m.accepted_at !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const first = active[0]
  return first ? { vendorId: first.vendor_id, role: first.role } : null
}

function fieldErrorState(error: z.ZodError): PackageState {
  return {
    status: 'error',
    message: 'Please check the highlighted fields.',
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  }
}

function writeErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === '42501') {
    return 'The database refused that change. Only an owner or manager may edit packages.'
  }
  return `Could not save this package: ${error.message}`
}

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value == null ? '' : String(value).trim()
  return s === '' ? undefined : s
}

function num(value: FormDataEntryValue | null): number | undefined {
  const s = str(value)
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function rupeesField(value: FormDataEntryValue | null): number | undefined {
  const n = num(value)
  return n == null ? undefined : rupeesToPaise(n)
}

/** Deliverables and inclusions are typed one per line; blank lines are not items. */
function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

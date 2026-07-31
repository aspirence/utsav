'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

import { createUtsavaServerClient, hasSupabaseEnv, slugSchema } from '@utsava/db'

import { CATEGORY_ATTRIBUTES, coerceAttributes } from '@/lib/category-attributes'

/**
 * Save a listing's category-specific details.
 *
 * A venue's seated capacity, a caterer's per-plate rate, a makeup artist's trial charge — the
 * questions that differ by what the listing actually is. They live in
 * `vendor_categories.attributes` (migration 20260730000300), keyed to the vendor *in a category*,
 * so a farmhouse that also caters keeps one set of answers per row rather than one muddled set.
 *
 * VALIDATION IS DRIVEN BY THE FIELD DEFINITIONS, not by a schema written twice. The same
 * lib/category-attributes.ts that the form renders from is what checks the submission here, so a
 * field cannot exist on screen without a rule behind it, and adding a question is one line rather
 * than two that can disagree.
 *
 * THE CATEGORY IS READ FROM THE DATABASE, never from the form. A posted category slug would let a
 * caller submit venue fields against a photographer and have them validated as venue fields — the
 * listing's own primary category is the only thing that decides which set applies.
 *
 * Writes go through the operator's own session. `vendor_categories_manage` admits a vendor's
 * manager or staff at field_agent and up; plan §6 keeps RLS as the boundary and a zero-row result
 * is what refusal looks like.
 */

export type AttributesActionState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

export async function saveVendorAttributes(
  _prev: AttributesActionState,
  form: FormData,
): Promise<AttributesActionState> {
  const slugCheck = slugSchema.safeParse(text(form.get('vendorSlug')))
  if (!slugCheck.success) {
    return { status: 'error', message: 'That listing reference is not valid.' }
  }
  const vendorSlug = slugCheck.data

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'No Supabase instance is connected, so nothing was saved. These are sample details — run ' +
        '`pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to edit real ones.',
    }
  }

  const supabase = await staffClient()
  if (!supabase) return { status: 'error', message: 'Could not reach the database.' }

  /*
   * Resolve the listing and its primary category in one hop.
   *
   * Two queries rather than an embed, for the reason the rest of this console does it: the
   * hand-authored database.types.ts declares `Relationships: []`, so postgrest types a nested
   * select as a SelectQueryError.
   */
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('slug', vendorSlug)
    .maybeSingle()

  if (!vendor) {
    return {
      status: 'error',
      message:
        'That listing is not visible to your account. Field agents are scoped to their own city.',
    }
  }

  const { data: links } = await supabase
    .from('vendor_categories')
    .select('id, category_id, is_primary')
    .eq('vendor_id', vendor.id)

  const primary = links?.find((l) => l.is_primary) ?? links?.[0]
  if (!primary) {
    return {
      status: 'error',
      message:
        'This listing has no category attached, so there is nothing category-specific to ask. ' +
        'Set its category first.',
    }
  }

  const { data: category } = await supabase
    .from('categories')
    .select('slug, name')
    .eq('id', primary.category_id)
    .maybeSingle()

  const categorySlug = category?.slug ?? ''
  if (!CATEGORY_ATTRIBUTES[categorySlug]) {
    return {
      status: 'error',
      message: `There are no category-specific details defined for ${category?.name ?? 'this category'} yet.`,
    }
  }

  const coerced = coerceAttributes(
    categorySlug,
    (key) => text(form.get(`attr_${key}`)),
    (key) => form.get(`attr_${key}`) === 'on',
  )
  if (!coerced.ok) return { status: 'error', message: coerced.message }

  const { data, error } = await supabase
    .from('vendor_categories')
    .update({ attributes: coerced.values })
    .eq('id', primary.id)
    .select('id')

  if (error) {
    if (error.code === '42501' || error.message.includes('row-level security')) {
      return { status: 'error', message: 'Your staff role does not allow editing this listing.' }
    }
    return { status: 'error', message: `Could not save those details: ${error.message}` }
  }

  if (!data || data.length === 0) {
    return {
      status: 'error',
      message:
        'The database refused that change. Editing a listing needs a staff role or membership of ' +
        'the vendor’s own team.',
    }
  }

  revalidatePath(`/admin/vendors/${vendorSlug}`)
  // The public listing renders these, so a stale page here is a stale page there.
  revalidatePath(`/vendor/${vendorSlug}`)

  return { status: 'done', message: `${category?.name ?? 'Listing'} details saved.` }
}

async function staffClient() {
  try {
    const store = await cookies()
    return createUtsavaServerClient({
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value, options } of list) store.set(name, value, options)
      },
    })
  } catch {
    return null
  }
}

function text(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

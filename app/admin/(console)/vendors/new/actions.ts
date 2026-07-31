'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

import { createUtsavaServerClient, hasSupabaseEnv, slugSchema } from '@/lib/db'

/**
 * Create a listing. Plan §S3: "the field team creates listings; the principal claims via
 * OTP (§3)."
 *
 * FIVE THINGS THE DATABASE DECIDES, NOT THIS FILE.
 *
 * 1. WHO. `vendors_insert_field` (migration 001300) admits `field_agent` and `super` only —
 *    a moderator cannot create a listing, only move one that exists. That is deliberate:
 *    the person who approves supply should not also be the person who invents it. So this
 *    screen is not available to every staff member, and the error below says which role is
 *    missing rather than "permission denied".
 *
 * 2. WHERE. The same policy requires `app.staff_covers_city(city_id)`. A field agent in
 *    Lucknow cannot file a Delhi listing. The city dropdown shows every city because the
 *    console cannot read another agent's coverage — the insert is what tests it.
 *
 * 3. WHAT STATE. `and status = 'draft'` is in the policy's WITH CHECK, so a new listing is
 *    always a draft. There is no "create and publish" here and there should not be: going
 *    live is a moderator's decision with §13's gates attached to it (five photos, price
 *    bands, profile score 60).
 *
 * 4. THE NUMBERS. `profile_score`, `media_count`, `rating_avg`, `is_seo_eligible` are
 *    maintained by trigger and app.guard_vendor_columns() rejects a write. A new listing
 *    starts at zero on all of them, which is why it cannot be published the moment it is
 *    made.
 *
 * 5. THE PRIVATE ROW. `vendors_create_private` fires after insert and creates the
 *    vendor_private row, so the vendor's contact details have somewhere to live later.
 *
 * WHY THERE IS NO CONTACT PHONE FIELD ON THIS FORM.
 *
 * The obvious thing for a field agent standing in a studio is to type the owner's number.
 * They cannot: `vendor_private_write_staff` is `app.is_staff('super', 'finance')`, and
 * `vendor_private_update_owner` needs vendor membership the new listing has nobody in yet.
 * A field agent therefore has write access to neither, and adding the field would produce a
 * form that looks like it saved a phone number and did not.
 *
 * Widening that policy is a real decision about who may hold a vendor's personal number
 * before they have consented to anything, so it is not something to slip into a form. Left
 * out, and said out loud on the screen.
 */

export type CreateVendorState =
  | { status: 'idle' }
  | { status: 'done'; message: string; slug: string }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * `citySlug` and `categorySlug` rather than ids.
 *
 * The form could post the uuids it was given, but then a stale page could post an id that no
 * longer exists and get a foreign-key error, and a hand-crafted request could post any uuid
 * at all. Resolving the slug server-side means the id always comes from a row that exists
 * right now, and `slugSchema` already constrains the shape.
 */
const createSchema = z
  .object({
    displayName: z.string().trim().min(2, 'A listing needs a name').max(120),
    slug: slugSchema,
    citySlug: slugSchema,
    localitySlug: slugSchema.optional(),
    categorySlug: slugSchema,
    legalName: z.string().trim().max(200).optional(),
    addressLine: z.string().trim().max(300).optional(),
    about: z.string().trim().max(4000).optional(),
    websiteUrl: z
      .string()
      .trim()
      .max(300)
      .refine((v) => /^https?:\/\//.test(v), 'A website has to start with http:// or https://')
      .optional(),
    // Stored without the @, which is how every other consumer of this column reads it.
    instagramHandle: z
      .string()
      .trim()
      .max(60)
      .transform((v) => v.replace(/^@+/, ''))
      .refine((v) => /^[A-Za-z0-9._]+$/.test(v), 'An Instagram handle is letters, numbers, dots and underscores')
      .optional(),
    priceBandMin: z.number().int().nonnegative().optional(),
    priceBandMax: z.number().int().nonnegative().optional(),
    establishedYear: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional(),
    teamSize: z.coerce.number().int().positive().max(500).optional(),
    travelsOutstation: z.boolean(),
  })
  // Mirrors vendors_price_band_ordered, so the operator reads a sentence rather than a
  // Postgres constraint name.
  .refine(
    (d) => d.priceBandMin == null || d.priceBandMax == null || d.priceBandMin <= d.priceBandMax,
    { message: 'The lower price band has to be the smaller number' },
  )

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function createVendorListing(
  _prev: CreateVendorState,
  form: FormData,
): Promise<CreateVendorState> {
  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'This is the demo console — no Supabase instance is connected, so nothing was created. ' +
        'Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to file real listings.',
    }
  }

  const name = text(form.get('displayName'))
  const parsed = createSchema.safeParse({
    displayName: name,
    // An operator who leaves the slug alone gets one derived from the name. Typed slugs win,
    // because a listing whose URL has to match something already printed is a real case.
    slug: text(form.get('slug')) ?? slugify(name ?? ''),
    citySlug: text(form.get('citySlug')),
    localitySlug: text(form.get('localitySlug')),
    categorySlug: text(form.get('categorySlug')),
    legalName: text(form.get('legalName')),
    addressLine: text(form.get('addressLine')),
    about: text(form.get('about')),
    websiteUrl: text(form.get('websiteUrl')),
    instagramHandle: text(form.get('instagramHandle')),
    priceBandMin: rupeesToPaise(text(form.get('priceBandMin'))),
    priceBandMax: rupeesToPaise(text(form.get('priceBandMax'))),
    establishedYear: text(form.get('establishedYear')),
    teamSize: text(form.get('teamSize')),
    travelsOutstation: form.get('travelsOutstation') === 'on',
  })

  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error) ?? 'Check those details.' }
  }
  const d = parsed.data

  const supabase = await staffClient()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const [{ data: auth }, city, category] = await Promise.all([
    supabase.auth.getUser(),
    lookup(supabase, 'cities', d.citySlug),
    lookup(supabase, 'categories', d.categorySlug),
  ])

  if (!city) return { status: 'error', message: 'That city is not in the database.' }
  if (!category) return { status: 'error', message: 'That category is not in the database.' }

  /**
   * The locality is resolved *inside* the chosen city, which is why it cannot go in the
   * Promise.all above.
   *
   * `localities` is unique on (city_id, slug), not on slug alone, so a global slug lookup can
   * return a locality belonging to a different city — and nothing in the schema stops
   * `vendors.locality_id` pointing outside `vendors.city_id`, because there is no composite
   * foreign key to express that. Without the city filter, a stale form (the locality list is
   * client-side, so it does not repopulate without JavaScript) could file a Delhi listing in
   * Gomti Nagar and the database would accept it.
   */
  const locality = d.localitySlug
    ? await lookupLocality(supabase, d.localitySlug, city.id)
    : null

  if (d.localitySlug && !locality) {
    return {
      status: 'error',
      message:
        'That locality is not in the city you picked. Choose one from the list, or leave it ' +
        'blank and set it on the listing afterwards.',
    }
  }

  const actorId = auth.user?.id ?? null
  if (!actorId) {
    return { status: 'error', message: 'Your session has expired. Sign in again and retry.' }
  }

  const { data: created, error } = await supabase
    .from('vendors')
    .insert({
      slug: d.slug,
      display_name: d.displayName,
      legal_name: d.legalName ?? null,
      // Not a default we are choosing — vendors_insert_field's WITH CHECK requires it.
      status: 'draft',
      city_id: city.id,
      locality_id: locality?.id ?? null,
      address_line: d.addressLine ?? null,
      about: d.about ?? null,
      website_url: d.websiteUrl ?? null,
      instagram_handle: d.instagramHandle ?? null,
      price_band_min: d.priceBandMin ?? null,
      price_band_max: d.priceBandMax ?? null,
      established_year: d.establishedYear ?? null,
      team_size: d.teamSize ?? null,
      travels_outstation: d.travelsOutstation,
      // Plan §S3. This is what makes "who filed this listing" answerable a year later,
      // separately from the audit row.
      created_by_staff: actorId,
    })
    .select('id')

  if (error) return { status: 'error', message: explainInsert(error, d.slug) }

  const row = created?.[0]
  if (!row) {
    return {
      status: 'error',
      message:
        'The database refused the insert. Creating listings is limited to field agents and ' +
        'super admins, in a city their role covers — a moderator cannot file a new listing.',
    }
  }

  /**
   * The category link, as a second statement.
   *
   * supabase-js cannot wrap two inserts in a transaction, so this is genuinely not atomic:
   * if it fails, the listing exists with no category. There is no DELETE policy on vendors
   * for staff, so it cannot be rolled back from here either.
   *
   * Given that, the honest move is to report it precisely rather than either pretending the
   * whole thing failed (the listing is there, and a retry would collide on the slug) or
   * pretending it worked. A listing with no category is a draft nobody can route to, which
   * is recoverable — a silent one is not.
   */
  const linkError = await linkCategory(supabase, row.id, category.id)

  await writeAudit(supabase, {
    actorId,
    vendorId: row.id,
    slug: d.slug,
    displayName: d.displayName,
    citySlug: d.citySlug,
    categorySlug: d.categorySlug,
    categoryLinked: linkError == null,
  })

  revalidatePath('/admin/vendors')
  revalidatePath('/admin')

  if (linkError) {
    return {
      status: 'error',
      message:
        `${d.displayName} was created as a draft, but its category could not be attached ` +
        `(${linkError}). Open the listing and set the category before it goes for review — ` +
        'until then it cannot be routed any enquiries.',
    }
  }

  return {
    status: 'done',
    slug: d.slug,
    message:
      `${d.displayName} is filed as a draft. It is not publicly visible and will not receive ` +
      'enquiries until a moderator publishes it — that needs five photos, price bands and a ' +
      'profile score of 60.',
  }
}

// ---------------------------------------------------------------------------
// Internals. A 'use server' module may export async functions and types only.
// ---------------------------------------------------------------------------

type WriteError = { code?: string; message: string } | null

/**
 * Narrowed client, same approach as ../actions.ts.
 *
 * packages/db/src/generated/database.types.ts is hand-authored around the read surface
 * apps/web needs, so `audit_log` and `vendor_categories` are not in it. Narrowing at the call
 * site keeps these writes typed without editing a file `pnpm db:types` regenerates wholesale.
 */
interface Writer {
  auth: { getUser: () => PromiseLike<{ data: { user: { id: string } | null } }> }
  from: (table: 'vendors' | 'vendor_categories' | 'audit_log' | 'cities' | 'localities' | 'categories') => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: WriteError }> & {
      select: (
        columns: string,
      ) => PromiseLike<{ data: { id: string }[] | null; error: WriteError }>
    }
    select: (columns: string) => {
      eq: (column: string, value: string) => Filter
    }
  }
}

/** `.eq()` returns another filter, so the chain has to be self-referential. */
interface Filter {
  eq: (column: string, value: string) => Filter
  limit: (n: number) => PromiseLike<{ data: { id: string }[] | null; error: WriteError }>
}

async function staffClient(): Promise<Writer | null> {
  try {
    const store = await cookies()
    return createUtsavaServerClient({
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          store.set(name, value, options)
        }
      },
    }) as unknown as Writer
  } catch {
    return null
  }
}

/**
 * Slug to id, for the two tables whose slug is globally unique.
 *
 * `.limit(1)` rather than `.maybeSingle()` because a missing row is an expected outcome here -
 * a stale form can post a slug that no longer exists - and the caller reports it as a sentence.
 * maybeSingle would make that an exception to catch.
 */
async function lookup(
  supabase: Writer,
  table: 'cities' | 'categories',
  slug: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase.from(table).select('id').eq('slug', slug).limit(1)
  return data?.[0] ?? null
}

/** Localities are unique on (city_id, slug), so both are needed to identify one. */
async function lookupLocality(
  supabase: Writer,
  slug: string,
  cityId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('localities')
    .select('id')
    .eq('slug', slug)
    .eq('city_id', cityId)
    .limit(1)

  return data?.[0] ?? null
}

async function linkCategory(
  supabase: Writer,
  vendorId: string,
  categoryId: string,
): Promise<string | null> {
  // is_primary drives the canonical SEO URL (§12) and vendor_categories_single_primary_idx
  // allows exactly one per vendor. A first category is always the primary one.
  const { error } = await supabase
    .from('vendor_categories')
    .insert({ vendor_id: vendorId, category_id: categoryId, is_primary: true, style_tags: [] })

  return error ? error.message : null
}

/**
 * The audit row. Best-effort by design: the listing exists either way, and losing the record
 * of who filed it is worth reporting but not worth failing the whole operation over — the
 * created_by_staff column above still names them.
 */
async function writeAudit(
  supabase: Writer,
  args: {
    actorId: string
    vendorId: string
    slug: string
    displayName: string
    citySlug: string
    categorySlug: string
    categoryLinked: boolean
  },
): Promise<void> {
  await supabase.from('audit_log').insert({
    actor_id: args.actorId,
    actor_role: null,
    action: 'vendor.created',
    subject_type: 'vendor',
    subject_id: args.vendorId,
    // Nothing existed before, and an empty object says that more clearly than null.
    before_state: {},
    after_state: {
      slug: args.slug,
      display_name: args.displayName,
      status: 'draft',
      city: args.citySlug,
      primary_category: args.categorySlug,
      category_linked: args.categoryLinked,
    },
    reason: null,
  })
}

/** FormData.get() returns null for an absent field; zod's .optional() rejects null. */
function text(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Rupees in, integer paise out (plan §5). Rounds, never truncates. */
function rupeesToPaise(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.round(n * 100)
}

/**
 * Name to slug, matching vendors_slug_format: ^[a-z0-9]+(-[a-z0-9]+)*$.
 *
 * Diacritics are folded before stripping, so "Café Studio" becomes cafe-studio rather than
 * caf-studio. Devanagari and other non-Latin scripts have no useful ASCII fold, so a name
 * written entirely in one yields an empty string here — which fails slugSchema and asks the
 * operator to type a slug, rather than inventing a wrong one.
 */
function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Structural, not z.ZodError<T> — the generic parameter would fight the call sites. */
function firstIssue(error: { issues: { message: string }[] }): string | undefined {
  return error.issues[0]?.message
}

function explainInsert(error: { code?: string; message: string }, slug: string): string {
  if (error.code === '23505' || error.message.includes('vendors_slug_key')) {
    return `The URL "${slug}" is already taken by another listing. Try a different one — adding the locality usually does it.`
  }
  if (error.code === '42501' || error.message.includes('row-level security')) {
    return (
      'Your staff role cannot create a listing here. Only a field agent or super admin can, ' +
      'and only in a city their role covers.'
    )
  }
  if (error.message.includes('vendors_slug_format')) {
    return 'The URL may only contain lowercase letters, numbers and single hyphens.'
  }
  if (error.message.includes('vendors_price_band_ordered')) {
    return 'The lower price band has to be the smaller number.'
  }
  if (error.message.includes('established_year')) {
    return 'The year established has to be between 1900 and this year.'
  }
  return `Could not create the listing: ${error.message}`
}

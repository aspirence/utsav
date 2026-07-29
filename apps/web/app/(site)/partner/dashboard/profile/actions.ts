'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { rupeesToPaise, slugSchema, vendorProfileSchema, type UtsavaClient } from '@utsava/db'

import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/supabase'

/**
 * The vendor profile editor. Plan §S3: "vendor onboarding tool v1 in field hands —
 * portfolio-first profile editor, photo capture, price bands."
 *
 * ── What this action must never write ────────────────────────────────────────
 * app.guard_vendor_columns() (migration 20260727001300) RAISEs on any client-session
 * UPDATE that changes a trigger-maintained column. The payload below therefore sends
 * NONE of these, and must never be extended to include them:
 *
 *   rating_avg · rating_count · completed_bookings · profile_score · media_count ·
 *   is_seo_eligible · response_rate_pct · median_response_mins · search_document ·
 *   search_vector · published_at · claimed_at · created_by_staff · status
 *
 * Every one of them is either a ranking input (app.vendor_rank) or a routing gate
 * (app.route_enquiry filters on is_seo_eligible), so a vendor who could write them
 * could boost themselves into other people's leads — which would quietly break plan
 * §11's "no ranking favour" promise for everyone. `status` is guarded separately: a
 * vendor may pause and resume itself but never publish itself, and that transition
 * belongs in its own action rather than in a routine profile save. legal_name and the
 * KYC columns are owner-only and live on the billing screen for the same reason.
 *
 * Style tags are not on vendors at all — plan §5 keeps them on vendor_categories, so
 * they are a second, separately-guarded write below.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ProfileState {
  status: 'idle' | 'saved' | 'error' | 'unconfigured'
  message?: string
  fieldErrors?: Record<string, string[]>
}

/**
 * The shared shape from '@utsava/db', adjusted for what this form actually posts:
 * vendors.locality_id is a uuid FK and the <select> carries ids, so there is no slug
 * round trip; style_tags ride along because they are saved in the same submit.
 */
const profileFormSchema = vendorProfileSchema
  .omit({ localitySlug: true })
  .extend({
    localityId: z.string().uuid('Pick a locality from the list').optional(),
    styleTags: z.array(slugSchema).max(8, 'Pick up to eight styles').default([]),
  })
  .refine(
    (v) => v.priceBandMin == null || v.priceBandMax == null || v.priceBandMin <= v.priceBandMax,
    {
      message: 'The lower end of your band cannot be above the higher end',
      path: ['priceBandMin'],
    },
  )

export async function updateVendorProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = profileFormSchema.safeParse({
    displayName: String(formData.get('displayName') ?? ''),
    about: str(formData.get('about')),
    establishedYear: num(formData.get('establishedYear')),
    teamSize: num(formData.get('teamSize')),
    travelsOutstation: formData.get('travelsOutstation') === 'on',
    localityId: str(formData.get('localityId')),
    websiteUrl: str(formData.get('websiteUrl')) ?? '',
    // People type their handle with the @ still attached.
    instagramHandle: (str(formData.get('instagramHandle')) ?? '').replace(/^@/, ''),
    // The form collects rupees; the database stores paise (plan §5).
    priceBandMin: rupeesField(formData.get('priceBandMin')),
    priceBandMax: rupeesField(formData.get('priceBandMax')),
    styleTags: formData.getAll('styleTags').map(String),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  if (!hasSupabaseEnv()) {
    return {
      status: 'unconfigured',
      message:
        'Your changes validated correctly, but no Supabase instance is connected yet, so ' +
        'nothing was saved. Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to edit ' +
        'the real listing.',
    }
  }

  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const membership = await activeMembership(supabase)
  if (!membership) {
    return {
      status: 'error',
      message: 'This account is not linked to a listing yet. Ask your team owner for an invite.',
    }
  }
  if (membership.role === 'responder') {
    return {
      status: 'error',
      message: 'Responders can reply to leads but cannot edit the listing. Ask an owner or manager.',
    }
  }

  const p = parsed.data

  // Exactly the self-serve columns. See the note at the top of this file for the list
  // of trigger-maintained columns that is deliberately absent.
  const { data: vendor, error } = await supabase
    .from('vendors')
    .update({
      display_name: p.displayName,
      about: p.about ?? null,
      established_year: p.establishedYear ?? null,
      team_size: p.teamSize ?? null,
      travels_outstation: p.travelsOutstation,
      locality_id: p.localityId ?? null,
      website_url: p.websiteUrl || null,
      instagram_handle: p.instagramHandle || null,
      price_band_min: p.priceBandMin ?? null,
      price_band_max: p.priceBandMax ?? null,
    })
    .eq('id', membership.vendorId)
    .select('slug')
    .maybeSingle()

  if (error) {
    return { status: 'error', message: writeErrorMessage(error) }
  }
  if (!vendor) {
    return {
      status: 'error',
      message: 'Nothing was saved — your account may no longer manage this listing.',
    }
  }

  // Plan §5: style tags live on vendor_categories. The primary row is the one that
  // drives the canonical SEO URL and the discovery filter, so that is the row edited.
  const { data: primaryCategory, error: tagError } = await supabase
    .from('vendor_categories')
    .update({ style_tags: p.styleTags })
    .eq('vendor_id', membership.vendorId)
    .eq('is_primary', true)
    .select('id')
    .maybeSingle()

  revalidatePath('/partner/dashboard/profile')
  revalidatePath('/partner/dashboard/packages')
  revalidatePath(`/vendor/${vendor.slug}`)

  if (tagError) {
    return {
      status: 'saved',
      message: `Your details are saved, but the style tags did not save: ${tagError.message}`,
    }
  }
  if (!primaryCategory) {
    return {
      status: 'saved',
      message:
        'Your details are saved. Style tags need a primary category first — ask your ' +
        'Utsava contact to set one, then add them here.',
    }
  }

  return {
    status: 'saved',
    message: 'Saved. Customers see these changes on your listing straight away.',
  }
}

// ---------------------------------------------------------------------------
// Which listing is this session editing?
// ---------------------------------------------------------------------------

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

/**
 * Plan §3: one human, many contexts. Until the dashboard ships a context switcher, the
 * oldest accepted membership is the listing being edited. The role is returned so the
 * UI can say why a responder cannot save, rather than letting RLS reject it silently.
 */
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

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** The guard trigger and the RLS policies both surface as insufficient_privilege. */
function writeErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === '42501') {
    return (
      'The database refused that change. Ratings, response times and your listing status ' +
      'are set by Utsava, not from this screen.'
    )
  }
  return `Could not save your listing: ${error.message}`
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

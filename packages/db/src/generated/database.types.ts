/**
 * Supabase schema types.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS HAND-AUTHORED FOR NOW AND COVERS ONLY THE READ SURFACE apps/web USES.
 *
 * Replace it wholesale, for all ~40 tables, with:
 *     pnpm db:types          # supabase gen types typescript --local
 *
 * That command needs a running local stack (`pnpm db:start`, which needs Docker).
 * Plan §9 gates CI on "generated-type drift", so once the stack is up this file stops
 * being maintained by hand and becomes a build artifact.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ---------------------------------------------------------------------------
// Enums — mirrors supabase/migrations/20260727000200_enums.sql
// ---------------------------------------------------------------------------

export type VendorStatus = 'draft' | 'pending_review' | 'live' | 'paused' | 'suspended'

export type LeadStatus = 'routed' | 'viewed' | 'responded' | 'quoted' | 'converted' | 'expired'

export type BookingStatus =
  | 'initiated'
  | 'advance_held'
  | 'confirmed'
  | 'completed'
  | 'released'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'disputed'

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled'

export type EnquiryStatus = 'pending_otp' | 'verified' | 'routed' | 'closed' | 'spam'

export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'escalated'

export type VendorMemberRole = 'owner' | 'manager' | 'responder'

export type StaffRoleKind = 'field_agent' | 'moderator' | 'finance' | 'super'

export type MediaKind = 'image' | 'video'

export type StoryStatus = 'draft' | 'pending_review' | 'published' | 'archived'

export type EventType =
  | 'wedding'
  | 'engagement'
  | 'reception'
  | 'sangeet'
  | 'mehendi'
  | 'birthday'
  | 'anniversary'
  | 'baby_shower'
  | 'housewarming'
  | 'corporate'
  | 'conference'
  | 'festival'
  | 'other'

export type PricingUnit = 'per_day' | 'per_event' | 'per_plate' | 'per_person' | 'per_hour'

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

/**
 * public.profiles — mirrors 20260727000300_identity.sql.
 *
 * Plan §3: "auth.users 1:1 profiles. Holds no role column by design — capabilities are
 * derived from vendor_members / corporate_members / staff_roles." So there is nothing here
 * to check for permission; RLS restricts the table to the owner's own row.
 */
export type ProfileRow = {
  id: string
  full_name: string | null
  /** E.164. The primary customer identity in India; OTP-verified at enquiry. */
  phone: string | null
  phone_verified: boolean
  email: string | null
  avatar_url: string | null
  city_id: string | null
  locale: 'en' | 'hi'
  marketing_consent: boolean
  marketing_consent_at: string | null
  deletion_requested_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/**
 * public.staff_roles — mirrors 20260727000300_identity.sql.
 *
 * Registered here because the console reads it on every request to decide whether the caller
 * is staff at all. It is a read surface, not the one-off write the vendor actions cast for.
 *
 * NO Insert type worth having: `staff_roles_select_own` is the only policy on this table.
 * There is deliberately no write policy — granting staff access is a service-role operation,
 * so a client-side insert has nowhere to land, and the shared `Table<>` alias's `Partial<T>`
 * insert shape is the honest reflection of "postgrest can express this, RLS will refuse it".
 */
export type StaffRoleRow = {
  id: string
  profile_id: string
  role: StaffRoleKind
  /** Plan §6: scopes a field_agent to their own city. Empty array = unscoped. */
  city_ids: string[]
  granted_by: string | null
  granted_at: string
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type CityRow = {
  id: string
  slug: string
  name: string
  state: string
  country_code: string
  is_launched: boolean
  launch_order: number | null
  live_vendor_count: number
  timezone: string
}

export type LocalityRow = {
  id: string
  city_id: string
  slug: string
  name: string
  aliases: string[]
  is_seo_eligible: boolean
  live_vendor_count: number
}

export type CategoryRow = {
  id: string
  slug: string
  name: string
  plural_name: string
  parent_id: string | null
  description: string | null
  icon: string | null
  sort_order: number
  is_wedge: boolean
  is_active: boolean
  pricing_unit: PricingUnit
}

export type StyleTagRow = {
  id: string
  category_id: string
  slug: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
}

/** Note: no contact_phone / pan_number / gstin — those live in vendor_private. */
export type VendorRow = {
  id: string
  slug: string
  display_name: string
  legal_name: string | null
  status: VendorStatus
  city_id: string
  locality_id: string | null
  address_line: string | null
  about: string | null
  established_year: number | null
  team_size: number | null
  travels_outstation: boolean
  website_url: string | null
  instagram_handle: string | null
  price_band_min: number | null
  price_band_max: number | null
  kyc_status: string
  is_anchor_studio: boolean
  rating_avg: number | null
  rating_count: number
  response_rate_pct: number | null
  median_response_mins: number | null
  completed_bookings: number
  media_count: number
  profile_score: number
  is_seo_eligible: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export type VendorCategoryRow = {
  id: string
  vendor_id: string
  category_id: string
  is_primary: boolean
  style_tags: string[]
  price_band_min: number | null
  price_band_max: number | null
}

export type PackageRow = {
  id: string
  vendor_id: string
  category_id: string
  name: string
  description: string | null
  style_tags: string[]
  price: number
  pricing_unit: PricingUnit
  duration_days: number
  /** Generated column — plan §2's per-day normalisation. Never write this. */
  price_per_day: number
  deliverables: string[]
  crew_size: number | null
  edited_photo_count: number | null
  delivery_days: number | null
  inclusions: string[]
  exclusions: string[]
  is_active: boolean
  sort_order: number
}

export type MediaRow = {
  id: string
  vendor_id: string
  package_id: string | null
  kind: MediaKind
  storage_path: string
  width: number | null
  height: number | null
  blurhash: string | null
  alt_text: string | null
  caption: string | null
  style_tags: string[]
  sort_order: number
  is_cover: boolean
  moderation: ModerationStatus
}

export type VendorFaqRow = {
  id: string
  vendor_id: string
  question: string
  answer: string
  sort_order: number
}

export type VendorAvailabilityRow = {
  id: string
  vendor_id: string
  blocked_on: string
  reason: string
  booking_id: string | null
}

export type ReviewRow = {
  id: string
  booking_id: string
  vendor_id: string
  author_id: string
  rating: number
  rating_quality: number | null
  rating_value: number | null
  rating_punctuality: number | null
  rating_professionalism: number | null
  title: string | null
  body: string | null
  moderation: ModerationStatus
  published_at: string | null
  vendor_reply: string | null
  vendor_replied_at: string | null
  helpful_count: number
  created_at: string
}

export type StoryRow = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  body: string | null
  author_vendor_id: string | null
  city_id: string | null
  locality_id: string | null
  event_type: EventType
  event_date: string | null
  couple_names: string | null
  style_tags: string[]
  cover_storage_path: string | null
  gallery: Json
  status: StoryStatus
  published_at: string | null
  view_count: number
}

export type EnquiryRow = {
  id: string
  event_id: string | null
  customer_id: string | null
  category_id: string
  city_id: string
  locality_id: string | null
  event_type: EventType
  event_date: string | null
  date_flexible: boolean
  guest_count: number | null
  budget_min: number | null
  budget_max: number | null
  style_preferences: string[]
  message: string | null
  contact_name: string
  contact_phone: string
  contact_email: string | null
  status: EnquiryStatus
  phone_verified_at: string | null
  consent_text: string
  consent_version: string
  /** Plan §12: lead quality is the top risk, so spam scoring feeds moderation. 0–100. */
  spam_score: number
  source: 'web' | 'vendor_app' | 'partner_pwa' | 'admin' | 'seo'
  routed_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export type ShortlistRow = {
  id: string
  profile_id: string
  event_id: string | null
  vendor_id: string
  note: string | null
  created_at: string
}

/** public.events — the container an enquiry, shortlist and checklist all hang off. */
export type EventRow = {
  id: string
  owner_id: string
  name: string | null
  event_type: EventType
  event_date: string | null
  date_flexible: boolean
  guest_count: number | null
  city_id: string | null
  locality_id: string | null
  budget_min: number | null
  budget_max: number | null
  notes: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

/**
 * public.leads — the customer side.
 *
 * Vendors read leads through the `vendor_leads` view, which masks contact details until the
 * state permits (plan §6). A customer needs none of that masking - it is their own contact
 * detail - so `leads_select_customer` lets them read the table directly, scoped to leads
 * whose enquiry they own.
 *
 * Writes are not the customer's to make: state moves through app.transition_lead().
 */
export type LeadRow = {
  id: string
  enquiry_id: string
  vendor_id: string
  status: LeadStatus
  routed_seq: number
  routed_at: string
  viewed_at: string | null
  responded_at: string | null
  quoted_at: string | null
  converted_at: string | null
  expires_at: string
}

export type ChecklistRow = {
  id: string
  event_id: string
  owner_id: string
  name: string
  template_slug: string | null
  created_at: string
  updated_at: string
}

export type ChecklistItemRow = {
  id: string
  checklist_id: string
  category_id: string | null
  title: string
  description: string | null
  /** Negative = before the event. Renders as "3 months before". */
  due_offset_days: number | null
  due_date: string | null
  is_done: boolean
  done_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

/** public.vendor_leads — the §6 contact-masking view. */
export type VendorLeadRow = {
  lead_id: string
  vendor_id: string
  status: LeadStatus
  routed_seq: number
  routed_at: string
  viewed_at: string | null
  responded_at: string | null
  quoted_at: string | null
  converted_at: string | null
  expires_at: string
  credit_charged: boolean
  credit_refunded_at: string | null
  enquiry_id: string
  event_type: EventType
  event_date: string | null
  date_flexible: boolean
  guest_count: number | null
  budget_min: number | null
  budget_max: number | null
  style_preferences: string[]
  message: string | null
  contact_first_name: string
  /** null until the lead reaches a permitted state — see app.lead_contact_visible(). */
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  contact_visible: boolean
  enquiry_created_at: string
}

/** Return shape of public.search_vendors(). */
export type SearchVendorResult = {
  id: string
  slug: string
  display_name: string
  about: string | null
  city_slug: string
  locality_slug: string | null
  locality_name: string | null
  price_band_min: number | null
  price_band_max: number | null
  rating_avg: number | null
  rating_count: number
  media_count: number
  is_anchor_studio: boolean
  style_tags: string[]
  cover_path: string | null
  min_price_per_day: number | null
  score: number
  total_count: number
}

// ---------------------------------------------------------------------------
// Database shape consumed by createClient<Database>()
// ---------------------------------------------------------------------------

/**
 * postgrest-js requires every table to expose Row/Insert/Update as object types
 * (GenericTable). `Insert: never` fails that constraint and silently collapses the
 * whole schema to `never`, so read-only intent is expressed by RLS and by the comments
 * above — not by the type.
 */
type Table<T, I = Partial<T>> = { Row: T; Insert: I; Update: Partial<I>; Relationships: [] }

/** A view postgrest cannot write through. */
type View<T> = { Row: T; Relationships: [] }

export type Database = {
  __InternalSupabase: { PostgrestVersion: '12' }
  public: {
    Tables: {
      // Own row only, enforced by RLS. `id`, `phone` and `phone_verified` are excluded
      // from Insert/Update: the row is created by the on_auth_user_created trigger, and
      // the phone is the account identity - changing it is an OTP re-verification, not a
      // column write.
      profiles: Table<
        ProfileRow,
        Omit<Partial<ProfileRow>, 'id' | 'phone' | 'phone_verified'>
      >

      // Read-only from any client. `staff_roles_select_own` admits the holder and super
      // admins; there is no write policy at all, by design.
      staff_roles: Table<StaffRoleRow>

      // Reference data — public SELECT, staff-only writes (see 001300_rls_policies.sql).
      cities: Table<CityRow>
      localities: Table<LocalityRow>
      categories: Table<CategoryRow>
      style_tags: Table<StyleTagRow>

      vendors: Table<VendorRow>
      vendor_categories: Table<VendorCategoryRow>
      // price_per_day is a generated column; excluded from Insert so it is never written.
      packages: Table<PackageRow, Omit<Partial<PackageRow>, 'price_per_day'>>
      media: Table<MediaRow>
      vendor_faqs: Table<VendorFaqRow>
      vendor_availability: Table<VendorAvailabilityRow>
      reviews: Table<ReviewRow>
      stories: Table<StoryRow>
      enquiries: Table<EnquiryRow>

      // The customer's own rows, all gated by `*_all_own` policies on profile ownership.
      events: Table<EventRow, Omit<Partial<EventRow>, 'id' | 'created_at' | 'updated_at'>>
      shortlists: Table<ShortlistRow>
      checklists: Table<ChecklistRow>
      checklist_items: Table<ChecklistItemRow>

      // Read-only to a customer. `leads_select_customer` scopes SELECT to leads whose
      // enquiry they own; every transition goes through app.transition_lead().
      leads: Table<LeadRow>
    }
    Views: {
      vendor_leads: View<VendorLeadRow>
    }
    Functions: {
      search_vendors: {
        Args: {
          p_city_slug: string
          p_category_slug?: string | null
          p_locality_slug?: string | null
          p_query?: string | null
          p_style_tags?: string[] | null
          p_budget_max?: number | null
          p_free_on?: string | null
          p_sort?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: SearchVendorResult[]
      }
    }
    Enums: {
      vendor_status: VendorStatus
      lead_status: LeadStatus
      booking_status: BookingStatus
      subscription_status: SubscriptionStatus
      enquiry_status: EnquiryStatus
      moderation_status: ModerationStatus
      event_type: EventType
    }
    CompositeTypes: Record<never, never>
  }
}

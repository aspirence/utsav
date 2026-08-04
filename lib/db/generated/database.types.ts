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

/**
 * Resellers — 20260803000100.
 *
 * NOT a member of StaffRoleKind, and that separation is a security boundary rather than a
 * modelling preference. app.is_staff() with no arguments passes for any staff row, so a
 * 'reseller' value in that union would grant read access to everything guarded by a bare
 * is_staff() — the raw webhook payloads in invitation_payments among them. The migration
 * header and supabase/tests/10_reseller_commissions.sql both spell this out.
 */
export type ResellerStatus = 'active' | 'suspended' | 'closed'

/** pending → payable → paid, or reversed. See the migration for what each transition means. */
export type ResellerCommissionStatus = 'pending' | 'payable' | 'paid' | 'reversed'

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

/**
 * public.invitation_templates — mirrors 20260730000100_invitation_templates.sql.
 *
 * `video_url` is a link somebody pasted, not a managed storage path. See that migration's
 * header for why, and for what has to change when this outgrows five rows.
 */
export type InvitationTemplateRow = {
  id: string
  slug: string
  name: string
  tags: string[]
  /** Integer paise (plan §5). */
  price: number
  video_url: string | null
  poster_url: string | null
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type InvitationOrderStatus =
  | 'awaiting_payment'
  | 'booked'
  | 'details_received'
  | 'draft_sent'
  | 'approved'
  | 'delivered'
  | 'refunded'
  | 'cancelled'

/**
 * public.invitation_orders — mirrors 20260730000200_invitation_orders.sql.
 *
 * NOT a money table in the plan §6 sense — no vendor, no payout leg, no escrow — but it holds
 * amounts, so it behaves like one where it counts: there is no client INSERT policy at all, and
 * app.guard_invitation_order_columns() blocks a console edit to any of the amounts, the
 * reference or the payment stamps. See that migration's header.
 */
export type InvitationOrderRow = {
  id: string
  reference: string
  template_id: string | null
  template_slug: string
  template_name: string
  /** Integer paise. What the template cost when ordered, not what it costs now. */
  template_price: number
  booking_amount: number
  balance_amount: number
  status: InvitationOrderStatus
  contact_name: string
  /**
   * Nullable since 20260803000300. The booking form asks for a name and a WhatsApp number only;
   * contact_phone is the channel the draft and payment links actually go to.
   */
  contact_email: string | null
  contact_phone: string
  customer_id: string | null
  payment_ref: string | null
  paid_at: string | null
  notes: string | null
  /**
   * What the card says. Added in 20260801000200. Shape owned by lib/invitation-card.ts and
   * pinned by card_content_version; the column only guarantees it is a JSON object.
   */
  card_content: Record<string, unknown> | null
  card_content_version: number | null
  /** The unlisted public URL segment. Deliberately not `reference`, which is read out loud. */
  public_slug: string | null
  published_at: string | null
  /**
   * Attribution, added in 20260803000100. Both are resolved and frozen by a BEFORE INSERT
   * trigger from the customer's live reseller assignment — never by a caller. Writing them
   * from application code has no effect: the trigger overwrites whatever is supplied, and the
   * column guard refuses a later change.
   */
  reseller_id: string | null
  /** Basis points in force when the order was placed. 250 = 2.5%. */
  reseller_commission_bps: number | null
  /**
   * Bearer token for the post-checkout details form — 20260803000300.
   *
   * NEVER SEND THIS TO A BROWSER except as the one-time return value of placeInvitationOrder(),
   * to the session that just created the row. It authorises a write to the card wording, so
   * putting it in a page a customer can link to or screenshot defeats the point of it not being
   * the reference.
   */
  details_token: string
  created_at: string
  updated_at: string
}

/**
 * public.resellers — an external commercial partner. Migration 20260803000100.
 *
 * Service-role write only. The console writes it after requireSuper(), exactly as staff_roles
 * are written; there is no client INSERT or UPDATE policy.
 */
export type ResellerRow = {
  id: string
  profile_id: string
  display_name: string
  /** Human-quotable on a statement: FRM-RS-XXX. */
  code: string
  /** Basis points, not percent. 250 = 2.5%. */
  commission_bps: number
  status: ResellerStatus
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * public.reseller_customers — account ownership.
 *
 * A row with `released_at: null` means every future invitation order by that customer is
 * attributed to that reseller. Releasing stops future attribution and retracts nothing.
 */
export type ResellerCustomerRow = {
  id: string
  reseller_id: string
  customer_id: string
  assigned_by: string | null
  assigned_at: string
  released_at: string | null
  release_reason: string | null
  created_at: string
  updated_at: string
}

/**
 * public.reseller_commissions — the money. Plan §5 rules apply in full.
 *
 * Every row is written by app.accrue_reseller_commission(), a trigger on invitation_orders
 * that fires off the paid_at transition. There is no client write policy and there must never
 * be one: a reseller who could insert here would pay themselves.
 */
export type ResellerCommissionRow = {
  id: string
  reseller_id: string
  order_id: string
  /** Copied from the order, which froze it at insert. Not read live from the reseller. */
  rate_bps: number
  /** Integer paise the rate was applied to. Stored, not recomputed — see the migration. */
  base_amount: number
  amount: number
  status: ResellerCommissionStatus
  earned_at: string
  payable_at: string | null
  paid_at: string | null
  reversed_at: string | null
  reversal_reason: string | null
  settlement_ref: string | null
  created_at: string
  updated_at: string
}

/**
 * public.my_reseller — the reseller's own record, safe columns only.
 *
 * public.resellers carries NO self-select policy: a reseller reading the base table gets
 * nothing. This view is how they read themselves, and it withholds `notes` and `created_by` —
 * the staff record *about* the partner rather than the partner's own data.
 *
 * NEVER ADD `notes` OR `created_by` HERE. That is the entire reason the view exists; the
 * migration's policy section explains why a column-level revoke could not do the job instead.
 *
 * Returns a suspended reseller's row, unlike app.my_reseller_id(), so the dashboard can tell
 * somebody they are suspended rather than showing them an empty screen.
 */
export type MyResellerRow = {
  id: string
  display_name: string
  code: string
  commission_bps: number
  status: ResellerStatus
  contact_email: string | null
  contact_phone: string | null
  created_at: string
}

/**
 * public.reseller_orders — what a reseller may see of an order they earned on.
 *
 * A masked view with definer semantics, the same construction as public.vendor_leads and for
 * the same reason. Its `reseller_id = app.my_reseller_id()` clause is the authorization
 * boundary, not a filter.
 *
 * NEVER ADD contact_email OR contact_phone HERE. A reseller with the customer's phone number
 * can take the relationship off-platform, which is the disintermediation risk plan §11 exists
 * to manage. A first name is enough to recognise your own introduction on a statement.
 */
export type ResellerOrderRow = {
  order_id: string
  reference: string
  template_slug: string
  template_name: string
  template_price: number
  status: InvitationOrderStatus
  created_at: string
  paid_at: string | null
  reseller_id: string
  customer_first_name: string
  commission_rate_bps: number | null
  commission_amount: number | null
  commission_status: ResellerCommissionStatus | null
  commission_earned_at: string | null
  commission_paid_at: string | null
}

/**
 * public.invitation_cards — the published invitation, for anonymous readers.
 *
 * The only object granted to `anon` that reads invitation_orders. It carries no contact detail
 * and no amount, and its `published_at is not null` clause is the authorization boundary rather
 * than a filter — see supabase/tests/09_invitation_cards.sql, which asserts both by absence.
 *
 * NEVER ADD A CONTACT OR AMOUNT COLUMN HERE. The link is forwarded to every guest by design.
 */
export type InvitationCardRow = {
  public_slug: string
  template_slug: string
  template_name: string
  card_content: Record<string, unknown> | null
  card_content_version: number | null
  published_at: string
}

/**
 * One payment event from the aggregator, success or failure. Migration 20260731180000.
 *
 * A ledger rather than columns on the order, because an order can be paid at the second
 * attempt and the first one is the one support gets asked about. Service-role write-only:
 * SELECT is granted to staff and there is no INSERT or UPDATE policy at all.
 */
export type InvitationPaymentRow = {
  id: string
  order_id: string
  aggregator: 'razorpay' | 'cashfree'
  aggregator_payment_id: string
  /** Integer paise. What was actually taken, which is not always what the order asked. */
  amount: number
  currency: string
  /** The aggregator's own word: SUCCESS, FAILED, USER_DROPPED. Not an enum on purpose. */
  status: string
  /** 'upi', 'card', 'netbanking', 'wallet'. */
  method: string | null
  paid_at: string | null
  failure_reason: string | null
  /** Plan §4: kept whole for reconciliation and dispute evidence. */
  webhook_payload: Json
  received_at: string
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

/**
 * public.audit_log — mirrors 20260727000300_identity.sql.
 *
 * Plan §3 asks the console for an "append-only audit log", and the console's own footer promises
 * every action taken there is written to it with the actor attached. Registered here so the
 * screens that make privilege changes can honour that promise in typed code rather than a cast.
 *
 * `audit_log_select_super` restricts reads to super admins and `audit_log_insert_staff` requires
 * `actor_id = auth.uid()` — so a client cannot write a row on somebody else's behalf, and a
 * service-role writer has to set the actor honestly because nothing else will.
 *
 * There is no UPDATE or DELETE policy at all, which is what "append-only" means here.
 */
export type AuditLogRow = {
  id: number
  actor_id: string | null
  actor_role: string | null
  action: string
  subject_type: string
  subject_id: string | null
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  reason: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

/**
 * Plan §3's capability source of truth: "one human, many contexts". A profile holds one row
 * per vendor it can act for, and `app.is_vendor_member()` reads exactly this table — so the
 * membership is the permission, and there is no role column on profiles to drift from it.
 *
 * `accepted_at` null means an invitation that was sent and never taken up; `revoked_at` not
 * null means it was withdrawn. Both are still rows, and both are ignored by the RLS helper, so
 * a reader that forgets either condition will show a dashboard whose every query is empty.
 */
export type VendorMemberRow = {
  id: string
  vendor_id: string
  profile_id: string
  role: VendorMemberRole
  invited_by: string | null
  invited_at: string
  accepted_at: string | null
  revoked_at: string | null
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
  /**
   * Category-specific details — a venue's seated capacity, a caterer's per-plate rate.
   * Added in 20260730000300. Shape lives in apps/web/lib/category-attributes.ts; the column only
   * guarantees it is a JSON object, so a reader must not assume any particular key exists.
   */
  attributes: Json
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
      profiles: Table<ProfileRow, Omit<Partial<ProfileRow>, 'id' | 'phone' | 'phone_verified'>>

      // Read-only from any client. `staff_roles_select_own` admits the holder and super
      // admins; there is no write policy at all, by design. /admin/users writes it through the
      // service-role key, gated on being super and audited — see lib/admin-users.ts.
      staff_roles: Table<StaffRoleRow>

      // Append-only. Super admins read it; any staff member may insert a row for themselves.
      // Nothing may update or delete one.
      audit_log: Table<AuditLogRow, Omit<Partial<AuditLogRow>, 'id' | 'created_at'>>

      // Reference data — public SELECT, staff-only writes (see 001300_rls_policies.sql).
      cities: Table<CityRow>
      localities: Table<LocalityRow>
      categories: Table<CategoryRow>
      style_tags: Table<StyleTagRow>

      // Plan §2's digital-invitation storefront. `created_at`/`updated_at` are excluded from
      // Insert so an upsert cannot backdate a row.
      invitation_templates: Table<
        InvitationTemplateRow,
        Omit<Partial<InvitationTemplateRow>, 'id' | 'created_at' | 'updated_at'>
      >

      // Orders against those templates. No client INSERT policy exists — the Insert type below
      // describes what the service-role action writes, and RLS refuses it from anywhere else.
      invitation_orders: Table<
        InvitationOrderRow,
        Omit<Partial<InvitationOrderRow>, 'id' | 'created_at' | 'updated_at'>
      >

      // The payment ledger behind those orders. Same rule as invitation_orders and more so:
      // the only writer is the signature-verified webhook, under the service-role key.
      invitation_payments: Table<
        InvitationPaymentRow,
        Omit<Partial<InvitationPaymentRow>, 'id' | 'created_at' | 'updated_at' | 'received_at'>
      >

      /*
       * Resellers and their money. All three are read-only from any client — SELECT policies
       * and nothing else, per CLAUDE.md's second non-negotiable. resellers and
       * reseller_customers are written by /admin/resellers under the service-role key after
       * requireSuper(); reseller_commissions is written only by the accrual trigger.
       */
      resellers: Table<ResellerRow, Omit<Partial<ResellerRow>, 'id' | 'created_at' | 'updated_at'>>
      reseller_customers: Table<
        ResellerCustomerRow,
        Omit<Partial<ResellerCustomerRow>, 'id' | 'created_at' | 'updated_at'>
      >
      reseller_commissions: Table<
        ResellerCommissionRow,
        Omit<Partial<ResellerCommissionRow>, 'id' | 'created_at' | 'updated_at'>
      >

      vendors: Table<VendorRow>
      // Read-only from a client. `vendor_members_select_member` admits fellow members;
      // `vendor_members_write_owner` restricts every write to the vendor's owner.
      vendor_members: Table<VendorMemberRow>
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
      invitation_cards: View<InvitationCardRow>
      reseller_orders: View<ResellerOrderRow>
      my_reseller: View<MyResellerRow>
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
      /**
       * The public wrapper added in 20260731170000. service_role only — a payment may be
       * declared only by the aggregator's signed webhook, never by a client.
       */
      record_invitation_payment: {
        Args: {
          p_reference: string
          p_payment_ref: string
          p_paid_at?: string
        }
        Returns: InvitationOrderRow
      }
      /**
       * Writes the card wording onto one order — 20260803000300.
       *
       * Keyed on details_token, not on the reference. service_role only: the token is the
       * authorisation, and only the server action ever holds one.
       */
      save_invitation_card: {
        Args: {
          p_token: string
          p_content: Json
          p_version: number
          p_slug: string
        }
        Returns: InvitationOrderRow
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

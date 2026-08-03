-- ============================================================================
-- Fremmo — 000200 · Enumerated types
-- Plan §5: "Status enums that drive the product". These four state machines are
-- the product; every transition below is enforced by an RPC, never by a client UPDATE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Identity & membership. Plan §3: "capabilities come from memberships, not a role column".
-- ---------------------------------------------------------------------------

create type public.vendor_member_role as enum ('owner', 'manager', 'responder');
comment on type public.vendor_member_role is
  'Plan §3. owner: billing/payouts/KYC/team. manager: profile+packages+leads. responder: leads+calendar only.';

create type public.staff_role_kind as enum ('field_agent', 'moderator', 'finance', 'super');
comment on type public.staff_role_kind is
  'Plan §3. field_agent: draft-only, own city. moderator: approve/reject. finance: four-eyes. super: all.';

create type public.corporate_member_role as enum ('admin', 'requester');

-- ---------------------------------------------------------------------------
-- Supply. Plan §5: vendors (draft → pending_review → live → paused / suspended)
-- ---------------------------------------------------------------------------

create type public.vendor_status as enum (
  'draft',           -- field agent is still building the listing
  'pending_review',  -- submitted, awaiting moderator
  'live',            -- publicly discoverable + indexable
  'paused',          -- vendor-initiated; hidden, retains data and leads
  'suspended'        -- staff-initiated; hidden, blocked from responding
);

create type public.media_kind as enum ('image', 'video');

create type public.moderation_status as enum ('pending', 'approved', 'rejected', 'escalated');

create type public.moderation_subject as enum (
  'vendor', 'package', 'media', 'review', 'story', 'enquiry'
);

-- ---------------------------------------------------------------------------
-- Demand. Plan §5: leads (routed → viewed → responded → quoted → converted / expired)
-- ---------------------------------------------------------------------------

create type public.event_type as enum (
  'wedding', 'engagement', 'reception', 'sangeet', 'mehendi',
  'birthday', 'anniversary', 'baby_shower', 'housewarming',
  'corporate', 'conference', 'festival', 'other'
);

create type public.enquiry_status as enum (
  'pending_otp',  -- created, phone not yet verified — never routed, never billable
  'verified',     -- OTP passed; budget + date captured
  'routed',       -- fanned out to at most 5 vendors (plan §2 cap)
  'closed',
  'spam'
);

create type public.lead_status as enum (
  'routed', 'viewed', 'responded', 'quoted', 'converted', 'expired'
);
comment on type public.lead_status is
  'Plan §5 demand spine. Forward-only except expiry; transitions via app.transition_lead().';

create type public.lead_activity_kind as enum (
  'routed', 'viewed', 'responded', 'quoted', 'called',
  'whatsapp_sent', 'converted', 'expired', 'contact_revealed', 'credit_refunded'
);

create type public.quote_status as enum (
  'draft', 'sent', 'accepted', 'rejected', 'expired', 'withdrawn'
);

-- ---------------------------------------------------------------------------
-- Money. Plan §5: bookings (initiated → advance_held → confirmed → completed → released,
-- with refund_pending / refunded / disputed branches)
-- ---------------------------------------------------------------------------

create type public.booking_status as enum (
  'initiated',       -- customer accepted a quote; no money moved
  'advance_held',    -- advance captured into aggregator escrow
  'confirmed',       -- vendor confirmed the date against held advance
  'completed',       -- event date passed and service delivered
  'released',        -- funds settled out to the vendor — terminal happy path
  'cancelled',       -- cancelled before any money moved — terminal
  'refund_pending',
  'refunded',        -- terminal
  'disputed'         -- frozen; resolves back to released or refunded
);

create type public.payment_kind as enum ('advance', 'balance', 'full', 'addon');

create type public.payment_status as enum (
  'created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded'
);

create type public.payout_status as enum ('pending', 'processing', 'paid', 'failed', 'on_hold');

create type public.refund_status as enum ('requested', 'approved', 'rejected', 'processing', 'completed', 'failed');

create type public.dispute_status as enum ('open', 'under_review', 'resolved_customer', 'resolved_vendor', 'withdrawn');

create type public.kyc_status as enum ('not_started', 'submitted', 'verified', 'rejected');
comment on type public.kyc_status is
  'Plan §6: "vendor KYC (PAN/GST) gates payouts". Only ''verified'' may receive a payout.';

-- ---------------------------------------------------------------------------
-- Monetisation. Plan §5: subscriptions (trial → active → past_due → cancelled)
-- ---------------------------------------------------------------------------

create type public.subscription_status as enum ('trial', 'active', 'past_due', 'cancelled');

create type public.invoice_status as enum ('draft', 'issued', 'paid', 'void', 'overdue');

-- ---------------------------------------------------------------------------
-- Engagement / ops
-- ---------------------------------------------------------------------------

create type public.notification_channel as enum ('whatsapp', 'sms', 'push', 'email');

create type public.notification_status as enum ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled');

create type public.onboarding_stage as enum (
  'prospect', 'contacted', 'shooting_scheduled', 'media_captured',
  'profile_drafted', 'submitted', 'live', 'rejected', 'dropped'
);

create type public.story_status as enum ('draft', 'pending_review', 'published', 'archived');

-- ---------------------------------------------------------------------------
-- Corporate (Phase 2). Plan §2 "Could" tier.
-- ---------------------------------------------------------------------------

create type public.rfp_status as enum ('draft', 'published', 'closed', 'awarded', 'cancelled');

create type public.rfp_bid_status as enum ('invited', 'declined', 'submitted', 'shortlisted', 'awarded', 'rejected');

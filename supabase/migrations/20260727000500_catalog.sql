-- ============================================================================
-- Utsava — 000500 · Catalog (supply)
-- Plan §5: "categories, vendors, vendor_members, vendor_categories, packages, media,
-- vendor_faqs — style tags live on vendor_categories/packages"
-- Plan §11: the photography wedge rides these existing epics — style taxonomy (S2),
-- portfolio-first profiles (S3), package cards (S4), availability filter (S5).
-- ============================================================================

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  plural_name   text not null,
  parent_id     uuid references public.categories (id) on delete restrict,

  description   text,
  icon          text,
  sort_order    integer not null default 100,

  -- Plan §11: photography is the wedge — 800 of 3,000 launch listings.
  is_wedge      boolean not null default false,
  is_active     boolean not null default true,

  -- Plan §2: "package cards normalised to per-day pricing". Categories priced per-plate
  -- (catering) or per-day (photography) render different card copy.
  pricing_unit  text not null default 'per_day'
                check (pricing_unit in ('per_day', 'per_event', 'per_plate', 'per_person', 'per_hour')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint categories_no_self_parent check (parent_id is null or parent_id <> id)
);

create index categories_parent_idx on public.categories (parent_id);
create index categories_active_idx on public.categories (is_active, sort_order);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Style taxonomy. Plan §S2: "category taxonomy incl. photography style tags".
-- A lookup table drives the filter UI and keeps tag spelling stable across vendors;
-- the tags themselves are denormalised onto vendor_categories/packages per plan §5.
-- ---------------------------------------------------------------------------

create table public.style_tags (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories (id) on delete cascade,
  slug         text not null,
  name         text not null,
  description  text,
  sort_order   integer not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),

  unique (category_id, slug),
  constraint style_tags_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.style_tags is
  'Plan §2/§11: candid / traditional / cinematic / documentary … Drives the discovery filter.';

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------

create table public.vendors (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  display_name    text not null,
  legal_name      text,
  status          public.vendor_status not null default 'draft',

  city_id         uuid not null references public.cities (id) on delete restrict,
  locality_id     uuid references public.localities (id) on delete set null,
  address_line    text,
  location        extensions.geography(point, 4326),

  about           text,
  established_year integer check (established_year is null
                                  or established_year between 1900 and extract(year from now())::int),
  team_size       integer check (team_size is null or team_size > 0),
  travels_outstation boolean not null default false,

  -- Public-safe contact only. Vendor phone/email/WhatsApp and tax identifiers live in
  -- public.vendor_private below — see the note on that table for why.
  website_url     text,
  instagram_handle text,

  -- Plan §2: "price bands" are a Must-tier discovery filter and a launch gate (§13).
  price_band_min  app.paise,
  price_band_max  app.paise,

  -- Plan §6: "vendor KYC (PAN/GST) gates payouts". The status is public-safe (it drives a
  -- "verified" badge); the actual PAN/GSTIN live in public.vendor_private.
  kyc_status      public.kyc_status not null default 'not_started',
  kyc_verified_at timestamptz,

  -- Plan §11: the founder's anchor studio "operates under disclosed, overflow-first rules
  -- with no ranking favour (auditable in the ranking SQL)" and carries a disclosure badge.
  -- app.vendor_rank() must never read this column; the pgTAP suite asserts that.
  is_anchor_studio boolean not null default false,

  -- Denormalised trust + responsiveness. Plan §10 KPI: median vendor response < 2h.
  -- Plan §2: "honest vendor dashboards" read these same numbers customers see.
  rating_avg           numeric(3, 2) check (rating_avg is null or rating_avg between 1 and 5),
  rating_count         integer not null default 0,
  response_rate_pct    smallint check (response_rate_pct is null or response_rate_pct between 0 and 100),
  median_response_mins integer,
  completed_bookings   integer not null default 0,

  -- Plan §13: launch gate is "≥5 photos and price bands"; §12 "quality thresholds"
  -- for the SEO engine. Maintained by trigger in 001500.
  media_count       integer not null default 0,
  profile_score     smallint not null default 0 check (profile_score between 0 and 100),
  is_seo_eligible   boolean not null default false,

  -- Plan §S3: the field team creates listings; the principal claims via OTP (§3).
  created_by_staff  uuid references public.profiles (id),
  claimed_at        timestamptz,

  published_at      timestamptz,
  suspended_reason  text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint vendors_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint vendors_price_band_ordered
    check (price_band_min is null or price_band_max is null or price_band_min <= price_band_max),
  constraint vendors_live_requires_publish
    check (status <> 'live' or published_at is not null)
);

comment on table public.vendors is
  'Plan §5 supply spine. status drives visibility: only ''live'' is publicly readable (§6).';
comment on column public.vendors.is_anchor_studio is
  'Plan §11/§12: disclosure badge + channel-conflict mitigation. Ranking SQL must not reference it.';

create index vendors_status_idx        on public.vendors (status);
create index vendors_city_status_idx   on public.vendors (city_id, status) where status = 'live';
create index vendors_locality_idx      on public.vendors (locality_id) where status = 'live';
create index vendors_location_idx      on public.vendors using gist (location);
create index vendors_seo_idx           on public.vendors (is_seo_eligible) where status = 'live';
create index vendors_price_band_idx    on public.vendors (price_band_min, price_band_max) where status = 'live';
create index vendors_rating_idx        on public.vendors (rating_avg desc nulls last) where status = 'live';
create index vendors_name_trgm_idx     on public.vendors using gin (display_name extensions.gin_trgm_ops);
create index vendors_created_by_staff_idx on public.vendors (created_by_staff);

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vendor private data.
--
-- Plan §6 grants the public "SELECT where live" on vendors. RLS is row-level, not
-- column-level, so any column left on that table is world-readable the moment the
-- listing goes live. Two classes of column cannot survive that:
--
--   · PAN / GSTIN — PII under DPDP, and §6 requires "PII encrypted at rest".
--   · contact phone / email / WhatsApp — the entire lead business depends on contact
--     details being earned through a routed lead, not scraped off a profile page.
--
-- So they live here, behind owner-and-staff-only RLS, and public.vendors stays safe
-- by construction rather than by remembering to exclude columns in every query.
-- ---------------------------------------------------------------------------

create table public.vendor_private (
  vendor_id       uuid primary key references public.vendors (id) on delete cascade,

  contact_phone   text,
  contact_email   text,
  whatsapp_phone  text,

  pan_number      text,
  gstin           text,

  bank_account_name   text,
  bank_account_last4  text,
  bank_ifsc           text,

  kyc_submitted_at    timestamptz,
  kyc_rejected_reason text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint vendor_private_pan_format
    check (pan_number is null or pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  constraint vendor_private_gstin_format
    check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'),
  constraint vendor_private_phone_format
    check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$')
);

comment on table public.vendor_private is
  'Vendor PII and tax identifiers. Never publicly readable — see the note above and the '
  'pgTAP assertion that anon SELECT returns zero rows.';

create trigger vendor_private_set_updated_at
  before update on public.vendor_private
  for each row execute function app.set_updated_at();

-- Every vendor gets exactly one private row, created with the vendor.
create or replace function app.create_vendor_private()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vendor_private (vendor_id)
  values (new.id)
  on conflict (vendor_id) do nothing;
  return new;
end;
$$;

create trigger vendors_create_private
  after insert on public.vendors
  for each row execute function app.create_vendor_private();

-- ---------------------------------------------------------------------------
-- Vendor membership. Plan §3: one human, many contexts.
-- ---------------------------------------------------------------------------

create table public.vendor_members (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        public.vendor_member_role not null default 'responder',

  invited_by  uuid references public.profiles (id),
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at  timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (vendor_id, profile_id)
);

comment on table public.vendor_members is
  'Plan §3: the capability source of truth. owner ⊃ manager ⊃ responder.';

create index vendor_members_profile_idx on public.vendor_members (profile_id) where revoked_at is null;
create index vendor_members_vendor_idx  on public.vendor_members (vendor_id) where revoked_at is null;

-- Exactly one active owner per vendor — owner holds billing, payouts and KYC (§3).
create unique index vendor_members_single_owner_idx
  on public.vendor_members (vendor_id)
  where role = 'owner' and revoked_at is null;

create trigger vendor_members_set_updated_at
  before update on public.vendor_members
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vendor × category, carrying the style tags (plan §5).
-- ---------------------------------------------------------------------------

create table public.vendor_categories (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors (id) on delete cascade,
  category_id   uuid not null references public.categories (id) on delete restrict,

  is_primary    boolean not null default false,
  style_tags    text[] not null default '{}',

  price_band_min app.paise,
  price_band_max app.paise,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (vendor_id, category_id),
  constraint vendor_categories_price_band_ordered
    check (price_band_min is null or price_band_max is null or price_band_min <= price_band_max)
);

create index vendor_categories_category_idx on public.vendor_categories (category_id);
create index vendor_categories_vendor_idx   on public.vendor_categories (vendor_id);
create index vendor_categories_styles_idx   on public.vendor_categories using gin (style_tags);

-- One primary category per vendor drives the canonical SEO URL.
create unique index vendor_categories_single_primary_idx
  on public.vendor_categories (vendor_id) where is_primary;

create trigger vendor_categories_set_updated_at
  before update on public.vendor_categories
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Packages. Plan §2: "package cards normalised to per-day pricing".
-- ---------------------------------------------------------------------------

create table public.packages (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors (id) on delete cascade,
  category_id   uuid not null references public.categories (id) on delete restrict,

  name          text not null,
  description   text,
  style_tags    text[] not null default '{}',

  price         app.paise not null,
  pricing_unit  text not null default 'per_day'
                check (pricing_unit in ('per_day', 'per_event', 'per_plate', 'per_person', 'per_hour')),

  -- The normaliser. A "3-day wedding package" and a "1-day package" become comparable
  -- cards because both expose price_per_day. Generated, so it can never drift.
  duration_days numeric(4, 1) not null default 1 check (duration_days > 0),
  price_per_day bigint generated always as
                ((price / greatest(duration_days, 0.5))::bigint) stored,

  -- Photography specifics surfaced on the card (plan §11).
  deliverables      text[] not null default '{}',
  crew_size         integer check (crew_size is null or crew_size > 0),
  edited_photo_count integer,
  delivery_days     integer,

  inclusions    text[] not null default '{}',
  exclusions    text[] not null default '{}',

  is_active     boolean not null default true,
  sort_order    integer not null default 100,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.packages.price_per_day is
  'Plan §2: the normalisation that makes package cards comparable across vendors. Generated — never written.';

create index packages_vendor_idx     on public.packages (vendor_id) where is_active;
create index packages_category_idx   on public.packages (category_id) where is_active;
create index packages_per_day_idx    on public.packages (price_per_day) where is_active;
create index packages_styles_idx     on public.packages using gin (style_tags);

create trigger packages_set_updated_at
  before update on public.packages
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Media. Plan §S2: "media pipeline (Storage + transforms)".
-- Plan §12: "Supabase CDN transforms bypass the image optimizer" — we store the
-- Storage path, never a Vercel-optimised URL.
-- ---------------------------------------------------------------------------

create table public.media (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors (id) on delete cascade,
  package_id    uuid references public.packages (id) on delete set null,

  kind          public.media_kind not null default 'image',
  storage_path  text not null,
  width         integer,
  height        integer,
  bytes         bigint,
  blurhash      text,
  alt_text      text,
  caption       text,

  style_tags    text[] not null default '{}',

  -- Plan §S3: portfolio-first profile editor. Order is the vendor's curation.
  sort_order    integer not null default 100,
  is_cover      boolean not null default false,

  moderation    public.moderation_status not null default 'pending',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint media_dimensions_positive
    check ((width is null or width > 0) and (height is null or height > 0))
);

create index media_vendor_idx  on public.media (vendor_id, sort_order);
create index media_package_idx on public.media (package_id);
create index media_moderation_idx on public.media (moderation) where moderation = 'pending';
create unique index media_single_cover_idx on public.media (vendor_id) where is_cover;

create trigger media_set_updated_at
  before update on public.media
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vendor FAQs — deflects repeat questions and feeds SEO long-tail (plan §5).
-- ---------------------------------------------------------------------------

create table public.vendor_faqs (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  question    text not null,
  answer      text not null,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index vendor_faqs_vendor_idx on public.vendor_faqs (vendor_id, sort_order);

create trigger vendor_faqs_set_updated_at
  before update on public.vendor_faqs
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Availability. Plan §2: the "'free on my date' availability filter" is Must-tier,
-- and plan §S8 ships the vendor-app calendar that maintains it.
-- Absence of a row means available — vendors block, they do not confirm.
-- ---------------------------------------------------------------------------

create table public.vendor_availability (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  blocked_on  date not null,
  reason      text not null default 'booked' check (reason in ('booked', 'held', 'personal', 'travel')),
  booking_id  uuid,  -- FK added in 000700
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),

  unique (vendor_id, blocked_on)
);

comment on table public.vendor_availability is
  'Plan §2/§S5: backs the ''free on my date'' filter. A vendor with no row for a date is available.';

create index vendor_availability_date_idx on public.vendor_availability (blocked_on, vendor_id);

-- Default-deny across the catalog. Plan §6.
alter table public.categories          enable row level security;
alter table public.style_tags          enable row level security;
alter table public.vendors             enable row level security;
alter table public.vendor_private      enable row level security;
alter table public.vendor_members      enable row level security;
alter table public.vendor_categories   enable row level security;
alter table public.packages            enable row level security;
alter table public.media               enable row level security;
alter table public.vendor_faqs         enable row level security;
alter table public.vendor_availability enable row level security;


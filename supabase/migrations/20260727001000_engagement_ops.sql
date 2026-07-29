-- ============================================================================
-- Utsava — 001000 · Engagement & operations
-- Plan §5: "checklists, checklist_items, notifications (outbox), e_invites,
-- onboarding_pipeline, cms_pages"
-- Plan §7: e-invites and checklist are the declared scope valves — "e-invites and
-- checklist fall back to the beta window before anything touching lead quality".
-- ============================================================================

create table public.checklists (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  name          text not null default 'Planning checklist',
  template_slug text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (event_id)
);

create trigger checklists_set_updated_at
  before update on public.checklists
  for each row execute function app.set_updated_at();

create table public.checklist_items (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references public.checklists (id) on delete cascade,
  category_id   uuid references public.categories (id) on delete set null,

  title         text not null,
  description   text,
  -- Negative = before the event, positive = after. Renders "3 months before".
  due_offset_days integer,
  due_date      date,

  is_done       boolean not null default false,
  done_at       timestamptz,
  sort_order    integer not null default 100,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index checklist_items_checklist_idx on public.checklist_items (checklist_id, sort_order);

create trigger checklist_items_set_updated_at
  before update on public.checklist_items
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications outbox. Plan §S7: "WhatsApp/SMS/FCM via outbox + pgmq".
-- The table is the source of truth and the retry ledger; pgmq (when present) is the
-- delivery transport. Writing the row and committing the business transaction happen
-- together, so a crash can never lose a notification or double-send one.
-- ---------------------------------------------------------------------------

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid references public.profiles (id) on delete cascade,
  vendor_id     uuid references public.vendors (id) on delete cascade,

  channel       public.notification_channel not null,
  status        public.notification_status not null default 'queued',

  template      text not null,
  payload       jsonb not null default '{}'::jsonb,

  to_phone      text,
  to_email      text,
  to_push_token text,

  subject_type  text,
  subject_id    uuid,

  -- Idempotency: one notification per (template, subject, channel, recipient).
  -- A retried server action cannot double-send.
  dedupe_key    text not null unique,

  attempts      integer not null default 0,
  max_attempts  integer not null default 5,
  scheduled_for timestamptz not null default now(),
  sent_at       timestamptz,
  delivered_at  timestamptz,
  failed_at     timestamptz,
  last_error    text,

  provider_message_id text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.notifications is
  'Plan §S7 transactional outbox. Rows are written inside the business transaction; a '
  'worker drains queued → sent. dedupe_key makes the whole path idempotent.';

create index notifications_drain_idx on public.notifications (status, scheduled_for)
  where status in ('queued', 'sending');
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_vendor_idx on public.notifications (vendor_id, created_at desc);

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- E-invites. Plan §2 Should tier, §S10 "e-invites v1".
-- ---------------------------------------------------------------------------

create table public.e_invites (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,

  slug          text not null unique,
  template_slug text not null default 'classic',
  title         text not null,
  message       text,
  hosts         text,
  venue_name    text,
  venue_address text,
  starts_at     timestamptz,

  theme         jsonb not null default '{}'::jsonb,
  cover_storage_path text,

  is_published  boolean not null default false,
  published_at  timestamptz,
  view_count    integer not null default 0,

  -- Anyone with the link may RSVP; the link itself is the credential.
  rsvp_enabled  boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint e_invites_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index e_invites_event_idx on public.e_invites (event_id);

create trigger e_invites_set_updated_at
  before update on public.e_invites
  for each row execute function app.set_updated_at();

create table public.e_invite_rsvps (
  id          uuid primary key default gen_random_uuid(),
  invite_id   uuid not null references public.e_invites (id) on delete cascade,
  guest_name  text not null,
  guest_phone text,
  response    text not null check (response in ('yes', 'no', 'maybe')),
  party_size  integer not null default 1 check (party_size > 0),
  message     text,
  created_at  timestamptz not null default now()
);

create index e_invite_rsvps_invite_idx on public.e_invite_rsvps (invite_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Onboarding pipeline. Plan §1: "Supply tooling before demand product … 3,000
-- concierge-quality listings are the launch asset." This is the field team's CRM.
-- Plan §S3: the onboarding tool ships Sep/Oct 2026, seven months before customers.
-- ---------------------------------------------------------------------------

create table public.onboarding_pipeline (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid references public.vendors (id) on delete set null,

  business_name text not null,
  contact_name  text,
  contact_phone text not null,
  contact_email text,

  city_id       uuid not null references public.cities (id) on delete restrict,
  locality_id   uuid references public.localities (id) on delete set null,
  category_id   uuid references public.categories (id) on delete set null,

  stage         public.onboarding_stage not null default 'prospect',
  assigned_to   uuid references public.profiles (id) on delete set null,

  source        text,
  notes         text,
  next_action_at timestamptz,

  -- Plan §13 launch gate: "≥5 photos and price bands" per listing.
  photos_captured integer not null default 0,
  price_band_captured boolean not null default false,

  contacted_at  timestamptz,
  shoot_at      timestamptz,
  submitted_at  timestamptz,
  went_live_at  timestamptz,
  dropped_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.onboarding_pipeline is
  'Plan §1: the 3,000-listing launch asset is built here, by the field team, from Sep 2026.';

create index onboarding_pipeline_stage_idx on public.onboarding_pipeline (stage, next_action_at);
create index onboarding_pipeline_agent_idx on public.onboarding_pipeline (assigned_to, stage);
create index onboarding_pipeline_city_idx  on public.onboarding_pipeline (city_id, stage);

create trigger onboarding_pipeline_set_updated_at
  before update on public.onboarding_pipeline
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- CMS pages. Plan §S9 "content tooling"; backs legal pages, the §11 disclosure
-- policy page, and editorial landing pages.
-- ---------------------------------------------------------------------------

create table public.cms_pages (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  body          text,
  excerpt       text,
  page_type     text not null default 'page'
                check (page_type in ('page', 'legal', 'guide', 'landing', 'policy')),

  meta_title    text,
  meta_description text,
  og_image_path text,
  is_indexable  boolean not null default true,

  is_published  boolean not null default false,
  published_at  timestamptz,
  updated_by    uuid references public.profiles (id),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Allows multi-word slugs and one level of nesting: 'privacy', 'vendor-terms',
  -- 'anchor-studio-policy', 'guides/wedding-photography'.
  constraint cms_pages_slug_format check (slug ~ '^[a-z0-9]+([-/][a-z0-9]+)*$')
);

create index cms_pages_published_idx on public.cms_pages (is_published, page_type);

create trigger cms_pages_set_updated_at
  before update on public.cms_pages
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Analytics events. Plan §10: "Events flow to PostHog + a nightly warehouse export;
-- vendor dashboards and board dashboards read the same semantic definitions, so the
-- numbers always match." Holding them in Postgres is what makes that true.
-- ---------------------------------------------------------------------------

create table public.analytics_events (
  id            bigint generated always as identity primary key,
  name          text not null,
  profile_id    uuid references public.profiles (id) on delete set null,
  anonymous_id  text,
  session_id    text,

  vendor_id     uuid references public.vendors (id) on delete set null,
  enquiry_id    uuid references public.enquiries (id) on delete set null,
  lead_id       uuid references public.leads (id) on delete set null,
  booking_id    uuid references public.bookings (id) on delete set null,

  city_id       uuid references public.cities (id) on delete set null,
  category_id   uuid references public.categories (id) on delete set null,

  properties    jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now()
);

comment on table public.analytics_events is
  'Plan §10 funnel spine: search_performed → enquiry_submitted → lead_routed → '
  'vendor_responded → booking_completed. North star: verified leads delivered per week.';

create index analytics_events_name_time_idx on public.analytics_events (name, occurred_at desc);
create index analytics_events_vendor_idx on public.analytics_events (vendor_id, occurred_at desc);
create index analytics_events_profile_idx on public.analytics_events (profile_id, occurred_at desc);

create trigger analytics_events_append_only
  before update or delete on public.analytics_events
  for each row execute function app.forbid_mutation();

alter table public.checklists          enable row level security;
alter table public.checklist_items     enable row level security;
alter table public.notifications       enable row level security;
alter table public.e_invites           enable row level security;
alter table public.e_invite_rsvps      enable row level security;
alter table public.onboarding_pipeline enable row level security;
alter table public.cms_pages           enable row level security;
alter table public.analytics_events    enable row level security;


-- ============================================================================
-- Fremmo — 000600 · Demand spine
-- Plan §5: "The demand spine (green) is the product: events → enquiries → leads →
-- quotes → bookings."
-- Plan §1: "Lead quality is an engineering feature: OTP verification, budget and date
-- capture, the five-vendor cap and honest vendor dashboards are core MVP scope —
-- renewal, the model's most sensitive assumption, depends on them."
-- ============================================================================

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,

  name          text,
  event_type    public.event_type not null,
  event_date    date,
  date_flexible boolean not null default false,
  guest_count   integer check (guest_count is null or guest_count > 0),

  city_id       uuid references public.cities (id) on delete set null,
  locality_id   uuid references public.localities (id) on delete set null,

  budget_min    app.paise,
  budget_max    app.paise,

  notes         text,
  is_archived   boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint events_budget_ordered
    check (budget_min is null or budget_max is null or budget_min <= budget_max)
);

comment on table public.events is
  'A customer''s celebration. Groups enquiries, shortlists and the planning checklist.';

create index events_owner_idx on public.events (owner_id) where not is_archived;
create index events_date_idx  on public.events (event_date);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Enquiries. Plan §2: "enquiry flow with OTP + budget/date verification".
-- An enquiry is not routable until phone_verified_at is set — that is the whole
-- lead-quality thesis, so it is a table constraint, not a UI rule.
-- ---------------------------------------------------------------------------

create table public.enquiries (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references public.events (id) on delete set null,
  customer_id     uuid references public.profiles (id) on delete set null,

  category_id     uuid not null references public.categories (id) on delete restrict,
  city_id         uuid not null references public.cities (id) on delete restrict,
  locality_id     uuid references public.localities (id) on delete set null,

  event_type      public.event_type not null,
  event_date      date,
  date_flexible   boolean not null default false,
  guest_count     integer check (guest_count is null or guest_count > 0),

  -- Plan §2: budget capture is part of verification, not an optional field.
  budget_min      app.paise,
  budget_max      app.paise,

  style_preferences text[] not null default '{}',
  message         text,

  -- Contact as typed. Masked from vendors until the lead state permits (§6).
  contact_name    text not null,
  contact_phone   text not null,
  contact_email   text,

  status          public.enquiry_status not null default 'pending_otp',
  phone_verified_at timestamptz,

  -- Plan §6: "DPDP consent at enquiry with purpose limitation (a lead shared with five
  -- vendors says so)". The exact string shown to the customer is stored, not a boolean,
  -- so a consent audit can reproduce what they actually agreed to.
  consent_text       text not null,
  consent_version    text not null,
  consent_given_at   timestamptz not null default now(),
  consent_ip         inet,

  -- Plan §12: lead-quality failure is the top risk; spam scoring feeds moderation.
  spam_score      smallint not null default 0 check (spam_score between 0 and 100),
  source          text not null default 'web' check (source in ('web', 'vendor_app', 'partner_pwa', 'admin', 'seo')),
  utm             jsonb not null default '{}'::jsonb,

  routed_at       timestamptz,
  closed_at       timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint enquiries_budget_ordered
    check (budget_min is null or budget_max is null or budget_min <= budget_max),
  constraint enquiries_phone_format
    check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- The lead-quality invariant: anything past pending_otp carries a verification timestamp.
  constraint enquiries_verified_before_routing
    check (status = 'pending_otp' or status = 'spam' or phone_verified_at is not null)
);

comment on table public.enquiries is
  'Plan §1: OTP verification + budget/date capture are what make a lead worth paying for.';
comment on column public.enquiries.consent_text is
  'Plan §6 DPDP purpose limitation — verbatim consent copy, versioned, reproducible in an audit.';

create index enquiries_customer_idx on public.enquiries (customer_id, created_at desc);
create index enquiries_event_idx    on public.enquiries (event_id);
create index enquiries_status_idx   on public.enquiries (status, created_at desc);
create index enquiries_routing_idx  on public.enquiries (category_id, city_id, status)
  where status = 'verified';
create index enquiries_phone_idx    on public.enquiries (contact_phone, created_at desc);

create trigger enquiries_set_updated_at
  before update on public.enquiries
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leads. Plan §5: "leads (UNIQUE enquiry × vendor)". Plan §2: 5-vendor cap.
--
-- The cap is enforced declaratively via routed_seq ∈ [1,5] + UNIQUE(enquiry, seq).
-- A counting trigger would race under concurrent routing; two transactions competing
-- for seq 5 here simply collide on the unique index and one rolls back.
-- ---------------------------------------------------------------------------

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  enquiry_id    uuid not null references public.enquiries (id) on delete cascade,
  vendor_id     uuid not null references public.vendors (id) on delete cascade,

  status        public.lead_status not null default 'routed',

  routed_seq    smallint not null check (routed_seq between 1 and 5),
  match_score   numeric(6, 3),

  routed_at     timestamptz not null default now(),
  viewed_at     timestamptz,
  responded_at  timestamptz,
  quoted_at     timestamptz,
  converted_at  timestamptz,
  expires_at    timestamptz not null default (now() + interval '7 days'),

  -- Plan §6: "contact masking is a view — vendors see a customer's phone only in
  -- permitted lead states". Set when the vendor first opens the lead.
  contact_revealed_at timestamptz,

  -- Plan §12: "credit refunds" are part of the lead-quality mitigation. A vendor who
  -- receives a junk lead gets the credit back, and the dashboard shows it honestly.
  credit_charged   boolean not null default true,
  credit_refunded_at timestamptz,
  refund_reason    text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint leads_unique_enquiry_vendor unique (enquiry_id, vendor_id),
  constraint leads_cap_five unique (enquiry_id, routed_seq)
);

comment on table public.leads is
  'Plan §2/§5: one row per enquiry × vendor, hard-capped at 5 by the routed_seq unique index.';
comment on column public.leads.routed_seq is
  'Plan §2 five-vendor cap, enforced declaratively. Never renumber; expiry does not free a slot.';

create index leads_vendor_status_idx on public.leads (vendor_id, status, routed_at desc);
create index leads_enquiry_idx       on public.leads (enquiry_id);
create index leads_expiry_idx        on public.leads (expires_at)
  where status in ('routed', 'viewed');

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Lead activities — append-only. Feeds the vendor dashboard (§2 "honest vendor
-- dashboards") and the §10 Match-stage KPI events.
-- ---------------------------------------------------------------------------

create table public.lead_activities (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references public.leads (id) on delete cascade,
  actor_id    uuid references public.profiles (id),
  kind        public.lead_activity_kind not null,
  note        text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);
create index lead_activities_kind_idx on public.lead_activities (kind, created_at desc);

create trigger lead_activities_append_only
  before update or delete on public.lead_activities
  for each row execute function app.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Shortlists. Plan §2 Must-tier.
-- ---------------------------------------------------------------------------

create table public.shortlists (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  event_id    uuid references public.events (id) on delete cascade,
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now(),

  unique (profile_id, event_id, vendor_id)
);

create index shortlists_profile_idx on public.shortlists (profile_id, created_at desc);
create index shortlists_vendor_idx  on public.shortlists (vendor_id);

alter table public.events          enable row level security;
alter table public.enquiries       enable row level security;
alter table public.leads           enable row level security;
alter table public.lead_activities enable row level security;
alter table public.shortlists      enable row level security;


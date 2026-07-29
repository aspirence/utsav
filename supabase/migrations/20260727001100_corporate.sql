-- ============================================================================
-- Utsava — 001100 · Corporate (Phase 2)
-- Plan §5: "corporate_orgs, corporate_members, rfps, rfp_invites, rfp_bids"
-- Plan §5: "corporate (Phase 2) ends in the same vendor graph" — an RFP bid resolves
-- to the same vendors/quotes/bookings tables, not a parallel universe.
-- Plan §2: Could tier, H2 FY28. Shipped dark; schema lands now so the vendor graph
-- never has to be reshaped for it later.
-- ============================================================================

create table public.corporate_orgs (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  legal_name    text,

  -- Plan §3: "Google OAuth with domain capture" — anyone with an @acme.com Google
  -- account joins the Acme org automatically as a requester.
  email_domains text[] not null default '{}',

  gstin         text,
  billing_address text,
  city_id       uuid references public.cities (id) on delete set null,

  is_active     boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint corporate_orgs_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint corporate_orgs_gstin_format
    check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$')
);

create index corporate_orgs_domains_idx on public.corporate_orgs using gin (email_domains);

create trigger corporate_orgs_set_updated_at
  before update on public.corporate_orgs
  for each row execute function app.set_updated_at();

create table public.corporate_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.corporate_orgs (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        public.corporate_member_role not null default 'requester',

  invited_by  uuid references public.profiles (id),
  accepted_at timestamptz,
  revoked_at  timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (org_id, profile_id)
);

create index corporate_members_profile_idx on public.corporate_members (profile_id) where revoked_at is null;
create index corporate_members_org_idx on public.corporate_members (org_id) where revoked_at is null;

create trigger corporate_members_set_updated_at
  before update on public.corporate_members
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- RFPs. Plan §3: admins create/publish; requesters are draft-only.
-- ---------------------------------------------------------------------------

create table public.rfps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.corporate_orgs (id) on delete cascade,
  created_by    uuid not null references public.profiles (id) on delete restrict,

  reference     text not null unique,
  title         text not null,
  brief         text,

  event_type    public.event_type not null default 'corporate',
  event_date    date,
  event_end_date date,
  headcount     integer check (headcount is null or headcount > 0),

  city_id       uuid not null references public.cities (id) on delete restrict,
  locality_id   uuid references public.localities (id) on delete set null,
  category_ids  uuid[] not null default '{}',

  budget_min    app.paise,
  budget_max    app.paise,

  status        public.rfp_status not null default 'draft',
  bids_due_at   timestamptz,

  published_by  uuid references public.profiles (id),
  published_at  timestamptz,
  awarded_at    timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint rfps_budget_ordered
    check (budget_min is null or budget_max is null or budget_min <= budget_max),
  constraint rfps_dates_ordered
    check (event_end_date is null or event_date is null or event_end_date >= event_date),
  -- Plan §3: only an admin publishes, and publishing is recorded.
  constraint rfps_published_has_publisher
    check (status = 'draft' or published_by is not null)
);

create index rfps_org_idx on public.rfps (org_id, status, created_at desc);
create index rfps_open_idx on public.rfps (status, bids_due_at) where status = 'published';

create trigger rfps_set_updated_at
  before update on public.rfps
  for each row execute function app.set_updated_at();

create table public.rfp_invites (
  id          uuid primary key default gen_random_uuid(),
  rfp_id      uuid not null references public.rfps (id) on delete cascade,
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  invited_by  uuid references public.profiles (id),
  invited_at  timestamptz not null default now(),
  viewed_at   timestamptz,

  unique (rfp_id, vendor_id)
);

create index rfp_invites_vendor_idx on public.rfp_invites (vendor_id, invited_at desc);

create table public.rfp_bids (
  id          uuid primary key default gen_random_uuid(),
  rfp_id      uuid not null references public.rfps (id) on delete cascade,
  vendor_id   uuid not null references public.vendors (id) on delete cascade,

  status      public.rfp_bid_status not null default 'invited',

  amount      app.paise,
  proposal    text,
  line_items  jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,

  submitted_at timestamptz,
  decided_at   timestamptz,
  decided_by   uuid references public.profiles (id),
  decline_reason text,

  -- Plan §5: corporate "ends in the same vendor graph" — an awarded bid becomes a
  -- booking in the ordinary bookings table.
  booking_id  uuid references public.bookings (id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (rfp_id, vendor_id),
  constraint rfp_bids_submitted_has_amount
    check (status <> 'submitted' or amount is not null)
);

create index rfp_bids_rfp_idx on public.rfp_bids (rfp_id, status);
create index rfp_bids_vendor_idx on public.rfp_bids (vendor_id, status);

-- At most one awarded bid per RFP.
create unique index rfp_bids_single_award_idx on public.rfp_bids (rfp_id) where status = 'awarded';

create trigger rfp_bids_set_updated_at
  before update on public.rfp_bids
  for each row execute function app.set_updated_at();

alter table public.corporate_orgs    enable row level security;
alter table public.corporate_members enable row level security;
alter table public.rfps              enable row level security;
alter table public.rfp_invites       enable row level security;
alter table public.rfp_bids          enable row level security;


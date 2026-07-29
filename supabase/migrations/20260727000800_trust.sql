-- ============================================================================
-- Utsava — 000800 · Trust
-- Plan §5: "reviews (FK booking_id UNIQUE — one per completed booking), review_media,
-- moderation_queue, stories (real-wedding galleries, all-vendor tagging)"
-- Plan §2: "booking-gated reviews" are Must-tier at launch.
--
-- Note on sequencing: bookings exist as records from launch (Apr 2027) even though
-- escrow money only flows from Jul 2027 (§2 Should tier). A booking may therefore reach
-- 'completed' with zero rupees attached — which is exactly how the §13 launch gate of
-- "500 beta-verified reviews" is satisfied before escrow ships.
-- ============================================================================

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),

  -- Plan §5: UNIQUE. One review per completed booking — this is the anti-fake-review
  -- design. There is no path to a review without a booking row.
  booking_id    uuid not null unique references public.bookings (id) on delete cascade,

  vendor_id     uuid not null references public.vendors (id) on delete cascade,
  author_id     uuid not null references public.profiles (id) on delete cascade,

  rating          smallint not null check (rating between 1 and 5),
  rating_quality  smallint check (rating_quality between 1 and 5),
  rating_value    smallint check (rating_value between 1 and 5),
  rating_punctuality smallint check (rating_punctuality between 1 and 5),
  rating_professionalism smallint check (rating_professionalism between 1 and 5),

  title         text,
  body          text,

  moderation    public.moderation_status not null default 'pending',
  published_at  timestamptz,
  rejected_reason text,

  -- One right of reply per review; vendors cannot edit or hide the review itself.
  vendor_reply      text,
  vendor_replied_at timestamptz,

  helpful_count integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint reviews_published_requires_approval
    check (published_at is null or moderation = 'approved')
);

comment on table public.reviews is
  'Plan §2/§5: booking-gated. The UNIQUE booking_id is the trust guarantee.';

create index reviews_vendor_idx on public.reviews (vendor_id, published_at desc nulls last)
  where moderation = 'approved';
create index reviews_author_idx on public.reviews (author_id);
create index reviews_moderation_idx on public.reviews (moderation) where moderation = 'pending';

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function app.set_updated_at();

create table public.review_media (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews (id) on delete cascade,
  kind        public.media_kind not null default 'image',
  storage_path text not null,
  width       integer,
  height      integer,
  moderation  public.moderation_status not null default 'pending',
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

create index review_media_review_idx on public.review_media (review_id, sort_order);

-- ---------------------------------------------------------------------------
-- Moderation queue. Plan §S8 ships it; §13 gates launch on "moderation staffed with SLA".
-- ---------------------------------------------------------------------------

create table public.moderation_queue (
  id            uuid primary key default gen_random_uuid(),
  subject_type  public.moderation_subject not null,
  subject_id    uuid not null,
  vendor_id     uuid references public.vendors (id) on delete cascade,
  city_id       uuid references public.cities (id) on delete set null,

  status        public.moderation_status not null default 'pending',
  priority      smallint not null default 5 check (priority between 1 and 9),
  reason        text,
  auto_flags    text[] not null default '{}',

  assigned_to   uuid references public.profiles (id),
  decided_by    uuid references public.profiles (id),
  decided_at    timestamptz,
  decision_note text,

  -- Plan §13: moderation runs to an SLA.
  sla_due_at    timestamptz not null default (now() + interval '24 hours'),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (subject_type, subject_id)
);

create index moderation_queue_pending_idx
  on public.moderation_queue (status, priority, sla_due_at)
  where status in ('pending', 'escalated');
create index moderation_queue_city_idx on public.moderation_queue (city_id);

create trigger moderation_queue_set_updated_at
  before update on public.moderation_queue
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Stories. Plan §2 (Should, beta window) and §11: "real-wedding stories
-- (photographer-contributed, all-vendor tagging)". Seeded from the anchor studio's
-- 50 season weddings — the content flywheel behind §10's Trust KPI.
-- ---------------------------------------------------------------------------

create table public.stories (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  subtitle      text,
  body          text,

  -- The contributing photographer. Plan §11: stories are photographer-contributed.
  author_vendor_id uuid references public.vendors (id) on delete set null,
  submitted_by     uuid references public.profiles (id) on delete set null,

  city_id       uuid references public.cities (id) on delete set null,
  locality_id   uuid references public.localities (id) on delete set null,
  event_type    public.event_type not null default 'wedding',
  event_date    date,

  couple_names  text,
  guest_count   integer,
  style_tags    text[] not null default '{}',

  cover_storage_path text,
  gallery        jsonb not null default '[]'::jsonb,

  status        public.story_status not null default 'draft',
  published_at  timestamptz,
  view_count    integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint stories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint stories_published_has_date
    check (status <> 'published' or published_at is not null)
);

create index stories_status_idx on public.stories (status, published_at desc nulls last);
create index stories_city_idx   on public.stories (city_id) where status = 'published';
create index stories_author_idx on public.stories (author_vendor_id);
create index stories_styles_idx on public.stories using gin (style_tags);

create trigger stories_set_updated_at
  before update on public.stories
  for each row execute function app.set_updated_at();

-- Plan §11: "all-vendor tagging" — one story credits every vendor on the wedding,
-- which is what makes contributing worthwhile for the whole supply base, not just
-- the photographer who submitted it.
create table public.story_vendors (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references public.stories (id) on delete cascade,
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  credit_note text,
  -- A tagged vendor confirms the credit before it appears on their profile.
  confirmed_at timestamptz,
  created_at  timestamptz not null default now(),

  unique (story_id, vendor_id)
);

create index story_vendors_vendor_idx on public.story_vendors (vendor_id) where confirmed_at is not null;
create index story_vendors_story_idx  on public.story_vendors (story_id);

alter table public.reviews          enable row level security;
alter table public.review_media     enable row level security;
alter table public.moderation_queue enable row level security;
alter table public.stories          enable row level security;
alter table public.story_vendors    enable row level security;


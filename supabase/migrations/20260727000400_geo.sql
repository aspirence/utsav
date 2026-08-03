-- ============================================================================
-- Fremmo — 000400 · Geography
-- Plan §5: "cities, localities (PostGIS; locality = the SEO unit)"
-- Plan §4: the discovery route is (discover)/[city]/[category]/[locality], and the
-- programmatic SEO page engine generates one ISR page per live combination.
-- ============================================================================

create table public.cities (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  state         text not null,
  country_code  text not null default 'IN',

  centroid      extensions.geography(point, 4326),

  -- Plan §14: "8-city scale-out (config-driven launches)". A city is dark until launched.
  is_launched   boolean not null default false,
  launched_at   timestamptz,
  launch_order  integer,

  -- Plan §13: "every category ≥50 listings per city" is a launch gate; denormalised
  -- for the readiness dashboard, refreshed by app.refresh_city_stats().
  live_vendor_count integer not null default 0,

  timezone      text not null default 'Asia/Kolkata',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint cities_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.cities is
  'Plan §1: Lucknow + Delhi NCR at public launch (Apr 2027). Others stay is_launched=false.';

create index cities_launched_idx on public.cities (is_launched, launch_order);
create index cities_centroid_idx on public.cities using gist (centroid);

create trigger cities_set_updated_at
  before update on public.cities
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Localities — the SEO unit. Plan §12: "sitemap partitioning" keys off this table.
-- ---------------------------------------------------------------------------

create table public.localities (
  id            uuid primary key default gen_random_uuid(),
  city_id       uuid not null references public.cities (id) on delete cascade,
  slug          text not null,
  name          text not null,

  centroid      extensions.geography(point, 4326),
  boundary      extensions.geography(polygon, 4326),

  -- Plan §12: "quality thresholds" — a locality page is only generated and put in the
  -- sitemap once it has enough live listings to be worth indexing. Thin pages are
  -- noindex, which is what keeps the SEO engine from shipping doorway pages.
  is_seo_eligible   boolean not null default false,
  live_vendor_count integer not null default 0,

  -- Free text a customer might type: "Gomti Nagar", "Indira Nagar", "CMH Road".
  aliases       text[] not null default '{}',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (city_id, slug),
  constraint localities_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.localities is
  'Plan §5: "locality = the SEO unit". One ISR page per city × category × locality once eligible.';
comment on column public.localities.is_seo_eligible is
  'Plan §12 quality threshold. False ⇒ page renders noindex and is excluded from sitemaps.';

create index localities_city_idx on public.localities (city_id);
create index localities_seo_idx on public.localities (city_id, is_seo_eligible) where is_seo_eligible;
create index localities_centroid_idx on public.localities using gist (centroid);
create index localities_boundary_idx on public.localities using gist (boundary);
create index localities_name_trgm_idx on public.localities using gin (name extensions.gin_trgm_ops);

create trigger localities_set_updated_at
  before update on public.localities
  for each row execute function app.set_updated_at();

-- Deferred FK from 000300 — profiles.city_id needed cities to exist first.
alter table public.profiles
  add constraint profiles_city_id_fkey
  foreign key (city_id) references public.cities (id) on delete set null;

-- Geo is public read-only reference data; writes are staff-only (policies in 001300).
alter table public.cities     enable row level security;
alter table public.localities enable row level security;

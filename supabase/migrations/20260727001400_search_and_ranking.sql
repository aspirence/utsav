-- ============================================================================
-- Utsava — 001400 · Search & ranking
-- Plan §4: "Postgres-native search first (FTS + pg_trgm + PostGIS ranking function);
-- Typesense only past mechanical exit criteria (p95 > 200 ms or 50k listings)."
-- Plan §12: "ranking isolated behind one SQL function" — that function is
-- app.vendor_rank(). Swapping to Typesense replaces its callers, not the schema.
-- Plan §13 performance gate: search < 200 ms.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The search document.
--
-- A generated column can only see its own row, but a useful document needs the
-- locality name, the category names and the style tags ("candid photographer
-- indiranagar" has to match). So it is a plain column maintained by triggers on
-- every table that contributes to it.
-- ---------------------------------------------------------------------------

alter table public.vendors
  add column search_document text,
  add column search_vector   tsvector;

create index vendors_search_vector_idx on public.vendors using gin (search_vector);
create index vendors_search_trgm_idx
  on public.vendors using gin (search_document extensions.gin_trgm_ops);

create or replace function app.build_vendor_search(p_vendor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc text;
begin
  select concat_ws(' ',
           v.display_name,
           v.about,
           c.name,
           l.name,
           array_to_string(l.aliases, ' '),
           (select string_agg(cat.name || ' ' || cat.plural_name, ' ')
              from public.vendor_categories vc
              join public.categories cat on cat.id = vc.category_id
             where vc.vendor_id = v.id),
           (select string_agg(array_to_string(vc.style_tags, ' '), ' ')
              from public.vendor_categories vc
             where vc.vendor_id = v.id),
           (select string_agg(p.name, ' ')
              from public.packages p
             where p.vendor_id = v.id and p.is_active)
         )
    into v_doc
  from public.vendors v
  join public.cities c on c.id = v.city_id
  left join public.localities l on l.id = v.locality_id
  where v.id = p_vendor_id;

  -- search_document/search_vector are in app.guard_vendor_columns()'s derived-metric
  -- tuple, and this UPDATE is reached from a trigger on a vendor's own profile edit —
  -- so it must announce itself as a trusted write or the guard rejects the edit.
  perform app.set_trusted_write(true);

  update public.vendors
     set search_document = v_doc,
         -- Weights: name beats category beats prose, so an exact studio-name search
         -- outranks a vendor who merely mentions the name in their about text.
         search_vector = setweight(to_tsvector('simple', coalesce(display_name, '')), 'A')
                      || setweight(to_tsvector('simple', coalesce(v_doc, '')), 'C')
   where id = p_vendor_id;

  perform app.set_trusted_write(false);
end;
$$;

create or replace function app.trg_refresh_vendor_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- NEW is unassigned on DELETE and OLD is unassigned on INSERT; touching the wrong one
  -- raises "record is not assigned yet". coalesce() does not help — the field reference
  -- itself is what fails — so branch on tg_op before reading either record.
  if tg_op = 'DELETE' then
    v_id := case tg_table_name when 'vendors' then old.id else old.vendor_id end;
  else
    v_id := case tg_table_name when 'vendors' then new.id else new.vendor_id end;
  end if;

  if v_id is not null then
    perform app.build_vendor_search(v_id);
  end if;
  return null;  -- AFTER trigger
end;
$$;

create trigger vendors_refresh_search
  after insert or update of display_name, about, city_id, locality_id on public.vendors
  for each row execute function app.trg_refresh_vendor_search();

create trigger vendor_categories_refresh_search
  after insert or update or delete on public.vendor_categories
  for each row execute function app.trg_refresh_vendor_search();

create trigger packages_refresh_search
  after insert or update of name, is_active or delete on public.packages
  for each row execute function app.trg_refresh_vendor_search();

-- ---------------------------------------------------------------------------
-- Derived vendor stats. Plan §13 launch gate: "≥5 photos and price bands".
-- Plan §12: "quality thresholds" decide what the SEO engine is allowed to publish.
-- ---------------------------------------------------------------------------

create or replace function app.refresh_vendor_stats(p_vendor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media   integer;
  v_score   smallint;
  v_rating  numeric(3,2);
  v_count   integer;
begin
  select count(*) into v_media
  from public.media m
  where m.vendor_id = p_vendor_id and m.kind = 'image' and m.moderation = 'approved';

  select round(avg(r.rating)::numeric, 2), count(*)
    into v_rating, v_count
  from public.reviews r
  where r.vendor_id = p_vendor_id and r.moderation = 'approved' and r.published_at is not null;

  -- Profile completeness, 0–100. These are exactly the fields the field team is
  -- measured on during the Sep 2026 – Mar 2027 supply push.
  select least(100,
      (case when v.about is not null and length(v.about) >= 120 then 15 else 0 end)
    + (case when v.price_band_min is not null then 20 else 0 end)
    + (case when v.locality_id is not null then 10 else 0 end)
    + least(30, v_media * 3)
    + (case when exists (select 1 from public.packages p
                          where p.vendor_id = v.id and p.is_active) then 15 else 0 end)
    + (case when exists (select 1 from public.vendor_categories vc
                          where vc.vendor_id = v.id and cardinality(vc.style_tags) > 0) then 10 else 0 end)
  )::smallint
    into v_score
  from public.vendors v where v.id = p_vendor_id;

  perform app.set_trusted_write(true);

  update public.vendors v
     set media_count   = v_media,
         rating_avg    = v_rating,
         rating_count  = coalesce(v_count, 0),
         profile_score = coalesce(v_score, 0),
         -- Plan §12/§13: thin listings never reach the index.
         is_seo_eligible = (v_media >= 5
                            and v.price_band_min is not null
                            and coalesce(v_score, 0) >= 60)
   where v.id = p_vendor_id;

  perform app.set_trusted_write(false);
end;
$$;

create or replace function app.trg_refresh_vendor_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Same NEW/OLD assignment rule as app.trg_refresh_vendor_search().
  if tg_op = 'DELETE' then
    v_id := old.vendor_id;
  else
    v_id := new.vendor_id;
  end if;

  if v_id is not null then
    perform app.refresh_vendor_stats(v_id);
  end if;
  return null;
end;
$$;

create trigger media_refresh_vendor_stats
  after insert or update of moderation or delete on public.media
  for each row execute function app.trg_refresh_vendor_stats();

create trigger reviews_refresh_vendor_stats
  after insert or update of moderation, published_at, rating or delete on public.reviews
  for each row execute function app.trg_refresh_vendor_stats();

create trigger packages_refresh_vendor_stats
  after insert or update of is_active or delete on public.packages
  for each row execute function app.trg_refresh_vendor_stats();

-- ---------------------------------------------------------------------------
-- THE ranking function. Plan §12: "ranking isolated behind one SQL function".
--
-- Plan §11 is a hard constraint here: the anchor studio runs "with no ranking favour
-- (auditable in the ranking SQL)". There is deliberately no reference to
-- vendors.is_anchor_studio anywhere in this function, and supabase/tests/03_ranking.sql
-- asserts that mechanically so a future edit cannot quietly introduce one.
-- ---------------------------------------------------------------------------

create or replace function app.vendor_rank(
  p_text_rank      real,
  p_trgm_sim       real,
  p_profile_score  smallint,
  p_rating_avg     numeric,
  p_rating_count   integer,
  p_response_rate  smallint,
  p_response_mins  integer,
  p_distance_m     double precision
)
returns double precision
language sql
immutable
as $$
  select
    -- Textual relevance dominates when the customer actually typed something.
      (coalesce(p_text_rank, 0) * 100)
    + (coalesce(p_trgm_sim, 0) * 30)

    -- Bayesian rating: a single 5★ review must not outrank 200 reviews at 4.8.
    -- Prior of 20 reviews at the 4.2 platform mean.
    + (((coalesce(p_rating_count, 0) * coalesce(p_rating_avg, 4.2) + 20 * 4.2)
        / (coalesce(p_rating_count, 0) + 20))::double precision * 6)

    -- Listing quality — the field team's §13 completeness gate, worth ranking for.
    + (coalesce(p_profile_score, 0)::double precision * 0.15)

    -- Responsiveness. Plan §10 KPI: median vendor response under two hours.
    -- Full credit at ≤120 min, decaying to zero at 24 h.
    + (coalesce(p_response_rate, 50)::double precision * 0.08)
    + (case
         when p_response_mins is null then 0
         when p_response_mins <= 120 then 8
         else greatest(0, 8 - (p_response_mins - 120)::double precision / 165)
       end)

    -- Locality proximity, when the customer scoped to a locality. Full credit inside
    -- 3 km, nothing beyond 25 km.
    + (case
         when p_distance_m is null then 0
         when p_distance_m <= 3000 then 10
         else greatest(0, 10 - (p_distance_m - 3000) / 2200)
       end);
$$;

comment on function app.vendor_rank is
  'Plan §12: the single ranking definition. Plan §11: contains no anchor-studio term — '
  'asserted by supabase/tests/03_ranking.sql.';

-- ---------------------------------------------------------------------------
-- The discovery query. Plan §2: "Category × locality discovery with price bands and
-- the ''free on my date'' availability filter".
--
-- SECURITY INVOKER (the default) on purpose: RLS runs, so this can only ever return
-- live listings, and the same call is safe from anon and from staff alike.
-- ---------------------------------------------------------------------------

create or replace function public.search_vendors(
  p_city_slug     text,
  p_category_slug text default null,
  p_locality_slug text default null,
  p_query         text default null,
  p_style_tags    text[] default null,
  p_budget_max    bigint default null,
  p_free_on       date default null,
  p_sort          text default 'relevance',
  p_limit         integer default 24,
  p_offset        integer default 0
)
returns table (
  id              uuid,
  slug            text,
  display_name    text,
  about           text,
  city_slug       text,
  locality_slug   text,
  locality_name   text,
  price_band_min  bigint,
  price_band_max  bigint,
  rating_avg      numeric,
  rating_count    integer,
  media_count     integer,
  is_anchor_studio boolean,
  style_tags      text[],
  cover_path      text,
  min_price_per_day bigint,
  score           double precision,
  total_count     bigint
)
language sql
stable
set search_path = public, extensions
as $$
  with params as (
    select
      (select c.id from public.cities c where c.slug = p_city_slug)              as city_id,
      (select ct.id from public.categories ct where ct.slug = p_category_slug)   as category_id,
      (select l.id from public.localities l
         join public.cities c2 on c2.id = l.city_id
        where l.slug = p_locality_slug and c2.slug = p_city_slug)                as locality_id,
      nullif(btrim(coalesce(p_query, '')), '')                                   as q
  ),
  anchor as (
    select p.*, (select l.centroid from public.localities l where l.id = p.locality_id) as loc_point
    from params p
  ),
  matched as (
    select
      v.id, v.slug, v.display_name, v.about,
      v.price_band_min, v.price_band_max,
      v.rating_avg, v.rating_count, v.media_count, v.is_anchor_studio,
      v.profile_score, v.response_rate_pct, v.median_response_mins,
      v.locality_id as v_locality_id,
      vc.style_tags,
      a.loc_point,
      case when a.q is null then 0::real
           else ts_rank(v.search_vector, plainto_tsquery('simple', a.q)) end     as text_rank,
      case when a.q is null then 0::real
           else similarity(coalesce(v.search_document, ''), a.q) end             as trgm_sim,
      case when a.loc_point is null or v.location is null then null
           else st_distance(v.location, a.loc_point) end                         as distance_m
    from public.vendors v
    cross join anchor a
    join public.vendor_categories vc
      on vc.vendor_id = v.id
     and (a.category_id is null or vc.category_id = a.category_id)
    where v.status = 'live'
      and v.city_id = a.city_id

      -- Locality scope: the named locality, or anything within 12 km of it, so a
      -- thin locality page still shows a useful result set instead of an empty one.
      and (
        a.locality_id is null
        or v.locality_id = a.locality_id
        or (v.location is not null and a.loc_point is not null
            and st_dwithin(v.location, a.loc_point, 12000))
      )

      -- Plan §2: price bands. A vendor qualifies if their entry price fits the budget.
      and (p_budget_max is null or v.price_band_min is null or v.price_band_min <= p_budget_max)

      -- Plan §11: photography style taxonomy as a first-class filter.
      and (p_style_tags is null or cardinality(p_style_tags) = 0 or vc.style_tags && p_style_tags)

      -- Plan §2: "free on my date". Absence of a block means available.
      and (p_free_on is null or not exists (
            select 1 from public.vendor_availability va
            where va.vendor_id = v.id and va.blocked_on = p_free_on))

      -- Full-text gate only when a query was typed; trigram catches the misspellings.
      and (
        a.q is null
        or v.search_vector @@ plainto_tsquery('simple', a.q)
        or coalesce(v.search_document, '') % a.q
      )
  ),
  deduped as (
    -- A vendor listed in two categories must appear once.
    select distinct on (m.id) m.*
    from matched m
    order by m.id, m.text_rank desc
  ),
  scored as (
    select d.*,
      app.vendor_rank(d.text_rank, d.trgm_sim, d.profile_score, d.rating_avg,
                      d.rating_count, d.response_rate_pct, d.median_response_mins,
                      d.distance_m) as score,
      count(*) over () as total_count
    from deduped d
  )
  select
    s.id, s.slug, s.display_name, s.about,
    p_city_slug,
    (select l.slug from public.localities l where l.id = s.v_locality_id),
    (select l.name from public.localities l where l.id = s.v_locality_id),
    s.price_band_min, s.price_band_max,
    s.rating_avg, s.rating_count, s.media_count, s.is_anchor_studio,
    s.style_tags,
    (select m2.storage_path from public.media m2
      where m2.vendor_id = s.id and m2.moderation = 'approved'
      order by m2.is_cover desc, m2.sort_order asc limit 1),
    (select min(pk.price_per_day) from public.packages pk
      where pk.vendor_id = s.id and pk.is_active),
    s.score,
    s.total_count
  from scored s
  order by
    case when p_sort = 'price_asc'  then s.price_band_min end asc nulls last,
    case when p_sort = 'price_desc' then s.price_band_min end desc nulls last,
    case when p_sort = 'rating'     then s.rating_avg end desc nulls last,
    case when p_sort = 'relevance'  then s.score end desc nulls last,
    s.id
  limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_vendors is
  'Plan §2 discovery. SECURITY INVOKER so RLS guarantees live-only results. '
  'Plan §4 exit criteria to Typesense: p95 > 200 ms or 50k listings.';

grant execute on function public.search_vendors(
  text, text, text, text, text[], bigint, date, text, integer, integer
) to anon, authenticated;

grant execute on function app.vendor_rank(
  real, real, smallint, numeric, integer, smallint, integer, double precision
) to anon, authenticated;

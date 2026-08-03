-- ============================================================================
-- Fremmo seed — 05 · Photographers in the remaining Lucknow localities
--
-- WHAT THIS FIXES. The home page's "Every corner of Lucknow" band lists localities that
-- have photographers, ordered by how many — getLocalityCounts() drops any with a count of
-- zero. 04_launch_catalogue.sql put its six Lucknow photographers in four localities, so
-- the band collapsed to four rows where it used to show eight.
--
-- The number eight is not arbitrary. lib/place-art.ts holds photographs for exactly eight
-- Lucknow localities — gomti-nagar, hazratganj, aliganj, chowk, indira-nagar,
-- sushant-golf-city, mahanagar, kanpur-road — and a locality with no photograph falls
-- through to a placeholder. So those eight are the ones that can carry the band's artwork,
-- and the four missing from it are the four seeded here.
--
-- Chowk and Kanpur Road already had listings, but a caterer each; the band is scoped to
-- photography, so they were absent from it while being present in the catalogue.
--
-- SEPARATE FILE RATHER THAN AN EXTENSION OF 04. That file's media insert selects its
-- vendors by an explicit slug list and ends with `on conflict do nothing` — and media has no
-- unique constraint on (vendor_id, storage_path), so re-running it to pick up four new names
-- would duplicate every photograph already there. A new file only touches new rows.
--
-- Same rules as 04: no auth users, no bookings, no reviews, and no derived columns written
-- by hand — media_count, profile_score and is_seo_eligible are filled by
-- app.refresh_vendor_stats() once the photographs and packages land.
-- ============================================================================

with c as (select id, slug from public.cities),
     l as (select id, slug, city_id from public.localities)
insert into public.vendors (
  slug, display_name, about, status, published_at,
  city_id, locality_id, price_band_min, price_band_max,
  established_year, team_size, travels_outstation, kyc_status
)
select
  v.slug, v.display_name, v.about, 'live', now() - (v.age_days || ' days')::interval,
  c.id, l.id, v.band_min, v.band_max, v.est, v.team, v.outstation, 'verified'
from (values
  ('purani-gali-studio', 'Purani Gali Studio',
   'Chowk is where we learned to shoot — narrow lanes, bad light and a wedding party that will not wait. Old-city weddings are our whole practice, and we know which gullies the baraat can actually get down.',
   'lucknow', 'chowk', 7500000::bigint, 20000000::bigint, 2013, 4, false, 620),
  ('roshni-weddings', 'Roshni Weddings',
   'Kanpur Road and everything along it. Two shooters, one cinematographer, and a habit of arriving before the decorator so the empty mandap is photographed while it is still perfect.',
   'lucknow', 'kanpur-road', 11000000, 28000000, 2017, 5, true, 260),
  ('ochre-weddings', 'Ochre Weddings',
   'Warm, unhurried coverage of the parts nobody stages — the grandmother watching, the cousins arguing about the sangeet. Mahanagar-based, working across Lucknow.',
   'lucknow', 'mahanagar', 13000000, 32000000, 2018, 4, true, 180),
  ('aperture-and-co', 'Aperture & Co.',
   'Sushant Golf City and the newer venues around it. Drone-certified, and we scout the property a week before so nobody is working out angles on the day.',
   'lucknow', 'sushant-golf-city', 16000000, 42000000, 2019, 6, true, 140)
) as v(slug, display_name, about, city_slug, locality_slug, band_min, band_max, est, team, outstation, age_days)
join c on c.slug = v.city_slug
join l on l.slug = v.locality_slug and l.city_id = c.id
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- Category, style tags and the photographer's own answers.
-- ---------------------------------------------------------------------------

with v as (select id, slug from public.vendors),
     k as (select id, slug from public.categories)
insert into public.vendor_categories (vendor_id, category_id, is_primary, style_tags, price_band_min, price_band_max, attributes)
select v.id, k.id, true, x.tags, ven.price_band_min, ven.price_band_max, x.attrs
from (values
  ('purani-gali-studio', 'photography', array['traditional','candid','heritage'],
   '{"deliveryDays":24,"editedPhotos":500,"crewSize":4,"droneAvailable":false,"albumIncluded":true,"rawHandover":false,"sameDayEdit":false}'::jsonb),
  ('roshni-weddings', 'photography', array['candid','cinematic','pre-wedding'],
   '{"deliveryDays":21,"editedPhotos":650,"crewSize":5,"droneAvailable":true,"albumIncluded":false,"rawHandover":true,"sameDayEdit":true}'::jsonb),
  ('ochre-weddings', 'photography', array['documentary','candid','portrait'],
   '{"deliveryDays":26,"editedPhotos":550,"crewSize":4,"droneAvailable":false,"albumIncluded":true,"rawHandover":true,"sameDayEdit":false}'::jsonb),
  ('aperture-and-co', 'photography', array['cinematic','drone','editorial'],
   '{"deliveryDays":18,"editedPhotos":800,"crewSize":6,"droneAvailable":true,"albumIncluded":true,"rawHandover":false,"sameDayEdit":true}'::jsonb)
) as x(vendor_slug, category_slug, tags, attrs)
join v on v.slug = x.vendor_slug
join k on k.slug = x.category_slug
join public.vendors ven on ven.id = v.id
on conflict (vendor_id, category_id) do nothing;


-- ---------------------------------------------------------------------------
-- Photographs. Six each, from the same pool of real files in public/.
--
-- The `not exists` guard is what makes this file safe to run twice: media carries no unique
-- constraint that would catch a duplicate, so the check has to be explicit rather than left
-- to `on conflict`.
-- ---------------------------------------------------------------------------

with pool as (
  select unnest(array[
    '/luck-1-1280.webp', '/luck-2-1280.webp', '/luck-3-1280.webp', '/luck-4-1280.webp',
    '/place-chowk-1280.webp', '/place-kanpur-road-1280.webp', '/place-mahanagar-1280.webp',
    '/place-sushant-golf-city-1280.webp', '/place-gomti-nagar-1280.webp',
    '/temple-1280.webp', '/historical-1280.webp', '/beach-1280.webp'
  ]) as path, generate_series(1, 12) as n
),
fresh as (
  select v.id as vendor_id, v.display_name, row_number() over (order by v.slug) as no
  from public.vendors v
  where v.slug in ('purani-gali-studio', 'roshni-weddings', 'ochre-weddings', 'aperture-and-co')
    and not exists (select 1 from public.media m where m.vendor_id = v.id)
)
insert into public.media (vendor_id, kind, storage_path, alt_text, sort_order, is_cover, moderation)
select
  f.vendor_id, 'image', p.path,
  f.display_name || ' — photograph ' || g,
  g * 10, g = 1, 'approved'
from fresh f
cross join lateral generate_series(1, 6) g
join pool p on p.n = ((f.no * 6 + g - 1) % 12) + 1;


-- ---------------------------------------------------------------------------
-- One package each, so the profile score clears 60 and the listing is SEO-eligible.
-- ---------------------------------------------------------------------------

with v as (select id, slug from public.vendors),
     k as (select id, slug from public.categories)
insert into public.packages (vendor_id, category_id, name, description, price, pricing_unit, duration_days, is_active, sort_order)
select v.id, k.id, x.name, x.descr, x.price, 'per_day', x.days, true, 10
from (values
  ('purani-gali-studio','photography','Old-city wedding day','Four of us through the day, printed album included, delivered in 24 days.',9500000::bigint,1),
  ('roshni-weddings','photography','Full-day coverage','Two photographers and a cinematographer, 650 edited photographs, drone where the venue allows it.',14000000,1),
  ('ochre-weddings','photography','Documentary day','No posing, no direction — we photograph what happens and hand over the raws with it.',16000000,1),
  ('aperture-and-co','photography','Two-day wedding','Sangeet and the wedding, crew of six, drone and a same-day edit for the reception screen.',38000000,2)
) as x(vendor_slug, category_slug, name, descr, price, days)
join v on v.slug = x.vendor_slug
join k on k.slug = x.category_slug
on conflict do nothing;

-- ============================================================================
-- Utsava seed — 03 · Demo data (LOCAL DEVELOPMENT ONLY)
--
-- Enough supply for discovery, ranking, routing and the trust surface to render
-- without a live database. Media paths point at Supabase Storage objects that do not
-- exist locally — the web app falls back to a generated placeholder, so this seed
-- needs no binary assets.
--
-- Do not run this against staging or production.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Demo auth users. Password for every account: utsava123
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('utsava123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  now(), now(), '', '', '', ''
from (values
  ('11111111-1111-4111-8111-111111111101'::uuid, 'priya@example.com',   'Priya Sharma'),
  ('11111111-1111-4111-8111-111111111102'::uuid, 'arjun@example.com',   'Arjun Mehta'),
  ('11111111-1111-4111-8111-111111111201'::uuid, 'studio@example.com',  'Vikram Rao'),
  ('11111111-1111-4111-8111-111111111202'::uuid, 'lensai@example.com',  'Neha Kulkarni'),
  ('11111111-1111-4111-8111-111111111901'::uuid, 'admin@utsava.test',   'Utsava Admin'),
  ('11111111-1111-4111-8111-111111111902'::uuid, 'field@utsava.test',   'Field Agent BLR')
) as u(id, email, full_name)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
select u.id, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', u.email, now(), now()
from auth.users u
where u.email like '%@example.com' or u.email like '%@utsava.test'
on conflict do nothing;

-- The on_auth_user_created trigger has already created profiles; top them up.
update public.profiles p
   set phone = v.phone, phone_verified = true,
       city_id = (select id from public.cities where slug = 'lucknow')
from (values
  ('11111111-1111-4111-8111-111111111101'::uuid, '+919845000101'),
  ('11111111-1111-4111-8111-111111111102'::uuid, '+919845000102'),
  ('11111111-1111-4111-8111-111111111201'::uuid, '+919845000201'),
  ('11111111-1111-4111-8111-111111111202'::uuid, '+919845000202')
) as v(id, phone)
where p.id = v.id;

-- Plan §3: staff carry roles, not a role column on the profile.
insert into public.staff_roles (profile_id, role, city_ids)
values
  ('11111111-1111-4111-8111-111111111901', 'super', '{}'),
  ('11111111-1111-4111-8111-111111111902', 'field_agent',
   array[(select id from public.cities where slug = 'lucknow')])
on conflict (profile_id, role) do nothing;

-- ---------------------------------------------------------------------------
-- Vendors. Weighted to photography per plan §11 (800 of 3,000 launch listings).
-- ---------------------------------------------------------------------------

insert into public.vendors (
  slug, display_name, status, city_id, locality_id, about,
  established_year, team_size, travels_outstation,
  price_band_min, price_band_max, is_anchor_studio, published_at, location
)
select
  d.slug, d.display_name, 'live',
  c.id, l.id, d.about,
  d.established_year, d.team_size, d.travels,
  d.band_min, d.band_max, d.is_anchor, now(),
  l.centroid
from (values
  -- Lucknow · photography
  ('lightleak-studio', 'Lightleak Studio', 'lucknow', 'gomti-nagar',
   'A four-person candid team that has shot over 300 weddings across South India since 2016. We work quietly, stay out of the rituals, and hand over a full gallery in three weeks.',
   2016, 4, true, 12000000, 35000000, false),
  ('saat-phere-films', 'Saat Phere Films', 'lucknow', 'hazratganj',
   'Cinematic wedding films and photography under one roof. Known for same-day edits screened at the reception.',
   2018, 6, true, 18000000, 60000000, false),
  ('anantha-photography', 'Anantha Photography', 'lucknow', 'aliganj',
   'Three generations of traditional South Indian wedding photography. We know every ritual before the priest calls it.',
   1994, 5, false, 6500000, 18000000, false),
  ('the-mango-tree-co', 'The Mango Tree Co.', 'lucknow', 'indira-nagar',
   'Fine-art and editorial wedding photography for couples who want their album to look like a magazine.',
   2019, 3, true, 22000000, 55000000, false),
  ('frame-by-frame', 'Frame by Frame', 'lucknow', 'sushant-golf-city',
   'Documentary-first coverage. One photographer, one film-maker, no posing, no interruptions.',
   2020, 2, true, 9000000, 24000000, false),
  ('kalyana-clicks', 'Kalyana Clicks', 'lucknow', 'chowk',
   'Affordable full-day wedding coverage with a fast turnaround, serving Lucknow families since 2011.',
   2011, 6, false, 4500000, 12000000, false),
  ('northlight-studio', 'Northlight Studio', 'lucknow', 'kanpur-road',
   'Natural-light portraiture and pre-wedding shoots across Uttar Pradesh. Drone coverage in-house.',
   2017, 3, true, 8000000, 20000000, false),
  ('the-vermilion-project', 'The Vermilion Project', 'lucknow', 'mahanagar',
   'Bold, colour-forward wedding photography. We chase the loud moments, not the staged ones.',
   2021, 4, true, 14000000, 38000000, false),
  -- Plan §11: the founder's anchor studio, live from Oct 2026, disclosed on-platform.
  ('utsava-studio', 'Utsava Studio', 'lucknow', 'gomti-nagar',
   'The in-house studio operated by Utsava''s founder. Listed under a public disclosure policy: no ranking preference, overflow bookings only, and capped at roughly 5% of category bookings.',
   2026, 3, true, 15000000, 40000000, true),
  -- Delhi NCR · photography
  ('shaadi-stories-delhi', 'Shaadi Stories', 'delhi-ncr', 'gurugram',
   'Big-fat-wedding specialists across Gurugram and the Chattarpur farmhouse belt. Ten-person crews, multi-day coverage.',
   2015, 10, true, 25000000, 90000000, false),
  ('mehfil-media', 'Mehfil Media', 'delhi-ncr', 'south-delhi',
   'Candid photography and cinematic films for South Delhi weddings. Small crew, premium output.',
   2019, 4, true, 20000000, 55000000, false),
  ('roshni-photography', 'Roshni Photography', 'delhi-ncr', 'noida',
   'Traditional and candid coverage for Noida and Ghaziabad families, with an in-house album studio.',
   2013, 7, false, 8000000, 22000000, false),
  -- Lucknow · other categories
  ('the-tamarind-estate', 'The Tamarind Estate', 'lucknow', 'faizabad-road',
   'A six-acre farmhouse venue with lawn seating for 800, a covered banquet for 400, and 12 guest rooms.',
   2015, 25, false, 35000000, 120000000, false),
  ('rangoli-banquets', 'Rangoli Banquets', 'lucknow', 'alambagh',
   'Centrally located air-conditioned banquet hall seating 500, with in-house catering and parking for 120 cars.',
   2009, 40, false, 18000000, 45000000, false),
  ('blush-by-meera', 'Blush by Meera', 'lucknow', 'gomti-nagar',
   'HD and airbrush bridal makeup. Meera has done over 400 brides and travels across South India.',
   2017, 3, true, 3500000, 9500000, false),
  ('the-glow-room', 'The Glow Room', 'lucknow', 'hazratganj',
   'Skin-first, natural bridal looks. We prep your skin for six weeks before the date.',
   2020, 4, true, 4500000, 12000000, false),
  ('marigold-decor', 'Marigold Decor', 'lucknow', 'aliganj',
   'Fresh-flower mandaps and stage design. We source from the Lucknow flower market every morning.',
   2012, 18, true, 15000000, 60000000, false),
  ('white-space-events', 'White Space Events', 'lucknow', 'indira-nagar',
   'Minimal, contemporary decor for couples who find traditional staging too heavy.',
   2021, 8, true, 20000000, 70000000, false),
  ('adyar-ananda-catering', 'Adyar Ananda Catering', 'lucknow', 'chowk',
   'Pure-veg South Indian and Jain satvik menus. Sixty years of banana-leaf service.',
   1965, 60, true, 45000, 110000, false),
  ('spice-route-catering', 'Spice Route Catering', 'lucknow', 'sushant-golf-city',
   'Multi-cuisine catering with live counters — North Indian, Continental and Pan-Asian.',
   2014, 45, true, 65000, 180000, false)
) as d(slug, display_name, city_slug, locality_slug, about,
       established_year, team_size, travels, band_min, band_max, is_anchor)
join public.cities c on c.slug = d.city_slug
join public.localities l on l.city_id = c.id and l.slug = d.locality_slug
on conflict (slug) do nothing;

-- Contact details land in vendor_private, never on the public row.
update public.vendor_private vp
   set contact_phone = '+9198450' || lpad((abs(hashtext(v.slug)) % 100000)::text, 5, '0'),
       contact_email = replace(v.slug, '-', '.') || '@example.com',
       whatsapp_phone = '+9198450' || lpad((abs(hashtext(v.slug)) % 100000)::text, 5, '0')
from public.vendors v
where vp.vendor_id = v.id and vp.contact_phone is null;

-- ---------------------------------------------------------------------------
-- Category assignment + style tags (plan §5: tags live on vendor_categories).
-- ---------------------------------------------------------------------------

insert into public.vendor_categories (vendor_id, category_id, is_primary, style_tags, price_band_min, price_band_max)
select v.id, cat.id, true, m.tags, v.price_band_min, v.price_band_max
from (values
  ('lightleak-studio',      'photography', array['candid','documentary','pre-wedding']),
  ('saat-phere-films',      'photography', array['cinematic','candid','drone']),
  ('anantha-photography',   'photography', array['traditional','portrait']),
  ('the-mango-tree-co',     'photography', array['fine-art','editorial','pre-wedding']),
  ('frame-by-frame',        'photography', array['documentary','candid']),
  ('kalyana-clicks',        'photography', array['traditional','candid']),
  ('northlight-studio',     'photography', array['portrait','pre-wedding','drone']),
  ('the-vermilion-project', 'photography', array['candid','cinematic','fine-art']),
  ('utsava-studio',         'photography', array['candid','cinematic','pre-wedding']),
  ('shaadi-stories-delhi',  'photography', array['candid','traditional','drone']),
  ('mehfil-media',          'photography', array['candid','cinematic']),
  ('roshni-photography',    'photography', array['traditional','candid']),
  ('the-tamarind-estate',   'venues',      array['farmhouse','resort']),
  ('rangoli-banquets',      'venues',      array['banquet']),
  ('blush-by-meera',        'makeup',      array['hd-makeup','airbrush']),
  ('the-glow-room',         'makeup',      array['natural','hd-makeup']),
  ('marigold-decor',        'decor',       array['floral','royal']),
  ('white-space-events',    'decor',       array['minimal','boho']),
  ('adyar-ananda-catering', 'catering',    array['south-indian','jain-satvik']),
  ('spice-route-catering',  'catering',    array['north-indian','continental','live-counters'])
) as m(vendor_slug, cat_slug, tags)
join public.vendors v on v.slug = m.vendor_slug
join public.categories cat on cat.slug = m.cat_slug
on conflict (vendor_id, category_id) do nothing;

-- The film-makers also list under videography.
insert into public.vendor_categories (vendor_id, category_id, is_primary, style_tags)
select v.id, cat.id, false, array['cinematic','same-day-edit']
from public.vendors v
cross join public.categories cat
where v.slug in ('saat-phere-films', 'mehfil-media', 'the-vermilion-project')
  and cat.slug = 'videography'
on conflict (vendor_id, category_id) do nothing;

-- ---------------------------------------------------------------------------
-- Packages. Plan §2: cards normalise to per-day pricing — note the 3-day package
-- below renders a lower per-day figure than the 1-day one, which is the whole point.
-- ---------------------------------------------------------------------------

insert into public.packages (
  vendor_id, category_id, name, description, style_tags, price, pricing_unit,
  duration_days, crew_size, edited_photo_count, delivery_days, deliverables, inclusions, sort_order
)
select v.id, vc.category_id, p.name, p.description, vc.style_tags,
       p.price, 'per_day', p.days, p.crew, p.photos, p.delivery,
       p.deliverables, p.inclusions, p.sort_order
from (values
  ('lightleak-studio', 'Wedding Day — Candid',
   'Single-day candid coverage by two photographers, from haldi to vidaai.',
   14000000, 1.0, 2, 600, 21,
   array['600+ edited photos','Online gallery','USB drive'],
   array['2 photographers','Full-day coverage','Colour grading'], 1),
  ('lightleak-studio', 'Three-Day Wedding',
   'Mehendi, sangeet and wedding day with a four-person crew.',
   33000000, 3.0, 4, 1800, 28,
   array['1800+ edited photos','Two 30-page albums','Online gallery'],
   array['4 crew','3 days','Two albums','Drone on wedding day'], 2),
  ('saat-phere-films', 'Film + Photo Combo',
   'Cinematic film and candid photography for the wedding day, with a same-day edit.',
   28000000, 1.0, 6, 700, 30,
   array['8-minute wedding film','Same-day edit','700+ photos'],
   array['6 crew','2 cinema cameras','Drone','Same-day edit screening'], 1),
  ('anantha-photography', 'Traditional Full Coverage',
   'Complete ritual documentation in the classic South Indian style.',
   8500000, 1.0, 3, 500, 25,
   array['500+ edited photos','40-page printed album'],
   array['3 photographers','Printed album','All rituals covered'], 1),
  ('the-mango-tree-co', 'Editorial Wedding',
   'Fine-art coverage with a styled couple portrait session.',
   32000000, 1.0, 3, 450, 35,
   array['450 hand-edited photos','Fine-art album','Styled portrait session'],
   array['3 crew','Hand editing','Museum-grade album'], 1),
  ('frame-by-frame', 'Documentary Day',
   'One photographer and one film-maker. No posing, no interruptions.',
   11000000, 1.0, 2, 500, 21,
   array['500+ photos','5-minute film'],
   array['2 crew','Full-day','Unposed only'], 1),
  ('kalyana-clicks', 'Value Wedding Package',
   'Full-day photo and video coverage at an accessible price.',
   5500000, 1.0, 4, 400, 14,
   array['400 photos','Full ceremony video','Printed album'],
   array['4 crew','Album','14-day delivery'], 1),
  ('utsava-studio', 'Wedding Day Coverage',
   'Candid and cinematic coverage by the in-house studio team.',
   18000000, 1.0, 3, 650, 21,
   array['650+ edited photos','Online gallery'],
   array['3 crew','Full-day','Drone'], 1),
  ('shaadi-stories-delhi', 'Grand Wedding — 3 Day',
   'Multi-day coverage for large Delhi weddings with a ten-person crew.',
   72000000, 3.0, 10, 2500, 30,
   array['2500+ photos','Wedding film','Two albums','Drone'],
   array['10 crew','3 days','Drone','Two albums'], 1),
  ('mehfil-media', 'Signature Wedding',
   'Candid photography and a cinematic film for the wedding day.',
   26000000, 1.0, 4, 700, 28,
   array['700+ photos','7-minute film'],
   array['4 crew','Full-day','Colour grading'], 1),
  ('roshni-photography', 'Complete Wedding',
   'Traditional plus candid coverage with an in-house printed album.',
   10000000, 1.0, 5, 600, 20,
   array['600 photos','Ceremony video','Printed album'],
   array['5 crew','Album studio','20-day delivery'], 1),
  ('northlight-studio', 'Pre-wedding Shoot',
   'Half-day couple shoot on location, natural light only.',
   4500000, 0.5, 2, 120, 10,
   array['120 edited photos','Location scouting'],
   array['2 crew','One location','Outfit changes'], 1),
  ('the-vermilion-project', 'Full Wedding Story',
   'Colour-forward candid coverage with a cinematic film.',
   24000000, 1.0, 4, 800, 25,
   array['800+ photos','6-minute film'],
   array['4 crew','Full-day','Drone'], 1),
  ('blush-by-meera', 'Bridal HD Makeup',
   'Bridal makeup, hair and saree draping on the wedding day.',
   4500000, 1.0, 2, null, null,
   array['Bridal makeup','Hair styling','Draping'],
   array['2 artists','Trial included','Travel within city'], 1),
  ('the-glow-room', 'Bride + Family',
   'Bridal look plus makeup for four family members.',
   6500000, 1.0, 3, null, null,
   array['Bridal look','4 family looks'],
   array['3 artists','Skin prep consultation'], 1)
) as p(vendor_slug, name, description, price, days, crew, photos, delivery,
       deliverables, inclusions, sort_order)
join public.vendors v on v.slug = p.vendor_slug
join public.vendor_categories vc on vc.vendor_id = v.id and vc.is_primary
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Portfolio media. Plan §13 gate: ≥5 photos per listing. Eight each clears it and
-- pushes profile_score over the is_seo_eligible threshold via the stats trigger.
-- ---------------------------------------------------------------------------

insert into public.media (vendor_id, kind, storage_path, width, height, alt_text, sort_order, is_cover, moderation, style_tags)
select
  v.id, 'image',
  'demo/' || v.slug || '/' || lpad(g::text, 2, '0') || '.jpg',
  1600, 1067,
  v.display_name || ' — portfolio image ' || g,
  g * 10,
  g = 1,
  'approved',
  coalesce((select vc.style_tags from public.vendor_categories vc
             where vc.vendor_id = v.id and vc.is_primary), '{}')
from public.vendors v
cross join generate_series(1, 8) as g
where not exists (select 1 from public.media m where m.vendor_id = v.id);

-- ---------------------------------------------------------------------------
-- Availability. Plan §2: the 'free on my date' filter needs blocked dates to filter on.
-- Each vendor blocks a deterministic scatter of dates over the next six months.
-- ---------------------------------------------------------------------------

insert into public.vendor_availability (vendor_id, blocked_on, reason)
select v.id,
       (current_date + ((abs(hashtext(v.slug || g::text)) % 180) || ' days')::interval)::date,
       'booked'
from public.vendors v
cross join generate_series(1, 6) as g
on conflict (vendor_id, blocked_on) do nothing;

-- ---------------------------------------------------------------------------
-- Vendor ownership. Plan §3: the principal claims a field-created profile.
-- ---------------------------------------------------------------------------

insert into public.vendor_members (vendor_id, profile_id, role, accepted_at)
select v.id, m.profile_id::uuid, 'owner', now()
from (values
  ('utsava-studio',    '11111111-1111-4111-8111-111111111201'),
  ('lightleak-studio', '11111111-1111-4111-8111-111111111202')
) as m(vendor_slug, profile_id)
join public.vendors v on v.slug = m.vendor_slug
on conflict (vendor_id, profile_id) do nothing;

update public.vendors set claimed_at = now()
where slug in ('utsava-studio', 'lightleak-studio');

-- Subscriptions for the two claimed studios.
insert into public.subscriptions (vendor_id, plan_id, status, billing_cycle, current_period_end)
select v.id, p.id, 'active', 'annual', now() + interval '1 year'
from public.vendors v
cross join public.plans p
where v.slug in ('utsava-studio', 'lightleak-studio') and p.slug = 'growth'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- One completed booking → one review, so the trust surface has real data and the
-- booking-gated review policy is exercised end to end.
-- ---------------------------------------------------------------------------

do $$
declare
  v_vendor   uuid;
  v_customer uuid := '11111111-1111-4111-8111-111111111101';
  v_booking  uuid;
begin
  select id into v_vendor from public.vendors where slug = 'lightleak-studio';
  if v_vendor is null then return; end if;

  insert into public.bookings (
    reference, customer_id, vendor_id, status, event_date, event_type,
    total_amount, advance_amount, balance_amount, completed_at
  )
  values (
    'UTS-2607-DEMO01', v_customer, v_vendor, 'completed',
    current_date - 30, 'wedding', 14000000, 3500000, 10500000, now() - interval '25 days'
  )
  on conflict (reference) do nothing
  returning id into v_booking;

  -- RETURNING yields no row when the ON CONFLICT branch fires, so v_booking would be
  -- NULL on a re-run and the review below would be silently skipped. Fall back to a
  -- lookup rather than bailing out.
  if v_booking is null then
    select id into v_booking from public.bookings where reference = 'UTS-2607-DEMO01';
  end if;
  if v_booking is null then return; end if;

  insert into public.reviews (
    booking_id, vendor_id, author_id, rating,
    rating_quality, rating_value, rating_punctuality, rating_professionalism,
    title, body, moderation, published_at
  )
  values (
    v_booking, v_vendor, v_customer, 5, 5, 4, 5, 5,
    'They disappeared into the wedding and came back with everything',
    'We barely noticed them during the ceremony, which is exactly what we wanted. '
    'The gallery arrived in nineteen days with 700 photos, and they caught moments '
    'from the muhurtham that none of our family managed to see.',
    'approved', now() - interval '20 days'
  )
  on conflict (booking_id) do nothing;
end
$$;

-- ---------------------------------------------------------------------------
-- Recompute derived fields (media_count, profile_score, is_seo_eligible, search).
-- The triggers already fired per row; this is the belt-and-braces pass that also
-- covers vendors seeded before their media landed.
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in select id from public.vendors loop
    perform app.refresh_vendor_stats(r.id);
    perform app.build_vendor_search(r.id);
  end loop;
end
$$;

-- Plan §12 quality threshold: a locality page is only indexable once it has supply.
update public.localities l
   set live_vendor_count = sub.n,
       is_seo_eligible   = sub.n >= 3
from (
  select locality_id, count(*) as n
  from public.vendors
  where status = 'live' and locality_id is not null
  group by locality_id
) sub
where l.id = sub.locality_id;

update public.cities c
   set live_vendor_count = sub.n
from (select city_id, count(*) as n from public.vendors where status = 'live' group by city_id) sub
where c.id = sub.city_id;

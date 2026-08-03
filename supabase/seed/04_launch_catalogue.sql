-- ============================================================================
-- Fremmo seed — 04 · Launch catalogue (SAFE FOR A HOSTED PROJECT)
--
-- WHY THIS EXISTS SEPARATELY FROM 03_demo.sql. That file opens by creating auth.users
-- rows whose password is `fremmo123` and says, at the top, not to run it against anything
-- but a local machine. It is right to say so: on a project with a public URL those are real
-- accounts anyone can sign into. So it stays local-only, and this file carries the part
-- that a hosted project actually needs — inventory.
--
-- WHAT IT DOES NOT CREATE, and why:
--
--   · No auth.users, no profiles, no staff. Nothing here is a credential. The one real
--     account is made by scripts/bootstrap-super-admin.mjs with a password you chose.
--   · No bookings, payments or subscriptions. Money tables are service-role write-only
--     (plan §6) and seeding them would put figures in the console that never happened.
--   · NO REVIEWS. reviews.booking_id is `not null unique` — plan §5's anti-fake-review
--     design means there is no path to a review without a completed booking. Faking that
--     chain would put "Verified customer" badges, whose entire meaning is "backed by a
--     completed booking", on testimonials nobody wrote. An empty review section is the
--     honest state of a marketplace before its first booking, and the home page now hides
--     the section rather than substituting samples.
--
-- Everything below is INVENTORY: listings, their photographs, their packages and the
-- category-specific answers a customer decides on. Placeholder content an operator will
-- replace, making no claim about a third party.
--
-- IDEMPOTENT. Every insert is `on conflict do nothing` or keyed on a slug, so re-running
-- adds what is missing and changes nothing else.
--
-- Media paths point at real files in public/ — a leading slash makes storageImageUrl()
-- return them untouched instead of building a Storage render URL, so these listings carry
-- actual artwork with no bucket uploads.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Invitation designs.
--
-- The same eight that lib/invitation-templates.ts carried as its no-database fallback,
-- promoted to real rows. That constant now only ever fires when no project is attached, so
-- without these the storefront is empty and the "Curated Collections" section renders
-- nothing.
-- ---------------------------------------------------------------------------

insert into public.invitation_templates (slug, name, tags, price, poster_url, sort_order, is_active)
values
  ('vibrant-heritage',          'Vibrant Heritage',                        array['Royal','Vibrant','New'],       149900, '/invitation.webp',      10, true),
  ('divine-kedarnath',          'Divine Kedarnath Elegance',               array['Temple','New','Shiva'],        149900, '/mountain-1280.webp',   20, true),
  ('taj-mahal-elegance',        'Taj Mahal Elegance',                      array['New','Royal','Tajmahal'],      149900, '/historical-1280.webp', 30, true),
  ('modern-rajputana',          'The Modern Rajputana',                    array['Modern','Royalty','New'],      149900, '/luck-3-1280.webp',     40, true),
  ('divine-prem-radha-krishna', 'Divine Prem: The Radha-Krishna Edition',  array['Radha','Temple','Krishna'],    149900, '/temple-1280.webp',     50, true),
  ('marathi-shalu',             'Marathi Shalu & Mundavalya',              array['Marathi','Classic','New'],     149900, '/marathi-1280.webp',    60, true),
  ('punjabi-phulkari',          'Punjabi Phulkari',                        array['Punjabi','Vibrant','New'],     149900, '/punjabi-1280.webp',    70, true),
  ('kanjivaram-classic',        'Kanjivaram Classic',                      array['Tamil','Classic','Temple'],    149900, '/tamil-1280.webp',      80, true)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- Listings.
--
-- Weighted to photography per plan §11 — it is the wedge, and 800 of the 3,000 launch
-- listings are meant to be photographers. Two cities, because the discovery pages are
-- city-scoped and one city makes the city switcher look broken.
--
-- published_at is set because `vendors_live_requires_publish` refuses status='live'
-- without it. media_count, profile_score and is_seo_eligible are NOT set: they are derived
-- columns that app.refresh_vendor_stats() fills through a trigger once photographs and
-- packages exist, and writing them here would be a number nobody computed.
-- ---------------------------------------------------------------------------

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
  -- ---- Photography · Lucknow ----
  ('lightleak-studio', 'Lightleak Studio',
   'A four-person candid team that has been shooting Lucknow weddings since 2016. We work in available light wherever the venue allows it, and we hand over every frame worth keeping rather than a curated forty.',
   'lucknow', 'gomti-nagar', 12000000::bigint, 35000000::bigint, 2016, 6, true, 120),
  ('saat-phere-films', 'Saat Phere Films',
   'Wedding films first, photographs alongside. We shoot two cameras through the ceremony and cut a ten-minute film you will actually watch again, plus the full-length record for the family.',
   'lucknow', 'hazratganj', 18000000, 45000000, 2014, 8, true, 400),
  ('anantha-photography', 'Anantha Photography',
   'Traditional coverage done properly. Every ritual photographed in order, elders included, nothing missed because it was not fashionable. Albums printed and delivered, not just files.',
   'lucknow', 'aliganj', 8000000, 22000000, 2011, 5, false, 700),
  ('the-mango-tree-co', 'The Mango Tree Co.',
   'Editorial-leaning couple portraits and quiet documentary coverage. Small team on purpose — two of us at the wedding, so nobody is directing your family around.',
   'lucknow', 'indira-nagar', 15000000, 40000000, 2018, 3, true, 200),
  -- ---- Photography · Delhi NCR ----
  ('shaadi-stories-delhi', 'Shaadi Stories',
   'Gurugram-based, shooting across NCR and destination weddings in Rajasthan. Drone-certified crew, same-day edit for the sangeet screen if you want one.',
   'delhi-ncr', 'gurugram', 25000000, 60000000, 2015, 9, true, 500),
  ('moonlight-weddings', 'Moonlight Weddings',
   'Night ceremonies are our favourite thing. Lighting rigs we carry ourselves, so a badly lit banquet hall is not your problem.',
   'delhi-ncr', 'noida', 14000000, 32000000, 2019, 4, false, 90),

  -- ---- Venues · Lucknow ----
  ('the-tamarind-estate', 'The Tamarind Estate',
   'A walled lawn on Faizabad Road with an old tamarind grove down one side. Two bookable spaces, guest rooms on the property, and parking that does not spill onto the road.',
   'lucknow', 'faizabad-road', 15000000, 50000000, 2009, 24, false, 800),
  ('rangoli-banquets', 'Rangoli Banquets',
   'Two air-conditioned halls in Alambagh, one seating 300 and one seating 120, bookable together for a single function. In-house kitchen, outside decorators welcome.',
   'lucknow', 'alambagh', 8000000, 25000000, 2013, 30, false, 600),
  -- ---- Venues · Delhi NCR ----
  ('grand-palace-banquets', 'Grand Palace Banquets',
   'Chattarpur farmhouse with a covered lawn and a separate mandap area, so the ceremony does not have to move when it rains.',
   'delhi-ncr', 'chattarpur', 40000000, 120000000, 2007, 40, false, 900),
  ('the-orchard-noida', 'The Orchard',
   'A garden venue in Noida built for smaller weddings — 200 seated, no minimum guarantee, and you are not sharing the property with another function.',
   'delhi-ncr', 'noida', 12000000, 35000000, 2017, 18, false, 300),

  -- ---- Catering ----
  ('spice-route-catering', 'Spice Route Catering',
   'Awadhi and Mughlai done by cooks who trained in it, plus the chaat counters everybody actually queues for. Jain and satvik prepared in a separate kitchen, not just labelled.',
   'lucknow', 'chowk', 8500000, 18000000, 2010, 45, true, 750),
  ('saffron-table', 'Saffron Table',
   'Multi-cuisine catering with live counters and a tasting session before you commit. Serving staff included in the per-plate rate — no surprise line at the end.',
   'lucknow', 'kanpur-road', 9500000, 22000000, 2016, 32, true, 350),
  ('dilli-dawat', 'Dilli Dawat',
   'North Indian and continental spreads across NCR. Fifteen days notice, minimum 200 guests, and a bar service if the venue permits it.',
   'delhi-ncr', 'karol-bagh', 11000000, 26000000, 2012, 55, true, 550),

  -- ---- Decor ----
  ('marigold-decor', 'Marigold Decor',
   'Fresh flowers, mostly. Mandaps, stages, entrances and haldi setups built the morning of, with lighting included rather than quoted separately.',
   'lucknow', 'aliganj', 6500000, 28000000, 2015, 22, true, 450),
  ('mehfil-decor', 'Mehfil Decor',
   'Royal and floral themes across South Delhi. We work at any venue — no tie-ups, no venue telling you which decorator you may use.',
   'delhi-ncr', 'south-delhi', 12000000, 45000000, 2011, 35, true, 650),
  ('sitara-events', 'Sitara Events',
   'Minimal and modern setups for couples who do not want a gold-and-red hall. Eight hours to build, mixed fresh and artificial so the budget goes where it shows.',
   'delhi-ncr', 'dwarka', 7000000, 30000000, 2019, 16, true, 150),

  -- ---- Makeup ----
  ('blush-by-meera', 'Blush by Meera',
   'Bridal makeup with an HD and airbrush option, hair and draping included. Trial available before you book, and I travel to the venue on the morning.',
   'lucknow', 'gomti-nagar', 2500000, 4500000, 2017, 3, true, 500),
  ('the-glow-room', 'The Glow Room',
   'A three-artist team, so the bride and her family are ready at the same time. Natural finishes as readily as full glam — we ask what you actually want to look like.',
   'lucknow', 'hazratganj', 2000000, 3800000, 2018, 3, false, 380),
  ('ritu-makeovers', 'Ritu Makeovers',
   'Noida-based bridal and party makeup, working across NCR. Products you will recognise, and a trial charge adjusted against the final bill.',
   'delhi-ncr', 'noida', 1800000, 3500000, 2020, 2, true, 100)
) as v(slug, display_name, about, city_slug, locality_slug, band_min, band_max, est, team, outstation, age_days)
join c on c.slug = v.city_slug
join l on l.slug = v.locality_slug and l.city_id = c.id
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- Category links, style tags and the category-specific answers.
--
-- attributes is what components/vendor-category-details.tsx renders on the public profile
-- and what the console's per-category form edits. Keys match lib/category-attributes.ts;
-- money values are integer paise (plan §5).
-- ---------------------------------------------------------------------------

with v as (select id, slug from public.vendors),
     k as (select id, slug from public.categories)
insert into public.vendor_categories (vendor_id, category_id, is_primary, style_tags, price_band_min, price_band_max, attributes)
select v.id, k.id, true, x.tags, ven.price_band_min, ven.price_band_max, x.attrs
from (values
  ('lightleak-studio', 'photography', array['candid','documentary','pre-wedding'],
   '{"deliveryDays":21,"editedPhotos":600,"crewSize":4,"droneAvailable":true,"albumIncluded":false,"rawHandover":false,"sameDayEdit":true}'::jsonb),
  ('saat-phere-films', 'photography', array['cinematic','candid','traditional'],
   '{"deliveryDays":35,"editedPhotos":800,"crewSize":6,"droneAvailable":true,"albumIncluded":true,"rawHandover":false,"sameDayEdit":true}'::jsonb),
  ('anantha-photography', 'photography', array['traditional','portrait','album'],
   '{"deliveryDays":30,"editedPhotos":450,"crewSize":3,"droneAvailable":false,"albumIncluded":true,"rawHandover":true,"sameDayEdit":false}'::jsonb),
  ('the-mango-tree-co', 'photography', array['editorial','candid','portrait'],
   '{"deliveryDays":25,"editedPhotos":500,"crewSize":2,"droneAvailable":false,"albumIncluded":false,"rawHandover":true,"sameDayEdit":false}'::jsonb),
  ('shaadi-stories-delhi', 'photography', array['cinematic','drone','destination'],
   '{"deliveryDays":28,"editedPhotos":900,"crewSize":7,"droneAvailable":true,"albumIncluded":true,"rawHandover":false,"sameDayEdit":true}'::jsonb),
  ('moonlight-weddings', 'photography', array['candid','night','portrait'],
   '{"deliveryDays":20,"editedPhotos":400,"crewSize":3,"droneAvailable":false,"albumIncluded":false,"rawHandover":false,"sameDayEdit":false}'::jsonb),

  ('the-tamarind-estate', 'venues', array['lawn','outdoor','with-rooms'],
   '{"seatedCapacity":450,"floatingCapacity":800,"halls":2,"rooms":24,"parking":150,"venueType":"Lawn","rentPerDay":18000000,"inHouseCatering":true,"outsideCateringAllowed":false,"outsideDecorAllowed":true,"alcoholAllowed":true,"amenities":["Generator","Valet","Bridal room","Lift"]}'::jsonb),
  ('rangoli-banquets', 'venues', array['banquet-hall','indoor','budget'],
   '{"seatedCapacity":300,"floatingCapacity":500,"halls":2,"rooms":0,"parking":60,"venueType":"Banquet hall","rentPerDay":9000000,"inHouseCatering":true,"outsideCateringAllowed":false,"outsideDecorAllowed":true,"alcoholAllowed":false,"amenities":["Generator","Air conditioning","Bridal room"]}'::jsonb),
  ('grand-palace-banquets', 'venues', array['farmhouse','lawn','luxury'],
   '{"seatedCapacity":900,"floatingCapacity":1500,"halls":3,"rooms":12,"parking":400,"venueType":"Farmhouse","rentPerDay":45000000,"inHouseCatering":false,"outsideCateringAllowed":true,"outsideDecorAllowed":true,"alcoholAllowed":true,"amenities":["Generator","Valet","Bridal room","Covered lawn","Mandap area"]}'::jsonb),
  ('the-orchard-noida', 'venues', array['lawn','intimate','garden'],
   '{"seatedCapacity":200,"floatingCapacity":350,"halls":1,"rooms":6,"parking":80,"venueType":"Lawn","rentPerDay":14000000,"inHouseCatering":true,"outsideCateringAllowed":true,"outsideDecorAllowed":true,"alcoholAllowed":true,"amenities":["Generator","Valet","Garden seating"]}'::jsonb),

  ('spice-route-catering', 'catering', array['awadhi','mughlai','chaat'],
   '{"vegPerPlate":85000,"nonVegPerPlate":115000,"minGuests":150,"cuisines":["Awadhi","Mughlai","Chaat","Continental"],"liveCounters":true,"jainSatvik":true,"barService":false,"servingStaffIncluded":true,"tastingAvailable":true,"noticeDays":15}'::jsonb),
  ('saffron-table', 'catering', array['multi-cuisine','live-counters','tasting'],
   '{"vegPerPlate":95000,"nonVegPerPlate":130000,"minGuests":100,"cuisines":["North Indian","Continental","Chinese","Chaat"],"liveCounters":true,"jainSatvik":true,"barService":false,"servingStaffIncluded":true,"tastingAvailable":true,"noticeDays":10}'::jsonb),
  ('dilli-dawat', 'catering', array['north-indian','continental','bar'],
   '{"vegPerPlate":110000,"nonVegPerPlate":150000,"minGuests":200,"cuisines":["North Indian","Continental","Mughlai"],"liveCounters":true,"jainSatvik":false,"barService":true,"servingStaffIncluded":true,"tastingAvailable":true,"noticeDays":15}'::jsonb),

  ('marigold-decor', 'decor', array['floral','mandap','traditional'],
   '{"setups":["Mandap","Stage","Entrance","Haldi"],"startingPrice":6500000,"flowerType":"Fresh only","lighting":true,"themes":["Floral","Traditional","Royal"],"setupHours":8,"noticeDays":10,"venueTieUps":true}'::jsonb),
  ('mehfil-decor', 'decor', array['royal','floral','stage'],
   '{"setups":["Mandap","Stage","Entrance","Sangeet","Car decor"],"startingPrice":12000000,"flowerType":"Both","lighting":true,"themes":["Royal","Floral","Minimal"],"setupHours":12,"noticeDays":15,"venueTieUps":true}'::jsonb),
  ('sitara-events', 'decor', array['minimal','modern','stage'],
   '{"setups":["Stage","Entrance","Sangeet"],"startingPrice":7000000,"flowerType":"Both","lighting":true,"themes":["Minimal","Modern","Boho"],"setupHours":8,"noticeDays":7,"venueTieUps":true}'::jsonb),

  ('blush-by-meera', 'makeup', array['hd','airbrush','bridal'],
   '{"bridalPrice":3500000,"partyPrice":350000,"products":["MAC","Bobbi Brown","Huda Beauty"],"techniques":["HD","Airbrush","Natural"],"trialAvailable":true,"trialPrice":500000,"travelsToVenue":true,"hairIncluded":true,"drapingIncluded":true,"teamSize":3,"hoursPerBride":4}'::jsonb),
  ('the-glow-room', 'makeup', array['natural','hd','bridal'],
   '{"bridalPrice":2800000,"partyPrice":300000,"products":["MAC","Nars","Charlotte Tilbury"],"techniques":["HD","Natural","Dewy"],"trialAvailable":true,"trialPrice":400000,"travelsToVenue":false,"hairIncluded":true,"drapingIncluded":true,"teamSize":3,"hoursPerBride":3}'::jsonb),
  ('ritu-makeovers', 'makeup', array['bridal','party','airbrush'],
   '{"bridalPrice":2400000,"partyPrice":250000,"products":["MAC","Huda Beauty","Estee Lauder"],"techniques":["Airbrush","HD","Party"],"trialAvailable":true,"trialPrice":300000,"travelsToVenue":true,"hairIncluded":true,"drapingIncluded":false,"teamSize":2,"hoursPerBride":3}'::jsonb)
) as x(vendor_slug, category_slug, tags, attrs)
join v on v.slug = x.vendor_slug
join k on k.slug = x.category_slug
join public.vendors ven on ven.id = v.id
on conflict (vendor_id, category_id) do nothing;


-- ---------------------------------------------------------------------------
-- Photographs.
--
-- Six per listing, drawn from a pool of real files in public/. Plan §13 gates going live
-- on five, so six clears it with one to spare and the go-live pill in the console reads
-- green. Alt text is written per listing rather than left null: these are the cards on a
-- discovery page, and an unlabelled gallery is a page a screen-reader user cannot shop
-- from. moderation is 'approved' because media_select_live requires it — pending photos
-- are invisible to customers, which would leave every card blank.
-- ---------------------------------------------------------------------------

with pool as (
  select unnest(array[
    '/luck-1-1280.webp', '/luck-2-1280.webp', '/luck-3-1280.webp', '/luck-4-1280.webp',
    '/place-gomti-nagar-1280.webp', '/place-hazratganj-1280.webp', '/place-aliganj-1280.webp',
    '/place-indira-nagar-1280.webp', '/place-mahanagar-1280.webp', '/place-chowk-1280.webp',
    '/place-sushant-golf-city-1280.webp', '/place-kanpur-road-1280.webp',
    '/temple-1280.webp', '/historical-1280.webp', '/mountain-1280.webp', '/beach-1280.webp',
    '/punjabi-1280.webp', '/marathi-1280.webp', '/tamil-1280.webp', '/gujarati-1280.webp',
    '/bengali-1280.webp', '/telugu-1280.webp', '/malayali-1280.webp'
  ]) as path, generate_series(1, 23) as n
),
seeded as (
  select v.id as vendor_id, v.slug, v.display_name,
         row_number() over (order by v.slug) as vendor_no
  from public.vendors v
  where v.slug in (
    'lightleak-studio','saat-phere-films','anantha-photography','the-mango-tree-co',
    'shaadi-stories-delhi','moonlight-weddings','the-tamarind-estate','rangoli-banquets',
    'grand-palace-banquets','the-orchard-noida','spice-route-catering','saffron-table',
    'dilli-dawat','marigold-decor','mehfil-decor','sitara-events','blush-by-meera',
    'the-glow-room','ritu-makeovers'
  )
)
insert into public.media (vendor_id, kind, storage_path, alt_text, sort_order, is_cover, moderation)
select
  s.vendor_id,
  'image',
  p.path,
  -- Generic but true, and specific to the listing. Better than "photograph 3", which tells
  -- a screen-reader user nothing they could shop on.
  s.display_name || ' — photograph ' || g,
  g * 10,
  g = 1,
  'approved'
from seeded s
cross join lateral generate_series(1, 6) g
join pool p on p.n = ((s.vendor_no * 6 + g - 1) % 23) + 1
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- Packages.
--
-- One or two each. `price_per_day` is generated by the schema from price and
-- duration_days, which is what makes plan §2's "compare a three-day quote against a
-- one-day one" work — so duration_days is set honestly rather than left at 1.
-- ---------------------------------------------------------------------------

with v as (select id, slug from public.vendors),
     k as (select id, slug from public.categories)
insert into public.packages (vendor_id, category_id, name, description, price, pricing_unit, duration_days, is_active, sort_order)
select v.id, k.id, x.name, x.descr, x.price, 'per_day', x.days, true, x.sort
from (values
  ('lightleak-studio','photography','Full-day candid coverage','Two photographers and one cinematographer for the wedding day, 600 edited photographs delivered in 21 days.',18000000::bigint,1,10),
  ('lightleak-studio','photography','Three-day wedding','Haldi, sangeet and the wedding. Same crew throughout, one edit, one handover.',45000000,3,20),
  ('saat-phere-films','photography','Film and photographs','Two-camera film plus stills across the wedding day, ten-minute edit and the full-length record.',28000000,1,10),
  ('anantha-photography','photography','Traditional coverage','Every ritual in order, printed album included, delivered in 30 days.',12000000,1,10),
  ('the-mango-tree-co','photography','Documentary day','Two of us, no direction, no posed group photographs unless you ask.',20000000,1,10),
  ('shaadi-stories-delhi','photography','Destination three-day','Crew of seven travelling with you, drone included, same-day edit for the sangeet.',75000000,3,10),
  ('moonlight-weddings','photography','Evening coverage','Lighting rig included, from the baraat to the vidaai.',16000000,1,10),

  ('the-tamarind-estate','venues','Lawn and hall, one day','Both spaces for a single function, in-house catering, 24 guest rooms available.',35000000,1,10),
  ('rangoli-banquets','venues','Main hall','300 seated, air-conditioned, in-house kitchen, decorator of your choice.',12000000,1,10),
  ('grand-palace-banquets','venues','Full property','Covered lawn, mandap area and three halls, outside caterer permitted.',85000000,1,10),
  ('the-orchard-noida','venues','Garden wedding','200 seated with no minimum guarantee, and the property is yours for the day.',18000000,1,10),

  ('spice-route-catering','catering','Awadhi vegetarian','Per plate, minimum 150 guests, serving staff and two live counters included.',8500000,1,10),
  ('saffron-table','catering','Multi-cuisine with counters','Per plate, tasting session before you commit, staff included.',9500000,1,10),
  ('dilli-dawat','catering','North Indian and continental','Per plate, minimum 200 guests, bar service where the venue permits.',11000000,1,10),

  ('marigold-decor','decor','Mandap and stage','Fresh flowers, lighting included, built the morning of.',12000000,1,10),
  ('mehfil-decor','decor','Full wedding decor','Mandap, stage, entrance and sangeet across two days.',35000000,2,10),
  ('sitara-events','decor','Minimal stage and entrance','Mixed fresh and artificial, eight hours to build.',9000000,1,10),

  ('blush-by-meera','makeup','Bridal, one function','HD or airbrush, hair and draping included, trial beforehand.',3500000,1,10),
  ('the-glow-room','makeup','Bride and family','Three artists so everybody is ready together.',4500000,1,10),
  ('ritu-makeovers','makeup','Bridal package','Airbrush or HD, hair included, trial charge adjusted against the bill.',2400000,1,10)
) as x(vendor_slug, category_slug, name, descr, price, days, sort)
join v on v.slug = x.vendor_slug
join k on k.slug = x.category_slug
on conflict do nothing;

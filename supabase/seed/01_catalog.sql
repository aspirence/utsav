-- ============================================================================
-- Fremmo seed — 01 · Category taxonomy and style tags
-- Plan §S2: "category taxonomy incl. photography style tags"
-- Plan §11: photography is the wedge — 800 of 3,000 launch listings.
-- ============================================================================

set search_path = public, extensions;

insert into public.categories (slug, name, plural_name, description, pricing_unit, is_wedge, sort_order) values
  ('photography',  'Photographer',      'Photographers',
   'Wedding and event photography — candid, traditional, cinematic and more.', 'per_day', true, 1),
  ('videography',  'Videographer',      'Videographers',
   'Cinematic films, teasers and same-day edits.', 'per_day', false, 2),
  ('venues',       'Venue',             'Venues',
   'Banquet halls, farmhouses, resorts and lawns.', 'per_event', false, 3),
  ('catering',     'Caterer',           'Caterers',
   'Multi-cuisine catering, live counters and bar service.', 'per_plate', false, 4),
  ('decor',        'Decorator',         'Decorators',
   'Stage, mandap, floral and lighting design.', 'per_event', false, 5),
  ('makeup',       'Makeup Artist',     'Makeup Artists',
   'Bridal and party makeup, hair and draping.', 'per_day', false, 6),
  ('mehendi',      'Mehendi Artist',    'Mehendi Artists',
   'Bridal and guest mehendi.', 'per_day', false, 7),
  ('music-dj',     'Music & DJ',        'Music & DJs',
   'DJs, live bands, dhol and sound systems.', 'per_event', false, 8),
  ('choreography', 'Choreographer',     'Choreographers',
   'Sangeet and reception choreography.', 'per_event', false, 9),
  ('invitations',  'Invitation Designer', 'Invitation Designers',
   'Printed cards, e-invites and stationery.', 'per_event', false, 10),
  ('transport',    'Transport',         'Transport Services',
   'Wedding cars, guest shuttles and vintage hire.', 'per_event', false, 11),
  ('pandit',       'Pandit',            'Pandits',
   'Priests and ceremony officiants across traditions.', 'per_event', false, 12),
  ('anchors',      'Anchor',            'Anchors',
   'Event hosts and emcees.', 'per_event', false, 13),
  ('gifting',      'Gifting',           'Gifting & Favours',
   'Return gifts, hampers and trousseau packing.', 'per_person', false, 14)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Style tags. Plan §2: "portfolio-first vendor profiles with style taxonomy
-- (candid/traditional/cinematic…)" — the photography set is the wedge filter.
-- ---------------------------------------------------------------------------

insert into public.style_tags (category_id, slug, name, description, sort_order)
select c.id, t.slug, t.name, t.description, t.sort_order
from public.categories c
join (values
  ('photography', 'candid',        'Candid',        'Unposed, in-the-moment storytelling.', 1),
  ('photography', 'traditional',   'Traditional',   'Classic posed portraits and rituals.', 2),
  ('photography', 'cinematic',     'Cinematic',     'Filmic grade, dramatic light and framing.', 3),
  ('photography', 'documentary',   'Documentary',   'Photojournalistic, full-day narrative.', 4),
  ('photography', 'fine-art',      'Fine Art',      'Editorial, styled and painterly.', 5),
  ('photography', 'pre-wedding',   'Pre-wedding',   'Couple shoots on location.', 6),
  ('photography', 'drone',         'Drone / Aerial', 'Aerial coverage of venue and baraat.', 7),
  ('photography', 'portrait',      'Portraiture',   'Studio and family portrait specialists.', 8),
  ('photography', 'editorial',     'Editorial',     'Magazine-style styled shoots.', 9),

  ('videography', 'cinematic',     'Cinematic Film', 'Feature-style wedding films.', 1),
  ('videography', 'same-day-edit', 'Same-day Edit',  'Edited teaser screened at the reception.', 2),
  ('videography', 'traditional',   'Traditional',    'Full-ceremony documentation.', 3),

  ('venues',      'banquet',       'Banquet Hall',   'Indoor, air-conditioned halls.', 1),
  ('venues',      'farmhouse',     'Farmhouse',      'Open-air farmhouse and lawn venues.', 2),
  ('venues',      'resort',        'Resort',         'Destination and staycation properties.', 3),
  ('venues',      'heritage',      'Heritage',       'Palaces, havelis and heritage hotels.', 4),
  ('venues',      'rooftop',       'Rooftop',        'Terrace and skyline venues.', 5),

  ('makeup',      'hd-makeup',     'HD Makeup',      'High-definition bridal makeup.', 1),
  ('makeup',      'airbrush',      'Airbrush',       'Airbrush application.', 2),
  ('makeup',      'natural',       'Natural / No-makeup', 'Minimal, skin-first looks.', 3),

  ('decor',       'floral',        'Floral',         'Fresh flower installations.', 1),
  ('decor',       'minimal',       'Minimal',        'Restrained, contemporary staging.', 2),
  ('decor',       'royal',         'Royal / Grand',  'Maximalist mandap and stage design.', 3),
  ('decor',       'boho',          'Boho',           'Rustic, pampas and macramé.', 4),

  ('catering',    'north-indian',  'North Indian',   'Punjabi, Mughlai and Awadhi.', 1),
  ('catering',    'south-indian',  'South Indian',   'Regional South Indian menus.', 2),
  ('catering',    'jain-satvik',   'Jain / Satvik',  'No onion, no garlic menus.', 3),
  ('catering',    'continental',   'Continental',    'European and fusion counters.', 4),
  ('catering',    'live-counters', 'Live Counters',  'Chaat, pasta and grill stations.', 5)
) as t(cat_slug, slug, name, description, sort_order)
  on t.cat_slug = c.slug
on conflict (category_id, slug) do nothing;

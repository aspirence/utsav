-- ============================================================================
-- Utsava seed — 00 · Geography
-- Plan §1: public launch April 2027 in Lucknow + Delhi NCR.
-- Plan §14 FY29: "8-city scale-out (config-driven launches)" — the rest are seeded
-- dark (is_launched = false) so a launch is a flag flip, not a data migration.
-- ============================================================================

set search_path = public, extensions;

insert into public.cities (slug, name, state, centroid, is_launched, launch_order) values
  ('lucknow', 'Lucknow', 'Uttar Pradesh',
    st_setsrid(st_makepoint(77.5946, 12.9716), 4326)::geography, true, 1),
  ('delhi-ncr', 'Delhi NCR', 'Delhi',
    st_setsrid(st_makepoint(77.2090, 28.6139), 4326)::geography, true, 2),
  ('mumbai', 'Mumbai', 'Maharashtra',
    st_setsrid(st_makepoint(72.8777, 19.0760), 4326)::geography, false, 3),
  ('hyderabad', 'Hyderabad', 'Telangana',
    st_setsrid(st_makepoint(78.4867, 17.3850), 4326)::geography, false, 4),
  ('pune', 'Pune', 'Maharashtra',
    st_setsrid(st_makepoint(73.8567, 18.5204), 4326)::geography, false, 5),
  ('chennai', 'Chennai', 'Tamil Nadu',
    st_setsrid(st_makepoint(80.2707, 13.0827), 4326)::geography, false, 6),
  ('jaipur', 'Jaipur', 'Rajasthan',
    st_setsrid(st_makepoint(75.7873, 26.9124), 4326)::geography, false, 7),
  ('ahmedabad', 'Ahmedabad', 'Gujarat',
    st_setsrid(st_makepoint(72.5714, 23.0225), 4326)::geography, false, 8)
on conflict (slug) do nothing;

update public.cities set launched_at = now() where is_launched and launched_at is null;

-- ---------------------------------------------------------------------------
-- Localities — the SEO unit (plan §5). Seeded is_seo_eligible = false; the quality
-- threshold in app.refresh_locality_stats() flips it once enough live listings exist.
-- ---------------------------------------------------------------------------

insert into public.localities (city_id, slug, name, centroid, aliases)
select c.id, l.slug, l.name,
       st_setsrid(st_makepoint(l.lon, l.lat), 4326)::geography,
       l.aliases
from public.cities c
join (values
  -- Lucknow
  ('lucknow', 'gomti-nagar',      'Gomti Nagar',      77.6408, 12.9784, array['Indira Nagar', 'CMH Road', '100 Feet Road']),
  ('lucknow', 'hazratganj',      'Hazratganj',      77.6245, 12.9352, array['Hazratganj 5th Block']),
  ('lucknow', 'sushant-golf-city',       'Sushant Golf City',       77.7500, 12.9698, array['ITPL', 'Varthur']),
  ('lucknow', 'aliganj',        'Aliganj',        77.5938, 12.9250, array['Jaya Nagar']),
  ('lucknow', 'indira-nagar',       'Indira Nagar',       77.6389, 12.9116, array['HSR', 'Agara']),
  ('lucknow', 'mahanagar',         'Mahanagar',         77.5857, 12.9063, array['Jayaprakash Nagar']),
  ('lucknow', 'chowk',     'Chowk',     77.5709, 13.0035, array['Malleswaram']),
  ('lucknow', 'alambagh',      'Alambagh',      77.5526, 12.9916, array['Rajaji Nagar']),
  ('lucknow', 'electronic-city',  'Electronic City',  77.6602, 12.8452, array['E City']),
  ('lucknow', 'yelahanka',        'Yelahanka',        77.5963, 13.1007, array['Yelahanka New Town']),
  ('lucknow', 'faizabad-road',    'Faizabad Road',    77.6870, 12.9010, array['Faizabad']),
  ('lucknow', 'kanpur-road',           'Kanpur Road',           77.5946, 13.0358, array['Kanpur Road Kempapura']),
  -- Delhi NCR
  ('delhi-ncr', 'gurugram',         'Gurugram',         77.0266, 28.4595, array['Gurgaon', 'Cyber City', 'DLF Phase']),
  ('delhi-ncr', 'noida',            'Noida',            77.3910, 28.5355, array['Greater Noida', 'Sector 18']),
  ('delhi-ncr', 'dwarka',           'Dwarka',           77.0460, 28.5921, array['Dwarka Sector']),
  ('delhi-ncr', 'hauz-khas',        'Hauz Khas',        77.2001, 28.5494, array['Hauz Khas Village', 'HKV']),
  ('delhi-ncr', 'vasant-kunj',      'Vasant Kunj',      77.1591, 28.5200, array['Vasant Vihar']),
  ('delhi-ncr', 'chattarpur',       'Chattarpur',       77.1798, 28.5062, array['Chhatarpur', 'Farmhouse belt']),
  ('delhi-ncr', 'rohini',           'Rohini',           77.0565, 28.7495, array['Rohini Sector']),
  ('delhi-ncr', 'pitampura',        'Pitampura',        77.1316, 28.6942, array['Netaji Subhash Place', 'NSP']),
  ('delhi-ncr', 'karol-bagh',       'Karol Bagh',       77.1909, 28.6519, array['Karolbagh']),
  ('delhi-ncr', 'ghaziabad',        'Ghaziabad',        77.4538, 28.6692, array['Indirapuram', 'Vaishali']),
  ('delhi-ncr', 'faridabad',        'Faridabad',        77.3178, 28.4089, array['Ballabgarh']),
  ('delhi-ncr', 'south-delhi',      'South Delhi',      77.2295, 28.5677, array['Greater Kailash', 'GK', 'Saket'])
) as l(city_slug, slug, name, lon, lat, aliases)
  on l.city_slug = c.slug
on conflict (city_id, slug) do nothing;

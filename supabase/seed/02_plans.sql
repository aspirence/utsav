-- ============================================================================
-- Fremmo seed — 02 · Subscription plans
-- Plan §2: "subscription tiers & GST billing" ship by Jul 2027.
-- Plan §10: "180 paying vendors by Mar 2028; renewal ≥ 55–60%".
-- Amounts are integer paise (plan §5). ₹1 = 100 paise.
-- ============================================================================

set search_path = public, extensions;

insert into public.plans (
  slug, name, description, price_monthly, price_annual,
  monthly_lead_credits, max_categories, max_media, max_team_members, sort_order, features
) values
  ('free', 'Listed', 'A verified listing with no lead access — the on-ramp for field-created profiles.',
   0, 0, 0, 1, 10, 1, 1,
   '{"lead_inbox": false, "analytics": false, "badge": null}'::jsonb),

  ('starter', 'Starter', 'For solo photographers and small studios taking their first platform leads.',
   99900, 999900, 20, 1, 40, 2, 2,
   '{"lead_inbox": true, "analytics": "basic", "badge": null, "quotes": true}'::jsonb),

  ('growth', 'Growth', 'For established studios working multiple categories and a small team.',
   249900, 2499900, 60, 3, 120, 5, 3,
   '{"lead_inbox": true, "analytics": "full", "badge": "verified", "quotes": true, "priority_support": true}'::jsonb),

  ('pro', 'Pro', 'Unmetered leads for high-volume studios and multi-city operators.',
   499900, 4999900, null, 8, 400, 15, 4,
   '{"lead_inbox": true, "analytics": "full", "badge": "pro", "quotes": true, "priority_support": true, "featured_eligible": true}'::jsonb)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Planning checklist template. Plan §2 Should tier / §S10 "checklist v1".
-- Offsets are days relative to the event date, so the same template works for a
-- wedding eleven months out and one six weeks out.
-- ---------------------------------------------------------------------------

insert into public.cms_pages (slug, title, page_type, is_published, published_at, body, meta_description)
values
  ('privacy', 'Privacy Policy', 'legal', true, now(),
   'How Fremmo collects, uses and protects your personal data under the DPDP Act.',
   'Fremmo privacy policy and DPDP compliance.'),
  ('terms', 'Terms of Use', 'legal', true, now(),
   'The terms governing use of the Fremmo platform by customers and vendors.',
   'Fremmo terms of use.'),
  ('vendor-terms', 'Vendor Agreement', 'legal', true, now(),
   'Listing, lead, subscription and payout terms for vendors on Fremmo.',
   'Fremmo vendor agreement.'),
  -- Plan §11/§12: the channel-conflict mitigation is a published, public policy.
  ('anchor-studio-policy', 'Our Studio on Fremmo', 'policy', true, now(),
   'Fremmo''s founder operates a photography studio that lists on this platform. '
   'It carries a disclosure badge, is ranked by exactly the same SQL as every other '
   'listing with no boost of any kind, takes overflow work only, and is capped at '
   'roughly 5% of bookings in its category. This page explains the rules and how we audit them.',
   'How Fremmo handles the founder-owned studio listed on the platform.')
on conflict (slug) do nothing;

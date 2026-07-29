-- ============================================================================
-- Utsava — 001300 · Row Level Security policies
--
-- Plan §6 golden rules, implemented literally:
--   1. default-deny on every table                       → RLS enabled in each schema
--                                                          migration; a table with no
--                                                          policy below is unreachable.
--   2. money tables never trust the client                → payments/payouts/refunds/
--                                                          subscriptions get SELECT
--                                                          policies only. No INSERT or
--                                                          UPDATE policy exists for
--                                                          anon/authenticated, so only
--                                                          service-role code can write.
--   3. contact masking is a view                          → 001400.
--   4. policies are tested code                           → supabase/tests/*.sql (pgTAP).
--
-- service_role holds BYPASSRLS, so it needs no policies; that is the whole point of
-- "written only by service-role code, merely readable by their parties".
--
-- Policy naming: <table>_<command>_<who>.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Reference data — world-readable, staff-writable.
-- ---------------------------------------------------------------------------

create policy cities_select_all on public.cities
  for select to anon, authenticated using (true);

create policy cities_write_staff on public.cities
  for all to authenticated
  using (app.is_staff('super')) with check (app.is_staff('super'));

create policy localities_select_all on public.localities
  for select to anon, authenticated using (true);

create policy localities_write_staff on public.localities
  for all to authenticated
  using (app.is_staff('super')) with check (app.is_staff('super'));

create policy categories_select_active on public.categories
  for select to anon, authenticated using (is_active or app.is_staff());

create policy categories_write_staff on public.categories
  for all to authenticated
  using (app.is_staff('super')) with check (app.is_staff('super'));

create policy style_tags_select_active on public.style_tags
  for select to anon, authenticated using (is_active or app.is_staff());

create policy style_tags_write_staff on public.style_tags
  for all to authenticated
  using (app.is_staff('super')) with check (app.is_staff('super'));

create policy plans_select_active on public.plans
  for select to anon, authenticated using (is_active or app.is_staff());

create policy plans_write_staff on public.plans
  for all to authenticated
  using (app.is_staff('super', 'finance')) with check (app.is_staff('super', 'finance'));

create policy cms_pages_select_published on public.cms_pages
  for select to anon, authenticated using (is_published or app.is_staff());

create policy cms_pages_write_staff on public.cms_pages
  for all to authenticated
  using (app.is_staff('super', 'moderator')) with check (app.is_staff('super', 'moderator'));

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or app.is_staff());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_staff on public.profiles
  for update to authenticated
  using (app.is_staff('super', 'moderator'))
  with check (app.is_staff('super', 'moderator'));

-- staff_roles is readable only by the holder and by super admins. Deliberately no
-- write policy: granting staff access is a service-role operation, audited in audit_log.
create policy staff_roles_select_own on public.staff_roles
  for select to authenticated
  using (profile_id = auth.uid() or app.is_staff('super'));

-- audit_log: append-only by trigger; readable by super admins only.
create policy audit_log_select_super on public.audit_log
  for select to authenticated using (app.is_staff('super'));

create policy audit_log_insert_staff on public.audit_log
  for insert to authenticated
  with check (app.is_staff() and actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Catalog. Plan §6: "SELECT where live/published" for the public; "ALL on own vendor
-- via membership (role-gated)"; "field: draft-only, own city; moderator: approve".
-- ---------------------------------------------------------------------------

create policy vendors_select_live on public.vendors
  for select to anon, authenticated
  using (status = 'live');

create policy vendors_select_member on public.vendors
  for select to authenticated
  using (app.is_vendor_member(id, 'responder'));

create policy vendors_select_staff on public.vendors
  for select to authenticated
  using (app.is_staff() and app.staff_covers_city(city_id));

-- Managers and owners edit the listing. The owner-only columns and the status column
-- are additionally guarded by app.guard_vendor_columns() below — RLS cannot express
-- column-level rules, so the trigger completes the §3 capability matrix.
create policy vendors_update_member on public.vendors
  for update to authenticated
  using (app.is_vendor_member(id, 'manager'))
  with check (app.is_vendor_member(id, 'manager'));

-- Plan §6: a field agent creates listings in draft, in their own city, only.
create policy vendors_insert_field on public.vendors
  for insert to authenticated
  with check (
    app.is_staff('field_agent', 'super')
    and app.staff_covers_city(city_id)
    and status = 'draft'
  );

create policy vendors_update_staff on public.vendors
  for update to authenticated
  using (app.is_staff('moderator', 'super')
         or (app.is_staff('field_agent') and status = 'draft' and app.staff_covers_city(city_id)))
  with check (app.is_staff('moderator', 'super')
         or (app.is_staff('field_agent') and status = 'draft' and app.staff_covers_city(city_id)));

-- vendor_private: owners and staff only. No public policy exists, so a leak is
-- impossible rather than merely unlikely.
create policy vendor_private_select_owner on public.vendor_private
  for select to authenticated
  using (app.is_vendor_member(vendor_id, 'owner') or app.is_staff('super', 'finance'));

create policy vendor_private_update_owner on public.vendor_private
  for update to authenticated
  using (app.is_vendor_member(vendor_id, 'owner'))
  with check (app.is_vendor_member(vendor_id, 'owner'));

create policy vendor_private_write_staff on public.vendor_private
  for all to authenticated
  using (app.is_staff('super', 'finance'))
  with check (app.is_staff('super', 'finance'));

-- Membership. A member sees their team; only the owner changes it (§3).
create policy vendor_members_select_member on public.vendor_members
  for select to authenticated
  using (profile_id = auth.uid() or app.is_vendor_member(vendor_id, 'responder') or app.is_staff());

create policy vendor_members_write_owner on public.vendor_members
  for all to authenticated
  using (app.is_vendor_member(vendor_id, 'owner') or app.is_staff('super'))
  with check (app.is_vendor_member(vendor_id, 'owner') or app.is_staff('super'));

-- Child catalog tables follow the parent vendor's visibility.
create policy vendor_categories_select_live on public.vendor_categories
  for select to anon, authenticated
  using (exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'live'));

create policy vendor_categories_manage on public.vendor_categories
  for all to authenticated
  using (app.is_vendor_member(vendor_id, 'manager') or app.is_staff('field_agent', 'moderator', 'super'))
  with check (app.is_vendor_member(vendor_id, 'manager') or app.is_staff('field_agent', 'moderator', 'super'));

create policy packages_select_live on public.packages
  for select to anon, authenticated
  using (is_active and exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'live'));

create policy packages_manage on public.packages
  for all to authenticated
  using (app.is_vendor_member(vendor_id, 'manager') or app.is_staff('field_agent', 'moderator', 'super'))
  with check (app.is_vendor_member(vendor_id, 'manager') or app.is_staff('field_agent', 'moderator', 'super'));

create policy media_select_live on public.media
  for select to anon, authenticated
  using (moderation = 'approved'
         and exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'live'));

create policy media_manage on public.media
  for all to authenticated
  using (app.is_vendor_member(vendor_id, 'manager') or app.is_staff('field_agent', 'moderator', 'super'))
  with check (app.is_vendor_member(vendor_id, 'manager') or app.is_staff('field_agent', 'moderator', 'super'));

create policy vendor_faqs_select_live on public.vendor_faqs
  for select to anon, authenticated
  using (exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'live'));

create policy vendor_faqs_manage on public.vendor_faqs
  for all to authenticated
  using (app.is_vendor_member(vendor_id, 'manager') or app.is_staff('field_agent', 'moderator', 'super'))
  with check (app.is_vendor_member(vendor_id, 'manager') or app.is_staff('field_agent', 'moderator', 'super'));

-- Availability is public: the "free on my date" filter (§2) has to read it anonymously.
-- It exposes only "this vendor is busy on this date", never why or for whom.
create policy vendor_availability_select_all on public.vendor_availability
  for select to anon, authenticated
  using (exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'live'));

create policy vendor_availability_manage on public.vendor_availability
  for all to authenticated
  using (app.is_vendor_member(vendor_id, 'responder') or app.is_staff('super'))
  with check (app.is_vendor_member(vendor_id, 'responder') or app.is_staff('super'));

-- ---------------------------------------------------------------------------
-- Demand. Plan §6: events/enquiries/shortlists — "own rows ALL" for the customer,
-- "—" for vendors, "SELECT" for staff.
--
-- Vendors are absent from enquiries by design: that table holds the raw customer phone.
-- Vendors reach their leads exclusively through public.vendor_leads (001400), which
-- applies the §6 contact mask.
-- ---------------------------------------------------------------------------

create policy events_all_own on public.events
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy events_select_staff on public.events
  for select to authenticated using (app.is_staff());

create policy enquiries_select_own on public.enquiries
  for select to authenticated
  using (customer_id = auth.uid() or app.is_staff());

-- An enquiry may only be created for oneself, and only ever in pending_otp.
-- Promotion to 'verified' happens in app.verify_enquiry_otp() — there is no client
-- path to a verified enquiry, which is what makes the §1 lead-quality claim hold.
create policy enquiries_insert_own on public.enquiries
  for insert to authenticated
  with check (customer_id = auth.uid() and status = 'pending_otp');

-- The WITH CHECK must repeat the state guard, not just re-assert ownership. Without the
-- status clause below a customer could UPDATE their own enquiry straight from
-- 'pending_otp' to 'verified' and stamp phone_verified_at themselves — which would make
-- the entire OTP gate, and therefore plan §1's lead-quality claim, client-bypassable.
-- Status and the verification stamp move only inside app.verify_enquiry_otp();
-- app.guard_enquiry_columns() below enforces that even if this policy is ever loosened.
create policy enquiries_update_own on public.enquiries
  for update to authenticated
  using (customer_id = auth.uid() and status in ('pending_otp', 'verified', 'routed'))
  with check (customer_id = auth.uid() and status in ('pending_otp', 'verified', 'routed'));

create policy enquiries_update_staff on public.enquiries
  for update to authenticated
  using (app.is_staff('moderator', 'super')) with check (app.is_staff('moderator', 'super'));

-- Leads. Plan §6: customer "own via enquiry"; vendor "SELECT own vendor's … transitions
-- via RPC"; staff "R/W". Note there is no vendor UPDATE policy — app.transition_lead()
-- is the only way a lead changes state.
create policy leads_select_customer on public.leads
  for select to authenticated
  using (exists (select 1 from public.enquiries e
                 where e.id = enquiry_id and e.customer_id = auth.uid()));

create policy leads_select_vendor on public.leads
  for select to authenticated
  using (app.is_vendor_member(vendor_id, 'responder'));

create policy leads_all_staff on public.leads
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

create policy lead_activities_select_party on public.lead_activities
  for select to authenticated
  using (
    app.is_staff()
    or exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (app.is_vendor_member(l.vendor_id, 'responder')
             or exists (select 1 from public.enquiries e
                        where e.id = l.enquiry_id and e.customer_id = auth.uid()))
    )
  );

create policy shortlists_all_own on public.shortlists
  for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy shortlists_select_staff on public.shortlists
  for select to authenticated using (app.is_staff());

-- ---------------------------------------------------------------------------
-- Transaction. Plan §6: quotes — customer SELECT own, vendor ALL own, staff SELECT.
-- bookings + money tables — SELECT only for both parties; finance writes via service-role.
-- ---------------------------------------------------------------------------

create policy quotes_select_customer on public.quotes
  for select to authenticated
  using (
    status <> 'draft'
    and exists (
      select 1 from public.leads l
      join public.enquiries e on e.id = l.enquiry_id
      where l.id = lead_id and e.customer_id = auth.uid()
    )
  );

-- The lead must belong to the same vendor. Checking only quotes.vendor_id would let a
-- vendor attach a quote to a competitor's lead — and since quotes_select_customer
-- resolves the recipient through the lead, that quote would be delivered to a customer
-- who never enquired with them.
create policy quotes_all_vendor on public.quotes
  for all to authenticated
  using (
    app.is_vendor_member(vendor_id, 'responder')
    and exists (select 1 from public.leads l
                where l.id = quotes.lead_id and l.vendor_id = quotes.vendor_id)
  )
  with check (
    app.is_vendor_member(vendor_id, 'responder')
    and exists (select 1 from public.leads l
                where l.id = quotes.lead_id and l.vendor_id = quotes.vendor_id)
  );

create policy quotes_select_staff on public.quotes
  for select to authenticated using (app.is_staff());

create policy bookings_select_customer on public.bookings
  for select to authenticated using (customer_id = auth.uid());

create policy bookings_select_vendor on public.bookings
  for select to authenticated using (app.is_vendor_member(vendor_id, 'responder'));

create policy bookings_select_staff on public.bookings
  for select to authenticated using (app.is_staff());

create policy payments_select_party on public.payments
  for select to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id
                   and (b.customer_id = auth.uid() or app.is_vendor_member(b.vendor_id, 'owner')))
         or app.is_staff('finance', 'super'));

create policy payouts_select_party on public.payouts
  for select to authenticated
  using (app.is_vendor_member(vendor_id, 'owner') or app.is_staff('finance', 'super'));

create policy refunds_select_party on public.refunds
  for select to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id
                   and (b.customer_id = auth.uid() or app.is_vendor_member(b.vendor_id, 'owner')))
         or app.is_staff('finance', 'super'));

create policy disputes_select_party on public.disputes
  for select to authenticated
  using (raised_by = auth.uid()
         or exists (select 1 from public.bookings b
                    where b.id = booking_id
                      and (b.customer_id = auth.uid() or app.is_vendor_member(b.vendor_id, 'owner')))
         or app.is_staff());

-- A party may open a dispute. Everything after that is staff/service-role.
create policy disputes_insert_party on public.disputes
  for insert to authenticated
  with check (
    raised_by = auth.uid()
    and status = 'open'
    and exists (select 1 from public.bookings b
                where b.id = booking_id
                  and (b.customer_id = auth.uid() or app.is_vendor_member(b.vendor_id, 'owner')))
  );

create policy disputes_update_staff on public.disputes
  for update to authenticated
  using (app.is_staff('moderator', 'finance', 'super'))
  with check (app.is_staff('moderator', 'finance', 'super'));

-- ---------------------------------------------------------------------------
-- Trust. Plan §6: reviews — "INSERT if own booking completed; SELECT published" for
-- customers, "SELECT own vendor's" for vendors, "moderator R/W" for staff.
-- ---------------------------------------------------------------------------

create policy reviews_select_published on public.reviews
  for select to anon, authenticated
  using (moderation = 'approved' and published_at is not null);

create policy reviews_select_own on public.reviews
  for select to authenticated
  using (author_id = auth.uid() or app.is_vendor_member(vendor_id, 'responder') or app.is_staff());

-- The booking gate, in one place. Plan §2: "booking-gated reviews".
create policy reviews_insert_completed_booking on public.reviews
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and moderation = 'pending'
    and published_at is null
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.customer_id = auth.uid()
        and b.vendor_id = reviews.vendor_id
        and b.status in ('completed', 'released')
    )
  );

-- The author may edit their own review, which sends it back through moderation
-- (enforced by app.guard_review_columns()).
create policy reviews_update_author on public.reviews
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Plan §5: vendors get a right of reply, never the right to edit or hide.
create policy reviews_update_vendor_reply on public.reviews
  for update to authenticated
  using (app.is_vendor_member(vendor_id, 'manager'))
  with check (app.is_vendor_member(vendor_id, 'manager'));

create policy reviews_all_moderator on public.reviews
  for all to authenticated
  using (app.is_staff('moderator', 'super')) with check (app.is_staff('moderator', 'super'));

create policy review_media_select_published on public.review_media
  for select to anon, authenticated
  using (moderation = 'approved'
         and exists (select 1 from public.reviews r
                     where r.id = review_id and r.moderation = 'approved'));

create policy review_media_manage_author on public.review_media
  for all to authenticated
  using (exists (select 1 from public.reviews r where r.id = review_id and r.author_id = auth.uid())
         or app.is_staff('moderator', 'super'))
  with check (exists (select 1 from public.reviews r where r.id = review_id and r.author_id = auth.uid())
         or app.is_staff('moderator', 'super'));

create policy moderation_queue_staff on public.moderation_queue
  for all to authenticated
  using (app.is_staff('moderator', 'super')) with check (app.is_staff('moderator', 'super'));

create policy stories_select_published on public.stories
  for select to anon, authenticated
  using (status = 'published');

create policy stories_manage_author on public.stories
  for all to authenticated
  using (author_vendor_id is not null and app.is_vendor_member(author_vendor_id, 'manager'))
  with check (author_vendor_id is not null and app.is_vendor_member(author_vendor_id, 'manager'));

create policy stories_all_staff on public.stories
  for all to authenticated
  using (app.is_staff('moderator', 'super')) with check (app.is_staff('moderator', 'super'));

create policy story_vendors_select_published on public.story_vendors
  for select to anon, authenticated
  using (exists (select 1 from public.stories s where s.id = story_id and s.status = 'published'));

-- A tagged vendor confirms their own credit; the story author manages the tag list.
create policy story_vendors_manage on public.story_vendors
  for all to authenticated
  using (app.is_vendor_member(vendor_id, 'manager')
         or exists (select 1 from public.stories s
                    where s.id = story_id and s.author_vendor_id is not null
                      and app.is_vendor_member(s.author_vendor_id, 'manager'))
         or app.is_staff('moderator', 'super'))
  with check (app.is_vendor_member(vendor_id, 'manager')
         or exists (select 1 from public.stories s
                    where s.id = story_id and s.author_vendor_id is not null
                      and app.is_vendor_member(s.author_vendor_id, 'manager'))
         or app.is_staff('moderator', 'super'));

-- ---------------------------------------------------------------------------
-- Monetisation. Plan §6: "owner SELECT own" / "finance R/W".
-- No INSERT or UPDATE policy for vendors — billing is service-role only.
-- ---------------------------------------------------------------------------

create policy subscriptions_select_owner on public.subscriptions
  for select to authenticated
  using (app.is_vendor_member(vendor_id, 'owner') or app.is_staff('finance', 'super'));

create policy subscription_invoices_select_owner on public.subscription_invoices
  for select to authenticated
  using (app.is_vendor_member(vendor_id, 'owner') or app.is_staff('finance', 'super'));

-- ---------------------------------------------------------------------------
-- Engagement & ops
-- ---------------------------------------------------------------------------

create policy checklists_all_own on public.checklists
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy checklist_items_all_own on public.checklist_items
  for all to authenticated
  using (exists (select 1 from public.checklists c where c.id = checklist_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.checklists c where c.id = checklist_id and c.owner_id = auth.uid()));

-- Notifications are readable by their recipient; writes are service-role only
-- (the outbox is filled inside business transactions, never by a client).
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid()
         or (vendor_id is not null and app.is_vendor_member(vendor_id, 'responder'))
         or app.is_staff('super'));

-- Only the host reads this table directly. A blanket "published is public" policy would
-- make every invite enumerable with the anon key — hosts, venue address and timing for
-- every wedding on the platform — which contradicts the design intent that the invite
-- link is the credential. Guests go through public.get_e_invite(slug) in 001600, which
-- requires knowing the slug.
create policy e_invites_select_own on public.e_invites
  for select to authenticated
  using (owner_id = auth.uid());

create policy e_invites_all_own on public.e_invites
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Plan: the invite link is the credential — a guest RSVPs without an account.
create policy e_invite_rsvps_insert_public on public.e_invite_rsvps
  for insert to anon, authenticated
  with check (app.invite_accepts_rsvp(invite_id));

create policy e_invite_rsvps_select_host on public.e_invite_rsvps
  for select to authenticated
  using (exists (select 1 from public.e_invites i where i.id = invite_id and i.owner_id = auth.uid()));

-- Plan §6: field agents work their own city's pipeline.
create policy onboarding_pipeline_staff on public.onboarding_pipeline
  for all to authenticated
  using (app.is_staff() and app.staff_covers_city(city_id))
  with check (app.is_staff() and app.staff_covers_city(city_id));

-- Plan §10: clients emit funnel events; nobody reads them back through the API.
-- Analysis happens in the warehouse export, not over PostgREST.
create policy analytics_events_insert_any on public.analytics_events
  for insert to anon, authenticated with check (true);

create policy analytics_events_select_staff on public.analytics_events
  for select to authenticated using (app.is_staff('super'));

-- ---------------------------------------------------------------------------
-- Corporate (Phase 2). Plan §3: admins create/publish and manage panels + billing;
-- requesters are draft-only.
-- ---------------------------------------------------------------------------

create policy corporate_orgs_select_member on public.corporate_orgs
  for select to authenticated
  using (app.is_corporate_member(id) or app.is_staff());

create policy corporate_orgs_update_admin on public.corporate_orgs
  for update to authenticated
  using (app.is_corporate_member(id, true)) with check (app.is_corporate_member(id, true));

create policy corporate_members_select_member on public.corporate_members
  for select to authenticated
  using (profile_id = auth.uid() or app.is_corporate_member(org_id) or app.is_staff());

create policy corporate_members_write_admin on public.corporate_members
  for all to authenticated
  using (app.is_corporate_member(org_id, true) or app.is_staff('super'))
  with check (app.is_corporate_member(org_id, true) or app.is_staff('super'));

create policy rfps_select_member on public.rfps
  for select to authenticated
  using (app.is_corporate_member(org_id) or app.is_staff());

-- An invited vendor sees the RFP they were invited to, once it is published.
--
-- This must go through a SECURITY DEFINER helper. Reading rfp_invites inline would
-- recurse: rfp_invites_select_party (below) reads rfps, and rfps would be reading
-- rfp_invites — a mutual RLS cycle that makes rfps, rfp_invites and rfp_bids all
-- unreadable for every authenticated role. The helper breaks the cycle by reading
-- rfp_invites as its owner, with RLS bypassed.
create policy rfps_select_invited_vendor on public.rfps
  for select to authenticated
  using (status = 'published' and app.vendor_invited_to_rfp(id));

-- Plan §3: requesters draft, admins publish. The status guard is what separates them.
create policy rfps_insert_member on public.rfps
  for insert to authenticated
  with check (app.is_corporate_member(org_id) and created_by = auth.uid() and status = 'draft');

create policy rfps_update_requester on public.rfps
  for update to authenticated
  using (app.is_corporate_member(org_id) and created_by = auth.uid() and status = 'draft')
  with check (app.is_corporate_member(org_id) and status = 'draft');

create policy rfps_update_admin on public.rfps
  for update to authenticated
  using (app.is_corporate_member(org_id, true)) with check (app.is_corporate_member(org_id, true));

-- Also definer-backed, for the same reason as rfps_select_invited_vendor above.
create policy rfp_invites_select_party on public.rfp_invites
  for select to authenticated
  using (app.is_vendor_member(vendor_id, 'responder')
         or app.rfp_belongs_to_my_org(rfp_id)
         or app.is_staff());

create policy rfp_invites_write_admin on public.rfp_invites
  for all to authenticated
  using (app.rfp_belongs_to_my_org(rfp_id, true))
  with check (app.rfp_belongs_to_my_org(rfp_id, true));

create policy rfp_bids_select_party on public.rfp_bids
  for select to authenticated
  using (app.is_vendor_member(vendor_id, 'responder')
         or app.rfp_belongs_to_my_org(rfp_id)
         or app.is_staff());

create policy rfp_bids_write_vendor on public.rfp_bids
  for all to authenticated
  using (app.is_vendor_member(vendor_id, 'manager'))
  with check (app.is_vendor_member(vendor_id, 'manager'));

create policy rfp_bids_update_admin on public.rfp_bids
  for update to authenticated
  using (app.rfp_belongs_to_my_org(rfp_id, true))
  with check (app.rfp_belongs_to_my_org(rfp_id, true));

-- ---------------------------------------------------------------------------
-- Column-level guards. RLS is row-level; §3's capability matrix is partly column-level,
-- so these triggers finish the job.
-- ---------------------------------------------------------------------------

-- Derived-metric writers (app.refresh_vendor_stats and friends) are SECURITY DEFINER,
-- but auth.uid() still reports the *calling* user inside them — the JWT lives in a GUC,
-- not in the role. So a vendor uploading a photo would trip the "derived metrics" guard
-- below via the media trigger. This flag lets a trusted function mark its own write.
-- It is set transaction-locally and cleared immediately after the UPDATE, so it cannot
-- leak into a later statement in the same request.
create or replace function app.set_trusted_write(p_on boolean)
returns void
language sql
as $$
  select set_config('app.trusted_write', case when p_on then 'on' else 'off' end, true);
$$;

create or replace function app.is_trusted_write()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.trusted_write', true), 'off') = 'on';
$$;

create or replace function app.guard_vendor_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Staff and service-role paths are governed by the admin console + audit_log.
  if app.is_trusted_write() or app.is_staff('moderator', 'super') or auth.uid() is null then
    return new;
  end if;

  -- Plan §3: only the owner touches billing/KYC identity.
  if (new.legal_name, new.kyc_status, new.kyc_verified_at)
     is distinct from (old.legal_name, old.kyc_status, old.kyc_verified_at)
     and not app.is_vendor_member(new.id, 'owner') then
    raise exception 'Only the vendor owner may change legal or KYC fields'
      using errcode = 'insufficient_privilege';
  end if;

  -- Plan §11: the anchor-studio disclosure flag is never self-serve.
  if new.is_anchor_studio is distinct from old.is_anchor_studio then
    raise exception 'is_anchor_studio is set by staff only'
      using errcode = 'insufficient_privilege';
  end if;

  -- Plan §6: moderators approve. A vendor may only pause and resume itself; it can
  -- never publish itself, which is what keeps the §13 quality gate meaningful.
  if new.status is distinct from old.status then
    if not (
      app.is_vendor_member(new.id, 'owner')
      and ((old.status = 'live'   and new.status = 'paused')
        or (old.status = 'paused' and new.status = 'live'))
    ) then
      raise exception 'Vendor status transition %→% requires staff approval', old.status, new.status
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Trust and ranking figures are derived, never client-supplied. This tuple must list
  -- EVERY trigger-maintained column: each one is a ranking input (app.vendor_rank) or a
  -- routing gate (app.route_enquiry filters on is_seo_eligible), so a gap here lets a
  -- vendor self-boost into the top of discovery and into other people's leads with a
  -- plain UPDATE — which would quietly break plan §11's "no ranking favour" promise for
  -- everyone, not just the anchor studio.
  if (new.rating_avg, new.rating_count, new.completed_bookings, new.profile_score,
      new.media_count, new.is_seo_eligible, new.response_rate_pct, new.median_response_mins,
      new.search_document, new.search_vector,
      new.published_at, new.claimed_at, new.created_by_staff)
     is distinct from
     (old.rating_avg, old.rating_count, old.completed_bookings, old.profile_score,
      old.media_count, old.is_seo_eligible, old.response_rate_pct, old.median_response_mins,
      old.search_document, old.search_vector,
      old.published_at, old.claimed_at, old.created_by_staff) then
    raise exception 'Derived vendor metrics cannot be written directly'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger vendors_guard_columns
  before update on public.vendors
  for each row execute function app.guard_vendor_columns();

create or replace function app.guard_review_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_trusted_write() or app.is_staff('moderator', 'super') or auth.uid() is null then
    return new;
  end if;

  -- A review's identity is immutable for every non-staff caller. Without this an author
  -- could re-point an already-approved review at a vendor they never booked, and a
  -- vendor could claim someone else's review by rewriting author_id.
  if (new.id, new.vendor_id, new.booking_id, new.author_id)
     is distinct from (old.id, old.vendor_id, old.booking_id, old.author_id) then
    raise exception 'A review cannot be moved to another booking, vendor or author'
      using errcode = 'insufficient_privilege';
  end if;

  -- Vendor path: may only add or change its reply, nothing else.
  --
  -- Branch on OLD, never NEW. NEW.author_id is attacker-controlled: a vendor manager who
  -- set author_id to their own uid would fail this test, fall through to the author
  -- branch below, and gain the power to rewrite or unpublish a review of their own
  -- business. OLD is the row as stored, so it cannot be forged.
  if app.is_vendor_member(old.vendor_id, 'manager') and old.author_id <> auth.uid() then
    if (new.rating, new.title, new.body, new.moderation, new.published_at)
       is distinct from (old.rating, old.title, old.body, old.moderation, old.published_at) then
      raise exception 'A vendor may only reply to a review, not edit it'
        using errcode = 'insufficient_privilege';
    end if;
    new.vendor_replied_at := now();
    return new;
  end if;

  -- Author path: editing the content re-opens moderation and unpublishes.
  if old.author_id = auth.uid() then
    if (new.rating, new.title, new.body) is distinct from (old.rating, old.title, old.body) then
      new.moderation   := 'pending';
      new.published_at := null;
    else
      -- Nothing substantive changed, so moderation state is not the author's to move.
      new.moderation   := old.moderation;
      new.published_at := old.published_at;
    end if;
    -- The author never rewrites the vendor's reply.
    new.vendor_reply      := old.vendor_reply;
    new.vendor_replied_at := old.vendor_replied_at;
  end if;

  return new;
end;
$$;

create trigger reviews_guard_columns
  before update on public.reviews
  for each row execute function app.guard_review_columns();

grant execute on function app.guard_vendor_columns() to authenticated;
grant execute on function app.guard_review_columns() to authenticated;

-- Deliberately NOT granted to anon/authenticated: only trusted definer functions may
-- raise the flag, and they run as their owner.
revoke execute on function app.set_trusted_write(boolean) from public, anon, authenticated;

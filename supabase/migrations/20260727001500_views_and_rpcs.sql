-- ============================================================================
-- Fremmo — 001500 · Masking views and state-machine RPCs
--
-- Plan §6: "Cross-table writes (route a lead, accept a quote, transition escrow) are
-- SECURITY DEFINER functions or service-role server actions; the service-role key
-- never ships in a client bundle."
-- Plan §6: "contact masking is a view — vendors see a customer's phone only in
-- permitted lead states".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- public.vendor_leads — the vendor's lead inbox, and the only route by which a vendor
-- can reach enquiry data.
--
-- Vendors have no RLS policy on public.enquiries at all, because that table holds the
-- raw customer phone. This view runs with definer semantics so it may join enquiries,
-- and therefore carries its own membership guard in the WHERE clause — that guard is
-- the security boundary, not a convenience filter. Do not remove it.
-- ---------------------------------------------------------------------------

-- security_barrier is not optional here. Without it the planner may push a cheap
-- user-supplied qualifier (a leaky operator or a VOLATILE function in a WHERE clause)
-- below the membership check, letting one vendor's query observe another vendor's
-- unmasked customer phone numbers through the error messages or side effects of that
-- qualifier. With the barrier, the WHERE clause below is guaranteed to run first.
create view public.vendor_leads
with (security_invoker = false, security_barrier = true)
as
select
  l.id                    as lead_id,
  l.vendor_id,
  l.status,
  l.routed_seq,
  l.routed_at,
  l.viewed_at,
  l.responded_at,
  l.quoted_at,
  l.converted_at,
  l.expires_at,
  l.credit_charged,
  l.credit_refunded_at,

  e.id                    as enquiry_id,
  e.event_type,
  e.event_date,
  e.date_flexible,
  e.guest_count,
  e.budget_min,
  e.budget_max,
  e.style_preferences,
  e.message,
  e.category_id,
  e.city_id,
  e.locality_id,
  e.created_at            as enquiry_created_at,

  -- First name is always visible so the vendor can address a reply.
  split_part(e.contact_name, ' ', 1) as contact_first_name,

  -- Plan §6: the mask. app.lead_contact_visible() is the single definition of
  -- "permitted lead states"; pgTAP asserts a 'routed' lead returns NULL here.
  case when app.lead_contact_visible(l.status, l.credit_refunded_at)
       then e.contact_name end       as contact_name,
  case when app.lead_contact_visible(l.status, l.credit_refunded_at)
       then e.contact_phone end      as contact_phone,
  case when app.lead_contact_visible(l.status, l.credit_refunded_at)
       then e.contact_email end      as contact_email,
  app.lead_contact_visible(l.status, l.credit_refunded_at) as contact_visible

from public.leads l
join public.enquiries e on e.id = l.enquiry_id
where app.is_vendor_member(l.vendor_id, 'responder');

comment on view public.vendor_leads is
  'Plan §6 contact-masking view. The WHERE clause is the authorization boundary — '
  'this view has definer semantics precisely so it can read enquiries.';

grant select on public.vendor_leads to authenticated;

-- ---------------------------------------------------------------------------
-- Notification outbox helper. Plan §S7.
-- ---------------------------------------------------------------------------

create or replace function app.enqueue_notification(
  p_channel      public.notification_channel,
  p_template     text,
  p_dedupe_key   text,
  p_recipient_id uuid default null,
  p_vendor_id    uuid default null,
  p_to_phone     text default null,
  p_payload      jsonb default '{}'::jsonb,
  p_subject_type text default null,
  p_subject_id   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (
    channel, template, dedupe_key, recipient_id, vendor_id,
    to_phone, payload, subject_type, subject_id
  )
  values (
    p_channel, p_template, p_dedupe_key, p_recipient_id, p_vendor_id,
    p_to_phone, p_payload, p_subject_type, p_subject_id
  )
  -- Idempotent by construction: a retried server action re-enqueues nothing.
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enquiry verification. Plan §1: OTP verification is what makes a lead billable.
--
-- The caller must already hold a phone-verified session for the same number that
-- was typed into the enquiry. That is checked against the JWT, not against a client
-- assertion, so there is no path from the browser to a verified enquiry.
-- ---------------------------------------------------------------------------

create or replace function app.verify_enquiry_otp(p_enquiry_id uuid)
returns public.enquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry   public.enquiries;
  v_jwt_phone text;
begin
  select * into v_enquiry from public.enquiries where id = p_enquiry_id for update;
  if not found then
    raise exception 'Enquiry % not found', p_enquiry_id using errcode = 'no_data_found';
  end if;

  if v_enquiry.customer_id is distinct from auth.uid() then
    raise exception 'Not your enquiry' using errcode = 'insufficient_privilege';
  end if;

  if v_enquiry.status <> 'pending_otp' then
    return v_enquiry;  -- idempotent
  end if;

  -- Supabase sets `phone` in the JWT once the phone OTP has been confirmed.
  v_jwt_phone := nullif(auth.jwt() ->> 'phone', '');
  if v_jwt_phone is null then
    raise exception 'Session is not phone-verified' using errcode = 'insufficient_privilege';
  end if;

  -- The JWT carries the number without a leading '+'; the enquiry stores E.164.
  if ltrim(v_enquiry.contact_phone, '+') <> ltrim(v_jwt_phone, '+') then
    raise exception 'Verified phone does not match the enquiry contact number'
      using errcode = 'insufficient_privilege';
  end if;

  update public.enquiries
     set status = 'verified', phone_verified_at = now()
   where id = p_enquiry_id
  returning * into v_enquiry;

  update public.profiles
     set phone_verified = true
   where id = auth.uid();

  insert into public.analytics_events (name, profile_id, enquiry_id, category_id, city_id)
  values ('otp_verified', auth.uid(), p_enquiry_id, v_enquiry.category_id, v_enquiry.city_id);

  return v_enquiry;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lead routing. Plan §2: "lead routing with 5-vendor cap". Plan §S7 ships the engine.
--
-- Picks at most five live vendors using the same app.vendor_rank() the customer sees
-- in discovery — so routing order is explainable and, per §11, carries no
-- anchor-studio favour.
-- ---------------------------------------------------------------------------

create or replace function app.route_enquiry(p_enquiry_id uuid)
returns setof public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry public.enquiries;
  v_seq     smallint := 0;
  v_vendor  record;
begin
  select * into v_enquiry from public.enquiries where id = p_enquiry_id for update;
  if not found then
    raise exception 'Enquiry % not found', p_enquiry_id using errcode = 'no_data_found';
  end if;

  -- Plan §1: only a verified enquiry may ever become a lead.
  if v_enquiry.status <> 'verified' or v_enquiry.phone_verified_at is null then
    raise exception 'Enquiry % is not verified (status=%)', p_enquiry_id, v_enquiry.status
      using errcode = 'check_violation';
  end if;

  for v_vendor in
    select v.id,
           app.vendor_rank(0, 0, v.profile_score, v.rating_avg, v.rating_count,
                           v.response_rate_pct, v.median_response_mins, null) as score
    from public.vendors v
    join public.vendor_categories vc
      on vc.vendor_id = v.id and vc.category_id = v_enquiry.category_id
    where v.status = 'live'
      and v.city_id = v_enquiry.city_id
      and v.is_seo_eligible                       -- complete listings only
      -- Budget fit: never route a ₹5 L enquiry to a ₹50 L studio.
      and (v_enquiry.budget_max is null or v.price_band_min is null
           or v.price_band_min <= v_enquiry.budget_max)
      -- Plan §2 availability: do not spend a customer's slot on a blocked date.
      and (v_enquiry.event_date is null or v_enquiry.date_flexible or not exists (
            select 1 from public.vendor_availability va
            where va.vendor_id = v.id and va.blocked_on = v_enquiry.event_date))
      -- Style match, when the customer expressed one.
      and (cardinality(v_enquiry.style_preferences) = 0
           or vc.style_tags && v_enquiry.style_preferences)
      -- A vendor with no lead capacity left this period is skipped, not overloaded.
      --
      -- Deliberately phrased as "exclude the exhausted", not "require an entitlement":
      -- leads ship at public launch (Apr 2027) but subscriptions only in Jul 2027
      -- (plan §2), so for the first quarter no vendor has a subscription row at all.
      -- Requiring one would route zero leads. Revisit when billing goes live.
      and not exists (
            select 1 from public.subscriptions s
            join public.plans pl on pl.id = s.plan_id
            where s.vendor_id = v.id
              and s.status in ('trial', 'active')
              and pl.monthly_lead_credits is not null
              and s.credits_consumed >= pl.monthly_lead_credits)
    order by score desc, v.id
    limit 5
  loop
    v_seq := v_seq + 1;

    insert into public.leads (enquiry_id, vendor_id, routed_seq, match_score)
    values (p_enquiry_id, v_vendor.id, v_seq, v_vendor.score)
    on conflict (enquiry_id, vendor_id) do nothing;

    insert into public.lead_activities (lead_id, kind, metadata)
    select l.id, 'routed', jsonb_build_object('seq', v_seq, 'score', v_vendor.score)
    from public.leads l
    where l.enquiry_id = p_enquiry_id and l.vendor_id = v_vendor.id;

    update public.subscriptions
       set credits_consumed = credits_consumed + 1
     where vendor_id = v_vendor.id and status in ('trial', 'active');

    -- Plan §S7: WhatsApp/SMS/FCM ride the outbox.
    perform app.enqueue_notification(
      'whatsapp', 'lead.new',
      'lead.new:' || p_enquiry_id::text || ':' || v_vendor.id::text,
      null, v_vendor.id, null,
      jsonb_build_object('enquiry_id', p_enquiry_id, 'event_date', v_enquiry.event_date),
      'enquiry', p_enquiry_id
    );
  end loop;

  update public.enquiries
     set status = 'routed', routed_at = now()
   where id = p_enquiry_id;

  insert into public.analytics_events (name, enquiry_id, category_id, city_id, properties)
  values ('lead_routed', p_enquiry_id, v_enquiry.category_id, v_enquiry.city_id,
          jsonb_build_object('vendor_count', v_seq));

  return query select * from public.leads where enquiry_id = p_enquiry_id order by routed_seq;
end;
$$;

comment on function app.route_enquiry is
  'Plan §2 routing engine. The 5-vendor cap is belt-and-braces: LIMIT 5 here, and the '
  'leads_cap_five unique index makes a sixth row impossible even under a concurrent call.';

-- ---------------------------------------------------------------------------
-- Lead state machine. Plan §5: routed → viewed → responded → quoted → converted / expired.
-- Forward-only; expiry is the sole exception and is terminal.
-- ---------------------------------------------------------------------------

create or replace function app.lead_transition_allowed(
  p_from public.lead_status,
  p_to   public.lead_status
)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'routed'    then p_to in ('viewed', 'responded', 'expired')
    when 'viewed'    then p_to in ('responded', 'quoted', 'expired')
    when 'responded' then p_to in ('quoted', 'converted', 'expired')
    when 'quoted'    then p_to in ('converted', 'expired')
    else false  -- converted and expired are terminal
  end;
$$;

create or replace function app.transition_lead(
  p_lead_id uuid,
  p_to      public.lead_status,
  p_note    text default null
)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead % not found', p_lead_id using errcode = 'no_data_found';
  end if;

  -- app.accept_quote() reaches this function on the *customer's* session, having already
  -- proved the caller owns the enquiry. auth.uid() still reports that customer inside a
  -- SECURITY DEFINER function (the JWT lives in a GUC, not the role), so without the
  -- trusted-write escape a customer accepting a quote would be rejected here and the
  -- whole booking would roll back. app.set_trusted_write() is revoked from anon and
  -- authenticated, so only a definer function that has already authorized its caller can
  -- raise the flag.
  if not (app.is_trusted_write()
          or app.is_vendor_member(v_lead.vendor_id, 'responder')
          or app.is_staff()) then
    raise exception 'Not a member of this vendor' using errcode = 'insufficient_privilege';
  end if;

  if v_lead.status = p_to then
    return v_lead;  -- idempotent
  end if;

  if not app.lead_transition_allowed(v_lead.status, p_to) then
    raise exception 'Illegal lead transition %→%', v_lead.status, p_to
      using errcode = 'check_violation';
  end if;

  update public.leads
     set status       = p_to,
         viewed_at    = case when p_to = 'viewed'    then coalesce(viewed_at, now())    else viewed_at end,
         responded_at = case when p_to = 'responded' then coalesce(responded_at, now()) else responded_at end,
         quoted_at    = case when p_to = 'quoted'    then coalesce(quoted_at, now())    else quoted_at end,
         converted_at = case when p_to = 'converted' then coalesce(converted_at, now()) else converted_at end,
         -- Plan §6: opening the lead is what reveals the customer's number. Every state
         -- that app.lead_contact_visible() unmasks must stamp this, not just 'viewed' —
         -- a vendor can legally go routed → responded directly, and the audit trail has
         -- to record when the contact details were actually exposed.
         contact_revealed_at = case
           when p_to in ('viewed', 'responded', 'quoted', 'converted')
             then coalesce(contact_revealed_at, now())
           else contact_revealed_at end
   where id = p_lead_id
  returning * into v_lead;

  insert into public.lead_activities (lead_id, actor_id, kind, note)
  values (p_lead_id, auth.uid(), p_to::text::public.lead_activity_kind, p_note);

  insert into public.analytics_events (name, profile_id, lead_id, vendor_id)
  values ('vendor_' || p_to::text, auth.uid(), p_lead_id, v_lead.vendor_id);

  -- Plan §10: median vendor response < 2 h is measured, not estimated.
  if p_to = 'responded' then
    perform app.refresh_vendor_response_metrics(v_lead.vendor_id);
  end if;

  return v_lead;
end;
$$;

-- Plan §2: "honest vendor dashboards" — the vendor sees the same response numbers
-- that feed ranking and the §10 board KPI. One definition, computed here.
create or replace function app.refresh_vendor_response_metrics(p_vendor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_median integer;
  v_rate   smallint;
begin
  select percentile_cont(0.5) within group (
           order by extract(epoch from (l.responded_at - l.routed_at)) / 60
         )::integer
    into v_median
  from public.leads l
  where l.vendor_id = p_vendor_id and l.responded_at is not null;

  select (100.0 * count(*) filter (where l.responded_at is not null)
          / nullif(count(*), 0))::smallint
    into v_rate
  from public.leads l
  where l.vendor_id = p_vendor_id and l.routed_at > now() - interval '90 days';

  perform app.set_trusted_write(true);
  update public.vendors
     set median_response_mins = v_median,
         response_rate_pct    = v_rate
   where id = p_vendor_id;
  perform app.set_trusted_write(false);
end;
$$;

-- Plan §12: "credit refunds" for junk leads — the mitigation that protects renewal.
create or replace function app.refund_lead_credit(p_lead_id uuid, p_reason text)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  if not app.is_staff('moderator', 'super') then
    raise exception 'Staff only' using errcode = 'insufficient_privilege';
  end if;

  update public.leads
     set credit_refunded_at = now(), refund_reason = p_reason, credit_charged = false
   where id = p_lead_id and credit_refunded_at is null
  returning * into v_lead;

  if not found then
    raise exception 'Lead % not found or already refunded', p_lead_id using errcode = 'no_data_found';
  end if;

  update public.subscriptions
     set credits_consumed = greatest(0, credits_consumed - 1)
   where vendor_id = v_lead.vendor_id and status in ('trial', 'active');

  insert into public.lead_activities (lead_id, actor_id, kind, note)
  values (p_lead_id, auth.uid(), 'credit_refunded', p_reason);

  return v_lead;
end;
$$;

-- ---------------------------------------------------------------------------
-- Escrow state machine. Plan §5 and §12: "Explicit state machine + timeouts;
-- PA sandbox soak tests; dispute runbook; audited manual override."
-- Plan §9 requires ~90% test coverage here — see supabase/tests/04_escrow.sql.
-- ---------------------------------------------------------------------------

create or replace function app.booking_transition_allowed(
  p_from public.booking_status,
  p_to   public.booking_status
)
returns boolean
language sql
immutable
as $$
  select case p_from
    -- 'initiated → confirmed' exists because bookings ship at launch (Apr 2027) while
    -- escrow only lands in Jul 2027 (§2). Until then money simply never moves.
    when 'initiated'      then p_to in ('advance_held', 'confirmed', 'cancelled')
    when 'advance_held'   then p_to in ('confirmed', 'refund_pending', 'disputed', 'cancelled')
    when 'confirmed'      then p_to in ('completed', 'refund_pending', 'disputed')
    when 'completed'      then p_to in ('released', 'refund_pending', 'disputed')
    when 'released'       then p_to in ('disputed')
    when 'refund_pending' then p_to in ('refunded', 'disputed')
    when 'disputed'       then p_to in ('released', 'refunded')
    else false  -- refunded and cancelled are terminal
  end;
$$;

comment on function app.booking_transition_allowed is
  'Plan §5 escrow state machine, in one auditable place. Terminal: released (via dispute '
  'only afterwards), refunded, cancelled.';

create or replace function app.transition_booking(
  p_booking_id uuid,
  p_to         public.booking_status,
  p_reason     text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_before  jsonb;
begin
  -- Plan §6: money paths are service-role or staff only. There is no customer or
  -- vendor path into this function.
  if not (app.is_staff('finance', 'super') or auth.role() = 'service_role') then
    raise exception 'Booking transitions are service-role or finance only'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking % not found', p_booking_id using errcode = 'no_data_found';
  end if;

  if v_booking.status = p_to then
    return v_booking;
  end if;

  if not app.booking_transition_allowed(v_booking.status, p_to) then
    raise exception 'Illegal booking transition %→%', v_booking.status, p_to
      using errcode = 'check_violation';
  end if;

  v_before := to_jsonb(v_booking);

  update public.bookings
     set status          = p_to,
         advance_held_at = case when p_to = 'advance_held' then coalesce(advance_held_at, now()) else advance_held_at end,
         confirmed_at    = case when p_to = 'confirmed'    then coalesce(confirmed_at, now())    else confirmed_at end,
         -- 'released' also stamps completed_at. bookings_released_requires_completion
         -- (000700) demands a completion timestamp, and the legal path
         -- disputed → released can arrive without ever passing through 'completed' —
         -- so a dispute resolved in the vendor's favour would otherwise be impossible
         -- to record, which is exactly the stuck-money scenario plan §12 warns about.
         completed_at    = case when p_to in ('completed', 'released')
                                then coalesce(completed_at, now()) else completed_at end,
         released_at     = case when p_to = 'released'     then coalesce(released_at, now())     else released_at end,
         cancelled_at    = case when p_to = 'cancelled'    then coalesce(cancelled_at, now())    else cancelled_at end,
         cancellation_reason = case when p_to = 'cancelled' then p_reason else cancellation_reason end,
         -- Plan §12 timeout: a held advance must be confirmed within 72 h or it sweeps.
         confirm_deadline = case when p_to = 'advance_held' then now() + interval '72 hours'
                                 else confirm_deadline end
   where id = p_booking_id
  returning * into v_booking;

  -- Plan §2: the date comes off the market the moment the vendor confirms.
  if p_to = 'confirmed' then
    insert into public.vendor_availability (vendor_id, blocked_on, reason, booking_id)
    values (v_booking.vendor_id, v_booking.event_date, 'booked', v_booking.id)
    on conflict (vendor_id, blocked_on) do update
      set reason = 'booked', booking_id = excluded.booking_id;
  elsif p_to in ('cancelled', 'refunded') then
    delete from public.vendor_availability
     where booking_id = v_booking.id;
  end if;

  if p_to = 'completed' then
    perform app.set_trusted_write(true);
    update public.vendors
       set completed_bookings = completed_bookings + 1
     where id = v_booking.vendor_id;
    perform app.set_trusted_write(false);

    -- Plan §2: booking-gated reviews — the request is what starts the trust loop.
    perform app.enqueue_notification(
      'whatsapp', 'review.request',
      'review.request:' || v_booking.id::text,
      v_booking.customer_id, null, null,
      jsonb_build_object('booking_id', v_booking.id), 'booking', v_booking.id
    );
  end if;

  -- Plan §3/§12: every money transition is audited, including manual overrides.
  insert into public.audit_log (actor_id, action, subject_type, subject_id,
                                before_state, after_state, reason)
  values (auth.uid(), 'booking.transition.' || p_to::text, 'booking', p_booking_id,
          v_before, to_jsonb(v_booking), p_reason);

  insert into public.analytics_events (name, booking_id, vendor_id, properties)
  values ('booking_' || p_to::text, p_booking_id, v_booking.vendor_id,
          jsonb_build_object('amount_paise', v_booking.total_amount));

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quote acceptance — the customer-facing cross-table write (§6).
-- ---------------------------------------------------------------------------

create or replace function app.accept_quote(p_quote_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote   public.quotes;
  v_enquiry public.enquiries;
  v_booking public.bookings;
  v_ref     text;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Quote % not found', p_quote_id using errcode = 'no_data_found';
  end if;

  select e.* into v_enquiry
  from public.enquiries e
  join public.leads l on l.enquiry_id = e.id
  where l.id = v_quote.lead_id;

  if v_enquiry.customer_id is distinct from auth.uid() then
    raise exception 'Not your quote' using errcode = 'insufficient_privilege';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'Quote is % and cannot be accepted', v_quote.status
      using errcode = 'check_violation';
  end if;

  if v_quote.valid_until is not null and v_quote.valid_until < now() then
    raise exception 'Quote expired on %', v_quote.valid_until using errcode = 'check_violation';
  end if;

  -- gen_random_bytes is pgcrypto, which lives in the extensions schema. gen_random_uuid()
  -- is core in PG13+ so table DEFAULTs are fine unqualified, but this one is not — and
  -- with `set search_path = ''` only pg_catalog is searched, so an unqualified call
  -- raises 42883 and no booking is ever created.
  v_ref := 'UTS-' || to_char(now(), 'YYMM') || '-'
           || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));

  insert into public.bookings (
    reference, quote_id, lead_id, event_id, customer_id, vendor_id,
    status, event_date, event_type,
    total_amount, advance_amount, balance_amount
  )
  values (
    v_ref, p_quote_id, v_quote.lead_id, v_enquiry.event_id, v_enquiry.customer_id, v_quote.vendor_id,
    'initiated', coalesce(v_quote.event_date, v_enquiry.event_date), v_enquiry.event_type,
    v_quote.total, v_quote.advance_amount, v_quote.total - v_quote.advance_amount
  )
  returning * into v_booking;

  update public.quotes set status = 'accepted', accepted_at = now() where id = p_quote_id;

  -- Ownership was proved above, so this call is authorized on the customer's behalf.
  perform app.set_trusted_write(true);
  perform app.transition_lead(v_quote.lead_id, 'converted', 'Quote accepted');
  perform app.set_trusted_write(false);

  perform app.enqueue_notification(
    'whatsapp', 'booking.initiated',
    'booking.initiated:' || v_booking.id::text,
    null, v_quote.vendor_id, null,
    jsonb_build_object('booking_id', v_booking.id, 'reference', v_ref),
    'booking', v_booking.id
  );

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expiry sweep. Plan §5: leads expire; §12: timeouts are explicit, not implicit.
-- Runs from a scheduled Edge Function.
-- ---------------------------------------------------------------------------

create or replace function app.expire_stale_leads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.leads
       set status = 'expired'
     where status in ('routed', 'viewed')
       and expires_at < now()
    returning id
  )
  select count(*) into v_count from expired;

  insert into public.lead_activities (lead_id, kind, note)
  select l.id, 'expired', 'Auto-expired by sweep'
  from public.leads l
  where l.status = 'expired' and l.updated_at > now() - interval '1 minute';

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Client-callable RPCs only; the rest stay service-role.
-- ---------------------------------------------------------------------------

grant execute on function app.verify_enquiry_otp(uuid)                              to authenticated;
grant execute on function app.transition_lead(uuid, public.lead_status, text)        to authenticated;
grant execute on function app.accept_quote(uuid)                                     to authenticated;
grant execute on function app.refund_lead_credit(uuid, text)                         to authenticated;
grant execute on function app.lead_transition_allowed(public.lead_status, public.lead_status)
                                                                                     to anon, authenticated;
grant execute on function app.booking_transition_allowed(public.booking_status, public.booking_status)
                                                                                     to anon, authenticated;

-- Routing and escrow are server-side only: the vendor selection and the money state
-- machine must never be reachable from a browser session.
revoke execute on function app.route_enquiry(uuid)                                  from public, anon, authenticated;
revoke execute on function app.transition_booking(uuid, public.booking_status, text) from public, anon, authenticated;
revoke execute on function app.expire_stale_leads()                                 from public, anon, authenticated;
revoke execute on function app.enqueue_notification(
  public.notification_channel, text, text, uuid, uuid, text, jsonb, text, uuid
) from public, anon, authenticated;

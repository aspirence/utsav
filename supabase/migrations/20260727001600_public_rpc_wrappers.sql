-- ============================================================================
-- Fremmo — 001600 · Public RPC wrappers
--
-- The `app` schema is deliberately NOT exposed through PostgREST (config.toml
-- api.schemas is ["public", "graphql_public"]), because it holds the trusted helpers
-- and the money state machine. But four functions in 001500 are granted to
-- `authenticated` on the assumption a browser can call them — and it cannot: PostgREST
-- only routes /rpc/<name> to functions in an exposed schema.
--
-- Rather than exposing `app` wholesale, which would also publish app.route_enquiry,
-- app.transition_booking and app.set_trusted_write to the internet, this migration adds
-- thin wrappers in `public` for exactly the four client-callable RPCs. The `app`
-- originals keep their own authorization checks; these add no privileges of their own.
--
-- SECURITY INVOKER (the default) is correct here: the wrapper must run as the caller so
-- that auth.uid() inside the wrapped function still resolves to the real end user.
-- ============================================================================

-- Plan §2: OTP verification. Authorization lives in app.verify_enquiry_otp(), which
-- checks the caller owns the enquiry and that their JWT carries the verified phone.
create or replace function public.verify_enquiry_otp(p_enquiry_id uuid)
returns public.enquiries
language sql
volatile
as $$
  select app.verify_enquiry_otp(p_enquiry_id);
$$;

comment on function public.verify_enquiry_otp is
  'PostgREST-reachable wrapper for app.verify_enquiry_otp(). Adds no privileges.';

-- Plan §5: the lead state machine. app.transition_lead() enforces membership and
-- transition legality.
create or replace function public.transition_lead(
  p_lead_id uuid,
  p_to      public.lead_status,
  p_note    text default null
)
returns public.leads
language sql
volatile
as $$
  select app.transition_lead(p_lead_id, p_to, p_note);
$$;

-- Plan §5: quote acceptance — the customer's single write into the money graph.
create or replace function public.accept_quote(p_quote_id uuid)
returns public.bookings
language sql
volatile
as $$
  select app.accept_quote(p_quote_id);
$$;

-- Plan §12: junk-lead credit refunds. app.refund_lead_credit() is staff-gated.
create or replace function public.refund_lead_credit(p_lead_id uuid, p_reason text)
returns public.leads
language sql
volatile
as $$
  select app.refund_lead_credit(p_lead_id, p_reason);
$$;

-- ---------------------------------------------------------------------------
-- Grants. Default-deny first, then hand back exactly the intended callers.
-- ---------------------------------------------------------------------------

revoke execute on function public.verify_enquiry_otp(uuid)                    from public, anon;
revoke execute on function public.transition_lead(uuid, public.lead_status, text) from public, anon;
revoke execute on function public.accept_quote(uuid)                          from public, anon;
revoke execute on function public.refund_lead_credit(uuid, text)              from public, anon;

grant execute on function public.verify_enquiry_otp(uuid)                     to authenticated;
grant execute on function public.transition_lead(uuid, public.lead_status, text) to authenticated;
grant execute on function public.accept_quote(uuid)                           to authenticated;
grant execute on function public.refund_lead_credit(uuid, text)               to authenticated;

-- ---------------------------------------------------------------------------
-- E-invite lookup. The link is the credential: a guest who knows the slug can read the
-- invite, but nobody can enumerate the table. SECURITY DEFINER so it can read past the
-- owner-only RLS policy, and it returns only the guest-facing columns.
-- ---------------------------------------------------------------------------

create or replace function public.get_e_invite(p_slug text)
returns table (
  id            uuid,
  slug          text,
  template_slug text,
  title         text,
  message       text,
  hosts         text,
  venue_name    text,
  venue_address text,
  starts_at     timestamptz,
  theme         jsonb,
  cover_storage_path text,
  rsvp_enabled  boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.slug, i.template_slug, i.title, i.message, i.hosts,
         i.venue_name, i.venue_address, i.starts_at, i.theme,
         i.cover_storage_path, i.rsvp_enabled
  from public.e_invites i
  where i.slug = p_slug and i.is_published;
$$;

grant execute on function public.get_e_invite(text) to anon, authenticated;

-- Deliberately absent: no wrapper for app.route_enquiry(), app.transition_booking(),
-- app.expire_stale_leads() or app.enqueue_notification(). Plan §6 keeps routing and the
-- escrow state machine on the server side only; they are invoked by Edge Functions and
-- scheduled jobs holding the service-role key, which bypasses PostgREST entirely.

-- ============================================================================
-- Fremmo — a PostgREST-reachable wrapper for app.record_invitation_payment()
--
-- 20260730000200 put the payment recorder in the `app` schema, which PostgREST does not
-- expose, so there was no way to call it from a route handler. That was fine while nothing
-- called it. The Cashfree webhook does, so it needs the same treatment every other RPC in
-- 20260727001600 got: a thin wrapper in `public` that adds no privileges of its own.
--
-- THE GRANT IS THE WHOLE POINT OF THIS FILE. Every other wrapper is granted to
-- `authenticated`, because a customer accepting a quote or a vendor moving a lead is a
-- signed-in person acting for themselves. This one is granted to `service_role` and nothing
-- else. Only the aggregator's signed webhook knows a payment happened, and it reaches
-- Postgres under the service-role key; a customer who could call this would mark their own
-- order paid without paying, which is the entire fraud.
--
-- The revoke is written out rather than assumed. `create function` grants EXECUTE to PUBLIC
-- by default, and PUBLIC includes anon — so a wrapper that is merely "not granted" to anon
-- is in fact granted to anon.
-- ============================================================================

create or replace function public.record_invitation_payment(
  p_reference   text,
  p_payment_ref text,
  p_paid_at     timestamptz default now()
)
returns public.invitation_orders
language sql
volatile
as $$
  select app.record_invitation_payment(p_reference, p_payment_ref, p_paid_at);
$$;

comment on function public.record_invitation_payment(text, text, timestamptz) is
  'PostgREST-reachable wrapper for app.record_invitation_payment(). Adds no privileges. '
  'service_role only — a payment may be declared only by the aggregator''s signed webhook.';

revoke execute on function public.record_invitation_payment(text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.record_invitation_payment(text, text, timestamptz)
  to service_role;

-- The inner function was revoked from PUBLIC in 20260730000200, which took service_role's
-- implicit grant with it. The wrapper is security invoker, so the caller needs EXECUTE on
-- both or the call fails at the inner one with a permission error that points at the wrong
-- function.
grant execute on function app.record_invitation_payment(text, text, timestamptz)
  to service_role;

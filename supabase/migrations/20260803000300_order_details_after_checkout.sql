-- ============================================================================
-- Fremmo — collect the card wording after checkout, not before it
--
-- The booking form asked for eleven fields before it would take an order: four contact fields
-- and then the whole card — hosts, venue, both sets of parents, the couple, the date and the
-- time. That is the entire content of the product, demanded from somebody who has not yet
-- decided to buy it, on a page they reached ten minutes ago.
--
-- The form is now two fields, name and WhatsApp number, and the card wording is asked for on
-- the confirmation screen once the order exists. Two schema changes make that possible.
--
-- ── 1. contact_email BECOMES OPTIONAL ────────────────────────────────────────
-- It was `not null` with a shape check, so a two-field form could not insert a row at all.
--
-- The check is rewritten rather than dropped: a null email is now allowed, but a present one
-- must still look like an address. Dropping the constraint entirely would have let the console
-- and any future importer write "n/a" into the column, which is worse than null — null is
-- honestly absent, "n/a" is a value that every downstream reader has to learn to distrust.
--
-- WhatsApp is the channel this product actually uses: contact_phone is still `not null`, the
-- draft link goes there, and app/(site)/invitations/[slug]/book/actions.ts says the payment
-- link does too. Email was never the primary route, it was just a required field.
--
-- ── 2. details_token — WHY A REFERENCE IS NOT ENOUGH ─────────────────────────
-- The confirmation screen has to be able to write the card content back to an order that
-- already exists. The obvious key is invitation_orders.reference, and it is the wrong one.
--
-- A reference is not a secret. It is printed on the confirmation screen, read out on WhatsApp,
-- quoted to support and pasted into chats — it is designed to be shared. It is also only six
-- characters from a 32-symbol alphabet, so the space is around a billion: too large to brute
-- force one at a time, small enough to sweep. An endpoint that accepts "here is a reference,
-- here is the new card content" lets anybody who has ever seen somebody else's reference
-- rewrite their invitation.
--
-- So the insert mints a random token, the confirmation screen carries it, and the update
-- requires it. It is deliberately NOT readable by any client: there is no SELECT policy on this
-- table for anon or authenticated at all, and the token is returned once, in the action's own
-- return value, to the session that just created the row.
--
-- `on delete cascade` is not relevant here — the column lives on the order itself and dies
-- with it, which is the correct lifetime: once the order is gone there is nothing to write to.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Optional email
-- ---------------------------------------------------------------------------

alter table public.invitation_orders
  alter column contact_email drop not null;

alter table public.invitation_orders
  drop constraint if exists invitation_orders_email_shape;

alter table public.invitation_orders
  add constraint invitation_orders_email_shape
  check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

comment on column public.invitation_orders.contact_email is
  'Optional since 20260803000300. The booking form asks for a name and a WhatsApp number only; '
  'contact_phone is the channel the draft link and the payment link actually go to.';

-- ---------------------------------------------------------------------------
-- 2. The write token for the post-checkout details form
-- ---------------------------------------------------------------------------

alter table public.invitation_orders
  add column details_token uuid not null default gen_random_uuid();

comment on column public.invitation_orders.details_token is
  'Bearer token for app.save_invitation_card(). Minted at insert, returned once to the session '
  'that placed the order, and never selectable by a client. NOT the reference — a reference is '
  'meant to be shared, so it cannot also be an authorisation.';

/*
 * Write the card wording onto an order, given its token.
 *
 * SECURITY DEFINER because no client may write invitation_orders — the table has SELECT
 * policies and nothing else, and that is CLAUDE.md's second non-negotiable. This function is
 * the one narrow hole, and it is narrow in three ways:
 *
 *   · It matches on the token, not the reference. A wrong or absent token updates nothing.
 *   · It touches exactly three columns. It cannot move money, change a status, alter a price
 *     or reassign a customer, so the worst a leaked token buys is the ability to edit the
 *     wording on one invitation.
 *   · It refuses an order that is already delivered. Past that point the card has been handed
 *     over and somebody has printed the link; silently rewriting it then is worse than
 *     refusing.
 *
 * app.set_trusted_write() is required around the update: app.guard_invitation_order_columns()
 * runs on every UPDATE, and while it permits these three columns, the surrounding guard is what
 * keeps the intent explicit for the next person to read it.
 */
create or replace function app.save_invitation_card(
  p_token   uuid,
  p_content jsonb,
  p_version integer,
  p_slug    text
)
returns public.invitation_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.invitation_orders;
begin
  perform app.set_trusted_write(true);

  update public.invitation_orders
     set card_content         = p_content,
         card_content_version = p_version,
         public_slug          = coalesce(public_slug, p_slug),
         published_at         = coalesce(published_at, now())
   where details_token = p_token
     and status <> 'delivered'
  returning * into v_order;

  perform app.set_trusted_write(false);

  if v_order.id is null then
    raise exception 'No editable order for that link.' using errcode = 'no_data_found';
  end if;

  return v_order;
end;
$$;

revoke execute on function app.save_invitation_card(uuid, jsonb, integer, text)
  from public, anon, authenticated;
grant execute on function app.save_invitation_card(uuid, jsonb, integer, text) to service_role;

comment on function app.save_invitation_card is
  'Writes card wording onto one order, keyed on details_token. Service-role only — the action '
  'holds the token, the browser never sees the table.';

-- ---------------------------------------------------------------------------
-- A PostgREST-reachable wrapper
--
-- PostgREST does not expose the `app` schema, so the function above cannot be called over the
-- wire without this. Same treatment 20260731170000 gave app.record_invitation_payment(), and
-- the grant is the point of the file in both cases: service_role and nothing else.
--
-- The revoke is written out rather than assumed. `create function` grants EXECUTE to PUBLIC by
-- default, and PUBLIC includes anon — so a wrapper that is merely "not granted" to anon is in
-- fact granted to anon, which here would mean a browser holding a token could call it directly
-- and skip every check the server action makes on its way in.
-- ---------------------------------------------------------------------------

create or replace function public.save_invitation_card(
  p_token   uuid,
  p_content jsonb,
  p_version integer,
  p_slug    text
)
returns public.invitation_orders
language sql
volatile
as $$
  select app.save_invitation_card(p_token, p_content, p_version, p_slug);
$$;

comment on function public.save_invitation_card(uuid, jsonb, integer, text) is
  'PostgREST-reachable wrapper for app.save_invitation_card(). Adds no privileges. service_role '
  'only — the token authorises the write, and only the server action ever holds one.';

revoke execute on function public.save_invitation_card(uuid, jsonb, integer, text)
  from public, anon, authenticated;

grant execute on function public.save_invitation_card(uuid, jsonb, integer, text)
  to service_role;

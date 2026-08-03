-- ---------------------------------------------------------------------------
-- Invitation card content, and the public card.
--
-- WHAT THIS CLOSES. An invitation_orders row records that somebody bought a design and how to
-- reach them. It has never held what the card actually says — lib/invitation-templates.ts says so
-- in as many words: "nothing behind this is automated yet: the order button opens an enquiry form
-- and a person answers it." A member of staff collected the names on WhatsApp and made the card
-- by hand. These columns are where those names live instead.
--
-- ONE TEMPLATE, ONE SHAPE, NO VERSION TABLE YET. `card_content_version` is a plain integer rather
-- than a foreign key to a template_versions table that does not exist. There is exactly one 3D
-- design; a version registry earns its cost at three or four, and pinning to a table that has one
-- row is ceremony. What it must NOT be is absent — retrofitting a version pin onto cards that
-- were never pinned means guessing which shape they were authored against, and that guess is
-- unrecoverable. So the pin lands now and grows into a foreign key later.
--
-- CONTENT IS VALIDATED IN THE APPLICATION, NOT HERE. The check below asserts only that the
-- document is a JSON object. Expressing "groom.name is a non-empty string of at most 48
-- characters" in a CHECK constraint is possible and unreadable, and it would have to be rewritten
-- as a migration every time the shape moves. lib/invitation-card.ts owns the shape; this column
-- owns the guarantee that it is an object and not a bare string or array.
-- ---------------------------------------------------------------------------

alter table public.invitation_orders
  add column card_content         jsonb,
  add column card_content_version integer,
  -- The public URL. Not the order reference: UTS-INV-XXXX is quoted to support over the phone and
  -- printed on receipts, and a wedding link that is also a support identifier is one that gets
  -- forwarded to two hundred guests. This is generated separately and carries enough entropy that
  -- a neighbouring couple's card cannot be reached by editing the address bar.
  add column public_slug          text,
  add column published_at         timestamptz;

alter table public.invitation_orders
  add constraint invitation_orders_public_slug_unique unique (public_slug);

alter table public.invitation_orders
  -- Lowercase words and digits, at least 12 characters. The length is the point: the slug is the
  -- only thing standing between an unlisted card and anybody who guesses.
  add constraint invitation_orders_public_slug_format
    check (public_slug is null or public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  add constraint invitation_orders_public_slug_length
    check (public_slug is null or length(public_slug) >= 12),

  add constraint invitation_orders_card_content_object
    check (card_content is null or jsonb_typeof(card_content) = 'object'),

  /*
   * Published means all three: a slug to reach it by, content to render, and the version that
   * content was written against. Any one of them missing is a card that 404s, renders blank, or
   * renders against the wrong shape — and the page has no way to tell which, because from the
   * outside all three look like "no card".
   */
  add constraint invitation_orders_published_is_complete
    check (
      published_at is null
      or (public_slug is not null and card_content is not null and card_content_version is not null)
    );

comment on column public.invitation_orders.card_content is
  'What the card says. Shape owned by lib/invitation-card.ts and pinned by card_content_version; '
  'this column only guarantees it is a JSON object.';

comment on column public.invitation_orders.public_slug is
  'The unlisted public URL segment. Deliberately not the order reference, which is a support '
  'identifier and gets read out loud.';

-- ---------------------------------------------------------------------------
-- public.invitation_cards — the only route by which an anonymous visitor reaches an order.
--
-- Anonymous callers have no policy on public.invitation_orders at all, and must not get one: that
-- table holds contact_name, contact_email, contact_phone and the amounts paid. A policy admitting
-- anon to published rows would publish a customer's phone number alongside their wedding date to
-- anybody holding the link — and the link is, by design, forwarded to every guest.
--
-- So this view runs with definer semantics, selects only the public-safe columns, and carries its
-- own `published_at is not null` guard. THAT GUARD IS THE SECURITY BOUNDARY, NOT A CONVENIENCE
-- FILTER — without it every draft card in the table becomes readable. It is the same shape as
-- public.vendor_leads, for the same reason, and CLAUDE.md's fifth non-negotiable applies here too.
--
-- security_barrier is not optional. Without it the planner may push a cheap user-supplied
-- qualifier below the published check, letting a caller observe unpublished rows through the side
-- effects of that qualifier. With the barrier, the WHERE clause is guaranteed to run first.
-- ---------------------------------------------------------------------------

create view public.invitation_cards
with (security_invoker = false, security_barrier = true)
as
select
  o.public_slug,
  o.template_slug,
  o.template_name,
  o.card_content,
  o.card_content_version,
  o.published_at
from public.invitation_orders o
where o.published_at is not null;

comment on view public.invitation_cards is
  'The published invitation, for anonymous readers. The published_at guard in the WHERE clause is '
  'the authorization boundary — this view has definer semantics precisely so it can read '
  'invitation_orders, which anon has no policy on. Never add a contact or amount column here.';

grant select on public.invitation_cards to anon, authenticated;

-- Every public card read is a lookup on this. Partial, because an unpublished order is never
-- reached through it.
create index invitation_orders_public_slug_idx
  on public.invitation_orders (public_slug)
  where published_at is not null;

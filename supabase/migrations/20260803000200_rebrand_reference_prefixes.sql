-- ============================================================================
-- Fremmo — widen the human-quotable reference prefixes for the rebrand
--
-- The product was called Fremmo and its two customer-quotable codes carry that in their
-- prefix: invitation orders are UTS-INV-XXXX and resellers are UTS-RS-XXX. Both are enforced
-- by a CHECK constraint, so the prefix is not a display convention — it is stored data with a
-- rule behind it.
--
-- ── WHY THIS ACCEPTS BOTH RATHER THAN REPLACING ──────────────────────────────
-- The obvious migration renames the prefix and rewrites the existing rows. It was rejected,
-- and the reason is not tidiness:
--
--   · A reference is something a customer already has. It went out in the order confirmation
--     and it is what they read out on WhatsApp when they ask where their invitation is. If
--     UTS-INV-4F2A stops existing, that conversation ends in "we have no record of that",
--     which is the worst possible answer to give somebody who has paid.
--   · These are money rows. invitation_orders is the invoice and reseller_commissions joins to
--     it; an UPDATE across both to change a cosmetic string is a large blast radius for zero
--     functional gain.
--
-- So the constraint widens to accept either prefix. Old rows stay exactly as they are and stay
-- valid. Everything minted from now on uses FRM-, because the generators in
-- app/(site)/invitations/[slug]/book/actions.ts and lib/resellers.ts now emit it.
--
-- The mixed estate is permanent and that is fine. A reference is an identifier, not a brand
-- surface — nobody reads the first three letters and infers a company name. What matters is
-- that every code ever issued still resolves.
--
-- ── DROP-THEN-ADD, NOT ALTER ─────────────────────────────────────────────────
-- Postgres has no "alter constraint" for a CHECK expression, so replacing one is a drop and an
-- add. `if exists` on the drop makes this safe to run against a database where 20260803000100
-- landed before this file existed and against one where both arrive together.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Invitation order references
-- ---------------------------------------------------------------------------

alter table public.invitation_orders
  drop constraint if exists invitation_orders_reference_format;

alter table public.invitation_orders
  add constraint invitation_orders_reference_format
  check (reference ~ '^(UTS|FRM)-INV-[A-Z0-9]{4,10}$');

comment on column public.invitation_orders.reference is
  'Human-quotable order reference. FRM-INV-XXXX for anything minted after the rebrand; '
  'UTS-INV-XXXX rows predate it and remain valid — see 20260803000200.';

-- ---------------------------------------------------------------------------
-- Reseller codes
-- ---------------------------------------------------------------------------

alter table public.resellers
  drop constraint if exists resellers_code_format;

alter table public.resellers
  add constraint resellers_code_format
  check (code ~ '^(UTS|FRM)-RS-[A-Z0-9]{3,10}$');

comment on column public.resellers.code is
  'Human-quotable partner code, printed on statements. FRM-RS-XXX going forward; UTS-RS-XXX '
  'stays valid for any partner created before the rebrand.';

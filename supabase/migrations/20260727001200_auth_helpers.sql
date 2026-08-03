-- ============================================================================
-- Fremmo — 001200 · Authorization helpers
-- Plan §3: "capabilities come from memberships, not a role column … The UI is a
-- context switcher; the database enforces everything."
-- Plan §6: "RLS is the authorization model — there is no trusted API between clients
-- and Postgres for reads."
--
-- Every helper is SECURITY DEFINER with an empty search_path and fully-qualified
-- references. They read the membership tables directly rather than trusting JWT claims,
-- so revoking a membership takes effect on the next query — not on the next token refresh.
-- The JWT hook at the bottom mirrors the same data purely so the UI can render the
-- context switcher without a round trip; nothing is authorized from it.
-- ============================================================================

create or replace function app.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Vendor membership. Role hierarchy per plan §3: owner ⊃ manager ⊃ responder.
-- ---------------------------------------------------------------------------

create or replace function app.vendor_role_rank(p_role public.vendor_member_role)
returns smallint
language sql
immutable
as $$
  select case p_role
    when 'owner'     then 3
    when 'manager'   then 2
    when 'responder' then 1
  end::smallint;
$$;

create or replace function app.is_vendor_member(
  p_vendor_id uuid,
  p_min_role  public.vendor_member_role default 'responder'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vendor_members vm
    where vm.vendor_id = p_vendor_id
      and vm.profile_id = auth.uid()
      and vm.revoked_at is null
      and vm.accepted_at is not null
      and app.vendor_role_rank(vm.role) >= app.vendor_role_rank(p_min_role)
  );
$$;

comment on function app.is_vendor_member is
  'Plan §3 capability check. ''manager'' passes a ''responder'' requirement; the reverse fails.';

-- Used by the JWT hook and by the partner PWA to render the context switcher.
create or replace function app.my_vendor_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(vm.vendor_id order by vm.vendor_id), '{}')
  from public.vendor_members vm
  where vm.profile_id = auth.uid()
    and vm.revoked_at is null
    and vm.accepted_at is not null;
$$;

-- ---------------------------------------------------------------------------
-- Staff. Plan §3: field agent · moderator · finance · super, on a separate deploy.
-- 'super' satisfies every staff check.
-- ---------------------------------------------------------------------------

create or replace function app.is_staff(variadic p_roles public.staff_role_kind[] default '{}')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles sr
    where sr.profile_id = auth.uid()
      and sr.revoked_at is null
      and (
        sr.role = 'super'
        or cardinality(p_roles) = 0
        or sr.role = any (p_roles)
      )
  );
$$;

comment on function app.is_staff is
  'Plan §3. No arguments = "any staff". ''super'' short-circuits every role check.';

-- Plan §6: a field agent is scoped "draft-only, own city". Empty city_ids = unscoped.
create or replace function app.staff_covers_city(p_city_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles sr
    where sr.profile_id = auth.uid()
      and sr.revoked_at is null
      and (
        sr.role in ('super', 'moderator', 'finance')
        or cardinality(sr.city_ids) = 0
        or p_city_id = any (sr.city_ids)
      )
  );
$$;

create or replace function app.my_staff_roles()
returns public.staff_role_kind[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct sr.role), '{}')
  from public.staff_roles sr
  where sr.profile_id = auth.uid()
    and sr.revoked_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Corporate (Phase 2). Plan §3: admin ⊃ requester.
-- ---------------------------------------------------------------------------

create or replace function app.is_corporate_member(
  p_org_id uuid,
  p_require_admin boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.corporate_members cm
    where cm.org_id = p_org_id
      and cm.profile_id = auth.uid()
      and cm.revoked_at is null
      and cm.accepted_at is not null
      and (not p_require_admin or cm.role = 'admin')
  );
$$;

-- An anonymous guest holding an invite link may RSVP, but has no read access to
-- public.e_invites (owner-only, so the table cannot be enumerated). This reads the
-- invite's state as its owner so the RSVP policy can still verify the invite is
-- published and accepting responses.
create or replace function app.invite_accepts_rsvp(p_invite_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.e_invites i
    where i.id = p_invite_id and i.is_published and i.rsvp_enabled
  );
$$;

-- ---------------------------------------------------------------------------
-- Corporate RFP cycle-breakers.
--
-- The RFP graph is mutually referential: an invited vendor may read a published RFP, and
-- an org member may read the invites on their own RFP. Expressing both inline would make
-- the rfps policy read rfp_invites while the rfp_invites policy reads rfps — a recursive
-- RLS cycle that renders rfps, rfp_invites and rfp_bids unreadable for every
-- authenticated role. These definer helpers read one side with RLS bypassed, which is
-- what breaks the loop.
-- ---------------------------------------------------------------------------

create or replace function app.vendor_invited_to_rfp(p_rfp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rfp_invites ri
    join public.vendor_members vm on vm.vendor_id = ri.vendor_id
    where ri.rfp_id = p_rfp_id
      and vm.profile_id = auth.uid()
      and vm.revoked_at is null
      and vm.accepted_at is not null
  );
$$;

create or replace function app.rfp_belongs_to_my_org(
  p_rfp_id uuid,
  p_require_admin boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rfps r
    join public.corporate_members cm on cm.org_id = r.org_id
    where r.id = p_rfp_id
      and cm.profile_id = auth.uid()
      and cm.revoked_at is null
      and cm.accepted_at is not null
      and (not p_require_admin or cm.role = 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Lead contact gating. Plan §6: "contact masking is a view — vendors see a customer's
-- phone only in permitted lead states". This predicate is the single definition of
-- "permitted", used by both the view (001400) and the pgTAP suite.
--
-- A vendor sees the customer's number once the lead has actually been opened, and
-- loses it again if the lead expires unworked or the credit was refunded as junk.
-- ---------------------------------------------------------------------------

create or replace function app.lead_contact_visible(
  p_status   public.lead_status,
  p_refunded timestamptz
)
returns boolean
language sql
immutable
as $$
  select p_refunded is null
     and p_status in ('viewed', 'responded', 'quoted', 'converted');
$$;

comment on function app.lead_contact_visible is
  'Plan §6 contact-masking rule. Deliberately excludes ''routed'' (not yet opened) and '
  '''expired'', and revokes visibility on a refunded junk lead (§12).';

-- ---------------------------------------------------------------------------
-- Custom access token hook. Plan §3: memberships "carried in JWT claims".
-- Convenience for the client only — never an authorization source.
-- ---------------------------------------------------------------------------

create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := (event ->> 'user_id')::uuid;
  v_claims      jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_vendor_ids  uuid[];
  v_staff       text[];
begin
  select coalesce(array_agg(vm.vendor_id order by vm.vendor_id), '{}')
    into v_vendor_ids
  from public.vendor_members vm
  where vm.profile_id = v_user_id
    and vm.revoked_at is null
    and vm.accepted_at is not null;

  select coalesce(array_agg(distinct sr.role::text), '{}')
    into v_staff
  from public.staff_roles sr
  where sr.profile_id = v_user_id
    and sr.revoked_at is null;

  v_claims := jsonb_set(v_claims, '{app_metadata}',
    coalesce(v_claims -> 'app_metadata', '{}'::jsonb)
      || jsonb_build_object(
           'vendor_ids', to_jsonb(v_vendor_ids),
           'staff_roles', to_jsonb(v_staff)
         )
  );

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

comment on function app.custom_access_token_hook is
  'Plan §3: mirrors memberships into JWT app_metadata so the UI can render the context '
  'switcher. Authorization always re-derives from the tables — see app.is_vendor_member.';

-- ---------------------------------------------------------------------------
-- Grants. RLS policies execute helpers as the querying role, so anon/authenticated
-- need EXECUTE. The auth hook is called by supabase_auth_admin, not by users.
-- ---------------------------------------------------------------------------

grant execute on function app.current_profile_id()                                to anon, authenticated;
grant execute on function app.vendor_role_rank(public.vendor_member_role)         to anon, authenticated;
grant execute on function app.is_vendor_member(uuid, public.vendor_member_role)   to anon, authenticated;
grant execute on function app.my_vendor_ids()                                     to authenticated;
grant execute on function app.is_staff(public.staff_role_kind[])                  to anon, authenticated;
grant execute on function app.staff_covers_city(uuid)                             to anon, authenticated;
grant execute on function app.my_staff_roles()                                    to authenticated;
grant execute on function app.is_corporate_member(uuid, boolean)                  to anon, authenticated;
grant execute on function app.invite_accepts_rsvp(uuid)                           to anon, authenticated;
grant execute on function app.vendor_invited_to_rfp(uuid)                         to authenticated;
grant execute on function app.rfp_belongs_to_my_org(uuid, boolean)                to authenticated;
grant execute on function app.lead_contact_visible(public.lead_status, timestamptz) to anon, authenticated;

revoke execute on function app.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant  execute on function app.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant  usage   on schema app to supabase_auth_admin;
grant  select  on table public.vendor_members, public.staff_roles to supabase_auth_admin;

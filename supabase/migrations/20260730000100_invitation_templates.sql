-- ---------------------------------------------------------------------------
-- Invitation templates — the "Curated Collections" storefront.
--
-- Plan §2 lists digital invitations as a revenue line beside vendor discovery. This is the
-- catalogue behind it: a row per template, each one a phone-shaped preview on the home page
-- with a price under it.
--
-- WHY THE PREVIEW IS A URL AND NOT AN UPLOAD. Staff paste a link. That is the whole design
-- brief, and it has a real consequence worth stating: the file is not ours, so we cannot
-- transform it, cannot guarantee it stays up, and cannot put it behind the Supabase CDN the
-- way §12 does for vendor media. In exchange, a new template ships without a build, an
-- upload pipeline, or a storage bucket. That is the right trade for a five-item storefront
-- and the wrong one at scale — when this grows, the column becomes a storage path.
-- ---------------------------------------------------------------------------

create table public.invitation_templates (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,

  -- The small uppercase words above the name: ROYAL · VIBRANT · NEW.
  tags          text[] not null default '{}',

  -- Plan §5: money is integer paise, never rupees, never a float.
  price         app.paise not null,

  /*
   * The preview. Either a direct video file or a YouTube/Vimeo watch link — the component
   * decides which element to render from the shape of the URL, because an <iframe> for an
   * .mp4 and a <video> for a YouTube page both fail silently.
   *
   * https only. An http video on an https page is blocked as mixed content, which shows up
   * as a phone frame that is simply empty — the single most confusing failure this table can
   * produce, so it is a constraint rather than a support ticket.
   */
  video_url     text,
  /* First frame, shown before the video plays and if it never does. */
  poster_url    text,

  sort_order    integer not null default 100,
  is_active     boolean not null default true,

  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint invitation_templates_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint invitation_templates_price_positive check (price > 0),
  constraint invitation_templates_video_https
    check (video_url is null or video_url ~ '^https://'),
  constraint invitation_templates_poster_https
    check (poster_url is null or poster_url ~ '^https://'),
  -- Six tags would not fit above the name at any readable size.
  constraint invitation_templates_tag_count check (cardinality(tags) <= 4)
);

comment on table public.invitation_templates is
  'Plan §2: digital invitation storefront. Preview media is a pasted URL, not managed storage.';
comment on column public.invitation_templates.price is 'Integer paise (plan §5).';
comment on column public.invitation_templates.video_url is
  'Direct video file or a YouTube/Vimeo link. https only — http is blocked as mixed content.';

create index invitation_templates_active_idx
  on public.invitation_templates (sort_order, name) where is_active;

create trigger invitation_templates_set_updated_at
  before update on public.invitation_templates
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Plan §6: RLS is the authorization model; there is no trusted API in front of it.
-- ---------------------------------------------------------------------------

alter table public.invitation_templates enable row level security;

-- The storefront is public, so anon reads it — but only the rows we are actually selling.
-- An inactive row is a draft, and a draft is not published content.
create policy invitation_templates_select_active on public.invitation_templates
  for select to anon, authenticated
  using (is_active);

-- Staff see drafts too, so the console can list what is not live yet.
create policy invitation_templates_select_staff on public.invitation_templates
  for select to authenticated
  using (app.is_staff());

/*
 * Writes: moderator and super only.
 *
 * Deliberately NOT field_agent. A field agent's remit is vendor listings in their own city
 * (plan §6); this table is national storefront copy with a price attached, which is a
 * different job. Splitting it any finer would need a capability column the plan does not have.
 */
create policy invitation_templates_write_staff on public.invitation_templates
  for all to authenticated
  using (app.is_staff('moderator', 'super'))
  with check (app.is_staff('moderator', 'super'));

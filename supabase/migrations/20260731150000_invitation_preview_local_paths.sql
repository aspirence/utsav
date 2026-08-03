-- ============================================================================
-- Fremmo — allow app-served paths in invitation preview media
--
-- 20260730000100 required poster_url and video_url to start with `https://`, written when
-- the only source was a URL an operator pasted from somewhere else — the table comment
-- still says "preview media is a pasted URL, not managed storage". That is no longer the
-- only case: the launch catalogue ships posters as files in public/, which is exactly how
-- public.media already carries its artwork, and storageImageUrl() has always returned a
-- leading-slash path untouched instead of building a Storage render URL from it.
--
-- So the rule widens from "https only" to "https, or a path this app serves itself".
--
-- WHY IT IS STILL A CONSTRAINT AND NOT A REMOVAL. The check exists to keep three things
-- out of an <img src> and an <iframe src> on a page customers load:
--
--   · http://       — mixed content, blocked by the browser and a downgrade if it were not
--   · javascript:   — script execution from a database column
--   · data:         — inline payloads, the usual way to smuggle SVG into an image slot
--
-- `^/[^/]` keeps all three out while admitting /invitation.webp. The second character
-- matters: `//evil.com/x.jpg` is a protocol-relative URL and would load from another host
-- entirely, so a single leading slash is required and a double one is still refused. This
-- is the same test previewSrc() applies client-side in the console's media form — the two
-- now agree rather than the database being stricter than the form that feeds it.
--
-- A bare relative path in video_url still classifies as 'none' in classifyPreview(), which
-- falls back to the poster. Handled in the same change so the constraint and the renderer
-- do not disagree.
-- ============================================================================

alter table public.invitation_templates
  drop constraint if exists invitation_templates_poster_https,
  drop constraint if exists invitation_templates_video_https;

alter table public.invitation_templates
  add constraint invitation_templates_poster_source
    check (poster_url is null or poster_url ~ '^(https://|/[^/])'),
  add constraint invitation_templates_video_source
    check (video_url is null or video_url ~ '^(https://|/[^/])');

comment on table public.invitation_templates is
  'Plan §2: digital invitation storefront. Preview media is either an https URL an operator '
  'pasted or a path this app serves from public/ — never http://, javascript: or data:, and '
  'never protocol-relative. See migration 20260731150000.';

# Review — "Scalable Next.js and React Three Fiber Architecture for 3D Wedding-Invitation Templates"

Reviewed 2026-08-01 against the repository at that date. This is a written assessment only;
nothing in it has been implemented.

The report is well built and mostly right about the destination. It is wrong about the starting
point, and three of its recommendations conflict with decisions this repository has already made
and written down. Both of those matter more than the parts it gets right, because they are what
would go wrong if it were followed literally.

---

## 1. Where the repository actually is

The report assumes 10–50 templates, up to 100,000 invitations, and an existing content model to
migrate. None of that is true here, and the gap is not incremental.

| The report assumes | What exists |
| --- | --- |
| 10–50 reviewed R3F template components, resolved through a registry | **One** scene, `components/invitation-3d/` (794 lines), mounted on exactly one route |
| `TemplateVersion` carrying `schema`, `uiSchema`, `editPolicy`, `assetManifest`, `rendererKey` | `invitation_templates` is a **storefront catalogue row** — `slug`, `name`, `tags`, `price`, `video_url`, `poster_url`. It describes a preview video, not a scene |
| Per-invitation content JSON, drafts, revisions, publications | Nothing. `invitation_orders` holds `contact_name/email/phone`, the two payment legs, a status and a `notes` field |
| `/invite/[slug]` public published route | Does not exist |
| Schema-generated editor, workflow states, asset pipeline, audit | None of it exists |
| Hardcoded templates to migrate away from | See below — worse than hardcoded |

**The demo is not a template.** `components/invitation-3d/index.tsx` carries one specific
family's wording as a literal array:

```
{ t: 'Mrs. Ramilaben & Mr. Manoj Kumar' }
{ t: '(D/o. Mrs. Kailashben & Mr. Randhir Jariwala)' }
```

So there is no `content` boundary to generalise — there is one artwork with one family's names
compiled into it. The report's "Migration from hardcoded templates" section assumes a renderer
that already takes inputs. That step has to be *created*, not migrated.

**Nothing behind the order is automated, and the code says so.** From
`lib/invitation-templates.ts`:

> There is deliberately no turnaround promise […] because nothing behind this is automated yet:
> the order button opens an enquiry form and a person answers it.

That is the honest current state: a customer buys a design, and a human makes the card. Every
piece of the report's machinery exists to remove that human. Worth being explicit about, because
it means the first increment has a *business* payoff (stop doing it by hand) rather than an
architectural one.

---

## 2. Verdict by section

| Report section | Verdict | Note |
| --- | --- | --- |
| Code-owned renderers, data-owned content | **Adopt** | The central idea, and correct. Never store executable scene code in a table |
| Pin invitations to an exact `templateVersionId` | **Adopt** | Cheap now, impossible to retrofit later |
| Immutable publication snapshot separate from draft | **Adopt** | Matches how `invitation_orders` already treats a paid order as a record, not a mutable row |
| JSON Schema for per-template content | **Adopt with change** | See conflict 2 |
| `x-ui` / `x-editPolicy` annotations | **Adopt** | Standard-compliant use of annotations; keeps one source of truth for form and permission |
| Object storage + CDN, direct upload | **Adopt with change** | See section 4 |
| Two independent controls: *who may edit* and *is it frozen* | **Adopt** | Genuinely good. Collapsing these into one enum is the bug it predicts |
| Structured schema-generated editor over WYSIWYG | **Adopt** | Correct for this product and this team size |
| Guided visual editing (`data-field-path`) | **Defer** | Right idea, wrong time — needs an editor first |
| Server shell + lazy client canvas | **Adopt with change** | See conflict 3 |
| ISR / `generateStaticParams` for public invitations | **Adopt with change** | See conflict 3 — does not work here today |
| Application-level authorisation as the boundary | **Reject as written** | See conflict 1 |
| `Template` / `TemplateVersion` / `Invitation` / `InvitationRevision` / `Publication` / `Asset` / `AuditEvent` | **Adopt, staged** | Six tables on day one for one template is cost without benefit. `AuditEvent` already exists as `public.audit_log` |
| Optimistic saving with revision conflict detection | **Defer** | Belongs with the editor |
| Workflow state machine (DRAFT → … → ARCHIVED) | **Defer, then adopt** | Not until two parties actually edit |
| Template kill switch / fallback mode | **Adopt early** | Cheapest insurance in the whole report |
| Testing pyramid, visual regression, permission matrix | **Adopt** | With one addition — see section 4 |
| OpenTelemetry instrumentation | **Defer** | No collector in this stack yet |

---

## 3. The conflicts, and how to resolve each

### Conflict 1 — authorisation

**Report:** "Role-based access alone is insufficient […] application-level checks are still needed
for field paths and workflow transitions", with PostgreSQL RLS as one layer among several.

**This repository:** `CLAUDE.md` non-negotiable #1 — *"RLS is the authorization model. Plan §6:
there is no trusted API between clients and Postgres for reads. Do not add a REST/tRPC layer to
work around a policy. Fix the policy and add a pgTAP assertion."*

These are not the same claim, and read carelessly the report licenses exactly what the
non-negotiable forbids.

**Resolution.** Field-path checks are an *addition above* RLS, never a replacement for it.
The rule to write down:

- Which **rows** a caller may read or write is decided by a policy, tested in pgTAP.
- Which **paths inside a content document** a caller may change is decided in the server action,
  because Postgres cannot express "may edit `/couple/partnerOne` but not `/theme/animationLevel`"
  without unreasonable contortion.
- A field-path check may only ever *narrow*. If deleting the whole check would let somebody read
  or write another person's row, the policy is wrong and the check is hiding it.

There is precedent already: `/admin/users` writes `staff_roles` with the service-role key behind
`requireSuper()`, because that table deliberately has no write policy at all. `lib/admin-users.ts`
says so out loud, including that this is the one path where the application check *is* the
boundary. Any content-path check should carry the same warning.

### Conflict 2 — zod versus JSON Schema

**Report:** JSON Schema Draft 2020-12 with Ajv.

**This repository:** *"Each feature owns one zod-validated `actions.ts`."*

**Resolution: the report wins, and the reason should be recorded so nobody "fixes" it later.**
A per-template schema has to be *stored*, versioned and shipped to a form generator. A zod schema
is TypeScript — it cannot live in a `jsonb` column. This is the one case the convention did not
anticipate.

The boundary to hold:

- **Form shape and content validation** — JSON Schema, stored on the template version, evaluated
  by Ajv on the server.
- **Everything else** — action inputs, ids, patch envelopes, workflow transitions — stays zod, as
  every other feature does.
- Ajv config must be **identical on server and client**, and defaults must be materialised by an
  explicit function, not by `useDefaults`. The report is right that `default` is an annotation;
  two differently-configured validators silently disagreeing about what a document contains is a
  genuinely nasty class of bug.
- Add the JSON-Schema-versus-zod split to `CLAUDE.md` when it lands, or the next person will
  correctly read it as a convention violation.

### Conflict 3 — ISR and static generation

**Report:** public invitations should be "runtime data backed by cached or incrementally
regenerated routes", using `generateStaticParams`.

**This repository, measured on 2026-08-01:** a production build prerenders 416 pages, and those
pages are then **re-rendered on every request**. Verified by diffing anonymous against signed-in
responses for `/[city]/[category]` and `/vendor/[slug]` — the HTML differs, so the prerender is
being discarded. The cause is the session read in the site header: the layout touches `cookies()`,
which bails the whole subtree out of static serving.

So following the report literally would produce an invitation route that *looks* statically
generated in the build table and is dynamic in production.

**Resolution.** A public invitation route must sit **outside** the `(site)` layout — no header, no
session read, nothing that touches `cookies()` anywhere in its tree. That is not a hardship: a
wedding invitation opened from WhatsApp should not carry the marketplace's navigation anyway. The
same layout that already opts `/account` and `/partner/dashboard` out of the site chrome is the
mechanism.

If the header must eventually appear on such a route, the session has to be hydrated in the
browser rather than read on the server — the trade-off is already written up in
`components/header-account-link.tsx`.

### Conflict 4 — six tables for one template

**Report:** `Template`, `TemplateVersion`, `Invitation`, `InvitationRevision`, `Publication`,
`Asset`, `AuditEvent`.

**Resolution.** Two of these are free and two are premature.

- `AuditEvent` **already exists** as `public.audit_log` — append-only, super-admin read,
  `actor_id = auth.uid()` on insert. Use it; do not add a second audit table.
- `TemplateVersion` and the `templateVersionId` pin should land **early**, because retrofitting a
  version pin onto invitations that were never pinned means guessing which version they were
  authored against.
- `InvitationRevision` and `Publication` earn their place when there are two parties editing and
  an approval step between them. Before that they are ceremony around a single writer.
- `Asset` overlaps with what `lib/image-upload.ts` already does for images; it should absorb that
  rather than sit beside it.

---

## 4. What the report omits, and this repository requires

**Money.** The report does not discuss it. Here, `price` is `app.paise` — integer paise, never a
float, never rupees (plan §5). More importantly `invitation_orders_amounts_reconcile` enforces
`booking + balance = template_price`, and `lib/invitation-templates.ts` derives both legs from one
function specifically because an earlier version computed them separately and broke that
constraint for any template cheaper than the booking fee. **No content or version layer may
recompute either leg.** A version pin must capture the price *as ordered*, which
`invitation_orders.template_price` already does.

**Storage.** The report specifies S3 presigned URLs and multipart upload. Here it is Supabase
Storage: `lib/image-upload.ts` uploads through the service-role client with a local-filesystem
fallback, returns a bare object path, and `storageImageUrl()` turns that into a CDN transform URL
at display time — plan §12's mitigation for media cost at SEO scale, and the reason `next/image`
is banned. Two consequences:

- The report's content-addressed immutable keys (`{assetId}/{contentHash}/…`) are still right and
  should be adopted; the current helper does not do this.
- **Only images have a pipeline.** Audio, GLB and KTX2 have none — no size limits, no structural
  inspection, no variants. The report's `modelAsset` and `audioAsset` are further off than they
  look.

**Tests.** `CLAUDE.md`: *"Add a pgTAP test in the same PR for anything touching leads, money or
reviews."* Invitation orders and payments already have three (`05`, `07`, `08`). Any new table
here touches money by adjacency and needs the same treatment — in particular, that a customer can
read their own invitation content and nobody else's, asserted in SQL rather than in a TypeScript
test that mocks the client.

**Guest orders have no owner.** `invitation_orders.customer_id` is written from the session if one
exists and left null otherwise, so a card bought before signing in belongs to nobody and is
invisible in `/account/invitations` forever. Claiming by `contact_email` is not available: sign-up
no longer proves email ownership. Any content model inherits this — decide at checkout whether
sign-in is required, before adding a content document nobody can be shown.

---

## 5. Suggested order

Each stage is shippable and has an exit condition. Stop after any of them without leaving a
half-built platform.

**Stage 1 — make the renderer take input.** Lift the hardcoded wording out of
`invitation-3d/index.tsx` into a typed `content` prop. One template, no database, no schema. Exit:
the same scene renders two different families from two literals in a fixture file.

**Stage 2 — one content document, one public route.** Add `content jsonb` and
`template_version_id` to `invitation_orders`, one JSON Schema for the one template, and
`/invite/[slug]` outside the `(site)` chrome. Server-render names, date, venue and event list as
real HTML; lazy-load the canvas. Exit: a bought card is reachable by link and readable with
JavaScript disabled. **This is the stage that replaces the human.**

**Stage 3 — the version pin and the kill switch.** `template_versions` table, `rendererKey`
registry, `enabled` + `fallbackMode`. Exit: a broken scene can be switched to poster mode without
taking any live invitation offline.

**Stage 4 — the editor.** Schema-generated form, field-path authorisation, revision conflict
detection. Only now do `InvitationRevision` and optimistic saving earn their cost.

**Stage 5 — workflow and approvals.** Only once vendors edit customer invitations. `lockState`
and `editorClass` as two independent controls, exactly as the report argues.

**Stage 6 — asset pipeline for audio and 3D.** Only once a template needs uploaded media beyond
images.

---

## 6. Open questions

1. **Is the 3D card the product, or one of several?** The report is designed for many templates.
   If the answer is "this one artwork, personalised", most of it is over-engineering and Stage 1–2
   is the whole job.
2. **Who authors an invitation — the customer, or Fremmo staff?** Today it is staff, by hand. The
   editor, the workflow and half the permission model exist only for the first answer.
3. **Must a buyer be signed in?** Unblocks the orphaned-order problem in section 4, and decides
   whether `/invite/[slug]` needs a share token or is public-by-URL.
4. **Does an invitation need to be private?** Public-by-URL is cacheable and simple; a token makes
   ISR much harder. Guest lists and RSVP push hard toward the second.

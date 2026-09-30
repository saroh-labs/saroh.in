# Dev learnings

Problems that cost real time, written down once so nobody pays for them twice.
**Search this file before debugging anything non-obvious**, and add an entry
after fixing one.

One entry per incident: the symptom as you would have described it before you
understood it, then the cause, the fix, and where the rule now lives. If a rule
can be enforced by a lint rule, a check script or a test, that is where it
belongs — an entry here is the story behind it, so the enforcement is not
mistaken for bureaucracy and removed.

---

## Local dev — sign-in from an app refused, nothing in the API log

**Problem**: An app started with `next dev -p <port>` could not sign in, and the
API logged no request at all.
**Root cause**: `api.saroh.in` builds its CORS allowlist from the portless
`.localhost` hostnames (`main.ts`), so the browser refused the call before it
left the page. Separately, Better Auth scopes its cookie to the shared parent
domain, which apps on different ports of bare `localhost` do not share — so
even a successful sign-in bounces back to the login screen.
**Fix**: Run apps through portless at their `.localhost` names (`pnpm dev`).
**Category**: local dev · rule in `docs/architecture/LOCAL_DEV.md`

## API — `PORT` default never applies, app binds a random port

**Problem**: The API listened on a random port in CI and containers, while
working locally.
**Root cause**: With `SKIP_ENV_VALIDATION` set, the typed env module returns
`process.env` untouched — skipping the schema's defaults along with its
validation. `app.listen(undefined)` picks a random port. Locally
`apps/api.saroh.in/.env` sets `PORT`, which hides it.
**Fix**: Anywhere without a `.env`, pass every value the app needs, including
the ones that "have a default". This cost a red CI run.
**Category**: env · rule in `docs/patterns/devops-environments-and-flags.md` and `apps/api.saroh.in/AGENTS.md`

## Auth — sign-in lands on the app launcher, not the page asked for (#222)

**Problem**: Signing in from a deep link on a `.localhost` app ended on the app
launcher.
**Root cause**: With `BETTER_AUTH_TRUSTED_ORIGINS` unset, trusted origins fall
back to the `*.saroh.in` production list, so a return-to on a `.localhost`
origin is — correctly — refused.
**Fix**: Set `BETTER_AUTH_TRUSTED_ORIGINS` when running the stack yourself;
`.env.example` has the value. An ad-hoc `turbo run dev` does not inherit it.
**Category**: auth · rule in `docs/architecture/LOCAL_DEV.md`

## Auth — every signed-in user sent to sign-in during an api restart

**Problem**: A deploy, a timeout or a 502 from `api.saroh.in` redirected
signed-in users to the accounts login page on their next server render.
**Root cause**: `getServerSession` returned `null` for three different answers:
no cookie, a session the api rejected, and an api that never answered.
`requireSession()` redirected on all three.
**Fix**: `resolveServerSession()` returns `authenticated | anonymous |
unavailable`, and only a 401/403 is `anonymous`. Gates throw
`SessionUnavailableError` so the nearest `error.tsx` offers a retry
(`7867fa8`).
**Category**: auth · rule in `.agents/skills/saroh-product-states`

## Renderer — `text-site-muted` renders in the inherited colour

**Problem**: Muted text on the tenant 404 and checkout looked like body text,
and `border-site-border` borders were invisible.
**Root cause**: `siteColors` maps `muted` and `border` to `--site-muted` and
`--site-border`, and `SiteTheme`'s defaults declared neither. `hsl()` of an
unset variable is an invalid declaration, which the browser drops without a
word. Published sites were fine because the publisher derives both per
publication; only the fallback was broken — which is what renders when
something has already gone wrong.
**Fix**: Defaults added to `SiteTheme`, using the values `siteStyleVariables()`
derives for the default style (`00cd219`). Every key in `siteColors` needs a
default in `SiteTheme`.
**Category**: CSS

## Renderer — `rounded-[--site-radius]` produces no CSS

**Problem**: An arbitrary-value radius class had no effect.
**Root cause**: The apps run Tailwind 3.4. The bare custom-property shorthand is
Tailwind 4 syntax.
**Fix**: `rounded-[var(--site-radius)]`, or `ctaClasses()`, which already
carries the radius.
**Category**: CSS

## Blocks gate — a new renderer surface fails `check:blocks` (G6)

**Problem**: Adding `error.tsx` and `loading.tsx` under `apps/saroh.app` failed
`pnpm run check:blocks`.
**Root cause**: G6 bans the `--site-*` layer outside `packages/site-blocks`,
except for an allowlist of Saroh surfaces that sit on a merchant's page.
**Fix**: A surface that draws no block — a 404, an error boundary, checkout —
goes into `SITE_LAYER_ALLOWED` in `scripts/check-blocks.mjs`, with its reason. A
file that draws a block does not: move the block into the package.
**Category**: blocks

## Git — a TypeScript file shows as "Bin" and grep cannot see inside it

**Problem**: `git diff` rendered `analytics-aggregate.handler.ts` as binary,
and a search for a constant defined in it found only its import.
**Root cause**: A raw 0x00 byte typed directly inside a string literal, as a
join separator. One NUL byte makes git, `git grep` and `grep` treat the whole
file as binary.
**Fix**: Write control characters as escape sequences, never as the raw byte
(`73465a4`). To find files grep considers binary:
`grep -rIL . --include='*.ts' apps packages` — `-I` stops binary files matching,
so `-L` lists exactly those.
**Category**: tooling

## Jobs — a stale worker re-sends a notification that was already delivered

**Problem**: Possible duplicate sends after a handler ran past the visibility
timeout.
**Root cause**: `claimDue` reclaims PROCESSING rows past `JOB_VISIBILITY_MS`,
but `complete()` and `fail()` wrote by `id` alone. A stale worker failing after
the reclaiming worker finished rescheduled a DONE job to PENDING.
**Fix**: Every terminal write on `Job` is `updateMany` fenced on
`(id, status: PROCESSING, lockedBy: workerId)` and reports whether it won
(`76f7a47`). A new terminal write must carry the same WHERE.
**Category**: jobs

## Jobs — booking notifications recorded as delivered, never sent

**Problem**: Every `booking.notify` job in the table was DONE, and no booker or
merchant had ever received one.
**Root cause**: No handler for `booking.notify` was ever registered — S4-002 left
it to a later ticket — and the registry's fallback for an unknown type was a
no-op that resolved, so the worker completed each job.
**Fix**: Unhandled types dead-letter as FAILED with the reason in `lastError`.
`apps/api.saroh.in/src/modules/jobs/job-consumers.spec.ts` pins every enqueued
type to a registered handler and lists the gaps still open. The handler itself
is still unwritten.
**Category**: jobs

## Jobs — scheduled jobs run at once on a Postgres not set to UTC

**Problem**: A job queued to run an hour later ran two seconds later, over and
over — a self-rescheduling job ran some 11,000 times in an hour on a dev
database, and a failed job's retry backoff was never waited out.
**Root cause**: Prisma stores `DateTime` as `timestamp without time zone`
holding UTC. The claim query compared `"runAt" <= now()`, and `now()` carries
a zone, so Postgres read `runAt` in the SESSION's zone. A developer's Postgres
in India runs in `Asia/Kolkata`, where every UTC time looks 5½ hours older than
it is — anything due within 5½ hours was due already. A database running in
UTC hides it, which is why it was never seen.
**Fix**: Compare with `now() AT TIME ZONE 'UTC'` (and write `lockedAt` the same
way) in `prisma-job-queue.ts`. `prisma-job-queue.db.spec.ts` claims against a
connection set to Asia/Kolkata. Any raw SQL that compares a Prisma `DateTime`
column with `now()` has the same bug — use the UTC form.
**Category**: jobs

## App — a role denial reads "turned off" in the gate, and "try again" in production (#274)

**Problem**: A MEMBER opening a website page was told "Website is not switched
on for this organization", which was false. Where a 403 did reach an error
boundary, `next dev` showed "You do not have access to this" while a
production build showed "Couldn't load this — try again".
**Root cause**: Two separate causes.

- `ModuleGate` rendered `CapabilityOffState` for every `DISABLED` readiness, and
  a failed authorization gate also makes a module `DISABLED`. WEBSITE's
  `requiredAction` was `site:update`, so every read-only role failed it; under
  `MODULE_ENFORCEMENT` the same gate 404s every sites route for them.
- `SectionError` found the status by parsing the thrown `ApiError`'s message,
  which Next replaces with a digest for server errors in production. The parse
  returned null, and the denial rendered as a failure.

**Fix**:

- WEBSITE gates on `site:read`.
- `ModuleGate` renders `AccessDenied` for an `UNAUTHORIZED` blocker.
- `getJson` calls `forbidden()` on a 403 (`experimental.authInterrupts`), caught
  by `forbidden.tsx` in `(shell)`, `(editor)` and the app root.
- Required Settings reads propagate permission interrupts and server failures.
- Site detail reports `canEdit` from server policy. Read-only roles get a site
  overview and review notes without requesting a draft, which requires write access.
- `module-enforcement.roles.spec.ts` runs the guard per role with the real
  availability service, which the stubbed guard spec never could.

Check a denial in `next build && next start`, not only in dev.
**Category**: auth · rules in `docs/patterns/frontend-error-feedback.md` and
`.agents/skills/saroh-module-capability`

## Local dev — an OWNER sees the read-only site view after a test run

**Problem**: With `pnpm dev` running, the site editor showed an OWNER "You can
view this site. Editing and publishing are limited to owners and admins."
`tsc` was clean, and the service returned `canEdit: true` in its spec.
**Root cause**: `pnpm --filter @saroh/e2e test:permissions` runs
`turbo run build`, which rebuilds `@saroh/database`'s `dist`. The API's dev
watcher recompiled mid-rebuild, reported missing exports from
`@saroh/database`, and kept serving its previous build, from before `canEdit`
existed. The field came back `undefined`, which the editor page treats as
read-only. Touching a source file did not trigger a recompile.
**Fix**: Restart `pnpm dev` after anything that rebuilds a workspace package's
`dist`. If the watcher's last line is "Found N errors" while `tsc --noEmit`
passes, the API is running an old build.
**Category**: local dev · note in `docs/patterns/frontend-error-feedback.md`

## Sites — draft HTML ran in the editor, and highlights vanished at publish (#280)

**Problem**: Two symptoms at the same boundary.

- Rich text saved through `PUT …/draft/sections` rendered raw in the editor
  preview on app.saroh.in, event handlers included.
- A merchant's highlighted words showed in the editor and were gone on the
  live site.

**Root cause**: The sanitizer ran only at publish. The public renderer reads
only snapshots, so it was safe, but the editor preview renders the DRAFT
through the same `RichTextSection`, whose own comment said never to feed it
unsnapshotted HTML. Separately, the allowlist had no `<mark>`, which is what
Tiptap's Highlight renders, and it kept `style` with any CSS property. So
highlights were stripped, and `position: fixed` was not.

**Fix**:

- `sanitize.ts` runs on save (`replaceDraftSections`, `updateFooter`), on the
  editor's load (`getPageDraft`) and at publish.
- The allowlist keeps `<mark>`, table cell spans, and only the CSS properties
  the editor writes. It forces `rel="noopener noreferrer"` on targeted links.
- Button links are refused unless they are `http`, `https`, `mailto`, `tel` or
  a path, checked with control characters stripped first; `ctaHref` repeats
  the check for stored content.

An editor extension that writes a new CSS property needs it added to
`allowedStyles`, or its formatting disappears on save.
**Category**: security · rules in `sanitize.ts`, `sanitize.spec.ts` and
`packages/block-contract/src/links.test.ts`

## Enquiry — the live form refuses visitors after a draft edit (#281)

**Problem**: After a merchant added a required field to an enquiry section and
kept editing, visitors submitting the form on the live site got
`Field "budget" is required`, for a field their form did not have. Nothing was
published, and the merchant saw no error.
**Root cause**: The live site draws the form from its publication snapshot and
posts to the section's `formId`. The public submit validated against
`Form.fields`, and the site editor PATCHes those fields on every autosave to
keep the Form in step with the draft. The one draft edit that reached the
public was validation.
**Fix**: `EnquiryService` validates against the fields in the current
publication's enquiry section for that `formId`, falling back to `Form.fields`
only when no live publication carries the form (`live-form-fields.ts`).
Publishing switches the fields, and restoring switches them back. The editor
now stamps only new formIds onto current state, instead of overwriting typing
done during the sync.
**Category**: enquiry · rule in `docs/patterns/backend-data-and-money.md`

## Sites — restoring a version went live past a change request unrecorded (#279)

**Problem**: A reviewer asked for changes. The merchant restored last week's
version from version history instead of publishing, and nothing, neither
version history nor the approval record, said the site had gone live past the
request.
**Root cause**: #199 added the bypass record to `publishSite` only.
`restorePublication` also appends a Publication and repoints the site, which is
a publish by effect, but it never called `reviewOutstanding`.
**Fix**: `restorePublication` reads `reviewOutstanding` and appends a
`BYPASSED` approval linked to the restored publication, inside the same
transaction. Version history already marks bypass rows by `publicationId`, and
the restore confirm now says a change request is outstanding before it
happens. Any new path that repoints `Site.currentPublicationId` must do the
same.
**Since DEC-071 (T7)** that rule is structural, not remembered: publish,
restore and a test release's Go live all call `putLive`
(`apps/api.saroh.in/src/modules/sites/live-pointer.ts`), which asks the
review standing, appends the LIVE row with its route, repoints the site and
writes the BYPASSED record in one place. `live-pointer.source.spec.ts` fails
if `currentPublicationId` is written anywhere else in `modules/sites`, so a
new path that puts something live has to go through it.
**Category**: sites · tests in `sites-editing.service.spec.ts`,
`live-pointer.source.spec.ts`, `test-release-go-live.db.spec.ts`

## Sites — a changed search title reads "the live site matches your draft" (#282)

**Problem**: After changing only the site's search title, share image, style,
menu, footer or a page name, the settings screen said "Nothing — the live site
matches your draft". The editor bar showed no pending work, the sites list read
"Live", and publishing was the only way the change would reach Google.
**Root cause**: `countPendingSectionChanges` diffed sections only, and every
surface trusted it. The snapshot carries far more than sections.
Separately, the unpublished-changes flag compared timestamps, and saving a
section never bumps `PageVersion.updatedAt`. Style autosave was not part of the
check that disables Publish, and it had no in-flight guard.
**Fix**: The pending count loads the site with `draftSiteSelect`, builds the
site block with `buildSnapshot` (lenient, so it can never throw) and diffs it
against the live snapshot into `SITE_CHANGE_KINDS`. It is returned as
`pendingSiteChanges` beside the section count and described through
`lib/sites/pending.ts`. The flag reads the same diff. Publish waits on an
unsaved style, and style saves run one at a time. A new snapshot field a
merchant can change needs a kind, or it goes uncounted.
**Category**: sites · tests in `pending-site-changes.spec.ts`

## Sites — anyone who could list share links could open the draft (#284)

**Problem**: A MEMBER cannot load a site's draft, but opening Review, listing
the share links and following one showed it to them anyway. A revoked link that
a reviewer already had open went blank on their next click.
**Root cause**: `SitePreviewLinksService.list` returned the raw `token` to any
`site:read` role, and tokens were stored in plaintext, so every row was a
working link. Separately, the three preview pages returned `null` when the link
was gone. Only the layout explained why, and Next keeps a layout mounted
across navigation inside it.
**Fix**: Only `tokenHash` (SHA-256 hex) is stored; migration
`20260911120000_preview_link_token_hash` hashes existing rows in place with the
same function. The raw token is returned once, from `create`, and lookups hash
what the visitor presents. `PreviewGone` is shared and rendered by every
preview page. The share-link UI keeps this session's addresses and says older
ones were shown once.
**Category**: security · tests in `site-preview-links.service.spec.ts`

## API — "false" settles a note: implicit conversion and inline body types (#286)

**Problem**: `PATCH …/comments/:id` with `{"resolved": "true"}` reopened a note
instead of being refused. The obvious fix, a DTO with `@IsBoolean()`, would
have made `{"resolved": "false"}` settle it.
**Root cause**: Two layers.

- The handler took `@Body() dto: { resolved?: boolean }`. An inline type
  reflects as `Object`, and `ValidationPipe` skips validation for `Object`.
- The pipe's `enableImplicitConversion` converts a value to the declared
  property type BEFORE validators run, and a boolean conversion is truthiness.
  Any string, `"false"` included, becomes `true` and then passes
  `@IsBoolean()`.

**Fix**: `SetCommentResolvedDto` read the raw value with
`@Transform(({ obj }) => obj.resolved)` ahead of `@IsBoolean()`. The pipe's
options moved to `common/validation.ts` so `dto.validation.spec.ts` validates
through exactly what `main.ts` applies.

**Then (#314)**: the workaround was the wrong shape. It had to be remembered on
every new boolean, and seven fields elsewhere in the API never got it — among
them whether an automation rule RUNS and whether a billing change applies
immediately. `enableImplicitConversion` is off now: a body is JSON and carries
real types already, and the one field that genuinely arrives as text converts
explicitly with `@Type(() => Number)`. The per-field transforms are gone, and
the plain decorator is the whole rule again. The lesson generalises — a trap you
step around in code review is a trap you will fall into; the fix is to remove it.
**Category**: api · rule in `docs/patterns/backend-nestjs.md`

## Sites — adding one section stopped the whole page from saving (#328, #275)

**Problem**: After adding a section, nothing else on the page saved: other
edits, a reorder, a hide. The bar said "Not saved", a toast repeated every
1.5s, and publish stayed blocked.
**Root cause**: The editor autosaves the page's WHOLE section list, and
`replaceDraftSections` refuses the list on the first section that fails its
contract. New sections start empty, so they fail. Three routes hit it: a new
section; an enquiry section with an empty field, whose Form sync ran before
anything was held back; and a section stored before its contract tightened,
which fails for ever.
**Fix**: The editor holds back sections that fail their contract
(`saveable-sections.ts`), sending a held-back section's saved version so the
save does not delete it. The held-back list is derived from the sections on
screen, never stored, because a stored list went stale on every revert,
removal or failed save. The enquiry sync skips unfinished sections
(`sync-enquiry-forms.ts`). The API carries through, unvalidated, a section
equal to the stored one under the same key, since nothing new is being
stored. A failed sync sets `failedJson` like any failed save, so it does not
loop.
**Category**: sites editor · tests in `saveable-sections.test.ts`,
`sync-enquiry-forms.test.ts`, `draft-revision.service.spec.ts`

## Blocks — a ¥1,500 service showed as ¥150,000 on the site (#325)

**Problem**: A price read right in the workspace but was 100× too high on a
merchant's site, for yen only. Rupees and pounds were fine, so nothing caught
it.
**Root cause**: `Service.priceCents` is the amount × 100 for EVERY currency:
that is how the service form writes it and how `formatMoney` reads it. The
site block divided by the currency's own minor unit (10⁰ for JPY), which is
the textbook reading of "cents", but not this codebase's.
**Fix**: The block divides by 100 and lets `Intl` choose only the displayed
decimals. Check how a money field is WRITTEN before formatting it anywhere
new.
**Category**: money · `packages/site-blocks/src/blocks/services-list.tsx`,
test in `services-list.test.tsx`

## Public pages — API error text is not visitor copy (#327, #322)

**Problem**: Booking visitors saw "Validation failed" or "startAt is not a
valid instant". Checkout was one field-name fix away from showing buyers
"Stored provider credentials are malformed".
**Root cause**: The API's 4xx messages are written for developers or for the
MERCHANT, and describe their setup. A block that showed `error.message`
(#327), and checkout's `readError`, which only failed because it read
`body.message` instead of `body.error.message`, both treated them as copy for
the public.
**Fix**: Merchant-site blocks and the checkout page show their own sentences,
chosen by status: 404/410 is "closed", 400 is "check your details", 429 is
"slow down". API text never reaches a visitor. Checkout has a comment where
`readError` was, so nobody "fixes" it back.
**Category**: public pages · `booking.tsx`, `apps/saroh.app/lib/checkout.ts`

## Catalog — a preview hydrated with different times than the server drew (#326)

**Problem**: The ui.saroh.in catalog's booking preview could hydrate with a
mismatch.
**Root cause**: The preview drew sample open times formatted in the viewer's
time zone, and prices in their locale, during server rendering, so they came
out in the SERVER's zone and locale, then differed in the browser. The live
blocks never hit this, because they load in an effect after mount.
**Fix**: `BlockFixturePreview` renders live-data previews only after mount
(`useSyncExternalStore` with a false server snapshot), from one list,
`LIVE_DATA_PREVIEWS`. Anything formatted for the viewer's zone or locale
waits for the browser.
**Category**: site blocks · `packages/site-blocks/src/block-fixture-preview.tsx`

## Database — row-level security quietly dropped Serializable (ADR-007 review)

**Problem**: A booking's last-seat check and a class pack's last-class check
were only safe because they run as Serializable transactions. Under
`RLS_ENFORCEMENT`, they would have run at Read Committed, and two races each
taking the last one could both have committed.
**Root cause**: The RLS proxy turns a service's `prisma.$transaction(fn,
options)` into its own transaction that sets the organization first, and
dropped `options`, so `isolationLevel` never reached Postgres. Enforcement is
off by default, so no test or environment ever showed it.
**Fix**: `withGuc` passes the caller's options through (`rls-proxy.ts`), and
`rls-proxy.test.ts` checks that the isolation level arrives. When wrapping a
Prisma call, carry every argument through, not just the one you are adding
to. The course and pack writes also take a
row lock on the course, the purchase or the booking before counting, so they
stay correct even if the isolation level is ever lost again.
**Category**: database · `packages/database/src/rls-proxy.ts`

## Database — deleting a contact on a course was refused (ADR-007, U7)

**Problem**: Deleting a contact enrolled on a course failed with a foreign key
error on `Booking_courseEnrollmentId_fkey`, though that key is
`ON DELETE SET NULL`.
**Root cause**: A booking points at both the contact (SET NULL) and the
enrolment (SET NULL), and the enrolment cascades from the contact. In one
delete, Postgres cleared the booking's `contactId` while the enrolment was
already gone but the booking's own `courseEnrollmentId` had not been cleared
yet. That update re-checked the enrolment key and failed the whole delete.
**Fix**: `ContactsService.remove` deletes the person's enrolments on their
own first, which clears the bookings' link, then deletes the contact. When
a row references two parents that cascade from each other, clear the inner
one first.
**Category**: database · `apps/api.saroh.in/src/modules/contacts/contacts.service.ts`

## Frontend — a colour class written in `lib/` never reached the CSS (U17)

**Problem**: The Business Calendar's layer chips rendered with no fill, though
`bg-layer-1` was a real colour in the shared Tailwind config and its
`--layer-1` variable was in the page's CSS.
**Root cause**: Tailwind only generates the classes it finds in its `content`
globs. `app.saroh.in` scans `app/`, `components/`, `pages/`, `src/` and
`packages/ui/src` — not `lib/`. The tone → class map lived in
`lib/calendar/layers.ts`, so every class in it was dropped from the build.
**Fix**: The class strings moved to `components/calendar/tones.ts`; `lib/`
keeps the tone numbers. Any whole class string a component picks from a map
has to live in a scanned folder.
**Category**: frontend · `apps/app.saroh.in/components/calendar/tones.ts`

## Frontend — a worktree's app under another portless name refused every Server Action (U14)

**Problem**: Running a worktree's `app.saroh.in` as
`https://orders-app.saroh.localhost` rendered pages fine, but every button that
called a Server Action failed with "An unexpected response was received from
the server", and nothing reached the API.
**Root cause**: The auth middleware (`packages/auth/src/middleware.ts`) refuses
a POST whose `Origin` is not in `BETTER_AUTH_TRUSTED_ORIGINS` with a 403
"Untrusted request origin". The app's `.env` lists only
`https://app.saroh.localhost`.
**Fix**: Start the second app with its own origin added —
`BETTER_AUTH_TRUSTED_ORIGINS=…,https://orders-app.saroh.localhost` (and
`API_URL` for its own API). No code change; reads work either way, which is
why it looks like a bug in the screen.
**Category**: local dev · `packages/auth/src/middleware.ts`

## Site — a merchant's home and booking page answered 500 in production only

**Problem**: After a deploy, a merchant's home page and booking page on
`saroh.app` answered 500, while `next dev` showed them fine.
**Root cause**: `apps/saroh.app/app/[domain]/layout.tsx` exported a
`generateStaticParams` returning `[]` as a placeholder. An empty list is not
harmless: it makes every tenant route an on-demand static page, and the
renderer reads the publication with `no-store` so a publish shows at once.
In a production build that pair is a hard error ("Page changed from static
to dynamic at runtime"); `next dev` renders everything dynamically, so it
never showed.
**Fix**: No `generateStaticParams` in the tenant layout, not even an empty
one (`d6d3672a`); tenant pages render per request. Pre-rendering, if it
comes, needs a list of hosts and a cached read together. Check a routing
change with `next build && next start`, not only `next dev`.
**Category**: frontend · `apps/saroh.app/app/[domain]/layout.tsx`

## CI — browser specs set in the showcase failed with a 404 or a sign-in that never landed

**Problem**: The bookings, subscriptions, order, customer and product-editor
e2e specs passed locally and failed in CI on a 404, or on signing in as
Rye's Member.
**Root cause**: They are set in the showcase businesses (Pulse Fitness,
Rye & Co., Leela & Loom — `seed_sc_*`), and the CI job ran only the base
seed, which has Northwind alone.
**Fix**: CI runs `db:seed:showcase` (`8603c9d9`), which runs the base seed
first so Northwind is unchanged; it is a turbo task with `^build`, like
`db:seed`, so the block contract is built before it runs. A spec that needs
a showcase business needs that seed wherever it runs.
**Category**: CI · `.github/workflows/ci.yml` · `turbo.json`

## E2E — a spec found the wrong order, or a customer with nothing upcoming

**Problem**: e2e specs that opened a showcase order or customer by a seeded
id passed one day and failed the next — `seed_sc_rc_order_62` was Sana's
order, not Priya's; Meera's bookings opened on Past.
**Root cause**: The showcase lays its diary, orders and memberships out
relative to today, so which id holds which scene moves with the date the
seed ran.
**Fix**: Specs find showcase records by what they are, through the API —
Priya's latest order from the org's orders list; a Pulse member with an
active membership, a late cancel and a class to come (`5cfe427a`). Never
hard-code a showcase id or date in a spec; Northwind's fixed ids are fine.
**Category**: e2e · `e2e/tests/order-detail.spec.ts` · `e2e/tests/customer-detail.spec.ts`

## Forms — Save stayed off after every field was filled in

**Problem**: On Business → Tax and invoices, turning GST on with a GSTIN
that was fixed, then the registered address filled in, left the earlier
refusal showing and Save off, though nothing was wrong any more.
**Root cause**: React Hook Form re-validates only the field that changed. A
rule that spans fields (a registration needs a GSTIN and an address) put
its error on another field, which nothing re-checked when the field it
depends on changed.
**Fix**: While any refusal shows, each change re-checks the whole form with
`form.trigger()` (`e890237c`); a cross-field rule needs `trigger()` on the
dependent field (or the lot) when the field it reads changes. The invoice
number fields do the same with `form.trigger(NUMBER_FIELDS)`.
**Category**: frontend · `apps/app.saroh.in/components/organizations/organization-settings-form.tsx` · `frontend-forms.md`

## Forms — the description read Unsaved the moment the editor opened (#525)

**Problem**: Every product with a description opened with Description marked
Unsaved, so Save all saved it too, though nobody had typed.
**Root cause**: Tiptap's `editor.setEditable(editable)` emits an `update`
event by default (its second argument, `emitUpdate`, is `true`). The editor
called it in an effect on mount, `onUpdate` handed `editor.getHTML()` to the
form, and Tiptap's spelling of the saved HTML (a list item wrapped in a
`<p>`, say) differs from what the API stored — a change, as far as the form
could tell.
**Fix**: `setEditable(!disabled, false)`, and `onUpdate` passes on only a
transaction with `docChanged`. Anything that feeds a Tiptap editor's HTML
into a dirty check should ignore updates that didn't change the document.
**Category**: frontend · `apps/app.saroh.in/components/commerce/product-sections/description-editor.tsx` · `frontend-forms.md`

## Forms — the description editor never loaded after the Unsaved fix

**Problem**: After the fix above (`bae5e936`), the product editor's
Description stayed an empty box: no toolbar, no text, no contenteditable.
The console showed only Tiptap's "Next.js detected. `immediatelyRender`
defaults to false" warning.
**Root cause**: Two things together. Tiptap 3.31 sees `window.next` and,
unless told otherwise, returns null from `useEditor` on the first render
and makes the editor in an effect. `useEditorState`, called beside it, builds
its store around the editor it is first given — null — and its snapshot
moves on to the real editor only at that editor's next `transaction` or
`update` event. The component drew the toolbar and `EditorContent` only once
the state was non-null, so nothing mounted that could make a transaction.
The stray `update` from `setEditable(editable)` had been the only thing
waking it; passing `false` there removed it.
**Fix**: `immediatelyRender: true` (the editor is loaded with
`next/dynamic`, `ssr: false`, so there is no server pass to mismatch), and
the toolbar and its `useEditorState` moved into a child that mounts only
once there is an editor — the shape `components/sites/rich-text-editor.tsx`
already had. Never call `useEditorState` beside a `useEditor` that can
return null. In the product page's Edit description sheet, which React
hides while a lazy part loads, the effects disconnect long enough for
`useEditor` to destroy its editor and make another on reconnect; the
surface's effects reconnect first, holding the destroyed one, and
`getHTML` threw on its missing schema. They skip a destroyed editor, and
the surface is keyed by editor instance so a new one gets a fresh store.
**Category**: frontend · Tiptap · `apps/app.saroh.in/components/commerce/product-sections/description-editor.tsx`

## Database — Load more skipped a product in the Needs you view (#534)

**Problem**: On the Products list's Needs you view, restocking the last row
with its own "+N · Add" and then pressing Load more never showed the next
product.
**Root cause**: The page read used Prisma's `cursor: { id }, skip: 1`.
Prisma finds the cursor row's place from the row itself, whether or not the
`where` still keeps it, and `skip: 1` then throws away the first row after
it — a real one, once the cursor row has left the filter (restocked out of
Needs you, archived out of a collection, renamed out of a search).
**Fix**: An explicit keyset: read the cursor product's `createdAt` (scoped
to the organization) and add `createdAt < c OR (createdAt = c AND id > c.id)`
to the where, matching the order `[createdAt desc, id asc]`; no `cursor`,
no `skip` (`afterInList` in `products/catalogue-page.ts`). Any paged read
whose filter can drop the cursor row needs the same.
**Category**: database · Prisma · `apps/api.saroh.in/src/modules/products/catalogue-page.ts`

## Security — a CodeQL ReDoS alert: fixed without knowing whether it mattered

**Problem**: CodeQL raised `js/polynomial-redos` (and, alongside it,
`js/type-confusion-through-parameter-tampering` and `js/double-escaping`)
on regexes that look harmless — `/<[^>]*>/`, `/\s*\n\s*/`, `/\/+$/`. The
first round of fixes in `dcd778ab` rewrote them, but said nothing about
whether any of them could actually be abused, so a reviewer could not tell
a real hole from a quiet cleanup.
**Root cause**: A regex with an unbounded repeat that can restart at every
position (`<[^>]*>` on a run of "<" with no ">") is quadratic: 8 KB takes
~25 ms, 32 KB ~350 ms. Whether that matters depends on who writes the input
and how long it can be — a 500-character merchant field never hurts; a
public, uncapped enquiry field does.
**Fix**: The method `3c20713d` set down, now for every such alert:

1. Find who reaches the input (a visitor, a signed-in merchant, a developer's
   config) and what caps its length (a contract `max()`, the 100 KB JSON
   body).
2. Benchmark the old form at growing sizes (8/16/32/64 KB) to see the curve.
3. Prefer a linear form — a character class that excludes its own opener
   (`<[^<>]*>`), a split and trim, an index scan — that accepts exactly what
   the old one did.
4. Say in the comment and the commit whether it was exploitable and by whom,
   or that it was a false positive and why; never imply a hole that wasn't.
5. Add a regression test on the pathological input (a run of "<", of
   spaces) with a time bound the old form fails.
   In #532 (`dcd778ab` and its follow-up): the block-contract `piecesOf` was
   reachable by a signed-in merchant on the API (a hero subheading has no cap
   below the body limit, ~3 s at 100 KB); the contact block's address (500
   characters) and the product editor's `stripHtml` (the merchant's own
   browser) were not.
   **Category**: security · CodeQL · `packages/block-contract/src/examples.ts` · `packages/site-blocks/src/blocks/contact.tsx`

## Database — a booking that lost the race for a seat answered 500 (#106)

**Problem**: Under concurrent public bookings, most losers got "fully booked"
(409), but about 1 in 150 got a 500. No test had ever shown it, because one test
process rarely loses the race that way.
**Root cause**: Through the pg driver adapter, a Postgres serialization failure
(40001) inside an interactive transaction can surface as a bare
`DriverAdapterError` whose `cause.kind` is `TransactionWriteConflict`, with no
`code`. Every `code === "P2034"` check missed it.
**Fix**: `prismaErrorCode()` / `isSerializationFailure()` in
`apps/api.saroh.in/src/common/prisma-errors.ts` read both shapes, and every
serializable path uses them. Found by `scripts/load-smoke.mjs`.
**Category**: database · rule in `docs/patterns/backend-data-and-money.md`

## RLS — `$transaction([...])` failed only with enforcement on (#53)

**Problem**: With `RLS_ENFORCEMENT=on`, the category merge and deleting a post
category failed with "All elements of the array need to be Prisma Client
promises". With enforcement off, they worked.
**Root cause**: The RLS proxy ran each org-scoped operation eagerly in its own
GUC-setting transaction and returned a plain promise. The array form needs
Prisma's lazy promises, and would not have been atomic anyway.
**Fix**: An org-scoped operation is now lazy and recognisable (`DeferredOp` in
`packages/database/src/rls-proxy.ts`), and the array form runs them in order
in one GUC'd transaction. `TEST_RLS=on` runs the whole integration suite under
enforcement, so the next one shows up in CI.
**Category**: RLS · rule in `docs/patterns/backend-data-and-money.md`

## Database — the Customers list took four seconds on 5,000 test customers (C3)

**Problem**: The first page of the Customers list, seeded with 5,000
customers and 10,000 orders by `createMany`, took over four seconds in its
integration spec; the same query with real data was expected in tens of
milliseconds.
**Root cause**: Postgres had no statistics for tables filled a moment
before, so it guessed about ten rows per table and nested loops: the
per-contact order aggregate was joined 5,000 × 5,000 times (12.5 million
join-filter checks). Autovacuum's analyse would have fixed it minutes later
in a real database, but a spec reads straight after its bulk load.
**Fix**: The scale spec runs `ANALYZE` after seeding, as autovacuum would,
and then answers in about 90ms (`customers-list.db.spec.ts`). Any timing
spec over bulk-inserted rows needs the same, or it measures the planner's
guess rather than the query.
**Category**: database · tests · `apps/api.saroh.in/src/modules/customer-workspace/customers-list.db.spec.ts`

## Database — Force on for one business answered 500 on a fresh database

**Problem**: In the admin console, Force on for one business answered
"Internal server error" on production's first day, for every flag.
**Root cause**: `FeatureFlagOverride.flagKey` is a foreign key to
`FeatureFlag.key`, and a flag nobody has set globally has no row: the seed
makes those rows in dev, and a fresh production database never ran the seed.
The unit spec mocks Prisma, so no foreign key was ever checked.
**Fix**: `setOverride` registers a missing flag off for everyone first, with
its own audit row, and answers 404 for an unknown business
(`feature-flags.service.db.spec.ts`). A path that only works on a seeded
database needs a real-database spec that starts without the seed.
**Category**: database · tests · `apps/api.saroh.in/src/modules/feature-flags/feature-flags.service.ts`

## Database — making a relation optional quietly changes its foreign key (B13)

**Problem**: Making `Order.customerId` nullable for walk-ins, the migration
is only `DROP NOT NULL`, but `Customer` → `Customer?` alone would not have
matched it: the replay check compares the datamodel with the migrations.
**Root cause**: Prisma's default `onDelete` is `Restrict` for a required
relation and `SetNull` for an optional one. Turning `Customer` into
`Customer?` with no `onDelete` asked for `ON DELETE SET NULL`, so the next
`migrate dev` would have rewritten the foreign key, and deleting a customer
would have silently turned their orders into walk-ins.
**Fix**: The relation names `onDelete: Restrict`, as the foreign key has
always been (`schema.prisma`), and `db:verify:replay` passes. When a
required relation becomes optional, say its `onDelete` explicitly.
**Category**: database · migrations · `packages/database/prisma/schema.prisma`

## API — Subscription Detail "could not be loaded" in CI, fine locally (D14)

**Problem**: Every showcase subscription's page failed in the CI browser
suite with "This subscription could not be loaded"; locally it opened.
**Root cause**: The detail read builds D14's autopay card, which opened the
business's Razorpay connection and decrypted its keys _before_ checking the
`RAZORPAY_AUTOPAY` flag. CI has a connected Razorpay but no
`PAYMENTS_ENC_KEY`, so decryption threw and took the whole read down with
it. Locally the key is set, so nothing failed.
**Fix**: The flag is checked before any credential is opened, and a
connection that can't be opened means "no autopay offered", logged — never a
failed read (`mandate-setup.service.ts`, `e43cd94b`). Rule: an optional
panel on a read — anything a flag, a provider or a module decides — degrades
to "not offered"; it never fails the page it sits on. Check the flag first,
open credentials last. When a test passes locally and fails in CI, diff the
environments before the code.
**Category**: API · providers · `docs/patterns/backend-integrations.md`

## E2E — the phone project timed out on a button the desk found at once (D7)

**Problem**: The Plan Editor spec passed on `desk` and timed out on `phone`
waiting to click "Publish changes"; the button was in the page snapshot.
**Root cause**: Two things, found one CI round apart. The editor draws its
actions twice — in the header (hidden below 760px) and in a sticky phone bar
— and `.first()` picked the hidden one. Then the "…is open for sign-ups."
toast, which rises from the foot of the screen, sat on the phone bar and
swallowed the tap: a real bug a merchant would have hit.
**Fix**: Locators for controls drawn once per layout use
`.filter({ visible: true })` (`1ef40ec2`). A sticky bottom bar reports its
height through `useBottomBarInset` and the Toaster's offsets add it
(`f98043a1`). Run a changed screen's spec on **both** projects before
pushing — `pnpm prepush --e2e` does.
**Category**: e2e · frontend · `apps/app.saroh.in/lib/hooks/use-bottom-bar-inset.ts`

## CI — gitleaks failed the batch on test webhook secrets (D12, D13, G20)

**Problem**: The secret scan failed a batch PR on six "generic-api-key" hits.
**Root cause**: Specs signed their fake Razorpay webhooks with made-up
secrets like `whsec_d13…`, random-looking enough for gitleaks' entropy rule.
Nobody ran gitleaks before pushing.
**Fix**: Reviewed fingerprints in `.gitleaksignore` (`66bc5e66`). Better: a
fixture secret that reads as one (`test-webhook-secret-d13`) is never
flagged. `pnpm prepush` runs gitleaks over the branch's commits.
**Category**: CI · secrets · `.gitleaksignore`

## Tests — a new public controller failed the module-enforcement spec (P1)

**Problem**: One integration spec failed after P1 landed:
`module-annotations.spec.ts` › "names every controller under src/modules".
**Root cause**: The spec requires every controller to be module-gated or
listed as exempt with a reason. P1 added `checkout-return.controller.ts`
and ran only its own module's tests.
**Fix**: Listed with its reason (`48ea390e`). A new controller means a row
in that spec's lists; the full integration run (`pnpm prepush --int`) is
what catches it, not the unit's own folder.
**Category**: tests · `apps/api.saroh.in/src/modules/capabilities/module-annotations.spec.ts`

## Tests — 28 subscription specs failed at random, then passed alone

**Problem**: A grouped integration run failed 28 subscription tests; the same
group passed when run again.
**Root cause**: A second run was started on the same test database while the
first was still going. Each resets the database, so they wiped each other's
rows.
**Fix**: One database per concurrent run — each unit agent has its own
`saroh-test-r2-<unit>`. Never start a test run against a database another
run is using.
**Category**: tests · local dev

## Repo — an internal pricing plan was pushed to the public repo

**Problem**: A plan with prices, plan limits and the pricing designs went up
on a batch branch of `saroh-labs/saroh.in`, which is **public**.
**Root cause**: `docs/plans` and `docs/prototypes` are where plans live, and
nothing said this one was internal.
**Fix**: Removed before it reached development (`f6f806d7`); it stays in the
branch history. Internal material — prices, plan limits, anything the user
calls internal — lives outside the repo (the user names where). Before a
push, read the file list of what is going up.
**Category**: repo · `AGENTS.md` → Rules that bite

## E2E — 23 local browser failures, none of them a bug (prepush --e2e)

**Problem**: `pnpm prepush --e2e` on batch 2026-09-29-2 failed 23 specs on
`desk` and `phone`; CI would have passed 21 of them.
**Root cause**: The stack ran against the long-lived local `saroh-dev`,
not a fresh seed: Kavi Dental (E29) was never seeded there, a Northwind
fixture variant was sold out after days of spec runs, the E12
`MODULE_CLASS_PACKS` row and the C1 Needs attention backfill had never run.
Two were real test problems (one assumed Z2a's removed allergen picker; a
walk-in helper read the radios before they drew — `9a372faa`).
**Fix**: Browser specs run against a database seeded the way CI seeds it —
`pnpm prepush --e2e` must point the stack at a fresh `saroh-test-e2e`
(`db:push --force-reset`, `db:seed:showcase`) before it runs. A failure
against `saroh-dev` is a data question before it is a code question.
**Category**: e2e · local dev · `scripts/prepush.sh`

## API — rules the round-2 audit found only one side kept (DEC-042, B11, B9, C7)

**Problem**: The audit found four gaps: a contact with orders or invoices
could still be hard-deleted through the API (only the ⋯ menu stopped it);
an invoice's pay link was minted for a Razorpay connection that couldn't
open checkout, so its page refused; a site checkout's order made dearer
after payment could never take the difference; and Customer Detail's
Classes left card vanished for a member when Class packs was off.
**Root cause**: Each rule lived in one place and a sibling path copied an
older, looser check — the UI instead of the service, `count(CONNECTED)`
instead of `pay-link-provider.ts`, a `placedOnline` exception that guarded
the stock hold in the wrong layer, and a stat built only inside its
module's branch.
**Fix**: `contacts/contact-records.ts` refuses the delete (409) before
autopay and again under the lock; `businessPayLinkProvider` is the one
provider rule for an invoice's link and its page; the webhook skips the
hold when another payment already held the units (`heldByAnotherPayment`),
so `payLinkStanding` compares received with the total for every order; a
membership fills Classes left on its own.
**Category**: api · a rule the UI shows is enforced by the API too; a
payment path reuses the rule its sibling uses, never a copy

## Plans — a unit's named work shipped as a "Not done here" note (D13, D14)

**Problem**: The round-2 audit found three things the payments plan named
missing from production-bound code: D13's Plan Editor warning ("Autopay
covers up to ₹X; N members will need to authorise again", its exact copy in
the unit's Files list), Home's "Send a set-up link" on an "Autopay limit too
low" row, and a notice to the customer when staff cancel their autopay. A
price rise quietly produced MANDATE_LIMIT_LOW renewals.
**Root cause**: The units shipped without them and said so only in prose —
D14's rollout section ("Not done here: …"). Nothing tracked prose, so the
gap surfaced only when someone read the plan against the code.
**Fix**: Built on `r2/fix-pay` (the Plan Editor's `autopayLimits`, Home's
row `link`, `AUTOPAY_CANCELLED`). Rule: anything a unit's plan names that
the unit doesn't build goes in the waves plan's follow-up table with an ID
(as DEC-063's checkout block went in as Z8), never only in a rollout note.
Before calling a unit done, search the code for each copy string its plan
quotes.
**Category**: plans · `docs/plans/2026-09-28-001-round-2-phase-2-waves-plan.md` → Deferred to follow-up work

## CI — `@saroh/database#lint` failed on types "that could not be resolved"

**Problem**: CI's lint job failed on dozens of `no-unsafe-*` errors in
`packages/database` ("Unsafe call of a type that could not be resolved",
`.businessProfile`, `.$transaction`); the same command passed locally.
**Root cause**: `lint` and `typecheck` depend on `^build` — the builds of a
package's _dependencies_, not its own. `@saroh/database`'s own `build`
starts with `prisma generate`, so in CI's fresh checkout it regenerated
the client while the package's lint was reading it. Locally the client
already sat on disk, so the race never showed.
**Fix**: `turbo.json` makes `@saroh/database#lint` and `#typecheck` wait for
the package's own `build`. A task that reads generated code depends on the
task that generates it, in the same package too.
**Category**: CI · turbo · `turbo.json`

## E2E — a spec passed only when the one above it had run first (D18)

**Problem**: "narrow the list by what each invoice was for" failed now and
then: the source chips never appeared.
**Root cause**: The chips show only for two sources or more, and the spec
relied on the test above having written an invoice by hand. Sharding,
retries and a fresh database break that order.
**Fix**: The spec makes its own invoice by hand through the API. A spec
never depends on another spec's leftovers.
**Category**: e2e · `e2e/tests/invoices.spec.ts`

## CI — every job re-downloaded the pnpm store and Chromium ("cache is not found")

**Problem**: CI runs were slow for no visible reason. A push to development
logged "pnpm cache is not found", installed 1,868 packages from the registry
(22s instead of 11s) and downloaded 300 MB of Chromium (29s) in each browser
shard. The Next build caches missed too.
**Root cause**: The repository's Actions cache was at 12.2 GB against a 10 GB
limit, so GitHub evicted the least recently used entries. Every run saved
about 1.3 GB of Turbo and Next caches, keyed per job and per commit, on every
PR push as well as on development. The Turbo cache also only grew, because
each run restored the last one and added to it. The pnpm store and the
Playwright browser were the entries evicted first, and every job needs them.
The browser's key was the lockfile hash, so any dependency bump discarded it
anyway.
**Fix**: `.github/actions/setup` saves the Turbo and Next caches only on
runs outside a pull request (pushes to main or development, the weekly run
and manual runs). A PR restores its base branch's newest caches and writes
none. A saving run drops Turbo entries older than a week. The Playwright
browser is keyed on the installed Playwright version.
Check `gh api repos/saroh-labs/saroh.in/actions/cache/usage` when CI slows
down: close to 10 GB means entries are being evicted.
**Category**: CI · caching · `.github/actions/setup/action.yml`,
`docs/patterns/devops-tooling-and-deploy.md` → CI

## CI — `pg_isready` over the socket can pass before Postgres is ready

**Problem**: None yet. The risk appeared while shortening the Postgres
service's health interval from 10s to 2s.
**Root cause**: The `postgres` image initialises the database with a
temporary server that listens only on the Unix socket, then restarts.
`pg_isready` without `-h` checks the socket, so a quick poll can report
ready during initialisation, before the real server restarts. The 10s
interval had hidden this.
**Fix**: The health check is `pg_isready -h 127.0.0.1`. It checks over TCP,
which only the real server listens on.
**Category**: CI · services · `.github/workflows/ci.yml`

## Tooling — the pre-push gate took 75s, and `--all` over 20 minutes

**Problem**: `git push` sat for about 75s on the quick gate, even straight
after `pnpm prepush --all` had passed on the same commit. `--int` took about
7 min and `--e2e` about 17, one after the other, so a batch spent close to
half an hour on its gate, and each push ran it again.
**Root cause**: Nothing remembered a pass. lint, typecheck, every unit suite
and vitest ran whole on every run, whatever changed. The integration suite
ran its eleven module groups one after another on one database, and the
browser run waited for all of it. A first attempt to test only what changed
(`turbo run test -- --changed=<sha>`) was slower still: turbo hashes a run's
pass-through arguments into every task in it, the `^build`s included, so
each new sha rebuilt every package the tests import.
**Fix**: `scripts/prepush.sh` records each passed step against
`HEAD^{tree}` and skips it on that tree (or one that differs only in docs).
lint, typecheck and tests go through turbo for the affected packages only.
The builds they import run once, then the checks run with `--only`. The
hook's tests run only what changed since the last passing commit. The
integration suite runs in 16 jest shards on three databases at once, with
the browser run building beside it. Measured on the same
batch: the hook takes 3s on a tree that already passed, and 19–32s after a
code change. `--int` takes 95s, and `--all` 10.7 min, most of it the
browser specs.
**Category**: tooling · `scripts/prepush.sh`,
`docs/patterns/devops-tooling-and-deploy.md` → How the gate stays fast

## Tooling — `--e2e` picked 25 spec files for a batch, and `--int` ran all 381

**Problem**: After the gate got fast, a batch's browser step still took about
11 min. The integration step still ran every spec, whatever the batch touched.
Batch 2's `--e2e` chose 25 of the 34 spec files.
**Root cause**: The browser step chose specs by grepping them for a changed
folder's name. Short names such as `orders`, `home` and `shared` match nearly
every spec, and the grep did not look at api or package changes. The
integration step had no selection at all.
**Fix**: Every spec's first line names what it exercises
(`// @covers app:/commerce/orders api:orders site:/shop pkg:site-blocks`).
`scripts/e2e-affected.mjs` maps the changed files onto those keys through an
import scan and prints why it chose each spec. `--int` runs
`jest --findRelatedTests` plus the permission, RLS and module-annotation
specs. Global changes, and `--full`, still run everything, and CI always
does. `check:e2e-covers` keeps the keys honest. On a commit that touches one
screen and one api module, `--e2e` picked 2 spec files (24 tests) and took
105s instead of 657s. The integration run picked 10 of 381 specs and took 9s
instead of 84s. Batch 2 would still have run every spec, because it changed
the schema and CI.
**Merging with a branch that edits the same specs**: the `@covers` line sits
above the imports. A branch that rewrites a spec's first import line (the
storageState sign-in change drops `demoUser` and `Page`) makes git report a
conflict between two edits that do not touch each other. Resolve it with a
one-off union merge, never a committed one: add
`e2e/tests/*.spec.ts merge=union` to `.git/info/attributes`, merge, then
remove the line. A union merge keeps both sides of the hunk, so the import
line the other branch deleted comes back (tried on a scratch repo: the
merged spec had the `@covers` line and the stale `import type { Page }`).
Delete those lines by hand, then run `pnpm run check:e2e-covers` and the e2e
lint. Or take the other branch's spec whole and put the one `@covers` line
back on top (`git show r2/e2e-b:<spec> | head -1`).
**Category**: tooling · `scripts/e2e-affected.mjs`, `scripts/prepush.sh`,
`docs/patterns/devops-tooling-and-deploy.md` → How the gate stays fast

## E2E — every browser spec typed a password, and every run seeded from nothing

**Problem**: The browser step spent minutes on work that never changed. About
150 tests signed in through the accounts form, one by one (three specs had
already grown their own saved-session helpers to dodge the sign-in
throttle). Every `prepush --e2e` run and every CI shard migrated and seeded
a fresh database (~40s). Three specs slept a fixed time: 9s to outlast a
booking's Undo hold, 2s a poll, 300ms a scroll.
**Root cause**: Nothing was shared between tests or between runs. A
sign-in's cookies, and a seeded database, are the same every time until the
seed or the session code changes.
**Fix**: A Playwright `setup` project (`e2e/tests/auth.setup.ts`) signs the
four seeded people in once per run and checks the workspace sees each
session; specs call `useSession` (`e2e/fixtures/sessions.ts`). The specs
about signing in (`auth.spec.ts`, `site-sign-in.spec.ts`) still use the form,
and nothing signs out on a saved session — sign-out revokes it on the server
for every later spec. `prepush --e2e` keeps `<E2E db>-template`, keyed on the
seed's inputs and the Indian day, and copies it per run (1s against 38s);
CI shards restore a `pg_dump` cached on the same inputs. The sleeps became
`page.clock.runFor` past the hold and `expect.poll`. Measured: all 34 spec
files on desk and phone, 334 passed, in 553s end to end on a template hit,
against 657s for 25 files before.
**Gotcha**: The showcase seed lays its data out relative to the moment it
runs, so a seeded copy has a shelf life: the template is reused for 4 hours
of one Indian day (`PREPUSH_E2E_TEMPLATE_HOURS`), CI's dump for one 4-hour
window. Don't key either on the files alone.
**Category**: e2e · tooling · `.agents/skills/saroh-browser-tests/SKILL.md`,
`docs/patterns/devops-tooling-and-deploy.md` → CI and How the gate stays fast

## E2E — the browser suite could only run one test at a time

**Problem**: 34 spec files on desk and phone took 553s on one worker, and CI's
shards split them by file (135s against 195s). Turning on parallel workers
failed on data, not code: the deposit test switched the walkthrough to
deposits and every other booking lost Pay at the desk; desk and phone
changed the same invoice prefix at once; two tests archived Rye's one
Sourdough plan; booking tests took "the third free time" from a list that
shrank as the others booked ("That time has just gone"); earlier, the
trolley's stock ran out and D18 leaned on another test's invoice. Four
tests had been skipped on every fresh seed and so never ran at all (Mark
ready from the quick view, the bulk Undo, both extra-hours journeys).
**Root cause**: Specs wrote to shared seeded records — Northwind's settings,
a named customer, "the first Preparing order", Rye's and Pulse's own data —
and read counts and first rows other specs were changing. One worker hid it.
**Fix**: Every test makes what it changes, through the API, with a stamp
unique to the test, project and worker (`e2e/fixtures/own-data.ts`); orders
are of one untracked product the setup project makes once. Lists and counts
are read on Rye, which nothing writes to; writes moved off Rye and Pulse to
Northwind. Business-wide changes are tagged `@serial` and run alone after
the rest (`e2e/run.mjs`: setup, parallel, serial). Each booking test takes a
day of its own. `fullyParallel` on 4 workers: ~220s end to end, four
back-to-back runs with no retry. `prepush --e2e` takes a lock so a second run
waits, and its teardown stops only its own servers.
**Gotcha**: A test that was skipped "because the seed has none" is not
coverage — make the record. And a long email pushed the phone's Link button
off-screen in "Link a commerce customer" (the test keeps emails short; the
dialog did not wrap — fixed in P2, next entry).
**Category**: e2e · tooling · `.agents/skills/saroh-browser-tests/SKILL.md`,
`docs/patterns/devops-tooling-and-deploy.md`, `scripts/prepush.sh`

## E2E — the phone tab-bar check found "no tab bar" on CI only (#718)

**Problem**: `four-scenes` "/commerce leaves nothing under the bar" failed on
CI's shard 3 (and its retry) with `["no tab bar"]`; it passed four times in
a row locally, and the failure screenshot shows the bar.
**Root cause**: `/commerce` redirects to `/commerce/storefronts`. The spec
waited for the page height to settle, then measured once — and on CI's
2-vCPU runner, with 2 workers, that one look landed between the two pages:
the old bar gone, the new one not drawn. A fast local machine never lands
in that gap.
**Fix**: The measurement itself is polled until it holds (`expect.poll`,
10s); a control really under the bar still fails. Rule: after a navigation
or redirect, never read the page once and assert — assert through a
web-first expectation or a poll, so a slow runner waits instead of failing.
**Category**: e2e · `e2e/tests/four-scenes.spec.ts` · `.agents/skills/saroh-browser-tests/SKILL.md`

## Modules — production showed `ROLLOUT_DISABLED` in Settings › Modules

**Problem**: On a fresh production database every module's rollout flag was
unset, and Settings › Modules listed each module with a raw
`ROLLOUT_DISABLED` line under it. Other surfaces had the same hole in
other shapes: onboarding and Home's first run offered modules Saroh hadn't
rolled out, a hidden module's page said "turned off" with a button to a
switch Settings no longer showed, and API refusals named `CLASS_PACKS`.
**Root cause**: `GET /modules` lists every module, a dark one with a gate
blocker that has no sentence; each screen filtered (or didn't) on its own,
and a step with no message fell back to its code.
**Fix**: DEC-057 is one function, `rolledOut` (`lib/modules/rollout.ts`),
which every list goes through; a hidden module's route is a 404. Words for a
blocker come only from `blockerSentence` (`lib/modules/blocker-copy.ts`):
the API's sentence, else ours, else a plain line.
**Guard**: `lib/modules/blocker-copy.test.ts` reads the API's capabilities
module and fails when a code it can send has no merchant words, and scans
the app for a blocker's `.code` rendered directly.
**Category**: modules · copy · DEC-057

## E2E — a phone test said a dialog fit at 320px while its buttons were off the screen

**Problem**: On a phone, "Link a commerce customer" put a long email on one
line and pushed Link off the screen; the invoice send confirm, the
duplicate notice on Customer Detail, its email in the header, the invoice
paper and Order Detail's header actions did the same with long values. The
first draft of the guard (`scrollWidth <= innerWidth`) passed on most of
them.
**Root cause**: Two. In the app, a dialog is a CSS grid, and a grid item's
`min-width: auto` let one unbreakable value (an email has no break point)
set the dialog's width; a text line's `truncate` or a `flex-none` button row
did the same outside dialogs. In the test, the Pixel 7 project is a mobile
viewport: content wider than the screen makes Chrome zoom the page out and
widen its layout viewport, so `innerWidth` grows with the overflow (320 → 426) and the check compares the bug with itself. A fixed dialog's `w-full`
then follows the widened viewport too. And a paragraph whose text spills
keeps its own box, so a "what sticks out" search by `getBoundingClientRect`
finds nothing but the tab bar.
**Fix**: `DialogContent` and `AlertDialogContent` have one
`minmax(0,1fr)` column, `break-words`, and a height capped at the screen's
with the rest scrolling inside; rows that hold an address wrap it
(`[overflow-wrap:anywhere]`) and keep their buttons `shrink-0`.
`e2e/tests/phone-reflow.spec.ts` opens the dialogs and sheets of Customer
Detail, Order Detail, New order, the invoice send confirm, Change plan and
Settings › Team with a 60-character email (no hyphen) and long names, at
320px and 390px, and measures against the width it SET
(`page.viewportSize()`), failing when `innerWidth` has grown; on failure it
names the innermost boxes past the edge or spilling their text.
**Category**: e2e · design system · `.agents/skills/saroh-browser-tests/SKILL.md`
(Traps), `docs/patterns/frontend-design-system.md` (reflow)

## Invoices — a new precondition on connecting a provider failed 46 integration specs (DEC-068)

**Problem**: Refusing an invoice, a pay link or a provider connection until
the business has its registered address (M3) turned 46 `*.db.spec.ts` files
red, most of them about bookings, subscriptions and webhooks, not invoices.
**Root cause**: Nearly every money spec connects a provider in its setup
through `PaymentsService.connectProvider`, and its test business was made
with no `BusinessProfile` address. The browser suite had the same shape:
Northwind, Pulse, Prana, CarePoint, Lumen and Leela & Loom were seeded with
no address, and every Northwind invoice spec would have been refused.
**Fix**: `test/business-details.ts` (`giveBusinessDetails`) gives a test
business an address without touching its GST standing; the specs call it
after they make the business (and after any `businessProfile.create` of
their own). Unit specs that mock Prisma stub `assertBusinessDetails`; the
refusal and the flag after money have their own specs. Every seeded business
has an address; the GST-registration browser spec clears Northwind's first
and puts the seeded one back.
**Rule**: a new check on a path every setup walks (connecting a provider,
making a storefront) ships with its fixture, and the seed says what the
check needs. `docs/patterns/backend-billing-and-classes.md` → Business
details before money.
**Category**: tests · seed · DEC-068

## Orders — a row's status ran over its Placed column at the desk

**Problem**: On the Orders list at 1440, a treatment's "Next 2 Oct, 10:45"
and a local delivery's "Handed to courier" pill were drawn on top of the
Placed date (Kavi Dental, Rye & Co.; found in the round-2 verify).
**Root cause**: Each row is its own grid, so the columns are fixed widths
(`ORDER_GRID`); the Status column kept the design's 122px, and its bar and
age sat on one `nowrap` line. The design's own words fit; the longer step
and visit words added later did not, and a grid track doesn't clip.
**Fix**: Status is `minmax(86px,140px)` (the longest pill fits) and the bar
and its age wrap onto a second line rather than overflow.
`orders-list.spec.ts` ("a row's status never runs into its Placed column")
measures every desk row's status text against the Placed cell on Kavi and
Rye.
**Category**: layout · `docs/patterns/frontend-design-system.md` (reflow)

## Invoices — a renewal line with no GST rate printed "Nil-rated" (DEC-072)

**Problem**: Rye's plan renewal invoices, issued with `gstRate` null on a
GST-registered business, read "Nil-rated" on every line in Invoice Detail's
paper and in the PDF.
**Root cause**: both papers tested the rate for truthiness
(`l.gst?.rate ? … : "Nil-rated"`), so null and "not set" fell into the 0%
branch. The title logic (D15, `isExemptRate`) already told null from 0; the
line label did not.
**Fix**: one rule, `lineGstNote`, in `invoices/invoice-paper-view.ts` (PDF)
and the app's `lib/invoices/paper-title.ts` (paper): nothing when the paper
charges no GST, nothing for a null rate, "Nil-rated" only for a rate of
exactly 0. Tests pin null, 0 and above 0, registered and not, and a Rye
renewal PDF against a real database.
**Rule**: null is "not set", never 0 — test a rate with `== null` before
reading it as a number. `docs/patterns/backend-billing-and-classes.md` → GST
shows only when it applies.
**Category**: invoices · GST · DEC-072

## E2E — "book into the new gap" failed on phone every Wednesday

**Problem**: `bookings.spec.ts` "open extra hours on a closed stretch, then
book into the new gap" failed on `phone-serial` on 2026-09-30, twice the
same way: the gap's New booking dialog showed no Service it could pick.
**Root cause**: the test, not the product. It booked "two days ahead" on
desk and "three days ahead" on phone. A one-to-one start is the person's
hours intersected with the service's own weekly rules (ADR-008), and the
seeded Northwind services run Mon–Fri 09:00–17:00 — so on a Wednesday the
phone opened hours on a Saturday, where the service has no time, and the
dialog greyed it out exactly as designed ("outside the service's own
hours"). On a Thursday or Friday the desk copy would have failed too.
**Fix**: the test reads the service's rules (`GET
/services/:id/rules`) and takes the first two days, two or more ahead, on
which the service runs — the desk the first, the phone the second — and
checks the booking over that one day rather than "the next four days".
**Rule**: a spec never books "N days from today": N days on is a different
weekday every day of the week. Take a day the service is known to run
(its rules), or a day the test makes open. `.agents/skills/saroh-browser-tests/SKILL.md`
→ Times and slots are claimed, not assumed.
**Category**: tests · e2e · dates

## RLS — "is this address free" would miss another business under enforcement (L1)

**Problem**: `addressTaken` and `freeAddress` (`sites/site-address.ts`) are
asked during one business's request too: site creation, the Turn on sheet
and, from L2, a change of address. With `RLS_ENFORCEMENT` on, `Site` and the
new `AddressReservation` are scoped to that business there, so another
business's site or held address read as free. A held address has no unique
index to catch the claim afterwards.
**Root cause**: the check is cross-business by nature, but it read through
the caller's (GUC'd) client.
**Fix**: `outsideOrgContext(fn)` (`@saroh/database`, rls-proxy) leaves the
ambient org context and its transaction. `site-address.ts` uses it for its
reads (and `releaseExpired`) only when enforcement is on and a context is
active. `site-address.db.spec.ts` checks it under `TEST_RLS=on`: business A
can't list B's holds, yet sees B's address as taken.
**Rule**: a read that must see every business (uniqueness across tenants)
goes through `outsideOrgContext`, never the request's client; such a read is
outside the caller's transaction.
**Category**: RLS · `docs/patterns/backend-data-and-money.md`

## Gate — batch 4 passed `prepush --all` and failed CI on RLS and the permission suite (#765)

**Problem**: PR #765 (batch 2026-09-29-4) passed `pnpm prepush --all` and
then failed two CI jobs the gate never ran. "Integration (rls, shard 4/4)":
`module-setup.db.spec.ts` › "an address in use fails the whole transaction"
fails with `RLS_ENFORCEMENT` on. "Permission states (production build)": F17
and F19 on Team (`permissions.spec.ts`, desk and phone) no longer found the
controls they check after DEC-073 changed the permission lists.
**Root cause**: two CI jobs had no local mirror. The gate ran the
integration suite plain only (its own doc said so, under "Not mirrored"),
and never ran `e2e/permissions/` at all: that suite is not the seeded
stack, it builds the app against a fake api, and the browser step only
knew `e2e/tests/`.
**Fix**: `--int` runs the same selection again under `TEST_RLS=on`, after
plain, on the same databases (`int-rls:affected` / `int-rls` in the pass
cache). `--e2e` runs the permission suite after the browser specs, in the
same worktree of HEAD, with CI's env only; its specs carry `@covers` lines
and `node scripts/e2e-affected.mjs --suite permissions` chooses them. Proved
on batch 4's tip (7cb03b67) plus the gate: a scratch commit touching
`team-screen.tsx` and `site-address.ts` made `int-rls:affected` fail on
exactly CI's spec (plain passed) and `e2e-permissions:affected` fail on
exactly CI's four tests (F17, F19 × desk, phone).
**Also**: RLS shards on parallel databases share one cluster role, and two
globalSetups granting it at once failed one with "tuple concurrently
updated". `test/global-setup.ts` re-runs the (idempotent) grants.
**Rule**: every CI job has a mirror in `scripts/prepush.sh`, or a line in
the pattern doc saying why not. A new CI job lands with its prepush step.
**Category**: tooling · `scripts/prepush.sh`, `scripts/e2e-affected.mjs`,
`docs/patterns/devops-tooling-and-deploy.md` → How the gate stays fast

## Integration — a probe role failed DROP ROLE beside another test database (K1)

**Problem**: `prepush --int` failed `public-catalogue.db.spec.ts` in teardown
with `role "saroh_g11_rls_probe" cannot be dropped because some objects
depend on it` (2BP01), after several units ran their suites at once and a
machine restart killed runs mid-way.
**Root cause**: a Postgres role belongs to the whole cluster, not one
database. Every `saroh-test-*` database shares it, so a grant left in another
database (a parallel run, or one that died before its `afterAll`) blocks the
drop.
**Fix**: the teardown drops the role in a `DO` block that ignores
`dependent_objects_still_exist`; the role is NOLOGIN and holds nothing in the
database being torn down.
**Rule**: a spec that creates a role must not fail when another database still
uses it — drop it tolerantly, or give it a per-database name.
**Category**: tests · integration · parallel databases

## Copy — the service editor matched an API refusal by its words (DEC-069 L11)

**Problem**: Rewording the API's "Treatments are sold as orders — add a
storefront first." to say location would have silently moved the app's
inline note under Time into a generic error toast.
**Root cause**: `components/services/service-editor/service-editor.tsx`
decides where to show the refusal with `error === TREATMENT_NEEDS_STOREFRONT`,
a copy of the API's sentence kept in `lib/services/service-editor.ts`. The
API already sends `details.reason: "no-storefront"`, but the app's save path
passes only the message on.
**Fix**: the app's constant changed in the same commit as the API's words.
`src/common/merchant-copy.spec.ts` now fails on any API prose that says
storefront, so a copy change there is visible in review.
**Rule**: branch on a code or `details.reason`, never on a message's words;
when an old app still compares words, change both sides together and expect
an old app to fall back to the toast until it is redeployed.
**Category**: copy · API contract · DEC-069

## Sites — every new site opened with broken images (DEC-070 K10)

**Problem**: A site made from the starter template (Turn on Website, or
`/sites/new`) drafted a hero and a three-image gallery, and all four images
were broken in the editor and on the published page. With no contact email,
its "Get in touch" went to `/contact`, a page it never made, which the
pre-publish check then flagged.
**Root cause**: `starter@1` named `/templates/starter/*.jpg`, relative
paths that no app's `public/` has. The template's tests only parsed the
content against the block contract, which checks that `src` is a string,
not that anything serves it. Nothing ever rendered a template.
**Fix**: `starter@2` carries no image and links only to its email or its
own About page. `packages/site-blocks/src/starter-template.test.tsx` renders
every page through `SectionRenderer` and fails on any `<img>` or
`/templates/` path; `starter@1` is its control. `starter-site.db.spec.ts`
checks a real Turn on Website draft. `listTemplates()` now lists only the
latest version of each id: registering v2 beside v1 would otherwise have
shown "Starter" twice in the picker, which keys options by id.
**Rule**: a template may name an image only by an absolute address the
media library served, never a path an app is assumed to have. Render a new
template in a test, not only parse it (K12–K14 follow the same test).
**Category**: sites · templates · DEC-070

## E2E stack — the API's renderer links pointed at production (DEC-069 L6)

**Problem**: a pay page opened on a tenant host in the CI and prepush e2e
stacks would have redirected the browser to `https://saroh.app/pay/…`, the
live service, instead of the stack's own renderer.
**Root cause**: the stacks set `E2E_RENDERER_URL` for the specs but never
the API's `RENDERER_URL`, so every link the API built for the renderer
(pay links, review links) fell back to production's `saroh.app`. Specs had
worked around it by keeping only the path of a link (`invoices.spec.ts`).
**Fix**: both stacks set `RENDERER_URL=http://localhost:3005`
(`scripts/prepush.sh`, `.github/workflows/ci.yml`), and
`pay-on-site.spec.ts` fails when `payUrl` names any host outside the
stack's renderer.
**Rule**: an origin the API hands to customers is set in every stack that
runs the API; a spec that follows a link asserts it stays on the stack.
**Category**: e2e · environment · `docs/patterns/devops-environments-and-flags.md`

## Sites — a Shop page can't be shown in the browser suite (DEC-069, L13)

**Problem**: L13's plan asked for a browser spec: turn on Sell with Delivery
on a business the test makes, then see Website › Pages show Shop (draft).
It can't pass on the seeded e2e stack.
**Root cause**: the Shop page and the Sells from row sit behind `SITE_SHOP`,
which is off by default and on for no seeded business (`site-shop.spec.ts`
runs only with `E2E_SITE_SHOP=1`, which neither CI nor `prepush --e2e`
sets). A business a test makes also has no `MODULE_*` overrides, so Sell
isn't even offered to it (DEC-057). The brief's "write to Northwind only"
rules out the other route: Northwind already has its site and pages.
**Fix**: the scenarios run against a real Postgres instead
(`module-setup.db.spec.ts` "selling online leaves the shop ready to
publish", `module-page-create.db.spec.ts`), with the flag turned on per
business by an override.
**Rule**: before planning a browser spec for a flag-gated surface, check the
flag is on in the e2e seed; if it isn't, plan the proof as a db spec, or
seed the flag for Northwind first.
**Category**: testing · feature flags · DEC-069

## Tooling — a killed `eslint --fix` left three source files empty (L9)

**Symptom**: after a machine restart, a unit worktree's uncommitted
`storefronts-screen.tsx` and two new files were 0 bytes, though `git status`
listed them only as modified or untracked.
**Cause**: `eslint --fix` over a directory was still writing when the
machine went down; a fix rewrites the file in place, so a kill mid-write
truncates it.
**Fix**: restored the tracked file from HEAD and re-applied the edits; the
new files were rewritten.
**Rule**: after any interruption, look for empty files before committing
(`find apps -path '*/node_modules' -prune -o -type f -empty -print`), and
commit work in progress before a long `--fix` run.
**Category**: tooling · worktrees

## CI — four reds on batch 4 (#765) that the local gate passed

**Problem**: `pnpm prepush --all` passed; CI failed four jobs. (1) Unit:
`interaction-states.test.tsx` › Checkbox timed out at 5s (33s on the
runner). (2) Integration, `rls` shard: the Turn on sheet's Website setup
with a taken address threw Prisma's unique error, not a 409. (3) Browser,
phone: a11y reported Orders' row name as a focus stop with no ring.
(4) Permission states: F17/F19 found no "See orders" or "Manage payments".
**Root cause**: (1) nwsapi answers `:modal` and `:popover-open` by calling
`Element.matches`, which is nwsapi again, down to a stack overflow, and
floating-ui asks both of every open menu after its test returns; the next
test paid for it: 3s on a Mac, 33s on a runner. (2) `writeSiteFromTemplate`
checked the address with its own `tx.site`/`tx.organization` reads, which
RLS scopes to the caller; L1 had moved only `site-address.ts` outside the
org context. (3) Not the page: the reduced-motion clamp makes every element
transition `all` for 0.01ms, so a box-shadow read in the frame of a blur
still has its old value. The walk's last stop was blurred just before the
resting read, and a batch change put a ring-on-`::after` row name there.
(4) `shownCatalogue` (DEC-073) kept a module's permissions only when the
modules list named it; the suite's fake API names only what its scenarios
need. The local gate runs integration without RLS and has no permission
suite, and the unit and browser failures needed a slower runner or a
different 20th stop.
**Fix**: (1) `packages/ui/vitest.setup.ts` answers the two top-layer
selectors false (jsdom has no top layer); the file went from 6s to 0.1s.
(2) `addressUse` in `site-address.ts`, read across businesses, is what
site creation checks; a held address is refused there too. (3) The a11y
walk waits for running transitions before each read. (4) A permission hides
only when the list names its module hidden (DEC-057) or it's Automations
(DEC-068).
**Rule**: a check on something other businesses own goes through
`site-address.ts`, never the request's `tx`. A computed-style read right
after a focus change waits a frame's transitions. A hide rule hides on
evidence, never on absence. Run `TEST_RLS=on` for any spec touching a
cross-business read, and the permission suite for anything on Team, until
`scripts/prepush.sh` runs both.
**Category**: CI · tests · RLS · a11y

## Capabilities — the annotation spec counted a decorator named in a comment

**Problem**: after K6 (DEC-070) moved the Payments gate off `InvoicesController`
onto its pay-link handler, `module-annotations.spec.ts` said the file had two
`@RequireModule(` but only one `@IgnoreModuleReadiness()`.
**Root cause**: the spec is a source scan. The class doc comment spelled out
`@RequireModule("PAYMENTS")` to explain the handler gate, and the regex
counted it as a second gate.
**Fix**: the comment says "its own Payments gate on the handler". A new case
pins that the invoices controller has exactly one gate, on the pay link.
**Rule**: in a controller, never write a decorator's literal text in a
comment; the annotation spec reads comments as code. Also: a service that
starts reading `organizationModule` (`paymentsOn`) breaks every unit spec
whose mocked Prisma lacks it with a TypeError, not a clear failure — add
`organizationModule: { findFirst: jest.fn().mockResolvedValue(null) }` (no
row reads as on).
**Category**: tests · capabilities · mocks

## Gate — batch 5's units passed alone and failed together: a copy guard and RLS (DEC-069/070/071)

**Problem**: batch 2026-09-30-5 (batch 4, wave 1 of DEC-069/070/071, K6)
failed two gates once merged, though each unit had passed its own.
(1) api-unit: L11's `merchant-copy.spec.ts` flagged DEC-074's refusal in
`orders/order-location.ts`, "Your role moves only your storefront's
orders." (2) int-rls: in `module-setup.db.spec.ts`, L13's "selling online
leaves the shop ready to publish" cases died at `tx.store.create()` with
"Unique constraint failed".
**Root cause**: (1) DEC-074 and L11 were built side by side; the guard
didn't exist when DEC-074 wrote its copy. (2) `freeStoreSlug` (Sell's
turn-on) asked `tx.store.findUnique({ where: { slug } })`. `Store.slug` is
unique across every business, but under RLS `tx` sees only the caller's,
so the other business's "rye-counter" looked free. L13 added the spec
cases that make two businesses with the same shop name; the units that
built them ran before the gate ran `TEST_RLS=on` (FAST-PREPUSH).
`StoresService.isSlugAvailable` had the same read (backstopped by a 409).
**Fix**: (1) "Your role moves only your location's orders." (2)
`storeSlugInUse()` (`stores/store-slug.ts`) reads every business's
storefronts through `outsideOrgContext`, as `addressUse()` does for web
addresses; both slug checks use it. The spec failed 5 cases under
`TEST_RLS=on` before and passes in both modes after.
**Rule**: units built before the gate ran RLS (or before a guard spec
landed) are re-gated when they land together: run `pnpm prepush --int`
(plain and RLS) and the full api unit suite on the batch branch, not only
per unit. A uniqueness check across businesses reads outside the org
context (`docs/patterns/backend-data-and-money.md`).
**Category**: gate · RLS · copy

## Merges — a new guard and a new string landed in one batch, and the guard failed (L2)

**Symptom**: on `batch-2026-09-30-5`, `src/common/merchant-copy.spec.ts`
(L11) failed on `orders/order-location.ts`: "Your role moves only your
storefront's orders."
**Cause**: DEC-074's location-team refusal and L11's "API prose never says
storefront" guard were built in parallel; each passed alone, and the merge
put them together with nothing re-running the unit suite on the result.
**Fix**: the refusal says "your location's orders" (L2's first commit).
**Rule**: after merging a unit that adds a guard test (a source scan, a
catalogue check), run the API unit suite on the batch before starting the
next wave from it.
**Category**: merges · testing · DEC-069

## Batch — a DEC-074 refusal said "storefront" once L11's copy scan landed (K2)

**Symptom**: `api-unit` failed on `batch-2026-09-30-5` itself:
`common/merchant-copy.spec.ts` flagged `orders/order-location.ts`'s
"Your role moves only your storefront's orders."
**Cause**: DEC-074's unit wrote the refusal before DEC-069 L11's scan (merchant
copy says location) existed; each unit passed alone, and the batch merge put
them together without re-running `api-unit`.
**Fix**: the refusal says "your location's orders" (K2 made the one-word
change, since it blocked its gate).
**Rule**: after landing units into a batch, run `pnpm prepush` on the batch
before branching the next wave from it; a scan added by one unit judges every
other unit's strings.
**Category**: batches · copy · DEC-069

## Capabilities — Sell's store slug read as free under RLS (batch 2026-09-30-5)

**Problem**: on `batch-2026-09-30-5`, `pnpm prepush --int` failed only in
`int-rls`. `module-setup.db.spec.ts` (L13) failed with a unique constraint
error on `tx.store.create`. The base also failed `api-unit`, because
`merchant-copy.spec.ts` (L9) found "storefront" in `OTHER_LOCATION_REFUSAL`.
**Root cause**: `freeStoreSlug` checked a globally unique `Store.slug` through
the request's `tx`. Under RLS that client sees only this business's stores,
so a slug another business held read as free. The copy line was left behind
by a merge: two units, one merge.
**Fix**: under RLS with an org context, the slug is read in
`outsideOrgContext` (`module-setup.writers.ts`). The refusal now says
"location". Both fixes landed with T3 (#754).
**Rule**: every uniqueness check on a column unique across businesses is read
outside the org context, as `site-address.ts` does. Test releases' host
lookups (`site-host-mode.ts`, `test-release-lookup.ts`) follow the same rule.
**Category**: RLS · tests · merge

## Invoices — a rule moved, and the sentences that described it stayed

**Problem**: after K6 (DEC-070) made invoices work without Payments, three
places still said the old rule: turning Payments off promised "their pay
links still work" (`module-deactivation-impact.ts`), the Modules list said
Payments is where you "send invoices", and the workspace offered "Copy pay
link" and "Issue with pay link" from a connected provider alone — a link the
API now refuses with Payments off.
**Root cause**: the rule was changed where it is enforced, and the words and
the workspace's own guesses (`online.providerConnected`) were not searched
for. `navRowsForModule` also listed Invoices as a Payments row, so turning
Payments off would have said Invoices go with it.
**Fix**: K7 reads `send.payOnline` (`paysOnline` in `lib/invoices/send.ts`)
for every pay-link offer on an invoice, `payLinkPossible` for New and Edit,
rewords the impact line and the Modules note, and a rail row can stand in
for a module's page while it is off (`unlessModule`), which
`navRowsForModule` skips.
**Rule**: when a gate moves, grep the copy for the old promise ("pay link",
"with Payments") as well as the code, and let the workspace read the API's
flag rather than rebuild the rule from a provider list.
**Category**: copy · invoices · nav

## e2e — a @serial test on the phone is project "phone-serial", not "phone"

**Problem**: K7's @serial spec took the desk path on the phone and failed
looking for the desk rail ("Primary") at Pixel width.
**Root cause**: `e2e/run.mjs` runs @serial tests in their own projects,
`desk-serial` and `phone-serial`. `testInfo.project.name === "phone"` is
false there, so a phone branch in a @serial spec never runs — and where the
phone branch only adds checks (`module-turn-on.spec.ts`'s sheet and 44px
asserts), it passes without checking them.
**Fix**: `project.name.startsWith("phone")` in the spec.
**Rule**: in a spec that can be @serial, test the project with
`startsWith("phone")`. The other `=== "phone"` checks in @serial specs are
worth the same change.
**Category**: e2e · tests

## E2E — a business a test sets up has no modules and no rollout flags (L4)

**Problem**: L4's browser spec had to change a web address on a business of
its own (Northwind's address is read by every other spec), and to show that
the new host serves. A business set up through onboarding in the seeded
stack could neither change its address nor have a website.
**Root cause**: the seed registers every rollout flag dark
(`enabledByDefault: false`) and gives overrides only to the businesses it
makes. A business made at test time gets the production default for each,
so `MODULE_WEBSITE` and `WEB_ADDRESS_CHANGE` are off for it, and there is
no staff session in `e2e/` to give it an override.
**Fix**: the seed registers `WEB_ADDRESS_CHANGE` on by default (a release
order, not a surface a business chooses). `e2e/fixtures/own-business.ts`
(`makeBusiness`) sets one up as Asha. The spec covers the change on a
business with no site, where the old address is kept rather than
forwarded. The forwarding half (the new host serves, the old one answers 307) waits for a way to give a test-made business a site.
**Rule**: before planning a spec on a business the test makes, check which
flags it will have. Only a flag with a seeded global default reaches it.
**Category**: e2e · flags · DEC-069

## Gate — the shared browser worktree ran a spec this tree doesn't have (T4)

**Symptom**: T4's `pnpm prepush --e2e` failed on
`tests/web-address-change.spec.ts`, a spec that is not in T4's tree. It
failed on the address it expected, not on anything T4 touched. The same
run also had `public-booking` and `site-sign-in` fail on one project each.
A rerun passed all of them.
**Cause**: parallel units share one detached browser worktree
(`$TMPDIR/saroh-prepush-e2e`). `e2e_worktree` moved it to HEAD with
`checkout -f`, which leaves untracked files in place, so a spec another
unit's run left there ran against this tree.
**Fix**: `e2e_worktree` cleans untracked files after the checkout. Ignored
files (node_modules, .next) stay, so the build cache is kept.
**Rule**: a failing browser spec that isn't in `e2e/tests` of your tree is
the shared worktree's leftover, not your change.
**Category**: gate · parallel units

## e2e — a business a test sets up can't turn a module on

**Problem**: L8's first spec set up a business as `founder` and turned on
Contacts, Bookings, Sell and Website through `PUT modules/:key`; every call
came back 400 "CRM isn't available for your business yet".
**Root cause**: each module sits behind its `MODULE_*` rollout flag
(DEC-057). The seed creates those flags with `enabledByDefault: false` and
turns them on only through overrides for the seeded businesses
(`seed/run.ts`). A business made during a test has no override, and no e2e
session is staff, so nothing can roll a module out to it.
**Fix**: `share-links.spec.ts` reads Northwind instead (its Online location
has no orders, so the Orders first run is reachable), and the booking
page's first run stays in vitest.
**Rule**: a spec that needs a module on uses a seeded business. A business
the test makes (setup, the web-address change) is for what needs no module.
**Category**: e2e · tests · modules

## e2e — a booking test took "the first open day" and failed late in the day

**Problem**: `site-sign-in.spec.ts` A9 failed on the phone in CI (#767) and in
T7's local run, both in the afternoon: "element(s) not found" for the second
free time.
**Root cause**: the desk takes the first time on the first open day and the
phone the second. Late in the day, today is still open but has one time
left, so the phone's slot doesn't exist. The test assumed the day, and the
clock decided.
**Fix**: `chooseTime` reads each day's "N times free" and picks the first day
with two.
**Rule**: a booking test reads the day it books from the page or the API.
Never "today", "the first open day" or "N days from now" (see also the
Saturday failure above).
**Category**: e2e · tests · dates
## Sites — the scheduled go-live was refused by the go-live it runs (T10)

**Symptom**: the first draft of `site.go_live` called T7's
`goLiveWithRelease` and got "Cancel the scheduled go-live first" for every
release it ran: the release it was putting live was, by definition,
scheduled. In a db spec, `jest.spyOn(prisma, "$transaction")` to fake a
failed last attempt threw "mockRejectedValueOnce is not a function".
**Cause**: T7 refuses any release with a `goLiveAt`, which is right for a
person going live by hand and wrong for the job that owns that schedule.
`prisma` from `@saroh/database` is the RLS proxy (`createRlsProxy`), so a
spy on it doesn't replace what callers reach.
**Fix**: `goLiveWithRelease` takes `scheduledFor`; a release scheduled for
exactly that instant is let through, and any other schedule still refuses.
The last-attempt write is `recordGaveUp`, exported and asserted directly;
the order (retry, then record on the last try) is pinned with a mocked
`@saroh/database` in `go-live.handler.spec.ts`.
**Rule**: a guard that refuses "something is scheduled" needs a way for the
schedule itself through. Fake `prisma` with `jest.mock`, not `spyOn`.
**Category**: sites · jobs · tests
## Sites — a customer is signed out after the business changes its web address (L3)

**Problem**: after an owner changes the web address, the old one forwards
for 90 days (a 307 from the `[domain]` layout to the same path on the new
address). A customer who was signed in on the old address arrives signed
out, and an order in their bag on the old host is not carried over.
**Root cause**: the customer session is a `__Host-` cookie
(`apps/saroh.app/lib/customer-session.ts`), which is host-only by
definition: it can't carry a `Domain` attribute, so nothing set on
`rye.saroh.app` is ever sent to `rye-bakery.saroh.app`.
**Fix**: none needed, by design. The change dialog says "Customers signed
in on your site will need to sign in again" (L4), and the account area
already treats a visitor with no session as signed out. Don't try to hand
the session across hosts in the redirect: a token in a URL is a credential
in logs and referrers.
**Rule**: anything that moves a customer from one host to another (an
address change, a custom domain going live, a test host) signs them out.
Say so where the merchant makes the move.
**Category**: sites · sessions · DEC-069

## E2E — the forwarding half of an address change reads a seeded row (L3)

**Problem**: L3's browser check (the old host answers 307 to the same page
on the new one, which serves) needs a business with a live site whose
address changes. A business a test sets up can't have a site (its
`MODULE_WEBSITE` rollout flag is the production default, off; see L4's
entry above), and Northwind's address is read by every other spec.
**Root cause**: the seed deliberately registers module rollout flags dark
and overrides them only for its own businesses; flipping one globally
would seed away the kill switch.
**Fix**: the seed holds an old address for Northwind, as a change would
leave it (`packages/database/src/seed/previous-address.ts`,
`northwind-before`, forwarding for 90 days from the seed). The spec reads
it without writing anything, so it runs beside every other spec. The change
that writes such a row is covered against a real database
(`web-address.service.db.spec.ts`), and the renderer's decision in vitest
(`middleware.test.ts`, `lib/publication.test.ts`, `lib/request-path.test.ts`).
**Rule**: when a browser check needs a state only a business-wide write
can make, and a test-made business can't reach it, seed the resulting row
on Northwind and read it. Don't change Northwind's shared settings.
**Category**: e2e · seed · DEC-069

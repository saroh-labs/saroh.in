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
**Category**: sites · tests in `sites-editing.service.spec.ts`

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

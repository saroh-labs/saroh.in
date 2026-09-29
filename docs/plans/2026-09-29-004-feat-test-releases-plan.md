---
title: "feat: Test releases — a frozen version on a test address, then Go live"
type: feat
status: active
date: 2026-09-29
origin: DEC-071
decisions: DEC-071, DEC-047 (amended), ADR-002, ADR-009, ADR-011, DEC-013, DEC-057, DEC-069 (address rules), DEV_LEARNINGS #279 #281 #284
unit_prefix: T
---

# Test releases

## Summary

A merchant freezes the current draft into a **test release**: a named,
non-live Publication with an optional note. It is served whole, shop, booking
and account pages included, at `test--<address>.saroh.app` (and at
`test.<custom domain>` once that host is set up). Only someone holding a
link can open it. It is `noindex`, and a "Test release" bar sits on every page.
Every order, booking, payment and enquiry is refused, in the UI and again by
the API. Reviewers approve **that frozen version**. "Go live" puts exactly
those bytes live, now or at a scheduled time in the business's time zone, even
if the draft has moved on since. Direct Publish stays. A new site setting,
**"Publishing needs approval"** (off by default), makes an approved test release
the only way to go live, except when an owner overrides, and every override is
recorded.

---

## Problem frame and scope

Today publish is one step (ADR-002): `publishSite`
(`apps/api.saroh.in/src/modules/sites/sites.service.ts` ~1729) builds a
snapshot with `buildSnapshot` (~1570), appends a `Publication` and repoints
`Site.currentPublicationId`. Preview links (`site-preview-links.service.ts`,
`apps/saroh.app/app/preview/[token]/*`) rebuild the **moving draft** on every
request, so a reviewer's view changes under them. Publish ships whatever the
draft is at that moment, which may not be what was approved. Preview has only `/`, `[slug]`
and `[slug]/[postSlug]`, so it has no shop, booking, checkout or account. An approval is
bound to a draft fingerprint (`review-route.ts`), but it never blocks
anything (DEC-047), and nothing can be scheduled.

**In scope**
- A candidate Publication (`kind = TEST`) with a name, a note and a number, plus
  its mutable state in a side table. Publications stay append-only.
- The test host: classification, the token gate, `noindex`, the bar, and the
  renderer's lookup mode.
- Shop, book, checkout, account and enquiry in test mode, with writes refused
  both in the UI and by a fail-closed API guard.
- Review verdicts and review requests attached to a test release.
- Go live now, and a scheduled go-live (a job, cancel, notify).
- The "Publishing needs approval" setting, the owner override, and its record.
- The editor, review and settings UI.
- The security properties: the token scheme, and never serving a test release
  on a real host (or a live site on a test host).

**Out of scope**
- **Address rules.** DEC-069's plan owns `site-address.ts` (`addressProblem`,
  `RESERVED_ADDRESSES`), the address change and its redirects. The `--` ban and
  reserving `test` are asked of that plan (see KTD-12). This plan has no unit
  for them.
- **Things that do not go through a publish stay live and outside test
  releases:** products, prices, stock, plans and packs (they have their own
  publish), opening hours, "Sells from", posts, and which modules are on. A test
  release reads them live, like the live site does, and says so (R6).
- Draft preview links stay as they are (`/preview/<token>` on the apex), for
  "look at my work in progress".
- Per-page releases, a visual diff between a release and live, and releases for
  posts.
- Attaching `test.<custom domain>` to the Vercel project automatically. There is
  no Vercel automation in the repo today (ADR-009 "implementation pending"), so
  it is an ops step, like the custom domain itself (open question Q4).
- Pay links (`/pay/*`) on a test host. They are about real invoices and 404 there.

---

## Requirements

- **R1** (DEC-071 "Make a test release"). Making a test release freezes the
  current draft into a Publication that is not live, built by the same
  `buildSnapshot` (strict, not lenient) and stored without touching
  `currentPublicationId`. It has a name (default "Test release N"), an optional
  note, who made it and when.
- **R2** (DEC-071 "its own address"). A test release is served at
  `test--<address>.saroh.app`, and at `test.<custom domain>` when the site has a
  VERIFIED custom domain and that host is set up. It shows the whole site,
  including the shop, booking and account pages.
- **R3** (DEC-071 "only people with the link", "noindex"). Only a valid,
  unexpired, unrevoked link opens a test release. Every response on a test host
  carries `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`,
  and has no share card.
- **R4** (DEC-071 "never takes a real order, booking or payment"). On a test
  host, live products, prices and times are shown. Placing an order, booking,
  paying, joining a plan, buying a pack, joining a waitlist, sending an enquiry
  and signing in are all refused: the UI stops with a plain explanation, and the
  API refuses the same calls on its own (409 `TEST_RELEASE`).
- **R5** (DEC-071 "a Test release bar"). Every page on a test host shows a bar
  that cannot be dismissed. It names the release and says that nothing here
  takes a real order, booking or payment.
- **R6** (DEC-071 Consequences, "the test release says so"). The bar, and the
  "Make a test release" sheet, list what stays live and outside the release:
  products, prices and stock; plans and packs; opening hours; where the shop
  sells from; posts; which modules are on.
- **R7** (DEC-071 "Review and approval attach to the test release"). A review
  request and a verdict (Approved / Changes requested) can name a test release.
  The verdict is bound to that release's fingerprint, not to the moving draft.
- **R8** (DEC-071 "Go live publishes exactly the tested version"). Go live puts
  the release's frozen snapshot live, byte for byte (only its `publishedAt` is
  restamped), whatever the draft looks like now. It is a pointer flip, like
  restore. It records the review standing, including a bypass (#279), and the
  live enquiry form fields switch with it (#281).
- **R9** (DEC-071 "at a scheduled time … cancelled … told"). Go live can be
  scheduled for a date and time in the business's time zone. It can be cancelled
  until it runs, and the team is told when it goes live or when it could not.
- **R10** (DEC-071 "Publishing needs approval", amends DEC-047). A site setting,
  off by default. While it is on, Publish, restore and Go live succeed only for
  an approved test release. An owner can override, and the override is recorded
  on the publication, in the approval history and in the audit log. While it is
  off, DEC-047 stands unchanged: approval is advisory and a bypass is recorded.
- **R11** (DEC-071 "An address containing `--` can never be claimed"). No
  business can hold an address that a test host could be mistaken for. This one
  is delivered by DEC-069's plan (KTD-12). This plan makes the host classifier
  fail closed whatever the address table holds.
- **R12** (security). A test release is never served on a real host, and a live
  site is never served on a test host. A token never grants anything beyond
  viewing one release of one site.
- **R13** (00-universal §15). Every existing editor capability stays: Publish,
  preview links, version history, restore and the review panel.

---

## Key technical decisions

**KTD-1. The candidate is a `Publication` with `kind = 'TEST'`, and its
mutable state lives in `SiteTestRelease`.** DEC-071 says "a named Publication",
and ADR-002 says publications are append-only (no `updatedAt`). The frozen
snapshot is therefore an ordinary Publication row, and everything that changes
lives in a 1:1 side table: name, note, schedule, went-live, discarded. Every
existing reader of `Publication` that means "published" is narrowed to
`kind = 'LIVE'` in the same unit that adds the column. Those readers are
`listPublications`, `getPublication`, `restorePublication`, the WEBSITE
readiness adapter (`module-readiness.registry.ts` ~143), `module-backfill.ts`
~81 and `admin-metrics.service.ts` ~66. *Rationale:* the snapshot is built and
stored exactly as publish stores it, so there is one shape and one sanitiser.
The side table keeps publications immutable.

**KTD-2. Go live appends a LIVE copy. It never points the site at the TEST
row.** Go live inserts a new `Publication` (`kind = 'LIVE'`,
`sourcePublicationId` = the TEST row) whose snapshot is the TEST snapshot with
only `publishedAt` restamped, then repoints the site. That is what
`restorePublication` already does. *Rationale:* it makes "`currentPublication`
is always LIVE" an invariant that can be checked. The live readers can then
also filter on `kind: 'LIVE'` as a second lock, so a TEST row can never become
what a real host serves (R12). Version history keeps one row per go-live, with
its own time. `draftFingerprint` ignores `publishedAt`, so an approval of the
release still matches the copy.

**KTD-3. One function repoints the live site.** `publishSite`,
`restorePublication` and Go live all call `putLive(tx, …)` in a new
`sites/live-pointer.ts`. It computes the review standing, enforces R10, appends
the LIVE row with its `reviewRoute`, repoints the site, and writes the
BYPASSED or OVERRIDDEN record. A source-scan spec fails if `currentPublicationId`
is written anywhere else in `modules/sites`. *Rationale:* #279 happened because
restore was a second repointing path that forgot the bypass record.
DEV_LEARNINGS already says "any new path must do the same". This makes it
structural instead of remembered.

**KTD-4. Live form fields need no extra switch.** `EnquiryService` validates
against `fieldsFromSnapshot(currentPublication.snapshot)`
(`enquiry/live-form-fields.ts`), so repointing *is* the switch (#281). T7 adds
a db spec that proves it for a go-live, and the enquiry form is refused on a
test host (R4), so a tester never submits against fields that are not live.

**KTD-5. The test host is one host per site. The token chooses the release and
travels in a host-only cookie.** The link is
`https://test--<address>.saroh.app/?release=<token>`. On a test host, the
renderer middleware moves `?release=` into a `__Host-saroh-test` cookie
(HttpOnly, Secure, SameSite=Lax, Path=/, no Domain) and redirects to the same
URL without the parameter. Every later request reads the cookie. *Rationale:*
the site's own routes (`/shop`, `/book`, `/account`, `[slug]`) work unchanged
on a host, which is what "the whole site" needs. Preview's path prefix needed a
link-rewriting script (`KeepLinksInside`) and has no shop. `__Host-` pins the
cookie to exactly that host, so it never reaches the live host or another
tenant, even though `saroh.app` is not on the Public Suffix List.

**KTD-6. The token scheme copies #284.** 32 random bytes, base64url. Only the
SHA-256 hex (`tokenHash`, unique) is stored, and the raw token is returned once,
from create. Links live in their own table, `SiteTestReleaseLink` (expiry,
revoke, `lastUsedAt`, creator, purpose `SHARE | OPEN`). They are not
`SitePreviewLink` rows, so a draft-preview token can never open a test host and
a test token can never open `/preview/<token>`. The renderer sends the token to
the API in a header (`x-saroh-test-token`), never in a path, so access logs
don't carry it. `common/logging/redact.ts` lists the header. A link stops
working when it expires, when it is revoked, or when its release is discarded
or has gone live (Q6).

**KTD-7. The host decides the mode, and one classifier with a shared test
vector decides the host.** `classifySiteHost(host, rootDomain)` →
`{ mode: 'live' | 'test', lookup }` lives twice:
`apps/api.saroh.in/src/modules/sites/site-host-mode.ts` and
`apps/saroh.app/lib/site-host-mode.ts`. Both test files pin the same vector,
as `site-relay.ts` does today. The rules:
- A label starting with `test--` under the root is a test host for the address
  that follows.
- On a custom host, `test.<H>` is a test host when no Domain row matches the
  full host exactly and `<H>` is a VERIFIED domain bound to a site.
- Everything else is live.

The live lookups (`by-subdomain`, `by-hostname`, `resolveSiteHost` in
`site-accounts/site-host.ts`) refuse a test-classified host before querying.
The test lookup refuses a live-classified host, never falls back to the live
site, and checks that the release's site is the site the host names.

**KTD-8. Test mode refuses writes in two places, and the API side fails
closed.**
- **UI.** Every write action in `apps/saroh.app` calls `testMode()` (beside
  `siteOrigin()`) and returns a typed `{ ok: false, reason: 'test-release' }`.
  The site-blocks flows show a `TestReleaseStop` panel where the sign-in sheet
  or the submit would be.
- **API.** A global `TestHostWriteGuard` (`common/guards/test-host.guard.ts`,
  registered beside `OriginGuard`) refuses every non-GET `/public/*` request
  whose `Origin`, or whose verified relay host, classifies as test. It answers
  409 `{ code: 'TEST_RELEASE' }`.
  - A route stays open on a test host only if it is marked
    `@AllowOnTestRelease()`, which is meant for read-shaped POSTs such as the
    checkout quote.
  - A spec lists every public non-GET route, so a new write route is refused
    on test hosts by default.
  - Webhooks send no browser `Origin` and are not affected.

*Rationale:* the UI stop is what the tester sees. The guard means a missed
action, or a block that posts straight from the browser (the enquiry form
does), still cannot take a real order. It is not a boundary against someone
calling the live API on purpose. Those endpoints are public for the live site
anyway, and saying so keeps the claim true.

**KTD-9. Sign-in is off on a test host.** The account pages show their
signed-out state, and the sign-in sheet says "Signing in is off on a test
release. On the live site, a code goes to this address." The account pages'
content is live data, not snapshot content. Only their chrome (theme, header,
footer, menu) comes from the release, and the signed-out view shows all of it.
*Rationale:* a first sign-in creates a Contact (DEC-049), sends a code through
the business's provider and opens a host-bound session, and all three are real
writes. See Q1 for the alternative.

**KTD-10. A review attaches to a release through `SiteApproval.testReleaseId`
and the release's fingerprint.** A REQUESTED or verdict row for a release
carries `testReleaseId` and `draftFingerprint = SiteTestRelease.fingerprint`.
`reviewStanding` (`review-route.ts`) is unchanged: Go live passes the release's
fingerprint as `currentFingerprint`, so an approval of the release settles it,
and self-approval still doesn't count. "Approved test release" means the newest
verdict on that release is APPROVED by someone other than the person going
live, and no CHANGES_REQUESTED on it is newer. Notes (`SiteComment`) stay on
draft pages and sections, as today. A note written while viewing a release
records `testReleaseId`, so the release view lists its own notes.

**KTD-11. The approval setting is a column on Site, and only an owner changes
it or overrides it.** `Site.publishNeedsApproval Boolean @default(false)`.
Turning it on or off is an OWNER-only write, recorded as an `AuditEvent`
(`site.publish_approval.on|off`). Letting an ADMIN switch it off would be an
override with no record. An override is an explicit `override: true` on
Publish, restore or Go live, accepted only from an OWNER. It writes
`Publication.reviewRoute = 'OVERRIDDEN'`, a `SiteApproval` row with outcome
`OVERRIDDEN` linked to the publication, and an `AuditEvent`. No new `OrgAction`
is needed, so the policy chain is untouched: making a release and sharing links
is `site:update`, opening one from the workspace is `site:read` (with
`reviewerScope`), Go live, schedule and cancel are `site:publish`, and verdicts
are `site:approve`.

**KTD-12. DEC-069's plan owns the `--` rule and the address length.** That
plan owns `site-address.ts`, and this plan asks it to add three things:
1. `addressProblem` refuses any address containing `--`.
2. `test` joins `RESERVED_ADDRESSES`.
3. A new address is at most **57** characters, so `test--<address>` still fits
   one 63-character DNS label.

This plan owns only `test` as a refused first label of a claimed custom
hostname (`domains/dto.ts`, T4), because that is the domains module. Until
DEC-069's unit lands, KTD-7 keeps things safe: a `test--*` label is always
classified as test, so even a site whose subdomain somehow started with
`test--` could never be served as live, and the test lookup would find no site.
T1's migration reports any existing `Organization.slug` or `Site.subdomain`
that contains `--` or is longer than 57 characters (Q8).

**KTD-13. A scheduled go-live is one delayed job, and the release row is the
lock.** `site.go_live` is a Job with `runAt` = the scheduled instant (UTC),
converted from the local date and time with the business zone
(`businessTimezone`, `bookings/staff-availability.ts`) so DST is handled. The
payload carries `{ testReleaseId, goLiveAt }`, ids only.
- **The handler re-reads first.** It locks the release row (`FOR UPDATE`) and
  does nothing if the release has been cancelled, rescheduled (`goLiveAt`
  differs), gone live or been discarded.
- **Then it goes live** through `putLive` as the scheduling user.
- **Cancelling** clears the schedule and deletes the PENDING job in one
  transaction, fenced on `status = 'PENDING'`. A job already PROCESSING answers
  409 "It's going live now".
- **One live schedule per site**, enforced by a partial unique index.

This follows `backend-jobs.md`: an outbox write in the same transaction,
idempotent through the re-read and the row lock, and registered in the same
change.

**KTD-14. A scheduled go-live does not go live if the live site moved after
it was scheduled.** The schedule records `scheduledOverPublicationId` (the live
row at the time). If the live row is different when the job runs, it does
not go live, and the team is told "Didn't go live: the site was published at
3:10pm after this was scheduled. Go live now, or schedule it again." The same
happens if the scheduler has lost `site:publish`, or if the setting is on and
the release is no longer approved and no override was recorded. *Rationale:* a
scheduled older version silently wiping out a later fix is the worst outcome
this feature could have. See Q2.

**KTD-15. Notices go through `team.alert`.** A new alert event, `site`
(`{ event: 'site'; testReleaseId; outcome: 'LIVE' | 'NOT_LIVE' }`), puts one
bell notice in the business's inbox and emails each person who can
`site:publish` and chose email (`notifications/alert-preferences.ts`). The
scheduler is always told, even if they turned site alerts off. Claimed once
per go-live attempt (`team:site:<releaseId>:<goLiveAt>`).

**KTD-16. Rollout sits behind a new flag, `SITE_TEST_RELEASES`.** The flag is
per organization and defaults to off (DEC-013). It gates:
- the release endpoints, which answer 404 when it is off;
- the test-host lookup, which answers 404, so the flag is also a kill switch
  for the host;
- the editor UI and the settings row, hidden per DEC-057's spirit.

A scheduled job that is already queued still runs when the flag is off. It is
an ordinary publish of a version that already exists, and the merchant was told
it would happen.

---

## Implementation units

### T1. Schema: candidate publications, test releases, links, and the approval setting

**Goal:** Every table and column this plan needs, in one additive migration,
with every existing "published" reader narrowed to LIVE rows.

**Requirements:** R1, R8, R10, R12 · **Dependencies:** none

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
  - `Publication.kind String @default("LIVE")` with a CHECK (`LIVE`, `TEST`),
    and `sourcePublicationId String?`
  - `@@index([siteId, kind, publishedAt])`
  - `SiteTestRelease`:
    - identity and content: `id`, `siteId`, `organizationId`,
      `publicationId @unique`, `number`, `name`, `note?`, `fingerprint`,
      `createdByUserId`, `createdAt`
    - lifecycle: `discardedAt?`, `wentLiveAt?`, `livePublicationId? @unique`
    - schedule: `goLiveAt?`, `goLiveZone?`, `scheduledByUserId?`,
      `scheduledOverPublicationId?`, `scheduleOverride Boolean @default(false)`,
      `goLiveJobId?`, `lastGoLiveOutcome?`, `lastGoLiveReason?`
    - `@@unique([siteId, number])`, and a partial unique index on `siteId`
      where `goLiveAt IS NOT NULL AND wentLiveAt IS NULL AND discardedAt IS NULL`
      (one live schedule per site, declared in the schema as a comment and
      created by the migration's SQL, as other partial indexes are)
  - `SiteTestReleaseLink`: `id`, `testReleaseId`, `siteId`, `organizationId`,
    `tokenHash @unique`, `purpose`, `createdByUserId`, `expiresAt`, `revokedAt?`,
    `lastUsedAt?`, `createdAt`
  - `SiteApproval.testReleaseId String?` (indexed); outcome comment adds
    `OVERRIDDEN`
  - `SiteComment.testReleaseId String?`
  - `Site.publishNeedsApproval Boolean @default(false)`
- Create: `packages/database/prisma/migrations/20261020100000_site_test_releases/migration.sql`
  - RLS `org_isolation` on both new tables
  - the partial index
  - a `DO` block that `RAISE NOTICE`s any slug or subdomain containing `--`
    or longer than 57 characters (KTD-12)
- Modify: `apps/api.saroh.in/src/modules/sites/sites.service.ts`
  (`listPublications`, `getPublication`, `restorePublication` read
  `kind: 'LIVE'`; the site `resolveCurrentPublication` select adds
  `kind: 'LIVE'`)
- Modify: `capabilities/readiness/module-readiness.registry.ts`,
  `capabilities/module-backfill.ts` and `admin/admin-metrics.service.ts`
  (count LIVE rows only)
- Modify: `apps/api.saroh.in/src/modules/feature-flags/flags.ts` (add
  `SITE_TEST_RELEASES`, with its deletion plan and reader count)
- Test: `sites/test-release-schema.db.spec.ts`,
  `version-history.service.spec.ts`, `module-readiness` spec

**Approach:** Additive only. Existing rows default to LIVE. There's no
backfill. Posts' publications stay LIVE (`postId` set) and untouched.

**Test scenarios:**
- db: a TEST publication for a site with no live publication. The WEBSITE
  readiness still reads "not published", `listPublications` omits it, and
  `by-subdomain` 404s.
- db: `restorePublication` with a TEST row's id → 404.
- db: a second schedule on the same site violates the partial index.
- db: RLS on, another org can't read either new table (`TEST_RLS=on`).
- Migration replay: `db:verify:replay` is clean (the saroh-migrations skill).

**Verification:** `pnpm --filter @saroh/database db:verify:replay`; unit and
integration suites green.

---

### T2. API: make, list, name and discard test releases, and their links

**Goal:** Merchants can freeze the draft, name it, add a note, share links,
open one themselves, and discard it.

**Requirements:** R1, R3, R6, R12 · **Dependencies:** T1

**Files:**
- Create: `apps/api.saroh.in/src/modules/sites/test-releases.service.ts`,
  `test-releases.controller.ts` (`@RequireModule("WEBSITE")`, guarded like
  `sites.controller.ts`; entry in `module-annotations.spec.ts`),
  `test-release-links.ts` (the mint and hash helpers; reuses
  `hashPreviewToken`'s scheme)
- Modify: `sites/dto.ts` (`CreateTestReleaseDto { name?, note? }`,
  `UpdateTestReleaseDto`, `CreateTestReleaseLinkDto { days: 1 | 7 | 30 }`),
  `sites.module.ts`, `sites.controller.spec.ts` / `sites.guard-chain.spec.ts`
- Test: `test-releases.service.spec.ts`, `test-releases.db.spec.ts`

**Approach:**
- `POST /sites/:id/test-releases` (`site:update`, flag): loads the draft with
  `loadDraftSite`, calls `buildSnapshot(site, now)` (strict: a section that
  fails its contract is a 400 naming it), checks `checkRenderability`, and
  writes the TEST Publication, the `SiteTestRelease` (next `number`,
  `fingerprint = draftFingerprint(snapshot)`) and a first SHARE link (7 days)
  in one transaction. It returns the release and the raw link URL once.
- `GET /sites/:id/test-releases` (`site:read`, `reviewerScope`): the list with
  status (`ready | scheduled | live | discarded`), who and when, the review
  standing, `draftChangedSince` (the current draft fingerprint against the
  release's), the link rows without tokens, and the test host(s).
- `PATCH …/:rid` (name, note), `POST …/:rid/discard`.
- `POST …/:rid/links` (`site:update`: SHARE, with a chosen expiry),
  `POST …/:rid/open` (`site:read`: a 12-hour OPEN link for the caller, which
  is how "Open test release" works from the workspace without anyone holding
  an old token), `POST …/links/:linkId/revoke`.
- The URL is built from `Site.subdomain` and, when set up, the custom-domain
  test host (T3 exposes `testHostsFor(site)`).

**Test scenarios:**
- Happy: make a release. It isn't live, `currentPublicationId` is unchanged,
  and the draft is untouched.
- Edge: two releases in a row get numbers 1 and 2. A default name is
  "Test release 2".
- Error: a MEMBER (`site:read`) can't make one (403). A REVIEWER outside
  `reviewerScope` gets 404.
- Error: the flag is off → 404. A draft with an invalid section → 400 naming
  the page.
- Security: the list never contains a token, and a revoked link's hash no
  longer resolves (T3).

**Verification:** Unit and db specs. `curl` against a local API creates a
release on Northwind and lists it.

---

### T3. API: test-host lookup and the host classifier

**Goal:** The renderer can ask "what does this test host, with this token,
show?", and no live path can answer for a test host.

**Requirements:** R2, R3, R12, R11 (the fail-closed half) · **Dependencies:** T1

**Files:**
- Create: `apps/api.saroh.in/src/modules/sites/site-host-mode.ts`
  (`classifySiteHost`, `testHostsFor`) and `site-host-mode.spec.ts` (the shared
  vector: `test--acme.saroh.app`, `test--acme.saroh.app.localhost`,
  `test.shop.acme.com`, `acme.saroh.app`, `test.saroh.app`, `a--b.saroh.app`,
  mixed case, a trailing dot, a port)
- Modify: `sites/public-sites.controller.ts` (`GET public/sites/test-release`,
  host in a query parameter and the token in `x-saroh-test-token`, `no-store`,
  a `FixedWindowRateLimiter` per client),
  `sites/sites.service.ts` (`getPublicationBySubdomain` and
  `getPublicationByHostname` refuse a test-classified host),
  `site-accounts/site-host.ts` (`resolveSiteHost` refuses a test host
  with its 404), `common/logging/redact.ts` (the token header)
- Create: `sites/test-release-lookup.ts` (the resolver)
- Test: `test-release-lookup.db.spec.ts`

**Approach:**
- The lookup classifies the host (a live host → 404), hashes the token, and
  finds the link joined to its release, TEST publication and site.
- It checks that the link is active, the release isn't discarded or live, and
  the release's site equals the site the host names: the subdomain for
  `test--`, the VERIFIED domain's site for `test.`. Anything else answers 404
  ("missing") or 410 with the reason (`expired | revoked | discarded | live`),
  as preview does.
- It returns `{ snapshot, siteId, modules, release: { name, number,
  madeAt }, liveUrl }` and sets `lastUsedAt`.
- `modules` comes from `publicModulePageStates`, read live.
- It runs inside the site's org RLS context, as `SitePreviewLinksService.resolve`
  does.

**Test scenarios:**
- Happy: a valid token on `test--northwind…` returns the TEST snapshot, not the
  live one.
- Security: the same token on `test--rye…` → 404. A valid token on
  `northwind.saroh.app` (a live host) → 404. `by-subdomain/test--northwind` → 404.
- Security: a relay for `test--northwind…` to `resolveSiteHost` → 404.
- Error: expired → 410 `expired`; revoked → 410 `revoked`; the release went
  live → 410 `live`, with `liveUrl`.
- Edge: `test.shop.acme.com` resolves only while `shop.acme.com` is VERIFIED.
  An exact Domain row for `test.shop.acme.com` is served live, not as test.

**Verification:** Unit and db specs. The classifier vector matches T5's
byte for byte.

---

### T4. API: refuse writes from a test host (the fail-closed guard)

**Goal:** No order, booking, payment, plan join, pack purchase, waitlist
entry, enquiry or sign-in reaches the database from a test host, however the
call got there.

**Requirements:** R4, R12 · **Dependencies:** T3 (the classifier)

**Files:**
- Create: `apps/api.saroh.in/src/common/guards/test-host.guard.ts`,
  `common/decorators/allow-on-test-release.ts`
- Modify: `apps/api.saroh.in/src/main.ts` (register it after `OriginGuard`),
  `orders/public-checkout.controller.ts` (`@AllowOnTestRelease()` on `quote`,
  and on `options` if it is a POST), `domains/dto.ts` (refuse a hostname whose
  first label is `test`)
- Test: `common/guards/test-host.guard.spec.ts`,
  `common/guards/test-host-routes.spec.ts` (walks every controller's metadata:
  each non-GET `public/*` route is guarded or explicitly allowed; the allowed
  list is pinned), `domains.service.spec.ts`

**Approach:**
- The guard classifies `Origin`'s host and the verified relay host
  (`verifySiteRelay`, so a forged relay can't turn test mode on or off).
- Test on either one → `ConflictException({ code: 'TEST_RELEASE', message:
  'This is a test release. Nothing here is ordered, booked or paid.' })`.
- GET and HEAD always pass. `/public/webhooks`, `/public/billing/webhooks`
  and `/public/payments` (the checkout return) are exempt, because they carry
  no browser origin from a test host.

**Test scenarios:**
- Unit: an Origin of `https://test--acme.saroh.app` on
  `POST public/forms/:id/submit` → 409 `TEST_RELEASE`. The same from
  `https://acme.saroh.app` passes.
- Unit: a relay for a test host on `POST public/sites/:id/checkout` → 409.
  The same relay on `quote` → passes.
- Unit: a forged relay naming a test host is ignored, and the route's own 401
  applies.
- Spec: adding an unannotated `@Post` under `public/` fails the route spec
  until it is added to one list or the other.
- Domains: claiming `test.shop.acme.com` → 400 "test. addresses are kept for
  test releases".

**Verification:** Unit specs. The route spec lists today's public writes.

---

### T5. Renderer: the test host, the token gate, noindex and the bar

**Goal:** `test--<address>.saroh.app` renders the release across every route,
behind its link, clearly not live.

**Requirements:** R2, R3, R5, R6, R12 · **Dependencies:** T3

**Files:**
- Create: `apps/saroh.app/lib/site-host-mode.ts` and its `.test.ts` (the vector
  from T3), `lib/test-release.ts` (`getTestRelease(host, token)` and the
  `testMode()` helper that reads the request header),
  `components/test-release-bar.tsx`, `components/test-release-gate.tsx` (no
  link / expired / revoked / discarded / "This is live now" with the live
  link)
- Modify:
  - `apps/saroh.app/middleware.ts`: on a test host, move `?release=` into the
    `__Host-saroh-test` cookie and redirect; with no cookie, rewrite to the
    gate; always delete any incoming `x-saroh-test-release` header, then set
    it from the cookie (so a visitor cannot inject it); a 404 for `/pay/*`
  - `lib/publication.ts`: `getSiteForHost` returns `mode` and `release`, and
    goes to `getTestRelease` on a test host; `getPublicationForHost` and
    `[slug]/not-found.tsx` go through `getSiteForHost`
  - `app/[domain]/layout.tsx`: the bar, `robots: noindex`, no `openGraph` in
    test mode
  - `next.config` `headers()`: `X-Robots-Tag` and `Referrer-Policy` for test
    hosts, assets included
- Test: `lib/site-host-mode.test.ts`, `lib/test-release.test.ts`,
  `middleware.test.ts`
- E2E: `e2e/tests/site-test-release.spec.ts` (new)

**Approach:**
- The bar is renderer chrome, like `PreviewBar`, and wears no Saroh brand
  (G2 and G6 stay green).
- It reads: "**Test release** · ‹name› — Nothing here takes a real order,
  booking or payment." It has a "What's live" disclosure listing R6's items
  ("These come from your live business, not this release").
- It stays pinned at the top and cannot be dismissed. At 320px it wraps to two
  lines and has no horizontal scroll.

**Test scenarios:**
- vitest: the middleware swaps the query for the cookie and strips a forged
  header. Without a cookie, a test host rewrites to the gate.
- vitest: a live host never calls `getTestRelease`.
- E2E (`@covers site:/ site:/shop site:/book site:/account api:sites
  pkg:site-blocks`): make a release through the API on Northwind with a
  stamped name, open `https://test--northwind.saroh.app.localhost/?release=…`.
  - The bar shows the stamped name, and `/shop`, `/book` and `/account`
    render.
  - The response has `x-robots-tag: noindex`.
  - Without the cookie in a fresh context, the gate shows.
  - The live `northwind.saroh.app.localhost` has no bar.
  - Desk and phone.

**Verification:** The four scenes at 320, 390 and 1440, in light and dark;
`check:blocks` green.

---

### T6. Renderer and site blocks: shop, book, checkout, account and forms in test mode

**Goal:** A tester can walk every flow up to the point where it would become
real, and there they see what would have happened, instead of it happening.

**Requirements:** R4, R6 · **Dependencies:** T5, T4

**Files:**
- Create: `packages/site-blocks/src/test-release/{context.tsx,test-release-stop.tsx}`
  (a `TestReleaseProvider` and a `useTestRelease()` hook, exported from
  `index.ts`)
- Modify:
  - Server actions, each calling `testMode()` first and returning
    `{ ok: false, reason: 'test-release' }`:
    `apps/saroh.app/app/[domain]/shop/actions.ts` (`startCheckout`),
    `book/actions.ts` (`bookSignedIn`, `joinWaitlist`, `leaveWaitlist`),
    `account/actions.ts` (`requestSignInCode`, `verifySignInCode`),
    `account/*/actions.ts` (every write), `autopay/actions.ts`
  - Blocks that show the stop where sign-in or submit would be:
    `packages/site-blocks/src/blocks/enquiry.tsx`, the booking flow, the
    bag and checkout, the Prices join and buy
  - `lib/origin.test.ts`'s action list becomes the list `testMode()` is
    asserted against too
- Test: `apps/saroh.app/lib/test-mode-actions.test.ts` (every exported write
  action returns `test-release` in test mode), `packages/site-blocks/src/blocks.test.tsx`
- E2E: extend `site-test-release.spec.ts`

**Approach:**
- The stop is honest and specific. For example: "On the live site, the
  customer signs in here and pays ₹1,240 for 3 items. Nothing is ordered on a
  test release." The booking version: "…books Haircut, Sat 4 Oct, 11:00 with
  Asha. Nothing is booked on a test release."
- Every read keeps working: the catalogue, the quote, availability, the days,
  the visit, On today, the journal.
- The sign-in sheet shows the KTD-9 line.
- No hold is created, because a hold is a write.

**Test scenarios:**
- vitest: every write action in the list refuses in test mode and calls no
  `fetch`.
- site-blocks: `TestReleaseStop` renders the total and items it is given, and
  the enquiry block in test mode never posts.
- E2E: on the Northwind test host, as a new visitor (`asNewVisitor`), add
  `ORDER_LINE` to the bag and reach checkout.
  - The stop shows the total, and the network shows no `checkout` POST.
  - Pick a booking time, and the stop shows it.
  - Submit the contact form, and the stop shows it.
  - Through the API, as Northwind's owner, no enquiry or order carries the
    test's stamp.

**Verification:** The four scenes for the three stops. Break the API (stop it),
and the stop still shows while reads show their failed states, never zeros.

---

### T7. API: Go live now, through one repointing function

**Goal:** Go live puts the release live exactly. Publish, restore and Go live
all share one path, so #279 cannot happen again.

**Requirements:** R8, R13 · **Dependencies:** T2

**Files:**
- Create: `apps/api.saroh.in/src/modules/sites/live-pointer.ts` (`putLive(tx,
  { site, snapshot, source, actor, fingerprint, sourcePublicationId? })` →
  `{ publicationId, publishedAt, bypassed, route }`) and
  `live-pointer.source.spec.ts` (no other `currentPublicationId` write in
  `modules/sites`)
- Modify: `sites.service.ts` (`publishSite`, `restorePublication` call
  `putLive`), `test-releases.service.ts` and `test-releases.controller.ts`
  (`POST …/:rid/go-live`)
- Test: `sites-editing.service.spec.ts` (the bypass cases stay green),
  `test-release-go-live.db.spec.ts`, and `enquiry/live-form-fields` db spec
  (#281 after a go-live)

**Approach:**
- Go live (`site:publish`) locks the release (`FOR UPDATE`). It refuses a
  discarded release, a live one, or one with a PENDING or PROCESSING
  schedule (409 "Cancel the scheduled go-live first").
- It checks `checkRenderability` on the TEST snapshot, because a deploy since
  the freeze could have retired a block. Failure is a 409 naming the section.
- It copies the snapshot with `publishedAt` = now, calls `putLive` with the
  release's `fingerprint`, and sets `wentLiveAt` and `livePublicationId`.
- The response says what it replaced ("replaced the version published 3:10pm
  by Asha").

**Test scenarios:**
- db: make a release, edit the draft, Go live. The live snapshot equals the
  release's, not the draft's (compare `draftFingerprint`), and the draft is
  unchanged.
- db: a CHANGES_REQUESTED stands, then Go live → the route is BYPASSED and a
  BYPASSED `SiteApproval` is linked to the new LIVE row (#279).
- db: a release approved by another user → the route is APPROVED. Approved by
  the person going live → BYPASSED.
- db (#281): the release's enquiry section has a required field `budget`, and
  live does not. After Go live, a submission without `budget` → 400. Before,
  it passes.
- Error: Go live twice → the second is a 409, and no second LIVE row is
  written.
- Source spec: a new `site.update({ data: { currentPublicationId } })`
  anywhere else in `modules/sites` fails.

**Verification:** Unit and db specs; the existing publish and restore specs
unchanged and green.

---

### T8. API: review requests and verdicts on a test release

**Goal:** "Ask for review" and "Approve / Ask for changes" can name a release,
and the review state reads per release.

**Requirements:** R7 · **Dependencies:** T7 (the `sites.service.ts` chain),
T10 (the `test-releases.service.ts` chain)

**Files:**
- Modify: `sites.service.ts` (`requestReview`, `createApproval`,
  `getReviewState`, `createComment`, `listComments` take an optional
  `testReleaseId`), `sites/dto.ts` (`CreateApprovalDto.testReleaseId?`,
  `RequestReviewDto`, `CreateCommentDto.testReleaseId?`),
  `sites.controller.ts`, `test-releases.service.ts` (a `standing` on each list
  row)
- Create: `sites/test-release-review.ts` (`releaseApproved(verdicts, release,
  actorUserId)`, pure)
- Test: `sites-review.service.spec.ts`, `test-release-review.spec.ts`

**Approach:**
- A request or verdict with `testReleaseId` stores the release's
  `fingerprint`, not the draft's. The release must belong to the site and be
  neither discarded nor live.
- `getReviewState(…, testReleaseId)` asks `reviewStandingFor` with the
  release's fingerprint.
- A comment with `testReleaseId` is still pinned to a page and section key.
  The key is checked against the release's snapshot, not the draft.

**Test scenarios:**
- Unit: an approval of release 2 doesn't settle release 3, even with the same
  draft pages, unless the fingerprints are equal. If they are equal, it
  settles both, which is honest: it is the same content.
- Unit: approve, then changes requested on the same release → not approved.
- Unit: approved by the person going live → not approved (KTD-10).
- Error: a verdict on a discarded release → 409.

**Verification:** Unit specs; the existing review specs green.

---

### T9. API: "Publishing needs approval" and the owner override

**Goal:** A business that wants a second pair of eyes gets it enforced, and an
owner can still act in an emergency, on the record.

**Requirements:** R10 · **Dependencies:** T8

**Files:**
- Modify:
  - `sites/live-pointer.ts`: the enforcement is in `putLive`, given `{ gate:
    'direct' | 'release', approved, override }`
  - `sites.service.ts`: `updateSettings` accepts `publishNeedsApproval`
    (OWNER only, with an `AuditEvent`); `publishSite` and
    `restorePublication` accept `override`; `getSite` returns the setting and
    `canOverride`
  - `test-releases.service.ts`: Go live accepts `override`
  - `review-route.ts`: `ReviewRoute.Overridden = "OVERRIDDEN"`
  - `sites/dto.ts`
- Test: `publish-approval.db.spec.ts`, `site-settings.service.spec.ts`

**Approach:**
- Setting off: behaviour is unchanged (DEC-047).
- Setting on:
  - Publish and restore → 409 `{ code: 'APPROVAL_REQUIRED', message: 'This
    site goes live only from an approved test release.' }`.
  - Go live → 409 unless `releaseApproved`.
  - `override: true` from an OWNER passes and records `OVERRIDDEN` three ways
    (KTD-11). `override` from anyone else → 403.
- Turning the setting on while a schedule exists doesn't cancel it. The job
  re-checks at run time (T10).

**Test scenarios:**
- db: setting on, Publish by an ADMIN → 409. By an OWNER without override →
  409. With override → 200 with route OVERRIDDEN, an `OVERRIDDEN`
  `SiteApproval` and an `AuditEvent`.
- db: setting on, an approved release, Go live by an ADMIN → 200 with route
  APPROVED.
- db: an ADMIN turns the setting off → 403. The OWNER → 200 with an
  `AuditEvent`.
- db: restore with the setting on and no override → 409 (Q3).

**Verification:** db specs; `sites.guard-chain.spec.ts` green.

---

### T10. API: scheduled go-live — schedule, cancel, run and tell

**Goal:** "Go live at Fri 6:00pm" works, can be cancelled, and never goes live
in a way the merchant would not expect.

**Requirements:** R9, R10 · **Dependencies:** T7

**Files:**
- Create: `sites/go-live.handler.ts` (`SITE_GO_LIVE_TYPE = "site.go_live"`,
  registered in `sites.module.ts` `onModuleInit`) and `go-live.handler.spec.ts`
- Modify: `test-releases.service.ts` and `test-releases.controller.ts`
  (`POST …/:rid/schedule { date, time, override? }`,
  `DELETE …/:rid/schedule`), `notifications/team-alerts.ts` (the `site`
  event), `notifications/team-alert.handler.ts`,
  `notifications/alert-preferences.ts` (the "Website" alert, default bell on
  and email on for `site:publish` holders), `jobs/job-consumers.spec.ts`,
  `docs/patterns/backend-jobs.md` (a "Scheduled go-live" section)
- Test: `test-release-schedule.db.spec.ts`

**Approach:**
- **Schedule.** `site:publish` and the flag are required. Date and time are
  taken in `businessTimezone`. The instant must be at least 5 minutes ahead
  and at most 60 days. The release must be ready, and there must be no other
  live schedule on the site. With the setting on, the release must be approved
  or carry an owner override.
- **In one transaction:** set `goLiveAt`, `goLiveZone`, `scheduledByUserId`,
  `scheduledOverPublicationId` and `scheduleOverride`, then `tx.job.create({
  type, runAt, payload })` and store `goLiveJobId`.
- **Handler.** It re-reads and locks, and no-ops on a mismatch (KTD-13). It
  re-checks KTD-14 (the live pointer is unchanged, the scheduler still holds
  `site:publish`, and approval is still in place or the override was recorded).
  Then it runs `putLive` as the scheduler and enqueues `team.alert { event:
  'site', outcome }`.
- **When it doesn't go live**, it records `lastGoLiveOutcome = 'NOT_LIVE'` and
  the reason, and clears the schedule, so the merchant can schedule again.
- **Transient errors** throw, and the worker retries. A clear no-go never
  retries.

**Test scenarios:**
- db: schedule for "tomorrow 18:00" in `Asia/Kolkata` → `runAt` is 12:30 UTC.
  Across a DST change in `Europe/London`, the local time is kept.
- db: cancel → the job row is gone, and the release is ready again. Cancel
  while the job is PROCESSING → 409.
- Handler: the job runs twice → one LIVE row and one notice.
- Handler: the site was published after scheduling → not live, a NOT_LIVE
  notice with the reason, and the schedule cleared.
- Handler: the scheduler was removed from the team → not live, and the owner is
  told.
- Handler: the setting was turned on after scheduling, with no approval → not
  live.
- `job-consumers.spec.ts`: the produced type has its handler.

**Verification:** db and unit specs. Locally, schedule 6 minutes ahead on
Northwind (a throwaway release). It goes live, and the bell shows it.

---

### T11. Editor: make, share, schedule and go live

**Goal:** The editor gains a Test releases surface. Publish follows the
approval setting. Nothing the editor can do today goes away.

**Requirements:** R1, R5, R6, R8, R9, R10, R13 · **Dependencies:** T2, T9, T10

**Files:**
- Create:
  - `apps/app.saroh.in/components/sites/test-releases/test-releases-panel.tsx`
  - `components/sites/test-releases/make-test-release-sheet.tsx`
  - `components/sites/test-releases/go-live-sheet.tsx` (now, or at a date and
    time; the owner-override confirmation)
  - `components/sites/test-releases/release-row.tsx`
  - `lib/sites/test-releases.ts` and its `.test.ts` (the status copy and the
    "What's live" list shared with T5's wording)
- Modify:
  - `components/sites/editor/top-bar-actions.tsx`: a "Test release" split
    beside Publish, and Publish reads "Needs approval" while the setting is on
  - `components/sites/editor/use-publish.ts`: `APPROVAL_REQUIRED` handling and
    override
  - `components/sites/editor/status-readout.ts`: "Going live Fri 6:00pm ·
    Diwali menu"
  - `components/sites/editor/editor-panels.tsx`
  - `lib/sites/actions.ts` and `lib/sites/service.ts`
- Test: `lib/sites/test-releases.test.ts`, `components/sites/editor-chrome.test.tsx`
- E2E: `e2e/tests/site-test-release-go-live.spec.ts` (`@serial`)

**Approach:**
- **"Make a test release"** opens a sheet with Name and Note. It shows what
  freezes (pages, menu, footer, look, search settings) and R6's list of what
  stays live. When made, the link shows once, with Copy and Open.
- **Each release row shows:**
  - the name, number, who made it and when, and "Your draft has changed since"
    when it has;
  - its review standing;
  - its links (expiry, last opened, Revoke, New link);
  - the actions Open, Go live…, Schedule…, Cancel schedule and Discard.
- **Go live** says what it replaces. With the setting on and no approval, an
  owner sees "Go live without approval" (a destructive-styled confirmation
  that names the record it leaves). Everyone else sees why it is disabled.
- **Publish while a schedule exists** warns that the scheduled go-live will then
  not run (KTD-14).
- There is no design file for this surface (Q7). It is built in the editor's
  existing language and goes through a design review before merging.

**Test scenarios:**
- vitest: the status copy for ready, scheduled (in the business's zone),
  live, discarded and NOT_LIVE with its reason.
- vitest: without `site:publish`, Go live is disabled and shows the reason.
- E2E `@serial` (`@covers app:/sites api:sites site:/`):
  - make a stamped release on Northwind and schedule it for tomorrow;
  - the top bar says so;
  - cancel it;
  - Go live now, and the live site shows the release's stamped heading;
  - afterwards, restore the previous version (put it back);
  - desk and phone.

**Verification:** The four scenes, with a side-by-side against the editor's
existing sheets. §15: every control that was there before still is.

---

### T12. Review and version history for test releases

**Goal:** Reviewers look at a release, not the draft, and approve that. Version
history tells which live versions came from which release, and which were
overridden.

**Requirements:** R7, R8, R10 · **Dependencies:** T8

**Files:**
- Create: `apps/app.saroh.in/app/(shell)/sites/[siteId]/releases/[releaseId]/page.tsx`
  (renders the frozen snapshot through `past-version-preview.tsx`, with the
  review panel beside it; registered for `check:routes`)
- Modify:
  - `components/sites/review-panel.tsx`, `components/sites/site-review-view.tsx`:
    what is being reviewed, "Draft" or "Test release N · ‹name›", with
    verdicts sent with `testReleaseId`
  - `components/sites/site-versions.tsx`, `components/sites/restore-version.tsx`:
    "From test release ‹name›", an "Overridden by ‹owner›" badge beside
    Bypassed, and scheduled go-lives
  - `lib/sites/service.ts`
- Test: `components/sites/site-versions` tests, `lib/sites/editor-status.test.ts`
- E2E: extend `e2e/tests/site-review.spec.ts` (a reviewer approves a stamped
  release, and the editor row reads Approved)

**Approach:** The in-app release view is read-only and needs no token (it
uses the session and `site:read`). "Open on the test address" mints an OPEN
link (T2).

**Test scenarios:**
- vitest: the version row labels for APPROVED, BYPASSED, OVERRIDDEN and NONE,
  and "from test release".
- E2E: as the seeded reviewer, approve the release, then edit the draft. The
  release still reads Approved, and the draft's own review state is
  unaffected.

**Verification:** The four scenes; the reviewer on phone.

---

### T13. Site settings: "Publishing needs approval"

**Goal:** The owner can turn the rule on and off, and everyone can see that it
is on.

**Requirements:** R10 · **Dependencies:** T9

**Files:**
- Modify: `apps/app.saroh.in/components/sites/site-settings.tsx`,
  `components/sites/settings-rows.tsx`, `components/sites/site-settings-read.tsx`,
  `lib/sites/actions.ts`
- Test: `components/sites/site-settings` test
- E2E: `e2e/tests/site-publish-approval.spec.ts` (`@serial`, on Northwind,
  turned back off at the end)

**Approach:**
- The row reads "Publishing needs approval: only an approved test release can
  go live. You can still go live without approval; it's recorded."
- Only an owner sees the switch. Others see "On · only the owner can change
  this".
- Hidden while the flag is off.

**Test scenarios:**
- vitest: an ADMIN sees the read-only line, and the OWNER sees the switch.
- E2E `@serial`: the owner turns it on, and the editor's Publish reads "Needs
  approval". Turn it off again.

**Verification:** The four scenes.

---

## Rollout

- **Additive and expand-only.** T1's migration adds two tables and nullable or
  defaulted columns. The previous API image ignores them: it never writes TEST
  rows, and its readers see only LIVE rows because no TEST rows exist until the
  new API makes one.
  - If the API is rolled back after TEST rows exist, the old image's
    `listPublications`, the readiness adapter and the admin counts would
    include them. That is harmless, because no live pointer ever names a TEST
    row (KTD-2), but version history would show the rows.
  - Keep `SITE_TEST_RELEASES` off until the API that filters them has been
    live for one release.
- **Ship order:** API units (T1–T4, T7–T10) → renderer (T5, T6) → app (T11–T13).
  - The renderer's test mode is inert until a test host resolves, and it
    cannot resolve before T3's endpoint exists and the flag is on.
  - The app hides everything behind the flag.
- **Migration:** `20261020100000_site_test_releases`, later than
  `20261019100000`, and re-timestamped at merge if this batch's other plans
  land migrations first. It has no backfill. The `DO` block only reports
  (KTD-12).
- **Flag:** `SITE_TEST_RELEASES` (DEC-013), off by default and per
  organization. It turns on in this order:
  1. On Northwind in development, after `site-test-release.spec.ts` and
     `site-test-release-go-live.spec.ts` pass.
  2. On Northwind in production, checked by hand: make, open, the refused
     checkout, go live, restore.
  3. Globally.

  Deletion plan: remove the flag and its 5 readers (the release service, the
  lookup, the schedule endpoint, the app panel, the settings row) one release
  after it is global.
- **Ops:** the wildcard `*.saroh.app` already covers `test--<address>` (one
  label), and so does portless's `--wildcard` locally. `test.<custom domain>`
  needs the merchant's DNS record and the host added to the Vercel project,
  the same manual step as the domain itself (Q4). Until then, the editor offers
  only the `saroh.app` test host for that site.
- **Contract steps (later):** remove the flag. Nothing else, because no column
  is replaced.
- **Docs, in the units that change them:**
  - `saroh-product.md` › Websites (test releases and the approval setting;
    DEC-047 now "advisory unless the site turns it on") — T9
  - `backend-jobs.md` — T10
  - `DEV_LEARNINGS.md` #279: point it at `putLive` — T7
  - `docs/architecture/LOCAL_DEV.md`: the local test-host URL — T5

---

## Waves

Two chains must run one unit at a time:
- **`sites.service.ts` and `live-pointer.ts`:** T7 → T8 → T9. T1 edits only
  the reader narrowing in `sites.service.ts` and lands first.
- **`test-releases.service.ts` and `test-releases.controller.ts`:** T2 → T7 →
  T10 → T8 → T9. T8 adds the standing to list rows, and T9 adds the Go-live
  override.

| Wave | Units (parallel) | Waits for |
| ---- | ---------------- | --------- |
| 1 | **T1** | none |
| 2 | **T2**, **T3**, **T4**\* | T1 (\*T4 needs T3's classifier; start it once T3's `site-host-mode.ts` is merged, or pair them in one worktree) |
| 3 | **T5**, **T7** | T5 ← T3; T7 ← T2 |
| 4 | **T6**, **T10**, then **T8** | T6 ← T5, T4; T10 ← T7; T8 ← T7 and T10 (it starts after T10 merges, because both edit `test-releases.service.ts`) |
| 5 | **T9**, **T12** | T9 ← T8; T12 ← T8 |
| 6 | **T11**, **T13** | T11 ← T2, T9, T10; T13 ← T9 |

The renderer track (T3 → T5 → T6) and the API track (T2 → T7 → T10 → T8 → T9)
run side by side. `schema.prisma` is edited only by T1. `sites/dto.ts` is
edited by T2, T8 and T9 in different waves.

---

## Risks and open questions

**Risks**
- **A 63-character DNS label.** `test--` plus a 58–63-character address is not
  a valid host. KTD-12 asks DEC-069 to cap new addresses at 57, and T1 reports
  any existing ones. A site over 57 gets only the custom-domain test host,
  and the editor says why.
- **Classifier drift between the API and the renderer.** If the two disagree,
  a host could be served as test by one and refused by the other. The shared
  vector, pinned in both test files (T3 and T5), is the guard, as for the
  relay.
- **The write guard's allowlist.** A read-shaped POST that is missed would
  break browsing on a test host, which fails safe. The route spec (T4) makes
  every new public write route choose one list or the other.
- **Rollback visibility** of TEST rows in the old image's version history
  (see Rollout). Mitigated by keeping the flag off until the new API has
  settled.
- **Snapshot size.** Each release stores a full snapshot, and each go-live
  stores a second copy. That is the same cost restore already pays, and it is
  small beside images, which are URLs.

**Open questions (each with a recommended answer)**

**Q1 — Sign-in on a test host.** *Recommended:* off (KTD-9). The account
pages' content is live data, and a first sign-in creates a Contact.
*Alternative:* allow sign-in for accounts that already exist, with a
host-bound session and every account write refused. It costs one more unit and
a `resolveSiteHost` test mode.

**Q2 — A scheduled go-live after someone published directly.**
*Recommended:* don't go live, tell the team why, and let them go live now or
reschedule (KTD-14). *Alternative:* go live anyway, which wipes out the later
publish.

**Q3 — Restore while "Publishing needs approval" is on.** *Recommended:*
owner only, recorded as an override. A rollback is an emergency, and the
owner is who DEC-071 trusts to override. *Alternative:* restore stays open to
`site:publish`, because the version was live once already.

**Q4 — `test.<custom domain>`.** Attaching a host to the Vercel project is
manual today. *Recommended:* ship `test--<address>.saroh.app` for every site
first. The custom-domain test host is shown once the merchant's `test` CNAME
resolves and ops has added the host, with the same check as domain
verification. Automating the Vercel attachment belongs with ADR-009's pending
custom-domain onboarding.

**Q5 — Who can make a test release?** *Recommended:* `site:update`, the
people who edit the site. Making a release shares work and publishes nothing.
Going live stays `site:publish`.

**Q6 — Links after a go-live.** *Recommended:* they stop working, and the
page says "This test release is live now" with the live link. A reviewer
never sees stale content presented as a test.

**Q7 — Design.** There is no `.dc.html` for the Test releases panel, the
go-live sheet or the bar. *Recommended:* a Claude Design pass on those three
before T11 and T5's bar merge. T1–T4, T7–T10 and T6's logic don't wait for it.

**Q8 — Existing addresses with `--`.** *Recommended:* keep any that don't
start with `test--`. They can't be mistaken for a test host, and taking
someone's address away is worse. Any that do start with `test--` (expected to
be none) are renamed by hand with the owner. T1's migration reports them.

---

## Issue list

- T1 — `sites(T1): Test releases schema: TEST publications, SiteTestRelease, links and the approval setting`
- T2 — `sites(T2): Make, name, share and discard a test release`
- T3 — `sites(T3): Test-host lookup and a host classifier that never mixes live and test`
- T4 — `api(T4): Refuse every public write from a test host`
- T5 — `site(T5): Serve a test release at test--<address> behind its link, with the bar and noindex`
- T6 — `site(T6): Shop, booking, checkout, account and forms stop short in test mode`
- T7 — `sites(T7): Go live now through one repointing path (#279, #281)`
- T8 — `sites(T8): Review requests and approvals attach to a test release`
- T9 — `sites(T9): "Publishing needs approval" with a recorded owner override`
- T10 — `sites(T10): Go live at a scheduled time, cancel it, and tell the team`
- T11 — `app(T11): Test releases in the site editor: make, share, schedule, go live`
- T12 — `app(T12): Review a test release, and show releases in version history`
- T13 — `app(T13): Site setting "Publishing needs approval"`

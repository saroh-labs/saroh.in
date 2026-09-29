---
title: "feat: One address — the website is where customers go, storefronts become locations"
type: feat
status: active
date: 2026-09-29
origin: DEC-069
decisions: DEC-069, DEC-068, DEC-071 (the `--` rule), DEC-018, DEC-030, ADR-009, ADR-010, ADR-011, DEC-013, DEC-057
unit-prefix: L
---

# One address: the website is where customers go, storefronts become locations

## Problem frame and scope

A business picks an address at setup (`Organization.slug`). Its first website
takes it as `Site.subdomain` (`apps/api.saroh.in/src/modules/sites/site-create.ts`,
`writeSiteFromTemplate`), and that website is the only public front: `/`,
`/shop`, `/book`, `/account`. The merchant, though, meets something else:

- **Five words for one thing.** Storefront, online store, the Shop/Online
  store kind (`StoreSettings.kind`, `components/stores/storefronts-screen.tsx`),
  the Shop page, and `/shop`. On top of those sits a storefront "Web address"
  (`Store.slug`, `components/stores/store-settings-form.tsx`,
  `create-store-form.tsx`) that goes nowhere, and a `CustomDomain` table that
  nothing reads.
- **"Address" means four things:** the web address, the registered address,
  a storefront's street address, and the blog's posts path ("Writing
  address" in `components/sites/site-settings.tsx`).
- **The address can never change.** `UpdateOrganizationDto` refuses `slug`
  on purpose (`apps/api.saroh.in/src/modules/organizations/dto.ts`). A typo is
  permanent.
- **Pay links live on another domain.** `pay-link-url.ts` builds
  `saroh.app/pay/<token>` and `/pay/o/<token>` for all nine callers.
- **"Share your storefront" shares the site's home page**
  (`apps/app.saroh.in/lib/orders/share.ts`). It uses `<subdomain>.<root>`,
  even when the business has a verified custom domain.
- **A site can still end up with no address.** On `/sites/new`, when the
  business's own address is in use, `writeSiteFromTemplate` sets
  `subdomain = undefined` without saying so.

DEC-068 (batch 4, built) already did some of this:

- the Sell sheet asks "Location name" (`components/modules/turn-on/setup-fields.tsx`);
- choosing delivery or shipping turns Website on after Sell (`lib/modules/turn-on.ts`,
  `turnOnPlan`, `websiteForShop`);
- a taken address comes back as a 409 with `details.suggestion` from
  `freeAddress` (`sites/site-address.ts`).

This plan builds on all three.

**In scope:**

- the Locations / online-shop wording across Sell and Sites (app copy and
  merchant-facing API messages);
- the four address words, named apart;
- changing the web address in Settings, with a 90-day redirect and a
  reservation (a new table);
- DEC-071's rule that an address containing `--` can never be claimed;
- pay links on the tenant host, with old apex links still working;
- share buttons that share the right link;
- selling online leaving the shop page ready to publish;
- site creation that never leaves a site without an address;
- removing `Store.slug` "Web address" and the `CustomDomain` table
  (expand now, contract later).

**Out of scope:**

- Renaming code identifiers (`Store`, `storefrontId`, `/stores/:storeId`
  API routes). Only the words change (KTD-1).
- DEC-071's test hosts (`test--<address>`) and their routing. This plan only
  guarantees that no business can hold such an address.
- DEC-070's kind-driven wording ("your business" / "you").
- Staff tools to release a reserved address early. Custom-domain changes.
  Per-location public pages: a location still has no public address of its
  own.
- Personal and brand words in `RESERVED_ADDRESSES` (a separate, pending list).

---

## Requirements

- **R1** (DEC-069 Words) Storefronts are called **Locations** everywhere a
  merchant reads them: the rail, the command menu, the screens, pickers,
  filters, activity lines and API messages. A location is a place the
  business sells from in person.
- **R2** (Words) **"Your online shop"** is the website's `/shop`, and it
  sells from one location's stock. "Sells from" is reworded to "Your online
  shop sells from ‹Location›".
- **R3** (Words) Each location says whether it sells **in person only** or
  **online too**, and when online, links to the shop.
- **R4** (Words) The four addresses are named apart everywhere:
  - *web address*;
  - *registered address*;
  - *location address*;
  - the blog's *posts path*.
- **R5** (Decision: the business address is the website) The business's web
  address is its website:
  - `<address>.saroh.app`, or the verified custom domain once there is one;
  - one origin, used everywhere Saroh hands out a customer link.
- **R6** (The address can be changed) The **owner** can change the web
  address in Settings. The shape rules and `RESERVED_ADDRESSES` apply.
- **R7** (The address can be changed) The old address **redirects for 90
  days** and stays **reserved to the business**. Nobody else can take it,
  and links already shared keep working.
- **R8** (DEC-071) An address containing `--` can never be claimed by a
  business: at setup, on a site, on a change, or as a suggestion.
- **R9** (Pay links) Pay links are `<origin>/pay/<token>` and
  `<origin>/pay/o/<token>`. `saroh.app/pay/…` is used only when the business
  has no live site, and every old apex link keeps working.
- **R10** (Share buttons) Share buttons share the link that fits: the shop,
  the booking page or the site, on the custom domain when it is verified.
- **R11** (Selling online creates the website) Turning on selling online
  makes the starter site on the business's address (DEC-068). The site sells
  from that location, and the Shop page is ready to publish.
- **R12** (Consequences) Creating a site never leaves it without an address.
  When the address is in use, creation asks for a free one and offers a
  suggestion.
- **R13** (Remove the dead parts) The storefront "Web address" (`Store.slug`)
  and the `CustomDomain` table are removed, expand then contract.
- **R14** (Rollout) The app, renderer and API that are already out keep
  working through every step.

---

## Key technical decisions

- **KTD-1: rename the words, not the code.**
  - `Store`, `storefrontId`, the `stores/:storeId` API routes and the
    `@/lib/stores/*` modules keep their names.
  - The workspace route `/commerce/storefronts` becomes `/commerce/locations`,
    and the old path answers a permanent redirect (bookmarks, emails).
  - *Rationale:* 153 API files and about 60 app files mention "storefront".
    Renaming identifiers would touch the schema, the DTOs and every parallel
    unit for no merchant benefit.
- **KTD-2: the web address is the site's `subdomain` when there is a site,
  else `Organization.slug`. A change moves both in one transaction.**
  - No backfill aligns the two where they differ today (a site that took a
    `freeAddress` variant). The old `Organization.slug` stays a plain
    reservation until the first change.
  - *Rationale:* the site's subdomain is what customers actually reach. The
    slug is only the setup-time promise (`site-address.ts`).
- **KTD-3: one new table, `AddressReservation`**, holding previous addresses:
  - Fields: `organizationId`, `address` `@unique`, `siteId?` (SetNull),
    `redirectUntil DateTime?`, `reservedUntil DateTime`, `createdAt`.
  - An address the business never served (only its old slug) gets
    `redirectUntil = null`: it is reserved, but nothing redirects from it.
  - Expiry is decided when the row is read. No job is needed:
    - a row past `reservedUntil` counts as free;
    - claiming an expired address deletes its row in the claiming
      transaction.
  - Changing back to your own reserved address deletes that row.
  - The table gets the `org_isolation` RLS policy in its own migration.
  - Public reads (the redirect lookup, `addressTaken`) run outside an org
    context, the way `resolveSiteHost` reads `Site` and `Domain`.
  - *Rationale:* DEC-069 asks for "a redirect table and a reserved-until
    date". One unique column means one holder at a time.
- **KTD-4: one "is it free" check.**
  - `addressProblem` gains the `--` rule (R8, "An address can't contain two
    hyphens in a row").
  - `addressTaken` also asks `AddressReservation` (a live row held by another
    business counts as taken).
  - `freeAddress` inherits both.
  - Setup, `/sites/new`, the Turn on sheet and the change endpoint all go
    through these three functions.
  - *Rationale:* `site-address.ts` already exists so the callers cannot
    disagree. `freeAddress` already collapses `-+`, so suggestions never
    contain `--`.
- **KTD-5: the redirect is decided in the renderer, only after a miss.**
  - `middleware.ts` puts the request path and query in an
    `x-saroh-request-path` header on its rewrite.
  - `[domain]/layout.tsx` checks for a move only where it would otherwise
    `notFound()`: `GET public/sites/moved/:address` returns `{ to: <origin> }`
    while `redirectUntil > now`.
  - The layout then `redirect()`s (307, not 308) to the same path on the new
    origin.
  - *Rationale:*
    - A live site costs nothing extra.
    - A temporary status means a browser never caches a hop that stops being
      true after 90 days, when the address may belong to someone else.
    - The layout can't see the path without the header.
- **KTD-6: a tenant host serves the existing pay pages by rewrite, not by a
  new route tree.**
  - The middleware rewrites `<tenant>/pay/<token>` and `/pay/o/<token>` to
    the apex routes `app/pay/[token]` and `app/pay/o/[token]`. The URL keeps
    the tenant host, and the host is passed in `x-saroh-tenant-host`.
  - The public pay read already returns the invoice's business. It now also
    returns `payUrl`, the canonical link built by `payLinkUrlFor`.
  - A tenant host that is not that business's origin gets a 307 to
    `payUrl`. This also covers an old address after its 90 days.
  - The apex route never redirects (R9: old links keep working).
  - *Rationale:*
    - The `[domain]` layout 404s a host with no live publication, and a pay
      link must still open when the site was unpublished after sending.
    - One page, one set of server actions.
    - Redirecting a mismatched host keeps the token on Saroh's own origins
      and never renders one business's invoice under another's name.
- **KTD-7: `payLinkUrlFor(organizationId, token)` is async and reads
  `siteOriginOf`** (`sites/site-origin.ts`, the verified custom domain
  first).
  - The nine callers pass the organization id.
  - Behind the `PAY_LINK_ON_SITE` rollout flag (DEC-013, fail-closed). Off,
    it returns today's apex link.
  - *Rationale:* the flag lets the API ship before the renderer's tenant
    rewrite is live, and turns on only after it is.
- **KTD-8: one origin read for the workspace.**
  - `GET /organizations/:id/web-address` returns:
    - `address`, `origin` (custom domain when verified), `customDomain`;
    - `links: { site, shop, book }`, each null unless live;
    - `previous[]` (address, `redirectUntil`, `reservedUntil`);
    - `canChange`.
  - Share buttons and Settings read it and never assemble
    `${subdomain}.${ROOT_DOMAIN}` themselves.
  - A link is live when:
    - `shop`: `/shop` would serve, meaning `shopRolloutOn`, `commerceOpen`,
      an effective Sells from and at least one listing (`sells-from.ts`);
    - `book`: the booking page is on;
    - `site`: there is a current publication.
  - *Rationale:* six app files rebuild the URL today, and none of them knows
    about custom domains.
- **KTD-9: the address change is owner-only, capped and flagged.**
  - A new policy action `org:address:update` sits in `organization-policy.ts`
    and `capability-catalogue.ts`, `ownerOnly` like `org:delete`.
  - A business holds at most **two** live reservations (see Q2).
  - It sits behind the rollout flag `WEB_ADDRESS_CHANGE` (fail-closed). The
    flag goes on after L3's redirect is in production.
  - *Rationale:*
    - DEC-069 says "by the owner".
    - Every change reserves an address for 90 days, so an uncapped change is
      a way to hoard addresses.
    - A change before redirects exist would break shared links.
- **KTD-10: Sells from picks a location even when it has nothing listed yet.**
  - `automaticStorefront` prefers the one open location with listings, as
    today (G11).
  - When no location has listings and the business has exactly one open
    location, it picks that one.
  - Selling online (DEC-068's `prepareCommerce` + `prepareWebsite`) sets the
    site's Sells from to the location Sell just saved, and adds a draft Shop
    module page through `module-page-create.ts`.
  - *Rationale:* at turn-on no product exists, so G11's rule leaves Sells
    from unset, and the "ready to publish" shop would ask a question the
    merchant has already answered.
- **KTD-11: `Store.slug` goes in two releases.**
  - Expand:
    - the column becomes nullable;
    - the API stops reading and writing it;
    - `UpdateStoreDto.slug` becomes optional and ignored, still declared so
      an old app's request isn't refused by `forbidNonWhitelisted`;
    - the app drops the field;
    - seeds and `backfill/catalogue-settings.ts` stop keying on it.
  - Contract: drop the column, its index, the DTO field, the `CustomDomain`
    table and `Store.customDomains`.
  - *Rationale:* `backend-data-and-money.md` says a destructive change ships
    in two deploys, and migrate-before-serve is not yet wired.
- **KTD-12: the storefront kind stays in the data and is reworded:**
  - `SHOP` becomes **"Customers visit"**: an address, hours and collection.
  - `ONLINE` becomes **"No counter"**: stock kept for online orders.
  - "In person only / online too" is derived, never stored: online too means
    this location is the site's effective Sells from.
  - *Rationale:* DEC-069's line per location answers "does the shop sell
    from here", which is `Site.storefrontId`, not the kind. See Q3.

---

## Implementation units

### L1. The address rules: `--` never claimable, and reservations count

**Goal:** one set of address rules that knows about reservations and about
DEC-071's `--`.

**Requirements:** R7, R8 · **Dependencies:** none

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (`AddressReservation`,
  `Organization.addressReservations`, `Site.addressReservations`)
- Create: `packages/database/prisma/migrations/20261020100000_address_reservation/migration.sql`
  (table, unique, `organizationId` index, `org_isolation` ENABLE and FORCE)
- Modify: `apps/api.saroh.in/src/modules/sites/site-address.ts`
  (`addressProblem`, `addressTaken`, `freeAddress`)
- Modify: `apps/api.saroh.in/src/modules/organizations/organization-onboarding.service.ts`
  (`checkAddress` inherits the rules; no new code beyond the message)
- Modify: `apps/app.saroh.in/lib/organizations/address.ts`
  (`cleanAddressInput` collapses `--` so the preview matches)
- Test: `apps/api.saroh.in/src/modules/sites/site-address.spec.ts`,
  `site-address.db.spec.ts` (new), `apps/app.saroh.in/lib/organizations/address.test.ts`

**Approach:**
- `addressProblem`: after the shape check, a `--` anywhere gives
  "An address can't have two hyphens in a row". This also blocks `xn--`
  labels.
- `addressTaken(db, address, orgId)`:
  - also reads `addressReservation.findUnique({ address })`;
  - a row with `reservedUntil > now` and another `organizationId` counts as
    taken;
  - an expired row, or one of the caller's own, doesn't.
- `Reader` widens to include `addressReservation`. `freeAddress` is
  unchanged beyond that.
- Export `releaseExpired(tx, address)`, which deletes a row whose
  `reservedUntil <= now`. Claimers call it before they write.

**Test scenarios:**
- *Unit:* `a--b`, `test--rye` and `xn--abc` are refused with the message;
  `a-b` passes; `freeAddress("a--b")` suggests `a-b`.
- *DB:*
  - another business's live reservation counts as taken, and one day past
    `reservedUntil` it is free;
  - your own reservation is free to you;
  - `releaseExpired` deletes only expired rows;
  - with `TEST_RLS=on`, business A cannot list B's rows in an org context.
- *DB:* `packages/database/src/rls-coverage.test.ts` passes with the new
  policy.

**Verification:** `db:verify:replay` is clean. Onboarding refuses
`my--shop.saroh.app` inline, in the same words.

---

### L2. Change the web address (API)

**Goal:** the owner changes the address in one transaction. The old one is
reserved for 90 days and redirects. There is one read of the business's web
address and its links.

**Requirements:** R5, R6, R7, R10 (the read) · **Dependencies:** L1

**Files:**
- Create: `apps/api.saroh.in/src/modules/organizations/web-address.service.ts`,
  `web-address.controller.ts`, `web-address.dto.ts`
- Modify: `apps/api.saroh.in/src/modules/organizations/organizations.module.ts`,
  `organization-policy.ts`, `capability-catalogue.ts` (`org:address:update`,
  owner-only)
- Modify: `apps/api.saroh.in/src/modules/feature-flags/flags.ts`
  (`WEB_ADDRESS_CHANGE`, safe default off)
- Create: `apps/api.saroh.in/src/modules/sites/site-moved.ts` (the
  `moved` read); Modify: `public-sites.controller.ts` (registers
  `GET public/sites/moved/:address`)
- Modify: `apps/api.saroh.in/src/modules/capabilities/module-annotations.spec.ts`
  (the new routes)
- Test: `web-address.service.db.spec.ts`, `web-address.controller.spec.ts`,
  `public-sites.moved.db.spec.ts`

**Approach:**
- `GET organizations/:id/web-address` (`org:settings:read`) returns KTD-8's
  shape. `canChange` is the policy answer AND the flag.
  - `shop` is built from `sells-from.ts` (`shopRolloutOn`, `commerceOpen`,
    `effectiveStorefront`, a listing count).
  - `book` comes from the booking page's public switch.
- `GET organizations/:id/web-address/availability?address=` answers
  `{ ok, reason, suggestion }` through `addressProblem`, `addressTaken` (own
  reservations are free) and `freeAddress`.
- `PUT organizations/:id/web-address { address }` (`org:address:update`,
  flag on, else 403 "Changing your web address isn't available yet"):
  1. Serializable transaction. Lock the organization row
     (`SELECT … FOR UPDATE`).
  2. Validate, `releaseExpired(new)`, and refuse a taken address with a 409
     carrying `details.suggestion`.
  3. Refuse a third live reservation: 409 "You can change your address again
     on ‹date›", the date being the oldest `reservedUntil`.
  4. For the old site subdomain, insert a row with
     `redirectUntil = reservedUntil = now + 90d` and its `siteId`. If the old
     `Organization.slug` differs and is not the new address, insert a row
     for it with `redirectUntil = null`.
  5. Delete the business's own reservation of the new address, if any.
  6. Set `Organization.slug` and the site's `subdomain`.
  7. Write an audit event `organization.address_changed { from, to }`.
  8. Same address: 200, no-op.
- `GET public/sites/moved/:address` returns `{ to: origin }` only while
  `redirectUntil > now` and the target site isn't deleted, else 404. It is
  rate-limited like the other public site reads, and a live row is not a
  secret (anyone could follow the redirect anyway).

**Test scenarios:**
- *DB (happy path):* `rye` → `rye-bakery`:
  - the site answers at the new address;
  - the reservation row says 90 days;
  - `moved/rye` → the new origin;
  - onboarding's check says `rye` is taken for anyone else.
- *DB:* change back to `rye` within the window → the row is deleted and
  there is no redirect loop.
- *DB edge cases:*
  - a third change with two live rows → 409 naming the date;
  - an expired reservation of another business is claimable, and its row is
    replaced;
  - a business with no site → only the slug moves, and the row has no
    redirect;
  - a verified custom domain → `origin` is the domain, and `moved` returns
    it.
- *Error paths:*
  - ADMIN → 403;
  - flag off → 403;
  - `a--b`, `admin`, or a taken address → 400/409, with a suggestion on the
    409;
  - two concurrent changes to the same new address → one wins, the other
    409s (serialization).
- *Integration:* `TEST_RLS=on`: a business can't read another's
  reservations through the read endpoint.

**Verification:** on a throwaway business, a `curl` against the renderer's
old host gives a 307 once L3 is in.

---

### L3. The old address redirects for 90 days (renderer)

**Goal:** a visitor to an old address lands on the same page at the new one
while the redirect lasts.

**Requirements:** R7 · **Dependencies:** L2 (the `moved` endpoint)

**Files:**
- Modify: `apps/saroh.app/middleware.ts` (the `x-saroh-request-path` header
  on the tenant rewrite)
- Modify: `apps/saroh.app/app/[domain]/layout.tsx` (the miss asks
  `moved`, then `redirect()`)
- Modify: `apps/saroh.app/lib/publication.ts` (`getMovedTo(host)`: the
  subdomain only, and never for a custom hostname)
- Test: `apps/saroh.app/lib/publication.test.ts`, `middleware.test.ts`,
  `e2e/tests/web-address-change.spec.ts` (created in L4; this unit adds the
  redirect half)

**Approach:**
- Only a miss pays for the lookup (KTD-5). Redirect to
  `${to}${path}${search}`. The path comes from the header; never trust a
  full URL from it, only a path that starts with `/`.
- `/account/*`: the redirect lands the customer on the new host signed out
  (the `__Host-` cookie is host-only, `lib/customer-session.ts`). The
  account area already handles "signed out" there.
- Posts, `/shop/<slug>`, `/book` and `/checkout/<id>` all go through the
  same layout, so one check covers them.

**Test scenarios:**
- *Vitest:* the header is set on the rewrite. A path with `//evil.com` is
  refused (redirect to the root instead).
- *Vitest:* `getMovedTo` → `null` on 404 and on an API error. The page then
  404s as today and never throws.
- *E2E* (`@covers site:/[slug] site:/shop api:organizations api:sites`):
  after L4's change, `old/shop?x=1` → 307 → `new/shop?x=1`.

**Verification:** `pnpm run check:routes` passes. The old host answers 307,
and an unknown host still 404s.

---

### L4. Settings › Business: Web address and Change

**Goal:** the owner sees the web address and changes it with the
consequences stated before saving.

**Requirements:** R4 (the "web address" word), R6, R7 · **Dependencies:** L2

**Files:**
- Create: `apps/app.saroh.in/components/organizations/web-address-section.tsx`,
  `web-address-dialog.tsx`, `apps/app.saroh.in/lib/organizations/web-address.ts`
  (typed client, the availability debounce)
- Modify: `apps/app.saroh.in/app/(shell)/settings/(sections)/organization/page.tsx`,
  `components/organizations/organization-settings-form.tsx` (the section's
  place)
- Create: `e2e/fixtures/own-business.ts` (`makeBusiness`: a business the
  test creates for itself through onboarding, because Northwind's address is
  read by every other spec)
- Test: `web-address-dialog.test.tsx`, `e2e/tests/web-address-change.spec.ts`

**Approach:**
- The row shows "Web address: rye.saroh.app · Open". With a verified custom
  domain it shows "Customers see shop.rye.in; rye.saroh.app still works".
- For anyone other than the owner the row is read-only, with "Only the
  owner can change this." When the flag is off, no Change button appears.
- The dialog:
  - the field with the `.saroh.app` suffix, checked live against
    `/availability`, with "Use ‹suggestion›";
  - then the consequences, before the button:
    - "rye.saroh.app forwards here until ‹date›, then it's released";
    - "Links you've shared keep working until then";
    - "Customers signed in on your site will need to sign in again".
- `previous[]` shows under the row: "rye.saroh.app forwards here until 28
  Dec".
- On save:
  - `router.refresh()`;
  - a toast: "Your web address is now rye-bakery.saroh.app";
  - the API's refusal is shown on the field (frontend-forms).

**Test scenarios:**
- *Vitest:*
  - the owner sees Change and an admin sees the read-only note;
  - a taken address shows the suggestion, and Use fills it;
  - `a--b` → the rule's words;
  - the date is formatted in the business's time zone.
- *E2E* (`@covers app:/settings/organization api:organizations site:/[slug]`,
  owning its data with `makeBusiness`, desk and phone):
  - change the address;
  - the new host serves;
  - the old host → 307 (with L3);
  - the row shows the forwarding date;
  - an ADMIN member sees no Change.

**Verification:** frontend-verification's browser pass on desk and phone.
Nothing is saved on Rye or Pulse.

---

### L5. A site is never made without an address

**Goal:** `/sites/new` and every other creation path either get an address
or ask for one. Existing sites without one are asked before they publish.

**Requirements:** R12, R8 · **Dependencies:** L1

**Files:**
- Modify: `apps/api.saroh.in/src/modules/sites/site-create.ts`
  (`writeSiteFromTemplate`)
- Modify: `apps/api.saroh.in/src/modules/sites/sites.service.ts`,
  `sites.controller.ts` (`GET sites/new-defaults` → `{ siteName, address }`,
  reusing module setup's WEBSITE default logic, which moves to a shared
  `siteDefaults()` in `site-address.ts`)
- Modify: `apps/api.saroh.in/src/modules/capabilities/setup/module-setup.service.ts`
  (calls `siteDefaults()`)
- Modify: `apps/api.saroh.in/src/modules/sites/site-flags.ts` (a blocking
  pre-publish flag: "Choose a web address before publishing")
- Modify: `apps/app.saroh.in/components/sites/create-site-form.tsx` (the
  address field prefilled, with the `setup-fields.tsx` suggestion
  behaviour), `lib/sites/service.ts`
- Test: `site-create.db.spec.ts`, `site-flags.spec.ts`,
  `create-site-form.test.tsx`

**Approach:**
- Not asked for:
  - use the business's own address when it is free to them;
  - otherwise **refuse** with a 409 `{ field: "subdomain", reason: "taken",
    suggestion }`, never `undefined`;
  - `subdomain` is always set on `site.create`.
- The form prefills from `new-defaults`, so a merchant normally never meets
  the 409.
- `releaseExpired` runs before the write (L1).
- An existing site with `subdomain = null` gets the pre-publish flag, which
  links to Settings › Business (L4). That flow sets the site's subdomain
  through `PUT web-address`, and L2 treats a null old subdomain as nothing
  to reserve.

**Test scenarios:**
- *DB:*
  - the business's own address is free → used;
  - it is taken by a site of another business → 409 with a suggestion, and
    no site row is written;
  - an `--` address → 400;
  - Turn on Website still passes `module-setup.db.spec.ts`.
- *DB:* a site with no subdomain → the flag blocks Publish. After L2's
  change it clears.
- *Vitest:* the form shows the prefilled address, and a 409 puts
  "Use ‹suggestion›" on the field.

**Verification:** no code path calls `site.create` without `subdomain`
(grep in the unit's PR description). The audit query (Rollout) is run and
its count recorded.

---

### L6. Pay pages on the business's own address (renderer)

**Goal:** `<tenant>/pay/<token>` and `/pay/o/<token>` open the same pay pages
on the business's host. A wrong host is sent to the right one.

**Requirements:** R9 · **Dependencies:** none (ships before L7 turns its flag
on)

**Files:**
- Modify: `apps/saroh.app/middleware.ts` (a tenant `/pay/…` rewrites to the
  apex route, with `x-saroh-tenant-host`)
- Modify: `apps/saroh.app/app/pay/[token]/page.tsx`,
  `app/pay/o/[token]/page.tsx` (a host mismatch → `redirect(payUrl)`)
- Modify: `apps/saroh.app/lib/invoice-pay.ts` and the order pay reader (read
  `payUrl`)
- Modify: `apps/api.saroh.in/src/modules/payments/public-invoices.service.ts`
  and the public order-pay read (return `payUrl` from `payLinkUrlFor`, which
  this unit creates beside the old functions in `invoices/pay-link-url.ts`)
- Test: `apps/saroh.app/middleware.test.ts`, `app/pay/pay-host.test.ts`,
  `public-invoices.service.db.spec.ts`

**Approach:**
- KTD-6.
  - The comparison is on hostnames, lowercased and without the port.
  - The apex (no tenant header) never redirects.
  - The existing noindex and `no-referrer` metadata stay.
  - The middleware ordering puts the pay rewrite before the account-area
    switch.
- Before `PAY_LINK_ON_SITE` is on, `payUrl` is the apex link. A tenant host
  that somebody typed then redirects to the apex, which is correct.

**Test scenarios:**
- *Vitest:*
  - a tenant `/pay/abc` → rewrite to `/pay/abc` with the header;
  - `/pay/o/abc` likewise;
  - an apex `/pay/abc` → `next()`.
- *DB:* `payUrl` is the custom domain when verified, else the subdomain.
  With the flag off, the apex.
- *E2E* (`@covers site:/pay api:invoices api:payments`, Northwind, an
  invoice the test issues itself):
  - the apex link and the tenant link both open the same invoice;
  - Rye's host with Northwind's token → redirected to Northwind's host.

**Verification:** an existing apex pay link from the seed still opens
unchanged.

---

### L7. Issue pay links on the business's address (API)

**Goal:** every new pay link uses the business's origin, behind a flag.

**Requirements:** R9 · **Dependencies:** L6 (merged, and in production before
the flag goes on)

**Files:**
- Modify: `apps/api.saroh.in/src/modules/invoices/pay-link-url.ts`
  (`payLinkUrlFor`, `orderPayLinkUrlFor`; the sync functions stay for the apex
  fallback)
- Modify the nine callers:
  - `invoices/invoice-send.service.ts`, `invoices/invoices.controller.ts`;
  - `bookings/bookings.controller.ts`;
  - `site-accounts/account-plan.service.ts`;
  - `subscriptions/subscriptions.controller.ts`;
  - `orders/orders.controller.ts`, `orders/organization-orders.controller.ts`;
  - `payments/public-invoices.service.ts`.
- Modify: `apps/api.saroh.in/src/modules/feature-flags/flags.ts`
  (`PAY_LINK_ON_SITE`)
- Modify: `apps/api.saroh.in/src/modules/sites/page-kinds.ts` (`/pay` is added
  to `RESERVED_PAGE_PATHS`: "where your customers pay a link you sent")
- Test: `pay-link-url.spec.ts`, `invoice-send.service.db.spec.ts`,
  `page-kinds.spec.ts`

**Approach:**
- Each caller already has the organization in hand: `ctx.organizationId`, or
  the invoice's or order's `organizationId`.
- `siteOriginOf(orgId)` returns null → apex.
- In a send transaction, the origin is read before the message is composed,
  so the email and the returned `url` match.
- The existing reserved-path check (`reservedAgainst`) then flags a
  free-form page at `/pay`. A static `pay` segment shadows `[slug] = "pay"`
  in the renderer, so such a page would stop being reachable.

**Test scenarios:**
- *Unit:*
  - flag off → `https://saroh.app/pay/t`;
  - flag on with a site → `https://rye.saroh.app/pay/t`;
  - flag on with a verified domain → `https://shop.rye.in/pay/t`;
  - flag on with no live site → the apex.
- *DB:* an invoice sent by email carries the tenant link. A booking pay link
  and an order pay link do too.
- *DB:* a live page at `/pay` is flagged in pre-publish.

**Verification:** turn the flag on for Northwind only (an Organization
override). The workspace's "Copy link" shows `northwind.saroh.app.localhost/pay/…`,
and it opens.

---

### L8. Share buttons share the link that fits

**Goal:** every share and "copy link" for the site, the shop or the booking
page uses the API's origin and the right path, and appears only when that
page is live.

**Requirements:** R10, R5 · **Dependencies:** L2 (the read)

**Files:**
- Create: `apps/app.saroh.in/lib/sites/share-links.ts` (it picks from the
  read's `links`)
- Delete: `apps/app.saroh.in/lib/orders/share.ts` and `share.test.ts`
  (replaced)
- Modify: `apps/app.saroh.in/app/(shell)/commerce/orders/page.tsx`,
  `components/commerce/orders/orders-states.tsx`:
  - "Share your online shop" → `links.shop`;
  - if there is no shop link, "Share your website" → `links.site`.
- Modify: the Bookings first run (`components/bookings/bookings-view.tsx`
  empty state, `components/calendar/calendar-nothing.tsx`): "Share your
  booking page" → `links.book`
- Modify: `components/sites/website-header.tsx`, `site-settings.tsx`,
  `site-settings-read.tsx` (Open, Copy link and the address rows read
  `origin`; no `.saroh.app` is hand-built)
- Test: `share-links.test.ts`, `orders-states.test.tsx`, the bookings
  empty-state test

**Approach:** there is one helper and no string assembly in components. With
a verified custom domain every link uses it. A link that isn't live is never
offered (00-universal §12).

**Test scenarios:**
- *Vitest:*
  - with a shop live → the shop link;
  - with the site live but no shop → the site link and "Share your website";
  - with nothing live → no button;
  - with a custom domain → it is used.
- *E2E* (`@covers app:/commerce/orders app:/bookings api:organizations`):
  the first-run share on a business the test makes copies
  `<address>.saroh.app.localhost/shop`.

**Verification:** a grep of `apps/app.saroh.in` for `.saroh.app` and
`ROOT_DOMAIN}` in components finds only the address field's suffix label.

---

### L9. Sell: Storefronts become Locations

**Goal:** the Sell area's own screens, nav and route say Locations, and each
location says where it sells.

**Requirements:** R1, R3 · **Dependencies:** none

**Files:**
- Move: `apps/app.saroh.in/app/(shell)/commerce/storefronts/**` →
  `commerce/locations/**`. Add a redirect for the old path in
  `apps/app.saroh.in/next.config.*`, and update `scripts/check-app-routes.mjs`
  expectations.
- Modify: `apps/app.saroh.in/lib/stores/links.ts`, `components/shared/nav-items.tsx`,
  `components/shared/command-menu.tsx`, `lib/nav/nav-items.test.ts`
- Modify: `apps/app.saroh.in/components/stores/storefronts-screen.tsx`
  (titles, "New location", "No location yet", the kind choice per KTD-12,
  the name note), `app/(shell)/commerce/storefronts/new/page.tsx`,
  `lib/stores/storefronts.ts` (copy)
- Create: `apps/app.saroh.in/components/stores/location-selling-line.tsx`:
  - "Sells in person only";
  - "Sells in person and online · Your online shop →";
  - "Online only · Your online shop →".
  It reads the site's Sells from (`lib/sites/sells-from.ts`).
- Modify: `docs/patterns/saroh-product.md` ("Storefront and website stay
  separate" → DEC-069's words), `PRODUCT.md` vocabulary
- Test: `storefronts-screen.test.tsx`, `location-selling-line.test.tsx`,
  `e2e/tests/storefront-settings.spec.ts` (labels)

**Approach:** copy only; identifiers stay (KTD-1). The singular rule
(`lib/stores/pick.ts`) stays: one location, no picker. The line links to the
site's Sells from row when the shop isn't live, and to `/shop` when it is.

**Test scenarios:**
- *Vitest:*
  - one location that is the Sells from → "Sells in person and online";
  - one that isn't → "Sells in person only";
  - an ONLINE-kind Sells from → "Online only".
- *E2E* (`@covers app:/commerce/locations app:/commerce/storefronts`):
  - the old path redirects;
  - the rail says Locations, desk and phone.

**Verification:** `pnpm run check:routes` passes. No merchant-visible
"storefront" remains on these screens (a grep plus a screenshot).

---

### L10. Sell: "location" in every other Sell screen

**Goal:** products, stock, orders, customers, discounts, team and activity
say location.

**Requirements:** R1 · **Dependencies:** L9 (its route and link helpers)

**Files (copy only):**
- `apps/app.saroh.in/components/commerce/**`: product page, stock, orders,
  `storefront-chooser.tsx`
- `components/stores/*`: filter, catalogue, discounts, same-email,
  fulfilment, members
- `components/organizations/storefront-team-notice.tsx`,
  `business-hours-section.tsx`
- `lib/settings/activity.ts`, `activity-detail.ts`
- `lib/products/*`, `lib/stock/*`, `lib/orders/list-query.ts`,
  `lib/customers/list.ts`, `lib/customer-workspace/view.ts`,
  `lib/discounts/describe.ts`
- `lib/modules/blocker-copy.ts`, `lib/settings/ready.ts`
- Their tests and the e2e specs asserting these labels

**Approach:**
- "All storefronts" → "All locations"; "At this storefront" → "At this
  location"; "counted at ‹name›" stays.
- Activity lines end "→ Locations".
- A location's street address is labelled "Location address" (R4).
- Out of scope: the chooser's `/{slug}` (removed by L14).

**Test scenarios:**
- *Vitest:* the updated label tests; the activity lines read "→ Locations".
- *E2E:* the existing Sell specs pass with the new labels. No new spec.

**Verification:** a grep for merchant-visible `[Ss]torefront` in
`apps/app.saroh.in/{components,app,lib}` strings is empty, apart from
`sites/**` (L12) and `modules/turn-on/**` (L12).

---

### L11. API messages say location

**Goal:** every refusal, audit summary and notification a merchant reads from
the API says location.

**Requirements:** R1 · **Dependencies:** none

**Files:** merchant-facing strings in `apps/api.saroh.in/src/modules/`:
- `stores/**`, `stock/**`, `orders/**`, `products/**`, `catalogue/**`;
- `customers/**`, `discounts/**`, `organizations/**` (storefront team),
  `audit/**`, `home/**`, `notifications/**`.

Excluded: `sites/**` and `capabilities/setup/**`, which L12 and L13 own.
Specs asserting those messages change with them.

**Approach:**
- Change strings only, never keys, codes or `details.field`.
- "Pick one of this business's open storefronts" → "…open locations".
- Plan-limit copy: "Your plan includes 5 locations".
- Customers never see these, and the site-blocks copy is checked and left
  alone if it is customer-facing.

**Test scenarios:**
- *Unit and DB:* the specs that pin messages are updated.
- *Unit:* a guard test lists the API's thrown `message` strings in the
  scoped modules and fails on `/storefront/i`. It lives in
  `src/common/merchant-copy.spec.ts`.

**Verification:** `pnpm --filter @saroh/api test:unit` and `test:int` pass.

---

### L12. Sites and the Turn on sheet: "Your online shop", and addresses named apart

**Goal:**
- the site's settings, pre-publish flags, blocks and the Sell and Website
  sheets use "Your online shop" and "Sells from ‹Location›";
- the four addresses are named apart.

**Requirements:** R2, R4 · **Dependencies:** L13 (`sells-from.ts`,
`module-setup.*`), L5 (`site-flags.ts`), L8 (`site-settings*.tsx`)

**Files:**
- Modify: `apps/api.saroh.in/src/modules/sites/sells-from.ts`, `site-flags.ts`
  (copy):
  - "Pick which location your online shop sells from…";
  - "Your online shop sells from Online · Change".
- Modify: `apps/app.saroh.in/components/sites/sells-from-row.tsx`,
  `lib/sites/sells-from.ts`, `site-settings.tsx`:
  - "Address" → "Web address";
  - "Saroh address / Subdomain" → "Web address";
  - "Writing address" → "Posts path".
- Modify: `components/sites/block-kinds.ts`, `section-fields/visit-us.tsx`
  ("Location address")
- Modify: `components/modules/turn-on/setup-fields.tsx`,
  `turn-on-sheet.tsx`, `apps/app.saroh.in/lib/modules/turn-on.ts` (the shop
  note: "Your online shop goes on your website at ‹address›/shop")
- Modify: `apps/app.saroh.in/components/organizations/organization-settings-form.tsx`
  and the take-money checklist ("Registered address")
- Test: `sells-from-row.test.tsx`, `turn-on-sheet.test.tsx`,
  `site-flags.spec.ts`

**Approach:** copy only. The registered address keeps its DEC-068 place.
Each label names which address it means.

**Test scenarios:**
- *Vitest:*
  - the row reads "Your online shop sells from Online";
  - the Sell sheet's note names `/shop`;
  - the site settings show "Web address" and "Posts path".
- *Unit:* site-flags' messages.

**Verification:** a browser pass on the site settings and both sheets, desk
and phone.

---

### L13. Selling online leaves the shop ready to publish

**Goal:** after Sell is turned on with delivery or shipping, the website
sells from that location and has a draft Shop page.

**Requirements:** R11 · **Dependencies:** none (builds on DEC-068 M1)

**Files:**
- Modify: `apps/api.saroh.in/src/modules/sites/sells-from.ts`
  (`automaticStorefront` per KTD-10)
- Modify: `apps/api.saroh.in/src/modules/capabilities/setup/module-setup.writers.ts`:
  - `prepareCommerce`: when a site exists without a Sells from, set it to
    the saved location;
  - `prepareWebsite`: when Commerce is on with online ways, add the Shop
    module page as a draft.
- Modify: `apps/api.saroh.in/src/modules/sites/module-page-create.ts` (a
  `tx`-taking variant that skips the per-request authorize, since its caller
  has already authorized)
- Modify: `module-setup.dto.ts` messages ("Give your location a name")
- Test: `module-setup.db.spec.ts`, `sells-from.spec.ts`,
  `module-page-create.db.spec.ts`

**Approach:**
- The two DEC-068 turn-ons run in order: Sell, then Website. Whichever
  writes second completes the link, so the result is the same either way.
- A pickup-only Sell doesn't add a Shop page.
- An existing site keeps its Sells from and its pages. The unit adds only
  what is missing, and a Shop page that already exists is never duplicated.

**Test scenarios:**
- *DB:*
  - a fresh business turns on Sell with Delivery (Website follows) → the
    site's `storefrontId` is the new location and a draft SHOP page exists;
    `/shop` stays 404 until publish and a first product.
- *DB:* pickup only → no Shop page and no site.
- *DB:* a business with two open locations and none listed → Sells from
  stays unset, and the sheet's location is the one chosen.
- *DB:* turned on again → nothing is duplicated.
- *E2E* (`@covers app:/settings/modules api:capabilities api:sites`, a
  business the test makes):
  - turn on Sell with Delivery → Website › Pages shows Shop (draft);
  - the settings read "Your online shop sells from ‹name›".

**Verification:** G11's tests (`public-catalogue.db.spec.ts`) still pass.

---

### L14. Remove the storefront "Web address" (expand)

**Goal:** no merchant sees or sends a storefront slug. The column becomes
nullable and nothing reads it.

**Requirements:** R13, R14 · **Dependencies:** L9 (it shares
`storefronts-screen.tsx`), L11 (it shares `stores/**`)

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (`Store.slug String?`)
- Create: `packages/database/prisma/migrations/20261020110000_store_slug_optional/migration.sql`
  (`DROP NOT NULL`)
- Modify: `apps/api.saroh.in/src/modules/stores/stores.service.ts`:
  - no slug on create;
  - `isSlugAvailable` and the slug update path removed.
- Modify: `stores/dto.ts` (`UpdateStoreDto.slug` optional, ignored, and
  commented "remove in L15"; `CreateStoreDto.slug` likewise)
- Modify: `stores/slug.ts` (deleted if unused), and the
  `module-setup.writers.ts` `freeStoreSlug` (removed)
- Modify: `apps/app.saroh.in/components/stores/store-settings-form.tsx`,
  `create-store-form.tsx`, `components/commerce/storefront-chooser.tsx`, the
  `storefronts-screen.tsx` button ("Description and logo")
- Modify: `packages/database/src/seed/showcase/clinic.ts`,
  `clinic-data.ts` (key by a fixed id), `packages/database/src/backfill/catalogue-settings.ts`
  (name instead of slug)
- Test: `stores.service.db.spec.ts`, `store-settings-form.test.tsx`

**Approach:**
- An old app still sends `slug` and gets 200, with the value ignored.
- The old API image, during rollout, still writes slugs, which is harmless
  on a nullable column.
- The API keeps returning `slug` (null for new locations) until L15, so an
  old app never reads an undefined field.

**Test scenarios:**
- *DB:*
  - creating a location stores `slug = null`;
  - an update carrying `slug` → 200 and unchanged;
  - two new locations → no unique clash.
- *Vitest:* the forms have no Web address field.
- *DB:* `db:seed` runs twice idempotently.

**Verification:** `db:verify:replay` is clean. A grep shows no read of
`store.slug` or `slug:` in `apps/*` or `packages/database/src` apart from
the DTO shim.

---

### L15. Drop `Store.slug` and `CustomDomain` (contract, a later release)

**Goal:** the dead column and table are gone.

**Requirements:** R13 · **Dependencies:** L14 in production for at least one
release, and the app release that dropped the field is live

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (remove `Store.slug`,
  `@@index([slug])`, `Store.customDomains`, `model CustomDomain`)
- Create: `packages/database/prisma/migrations/20261027100000_drop_store_slug_custom_domain/migration.sql`
- Modify: `apps/api.saroh.in/src/modules/stores/dto.ts` (remove the ignored
  field; the API stops returning `slug`)
- Test: `rls-coverage.test.ts` (it still passes without the table),
  `stores.service.db.spec.ts`

**Approach:**
- Before the migration runs, a pre-flight query confirms that `CustomDomain`
  has zero rows in production. If not, stop and ask.
- The migration drops the FK, the indexes, the table, then the column.

**Test scenarios:** *DB:* the suite passes against the pushed schema; replay
is clean.

**Verification:** `db:verify:replay` passes. Production's `CustomDomain`
row count (0) is recorded in the PR.

---

## Rollout

**Additive first. Every step leaves the previous app working.**

1. **Migrations**, all timestamped after 20261019100000 and re-timestamped
   at merge if needed:
   - `20261020100000_address_reservation` (L1): a new table and policy;
     additive.
   - `20261020110000_store_slug_optional` (L14): drop NOT NULL; additive for
     readers.
   - `20261027100000_drop_store_slug_custom_domain` (L15): the **contract**,
     in a later release.
2. **Flags (DEC-013, fail-closed, admin console):**
   - `WEB_ADDRESS_CHANGE` gates L2's `PUT` and L4's Change button.
     - Turn it on only after L3 (the redirect) is live in production.
     - First for one internal business (an Organization override), then
       globally.
   - `PAY_LINK_ON_SITE` gates L7.
     - Turn it on only after L6's tenant rewrite is live on saroh.app.
     - Northwind first.
   - Both are rollout flags, not modules. DEC-057 applies in the sense that
     when a flag is off, the Change button isn't rendered at all: no
     disabled control, and no raw code.
3. **Deploy order:**
   - The API goes before the app for each changed DTO (L2's read, L5's
     `new-defaults`, L14's optional slug).
   - The renderer (L3, L6) can go with or before the API. Its `moved` and
     `payUrl` reads degrade to today's behaviour when the endpoint 404s or
     omits the field.
4. **No backfill writes.** Read-only audits run against production before
   the release. The counts go in the release PR and the answers to Q4/Q5:
   - sites with `subdomain IS NULL` (live or draft);
   - businesses where `Organization.slug` ≠ its site's `subdomain`;
   - any `Organization.slug` or `Site.subdomain` containing `--`;
   - live pages whose path is `/pay`;
   - rows in `CustomDomain`.
5. **The contract steps for later:**
   - L15 (`Store.slug`, `CustomDomain`, the ignored DTO field);
   - removing the sync `payLinkUrl` and `orderPayLinkUrl` and the
     `PAY_LINK_ON_SITE` flag once it has been on everywhere for a release;
   - removing `WEB_ADDRESS_CHANGE` once it has been on globally;
   - the `/commerce/storefronts` redirect stays; it costs nothing.
6. **Docs, the same day as each merge:**
   - DEC-069's Migration line is updated to point at this plan;
   - `saroh-product.md` (L9);
   - `DEV_LEARNINGS.md` gets the `__Host-` cookie point, that customers sign
     in again after an address change (L3).

---

## Waves

A unit waits for the ones named. Within a wave, no two units edit the same
file.

| Wave | Units (parallel) | Why they wait |
|---|---|---|
| 1 | **L1** (schema, `site-address.ts`) · **L6** (renderer pay, `public-invoices.service.ts`, `pay-link-url.ts` add-only) · **L9** (Sell screens, nav, route) · **L11** (API messages outside `sites/`, `capabilities/setup/`) · **L13** (`sells-from.ts`, `module-setup.*`, `module-page-create.ts`) | none |
| 2 | **L2** (after L1) · **L5** (after L1; `site-create.ts`, `site-flags.ts`, `module-setup.service.ts` after L13) · **L7** (after L6; `pay-link-url.ts`, callers, `page-kinds.ts`) · **L10** (after L9) · **L14** (after L9, L11) | the files and endpoints named |
| 3 | **L3** (after L2) · **L4** (after L2) · **L8** (after L2, L10) | L8 shares `orders-states.tsx` with L10 |
| 4 | **L12** (after L5, L8, L13) | shares `site-flags.ts` with L5 and `site-settings*.tsx` with L8 |
| Later release | **L15** (after L14 is in production) | the contract |

Conflict notes:
- **L2 and L5** are both in wave 2. L2 puts the `moved` read in a new
  `site-moved.ts` and only registers it in `public-sites.controller.ts`.
  L5 alone owns `sites.service.ts` and `sites.controller.ts`.
- **L7's `page-kinds.ts` edit** is add-only, and no other unit touches that
  file.

---

## Risks and open questions

**Risks**
- **Customers are signed out after a change.** The session cookie is
  `__Host-` and host-only. The dialog says so (L4), and nothing else breaks.
- **Links older than 90 days break after a change**, for pages other than
  pay links. This covers booking-manage links, order tracking and autopay
  return URLs: once the old address is released they 404, or land on
  whoever claims it next.
  - Pay links are safe (KTD-6 redirects by token).
  - This is DEC-069's 90 days as decided, and it is stated in the dialog.
- **Emails in flight.** A message composed before a change carries the old
  host. The redirect covers it.
- **DEC-071's plan may also add the `--` rule.** Only L1 adds it. DEC-071's
  units use `addressProblem` and must not duplicate it.
- **DEC-070's plan edits the same copy surfaces**: the Turn on sheet and the
  checklists. Merge DEC-070's copy units after L12, or rebase them onto it.
  The words don't conflict ("location" vs "your business").
- **The copy units (L9–L12) are wide.** 60 app files and about 110 API
  strings. The guard tests in L11 and the L10 grep keep a regression from
  slipping back in.

**Open questions (each with a recommended answer)**
- **Q1. How long is the old address reserved?** DEC-069 says it "redirects
  for 90 days and stays reserved to the business", and gives the reservation
  its own date.
  - **Recommend:** reserved for the same 90 days, then released.
  - The alternative is a longer reservation (e.g. a year) after the redirect
    ends. It protects old links from a squatter, but holds addresses longer.
- **Q2. How often can a business change its address?**
  - **Recommend:** at most two old addresses held at once. A third change is
    refused until the oldest one's 90 days end, and the refusal names the
    date.
- **Q3. What do the two location kinds say?**
  - **Recommend:** "Customers visit" (address, hours, collection) and "No
    counter" (stock for online orders), with the derived line "Sells in
    person only / in person and online / online only".
  - The alternative is to drop the kind choice and infer it from whether an
    address is set. That is a behaviour change, and a bigger one.
- **Q4. Existing sites with no address** (from the audit):
  - **Recommend:** don't assign one silently. The pre-publish check blocks
    publishing until the owner chooses (L5).
  - A live site with no address can't exist: it is unreachable, so it has no
    visitors to lose.
- **Q5. Existing addresses containing `--`** (from the audit):
  - **Recommend:** keep any that exist (they can't be claimed anew). A
    `test--*` address would collide with DEC-071's test hosts, so staff
    rename it with the owner before DEC-071 ships.
- **Q6. Should the apex `saroh.app/pay/…` redirect to the business's host
  when it has a site?**
  - **Recommend:** no. It keeps serving as it does today, which is exactly
    "old links keep working" and costs nothing.

---

## Issue list

- L1 — `sites(L1): An address with "--" is never claimable, and a reserved address counts as taken`
- L2 — `organizations(L2): Change the web address, with a 90-day redirect and reservation (API)`
- L3 — `saroh.app(L3): The old web address redirects to the new one for 90 days`
- L4 — `settings(L4): Web address in Settings › Business, with Change for the owner`
- L5 — `sites(L5): A site is never made without a web address`
- L6 — `saroh.app(L6): Pay pages open on the business's own address`
- L7 — `invoices(L7): Pay links use the business's address (PAY_LINK_ON_SITE)`
- L8 — `app(L8): Share buttons share the shop, the booking page or the site, on the custom domain`
- L9 — `commerce(L9): Storefronts become Locations, and each says where it sells`
- L10 — `commerce(L10): "Location" across products, stock, orders, customers and activity`
- L11 — `api(L11): Merchant-facing API messages say location`
- L12 — `sites(L12): "Your online shop sells from", and the four addresses named apart`
- L13 — `capabilities(L13): Selling online leaves the shop ready to publish`
- L14 — `stores(L14): Remove the storefront "Web address" (expand)`
- L15 — `database(L15): Drop Store.slug and CustomDomain (contract)`

## Resolved open questions (user, 2026-09-29)

The user accepted every recommendation in "Risks and open questions" above as written ("all as recommended"). Treat each recommendation as the decision.

Cross-plan (from DEC-071): L1 also bans `--` in any address, reserves `test`, and caps new addresses at 57 characters so `test--<address>` stays a valid DNS label. L1 owns these rules; DEC-071 does not add them again.

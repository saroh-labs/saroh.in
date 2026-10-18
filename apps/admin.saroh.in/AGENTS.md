# admin.saroh.in — the operator console

The console an operator runs one Saroh instance from: its businesses, the
people in them, the operator's own team, releases, the waitlist and the
machinery behind it all. It talks to `api.saroh.in`'s `/admin/*` routes over
HTTP like every other frontend and decides nothing for itself — the API
authorizes, validates and records every read and write. The root `AGENTS.md`
still applies. Plan: `docs/plans/2026-09-23-001-feat-admin-console-plan.md`;
decision: DEC-021.

```bash
pnpm --filter admin dev        # under portless: https://admin.saroh.localhost
```

Signing in needs a staff grant or an address on the API's `ADMIN_ALLOWLIST`
(break-glass). A break-glass operator should grant themselves Platform owner on
`/team` so their own access is on the record.

## Rules that bite here

- **Every screen opens with `requireStaff(permission)`** (`lib/console.ts`)
  and hides what the operator cannot do with `can(...)`. That is a courtesy:
  the API refuses regardless. Staff refused a screen see "Not authorized"
  inside the shell, with the menu of what they can open; only someone who is
  not staff at all gets the bare page (`components/not-authorized.tsx`, #840).
- **Every write is an `OperatorDialog`** (`components/operator-dialog.tsx`):
  it says what will change, asks for a reason, asks for the business's name for
  anything that takes one down, and mints one idempotency key per attempt.
  Bulk retries and replays use `BulkAction`, which always shows the dry run
  first.
- **Deployments (`/deployments`, #886, DEC-107) are Platform Owners' only**,
  through `deployments:run`, which no other role carries. **Each console
  deploys only its own environment** (owner, 9 Oct): admin.saroh.io (dev
  API) deploys dev, admin.saroh.in (prod API) deploys production. The API
  decides, from its `SITE_DEPLOY_ENVIRONMENT`: it lists only that
  environment's rows and refuses a start for the other one (403, audited
  as DENIED); with none set it refuses every start (fail closed) and the
  page says why. The page shows one panel, a row per Cloudflare app, with
  the last successful deploy and the latest run, read from GitHub Actions
  (the API holds no Cloudflare read token, so the Worker's own
  `BUILD_FINGERPRINT` is not shown). Deploy is the one write without an
  `OperatorDialog` for dev: it starts at once (owner, 8 Oct). Production
  opens one that names the app and asks for its Worker's name
  (`saroh-web`), which the API checks too. The API starts
  `deploy-frontends.yml` with `SITE_DEPLOY_GITHUB_TOKEN`, rate-limits it per
  app and environment and per operator, and writes `deployment.start` to the
  audit trail for every start, and for every one refused for its
  environment, by the rate limit or by GitHub. A console deploy always
  builds; merges still deploy only what changed.
- **A legal hold shows wherever a business does** (DEC-122): a "Legal
  hold" badge on the directory (filter "On legal hold") and the summary
  strip, and a notice at the top of the business page with who placed it,
  when and why. Suspend carries the checkbox "Suspended for activity the
  law prohibits — keep its data"; Place legal hold is offered on a business
  already suspended, closing or deleted (`organization:lifecycle:write`),
  and Lift legal hold only to `organization:legal-hold:lift`, which
  Platform Owners alone hold. A held business is offered no Lift
  suspension, Cancel deletion or Schedule deletion: the API refuses them. A
  deleted business's deletion trail opens with "Data kept until ‹date›"
  (180 days after it was deleted, `lib/deletion-words.ts`).
- **Server-only modules stay server-only.** `lib/control-plane.ts` and the
  modules that read through it (`businesses`, `staff`, `people`, `machinery`,
  `waitlist`, `deployments`, `usage`, `business-reports`, `contact-messages`,
  `billing`) import `next/headers`; a client component takes types from them,
  never values. Client-safe words live in `lib/roles.ts`, `lib/modules.ts`,
  `lib/format.ts`, `lib/deployment-words.ts`, `lib/usage-words.ts`,
  `lib/deletion-words.ts`, `lib/billing-words.ts`,
  `lib/billing-action-words.ts`, `lib/user-filters.ts`,
  `lib/sign-in-words.ts`, `lib/user-tabs.ts`, `lib/user-agent.ts`,
  `lib/overview-words.ts`, `lib/module-fix.ts`, `lib/subscription-sheet.ts`,
  `lib/business-words.ts`.
- **Messages (`/messages`, DEC-137)** lists what people wrote from
  saroh.in/contact, newest first, by topic on asking. Read-only: the reply
  goes from the team's mailbox. Every row is personal data, so the screen
  and its `GET /admin/contact-messages` need `organization:pii:read`; it
  adds no permission.
- **Usage (`/usage`, #798)** lists every business by the storage its
  photos and videos use (READY media, in GB as the plan's `storageGb`
  counts it), sorted by the API across all businesses (Most / Least) and
  paged by number. It reads with `organization:read`, the directory's
  permission, so it adds none (DEC-039).
- **Billing (`/billing/invoices`, `/billing/subscriptions`, DEC-163)** shows
  every invoice Saroh issued (with the filtered set's totals, each PDF and a
  month's CSV for GST) and every business's Saroh subscription (a row opens
  its side sheet, admin plan U15: one problem banner, then Summary, History
  and Invoices as addresses, `?sheet=`, `?history=`, `?hpage=`; History is
  `GET …/subscriptions/:id/history`, merged by the API from provider
  events (never their payload), invoices, billing emails and staff
  actions; after a write the list's row lights through
  `SubscriptionChangesProvider`). Read-only. It
  needs `saroh-billing:read`, which only Platform Owners and Billing hold
  (owner, 17 Oct: never Support, Operations, Release manager or Auditor);
  the API checks it on the route and again in the service, and records
  every read. The PDF and CSV are proxied by route handlers under
  `app/billing/invoices/`. Amounts arrive in paise from the API; no price
  is ever written in the console. **Billing is one page** (admin plan U14):
  `app/billing/layout.tsx` draws the header, the four tabs as routes with
  their counts (`GET /admin/billing/counts`) and one search (`q`) for every
  tab; `/billing` lands on Subscriptions. Every filter is an address built
  by `lib/billing-filters.ts` and applies as it is picked (no Apply
  button); `FilterBar` stays for the other screens.
- **Billing's queue and controls (DEC-166)**: `/billing/actions` (Needs
  action: every billing problem an operator must act on, across
  businesses, oldest open first, with the failed `billing.*` jobs beside
  it) and `/billing/events` (what the billing provider sent; "Not
  applied", "No business") read with `saroh-billing:read`. Every write
  (Mark resolved, End autopay, Check the refund again, Sync again, Record a
  refund) is an `OperatorDialog` behind `saroh-billing:act`, which only
  Platform Owners and Billing hold, posted through `lib/billing-actions.ts`.
  They sit on the subscription sheet, so Billing never needs a support
  session; "Open the business" shows only with `organization:view-as`.
  Razorpay ids link to its dashboard (`razorpayDashboardUrl`,
  `rel="noopener noreferrer"`), one test-mode hint per screen. End autopay
  asks for the business's name: it is the business's own Cancel plan.
- **Users (`/users`, admin console U9, R13; People until then, and
  `/people` redirects)** lists everyone with an account: a search and the
  chips No business yet · Email not verified · Owners · Joined this week
  (toggles, `aria-pressed`, any number at once, in the address through
  `lib/user-filters.ts`). A user's page has the tabs Overview · Businesses ·
  Sign-in · History (`app/users/[userId]/…`, the person read once per
  request by the cached `getPerson`). The header's sign-in help (Send a
  sign-in code, Mark verified…, Change sign-in email…, Sign out
  everywhere…, Copy id) shows only with `people:sign-in-help`; Sign out
  everywhere also needs `organization:people:write`. The Overview's banner
  says why someone can't sign in (`lib/sign-in-words.ts`): an unverified
  email, or a changed sign-in email still held for its 24 hours, which a
  second staff member confirms from the Sign-in tab.
- **A business's Overview needs no support session** (admin plan U3):
  `GET /admin/organizations/:id/overview` (`organization:read`, scoped by
  `scopeForStaff`) returns the cards and the tab badges with no personal
  data: team names and roles (never emails), activity as action and time
  (never who or why), notes as a count and date, offers without reasons,
  and who it is billed to only for `saroh-billing:read`. The layout reads
  it once for the badges (`readOverview`); each card's action opens over
  Overview and highlights the card after a write (`useChangeFeedback`).
- **A business's Modules tab (admin plan U4) needs no support session.**
  Its rows are each module's true state (`GET …/modules/state`), and each
  row's one fix opens a sheet listing the gates: Turn on for this business
  (a release override, `flags:publish`, with Undo), Switch on for them
  (`organization:modules:write`), or Only they can do this (Copy steps). A
  fix the operator lacks the permission for shows disabled, saying why.
  Writes go through `moduleReleaseAction` / `switchOnModuleAction`, which
  read the module's state back so the row flips to the truth.
- **A business's details need a support session.** The session id lives in an
  httpOnly cookie per business (`accessCookieName`) and is sent as
  `x-admin-access-session`; without one the page shows the directory row and
  asks for a reason. When it lapses is kept beside it
  (`accessUntilCookieName`), so the header reads "Open until hh:mm" (India's
  time) by Close support access.
- **Website and payments and Team (admin plan U6) stand without a session**
  on the Overview's read: each site and whether it is published, the
  payments connection (only the business can publish or connect, so those
  rows offer Copy steps), and each person's name, role and what it can do
  (`lib/business-words.ts`). Trackers, emails, invitations and Change role…
  / Remove… need the session; Notes and History do too. History is one
  list, the business's own activity and Saroh's team's actions merged
  newest first (`mergeHistory`).
- **Dark by default, not following the system**, on the shared tokens. No
  accent is overridden — the console's Saffron is the base dark one.
- **`Badge` renders a `<div>`.** Never put one inside `<p>` or `<span>`; the
  hydration error it causes blanks nothing but costs a re-render.
- **Nav rows appear only for screens that exist** (`components/console-nav.tsx`),
  filtered by permission. The rail and drawer build it themselves from the
  permissions: a nav item carries its icon, which cannot cross to a client
  component.

## Read first

| When you are about to…                         | Read                                                            |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Add a screen or an `/admin` endpoint behind it | `docs/patterns/backend-auth-and-access.md` (cross-tenant reads) |
| Add a staff permission or change a role        | `apps/api.saroh.in/src/modules/admin/admin-permissions.ts`      |
| Style anything                                 | `docs/patterns/frontend-design-system.md`                       |
| Call a change done                             | `docs/patterns/frontend-verification.md`                        |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

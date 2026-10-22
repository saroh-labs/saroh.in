# Frontend app structure

> **Read when:** adding a route, page, layout, component or `lib/` module in a
> Next.js app.
> Adapted from claude-patterns `frontend/01-app-structure.md`. The library's
> thin-page and `modules/<feature>/` layout is **not** used here; this file
> describes what is. Page templates and container widths: `docs/design-system/04_LAYOUT_SYSTEM.md`.

## The shape of `app.saroh.in`

```
app/
  (shell)/page.tsx             Home: the ranked action list
  (shell)/<area>/layout.tsx    ModuleGate for a capability-gated section
  (shell)/<area>/page.tsx      async Server Component: reads, then renders
  (shell)/<area>/error.tsx     segment boundary that keeps the chrome
  (shell)/<area>/loading.tsx
  (editor)/sites/[siteId]/     the site editor, outside the shell
  onboarding/
lib/<domain>/service.ts        server-only reads and writes via lib/api/http.ts
lib/<domain>/actions.ts        "use server" wrappers that client components call
components/<domain>/           UI for one domain (sites, stores, bookings, crm…)
components/shared/             app shell, navigation, command menu
```

## Rules

- **Current** — **Every shell page renders inside `PageContainer`.**
  `components/shared/page/page-container.tsx` owns the page's gutter and measure, so
  a screen cannot arrive with its own. Four widths: `full` (the whole work
  area, for lists, boards and dashboards), `form` (`max-w-2xl`, create and
  edit forms), the default (`max-w-5xl`, a record) and `wide` (`max-w-7xl`).
  Which screen takes which, and the page header and loader every screen
  shares, are in `frontend-design-system.md` → Components and status and
  `frontend-error-feedback.md`.
  It is LEFT-ALIGNED: centring each page inside its own max-width moved the
  heading between screens, which is what made the app feel unsettled. Full-bleed
  editors — the site editor, the post editor — are deliberately outside it.
  So is the product page (`commerce/products/[productId]/page.tsx`, #523): the
  "Saroh Product Detail" design draws its header, access line, archived
  banner and tab bar edge to edge, each ruled off by a full-width border,
  with a 22px gutter inside them (`px-4 sm:px-[22px]`, the design's own) —
  not PageContainer's 26px. Its header (the one `PageHeader`, with the
  breadcrumb in it since 10 Oct 2026), banners and tab panel carry that
  gutter themselves; keep them in step if one changes.
- **Current** — **Pages are Server Components that read.** A `page.tsx` calls
  `requireSession()` and its `lib/<domain>/service.ts`, and may hold
  view-shaping helpers for that page (`siteState()` in `sites/page.tsx`).
  Business rules belong in the API.
- **Current** — **Reads go through a service, writes through an action.**
  `lib/<domain>/service.ts` builds on `lib/api/http.ts`, which imports
  `next/headers` and so can never reach a client component; the 20
  `lib/<domain>/actions.ts` files are what client components call.
- **Current** — **One server fetcher for the chrome.**
  `components/shared/shell/app-shell.tsx` reads session, organizations, the active
  organization, modules and counts once per render and passes props down.
- **Current** — **Navigation has one source.**
  `components/shared/navigation/nav-items.tsx` feeds the sidebar, the phone tab bar (below 760px) and the
  command menu, and lists only routes that exist; `pnpm run check:routes` fails
  on a link that would 404.
- **Current** — **Capability gating in the UI is an aid, not a permission.** A
  section's `layout.tsx` renders `ModuleGate` (`ModuleOffState` when the
  module is off, so a deep link is covered once), and nav groups carry a
  `moduleKey`. Both fail open when availability is unknown; the API enforces.
  See `saroh-product.md` and `.agents/skills/saroh-module-capability/SKILL.md`.
- **Current** — **One person, one page** (UX-050, #869). Everyone the
  business knows opens at `/contacts/<contactId>`: Customer Detail's screen
  (`components/customers/detail/`) plus the page's own Leads, Enquiries and
  Courses tabs, gated by `lib/contacts/person.ts` (module readiness and the
  role's permissions, never its name). Build every link to a person with
  `personHref` (`lib/contacts/person-href.ts`); `/customers/<id>` only
  redirects, resolving a linked store customer's id to its contact. The
  Contacts list's CRM gate sits on the `(list)` route group, so the person
  page opens with CRM off and drops only the CRM tabs. Two things the old
  contact page did stay (owner, 9 Oct): its delete confirm names what
  deleting ends (`deleteQuestion` and `heldCounts` in
  `lib/contacts/removal.ts`, counted from what the page read; a kind it
  couldn't read is said in general terms), and each unpaid invoice on the
  Invoices tab offers Record payment — Invoice Detail's own
  `RecordPaymentDialog`, on `invoice:write` as there (DEC-098).
  Its header's New order and New booking (#247) are links into the flows
  that already exist — `/commerce/orders?new=1&contactId=` and
  `/bookings?new=1&contactId=` — each shown only with its module on and the
  permission that flow's own button asks (`personNewActions`). The page they
  land on reads the person (`readCustomerPick`) and opens the sheet or
  dialog with them picked; a person it can't read opens it empty. A new
  flow reached from a person takes the same `?new=1&contactId=` rather than
  a copy of the flow on the person page.
- **Adopted** — **Every app has `app/error.tsx` and `app/loading.tsx`,** and a
  route group that can fail on its own gets its own boundary. Gap: templates,
  saroh.in and ui have neither.
- **Adopted** — **Place components by who uses them.** One domain:
  `components/<domain>/`. Several domains in one app: `components/shared/`.
  Another app would need it and it is product-agnostic: `packages/ui`. A block
  on a merchant's site: `packages/site-blocks`, never an app.
- **Current** — **Split big components along their panels.** The site
  editor is the worked example (#260): `site-editor.tsx` only composes, its
  state lives in hooks in `components/sites/editor/` (`use-editor-draft`,
  `-style`, `-selection`, `-viewport`, `-review`, `use-publish`, and
  `use-site-chrome` for the header's name and footer's line, G6) and its
  drawing in panels there (`editor-top-bar`, `editor-rail`, `editor-canvas`,
  `inspector-host`). A new editor panel or piece of editor state goes there,
  not back into `site-editor.tsx`.
- **Adopted** — **A domain folder that grows mixed or big gets feature
  sub-folders** (DEC-183). Group `components/<domain>/` into
  `components/<domain>/<feature>/` when it holds more than three files that
  are unrelated (different screens or features that don't import each other,
  such as a switcher, a closing banner and a setup step side by side), or more
  than about 25 files. Name each folder in kebab-case after what the merchant
  sees (`business-hours`, `pay-instructions`, `team`, `setup`), never after a
  component type (`sheets`, `hooks`). Files keep their kebab-case names and
  feature prefix (`team/team-screen.tsx`); tests and `*.test-kit.tsx` sit
  beside the file they test, as `<subject>.test.tsx` or
  `<subject>.<aspect>.test.tsx`. Pieces two features in the domain share go
  in the folder of the screen that composes them; pieces another domain uses
  go up to `components/shared/` or that domain. No `index.ts` barrels: import
  the file. Inside a folder import with `./`; across folders with
  `@/components/<domain>/<feature>/…`, never `../`. A move is its own
  change, renames and import updates only, and that includes what the
  compiler does not check: `vi.mock` strings, path lists in tests, and
  `tooling/eslint-config-custom/controls-allowlist.js`.
- **Adopted** — **The UI layer is separate from the business layer**
  (DEC-183). A component file (`.tsx`) draws: layout, styling, the words on
  screen, and wiring events to handlers. It holds no business rules. Rules
  and derivations (who may do what, what a value works out to, plurals, the
  words a status maps to) are pure functions in `.ts` files, in
  `lib/<domain>/` when more than one component uses them, otherwise beside
  the component (`team/role-book.ts`), each with unit tests that need no
  render. State and actions (drafts, save, undo, refusals) live in a
  `use-*.ts` hook that calls `lib/<domain>/actions.ts`. The component takes
  data and callbacks and decides only how they look, so restyling or
  rewording a screen never touches a `.ts` file and changing a rule never
  touches a `.tsx` one. Every new component follows it; an existing one moves
  to it when it is next changed, not in a sweep.
- **Current** — **A QR beside a link is `QrButton`** (DEC-118,
  `components/qr/qr-button.tsx`, its panel `qr-panel.tsx`), never a second
  drawing. A page that stays (the website, the shop, the booking page, a
  product) takes `mode: "saved"`: the panel finds the target's code or
  offers "Make this code" as a press of its own, so opening it never
  writes. A link that belongs to one record (a pay link, a preview link)
  takes `mode: "instant"`: drawn in the browser, nothing saved, and it says
  it isn't counted. Draw the button only where there is a link to open
  (absent, not broken), and let the panel finish the job: make, download
  and copy happen in it; "More options" is never a required step. A file
  the API draws (a print PDF) comes through the app's own route
  (`app/api/qr-codes/…/print`, as an invoice's PDF does), so the session
  stays server-side.
- **Current** — **The editor's page menu offers what the API lists** (round-2
  G16): `components/sites/pages-panel.tsx` (the list), `page-settings.tsx`
  (the open page's title, address, In the menu, On the site, Delete) and
  `add-page-panel.tsx` (the kinds in `getSite`'s `addablePageKinds`, then
  Blank page), with their words in `lib/sites/page-menu.ts`. It never
  decides which kinds can be added or which addresses are free; it shows
  the API's refusal and offers its `details.suggestion`. A list section's
  display options (Show as, Photos, Descriptions, Prices, Highlight,
  Button) go through `section-fields/display-options.tsx` and
  `components/sites/choice-field.tsx`, and each option's default is stored
  as absent, so an untouched section publishes as before.

## Titles, and staying out of search

**Current** (12 Oct 2026) — for the three signed-in apps: the workspace,
accounts and the operator console. `pnpm run check:titles` and
`check:security-headers` hold it (prepush and CI).

- **Every page names its tab.** A `page.tsx` exports
  `metadata = { title: "Orders" }` or `generateMetadata`; a client page gets
  a `layout.tsx` beside it that does; a `not-found.tsx` has one too ("Page
  not found", "Order not found"), or the tab keeps the missing page's. A page
  that only redirects needs none. Write the page's name only: the root
  layout's template adds the app's.
- **The workspace tab says whose page it is**: `‹Page› · ‹Business› · Saroh`
  inside a business, `‹Page› · Saroh` before one is chosen. The `(shell)` and
  `(editor)` layouts set the template from the active business
  (`lib/organizations/tab-title.ts`), read once per request with the shell
  (`activeOrganizationOnce`), so it costs no call. The unread count goes in
  front of whatever that makes. A tab inside a section is
  `‹Tab› · Website`, `‹Section› · Settings`.
- **A record is named by its reference or the business's own nouns, never
  by a person.** `Order #1042`, `Invoice INV-0042`, a product, service,
  course, class pack, plan, post or form by its name. A customer, contact,
  lead or subscription stays "Customer", "Contact", "Lead", "Subscription",
  and a booking names its service: no name, email, phone number, date or
  amount. A title shows in the tab strip on a shared screen, in history and
  in bookmarks. In the console a business's page shows the business's name
  and a person's stays "Person".
- **A record's title reuses the page's read.** Wrap the read in React's
  `cache` and hand it to `recordTitle` (`lib/page-title.ts`), which answers
  with the fallback when the record is missing, refused or unread, so the
  title never decides what the page shows (its not-found, its locked card).
- **None of the three is indexed, by design.** The root layout says
  `robots: { index: false, follow: false }`, and every answer carries
  `X-Robots-Tag: noindex, nofollow` from three places that each reach what
  the others can't: next.config `headers()` (what Next answers),
  `withPrivateApp` outermost in `middleware.ts` / `proxy.ts` (what the
  middleware answers itself, the redirect to sign-in above all), and
  `public/_headers` (files Cloudflare serves without the Worker). No
  `robots.txt` Disallow: a blocked crawler never reads the noindex.
- **One share card.** A pasted link to a signed-in page previews what an
  anonymous fetch sees, which is accounts' sign-in page. Its tags are static
  ("Sign in to Saroh", one image, `og:url` and canonical `/login` with no
  query), so the address being opened is never echoed. A page that takes a
  token in its address (`/invite/[token]`, `/reset-password`) keeps a fixed
  title and sets `referrer: "no-referrer"`.

## saroh.in and search

- **Current** (DEC-143) — **A main page of saroh.in has search words of its
  own**, beside what a visitor reads: a plain category `phrase`, a
  `seoTitle` that leads with it and a one-sentence `seoDescription` that
  opens with it (`SearchWords`, `content/types.ts`). The title is
  `pageTitle(seoTitle)`: "‹what the page is› · Saroh", 60 characters or
  fewer, the brand once and last; the description is 150 or fewer. The
  page's first screen says the phrase in plain words. A feature page owns
  "‹X› software", a solution page "software for ‹trade›".
  `content/seo.test.ts` fails a page that breaks any of it. They are claims:
  a row in `MARKETING_CLAIMS.md` first, and no price or plan.
- **A new feature or solution page** is a slug in `content/types.ts` and a
  data set; the nav, the footer, Home's cards, the sitemap and `llms.txt`
  follow from the list. Add it to `e2e/tests/marketing.spec.ts`'s lists. A
  solution with no screen of its own trade captured has no `hero` and no
  segment `shot`: it is drawn as words, never beside another trade's
  screen.
- **The site is built at deploy time and nothing deploys on a schedule.** A
  page dated for a day (`publishOn`) appears with the first deploy made on
  or after it. Anything that answers per request about a dated page asks
  `builtContext()` (the build's moment), not `resourcesContext()` (now).
- **A page that reads an optional query parameter reads it in the
  browser**, through `readAddress` (`lib/page-address.ts`), so the page
  stays one built file: the waitlist form, the link preview tool.
- **A screenshot is files with a `srcset`**, never `next/image`
  (`components/v2/shot-image.tsx`). After a capture run
  `pnpm --filter web shots:sizes --force`.
- **Files Cloudflare serves without the Worker take their headers from
  `public/_headers`**: caching for `/_next/static/*` and `/shots/*`, and
  the security headers. Never an `X-Robots-Tag` there: this site is public.
- **Structured data carries only facts that are set** (`lib/structured-data.ts`,
  `content/company.ts`): no price, rating, review or count, and an offer
  only from a published catalogue once the launch switch is open.

## The other apps

- **Current** — `accounts.saroh.in` is identity UI only, built client-side
  around `authClient` from `@saroh/auth/client`. It has no Server Actions.
- **Current** — `admin.saroh.in` reads through `lib/control-plane.ts`; the API
  decides who is staff.
- **Current** — `saroh.app` renders publications only — `[domain]/` for tenant
  hosts and `preview/[token]/` for drafts — and draws from the `--site-*` layer.
- **Current** — A static route under `saroh.app/app/[domain]/` shadows any
  merchant page at that address, and nothing says so. `/book`, `/shop`,
  `/checkout` and `/account` are reserved page paths for that reason (round-2
  G14, G15; `RESERVED_PAGE_PATHS` in
  `apps/api.saroh.in/src/modules/sites/page-kinds.ts`): the API refuses a page
  there and the pre-publish check flags one made before. A new static route
  needs its address added there too. `/account` is reserved whether or not
  `SITE_ACCOUNT_AREA` is on, because its route answers (or 404s) either way.
- **Current** — Module pages on the live site (round-2 G15,
  `saroh.app/lib/module-pages.ts`): `/book` and `/shop` draw their Book or
  Shop page's sections when one is published (deep links still go to the
  flow or product), `[slug]` draws Prices, Journal and Contact, and all of
  them go through `components/published-page.tsx`. A module page whose
  module is off (the public site read's `modules`) leaves the menu and its
  address shows `ModulePageUnavailable`, never a 404; an unknown state shows
  the page. A menu made only of module pages gets Home in front
  (`siteMenu` in `site-blocks/src/site-chrome.tsx`).
- **Current** — The menu follows the modules at view time only (round-2
  G19). Publish keeps every module page in the navigation with its `kind`;
  `siteMenu` is the one place an entry is dropped, from the read's
  `modules`, so a module turned off or back on needs no republish. Never
  filter the menu at publish. A draft preview gets the same `modules` from
  its read and passes them to `SiteHeader` and its `[slug]`. The main
  button follows the same modules through `lib/header-action.ts`.
- **Current** (20 Oct 2026, DEC-172 U9) — **Booking is one route with the
  step in the address**: `/book?service=…&step=what|who|when|details|pay|done`
  (`site-blocks/src/booking-flow/step-url.ts`), in every look and in
  Classic. A later step is a new history entry, so Back is the step before;
  anything else replaces the entry (`use-step-history.ts`), with no server
  render. A link with no step opens the furthest its choices reach, and a
  step the page can't stand on falls back (`resolveStep`): `pay` from a
  link or a reload goes back to `when`, because the hold is only in the
  page's memory. Only what is safe to share rides the address (the service,
  the person, the day and time in the business's zone, the booking being
  moved, the booked reference); a note, a name, an email, a phone, a code
  or a hold's or payment's token never does (`NEVER`), and other
  parameters (a QR code's `src`) are left alone. A look frames the same
  steps differently; it never adds a route.

## Not adopted

`modules/<feature>/index.tsx` exporting a `<Feature>Module`, and a
mandatory hook → view → index triple for every component. Both assume
client-side data fetching; Server Components already separate reading from
rendering, and the UI/business split above is done by moving rules into `.ts`
files, not by a fixed three-file shape.

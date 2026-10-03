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
  `components/shared/page-container.tsx` owns the page's gutter and measure, so
  a screen cannot arrive with its own. Three widths, the scale
  `docs/design-system/04_LAYOUT_SYSTEM.md` proposed: `form` (`max-w-2xl`,
  settings and create/edit forms), the default (`max-w-5xl`, lists, details and
  dashboards) and `wide` (`max-w-7xl`, tables, boards and analytics grids).
  It is LEFT-ALIGNED: centring each page inside its own max-width moved the
  heading between screens, which is what made the app feel unsettled. Full-bleed
  editors — the site editor, the post editor — are deliberately outside it.
  So is the product page (`commerce/products/[productId]/page.tsx`, #523): the
  "Saroh Product Detail" design draws its header, access line, archived
  banner and tab bar edge to edge, each ruled off by a full-width border,
  with a 22px gutter inside them (`px-4 sm:px-[22px]`, the design's own) —
  not PageContainer's 26px. Its header, banners and tab panel carry that
  gutter themselves, and the crumbs bar above them the design's `9px 14px`
  (`px-3.5`); keep them in step if one changes.
- **Current** — **Pages are Server Components that read.** A `page.tsx` calls
  `requireSession()` and its `lib/<domain>/service.ts`, and may hold
  view-shaping helpers for that page (`siteState()` in `sites/page.tsx`).
  Business rules belong in the API.
- **Current** — **Reads go through a service, writes through an action.**
  `lib/<domain>/service.ts` builds on `lib/api/http.ts`, which imports
  `next/headers` and so can never reach a client component; the 20
  `lib/<domain>/actions.ts` files are what client components call.
- **Current** — **One server fetcher for the chrome.**
  `components/shared/app-shell.tsx` reads session, organizations, the active
  organization, modules and counts once per render and passes props down.
- **Current** — **Navigation has one source.**
  `components/shared/nav-items.tsx` feeds the sidebar, the phone tab bar (below 760px) and the
  command menu, and lists only routes that exist; `pnpm run check:routes` fails
  on a link that would 404.
- **Current** — **Capability gating in the UI is an aid, not a permission.** A
  section's `layout.tsx` renders `ModuleGate` (`CapabilityOffState` when the
  module is off, so a deep link is covered once), and nav groups carry a
  `moduleKey`. Both fail open when availability is unknown; the API enforces.
  See `saroh-product.md` and `.agents/skills/saroh-module-capability/SKILL.md`.
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

## Not adopted

`modules/<feature>/index.tsx` exporting a `<Feature>Module`, and the
hook → view → index split. Both assume client-side data fetching; Server
Components already separate reading from rendering.

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
  `components/shared/nav-items.tsx` feeds the sidebar, the mobile drawer and the
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
- **Adopted** — **Split big components along their panels.** Gap:
  `site-editor.tsx` is 1,548 lines; its sibling `pages-panel`, `style-panel`,
  `review-panel` and `section-fields/` show where the rest goes.

## The other apps

- **Current** — `accounts.saroh.in` is identity UI only, built client-side
  around `authClient` from `@saroh/auth/client`. It has no Server Actions.
- **Current** — `admin.saroh.in` reads through `lib/control-plane.ts`; the API
  decides who is staff.
- **Current** — `saroh.app` renders publications only — `[domain]/` for tenant
  hosts and `preview/[token]/` for drafts — and draws from the `--site-*` layer.

## Not adopted

`modules/<feature>/index.tsx` exporting a `<Feature>Module`, and the
hook → view → index split. Both assume client-side data fetching; Server
Components already separate reading from rendering.

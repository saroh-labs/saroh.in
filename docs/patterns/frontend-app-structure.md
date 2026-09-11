# Frontend app structure

> **Read when:** adding a route, page, layout, component or `lib/` module in a
> Next.js app.
> Adapted from claude-patterns `frontend/01-app-structure.md`. The library's
> thin-page and `modules/<feature>/` layout is **not** used here; this file
> describes what is.

## The shape of `app.saroh.in`

```
app/
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

- **Pages are Server Components that read.** A `page.tsx` calls
  `requireSession()` and its `lib/<domain>/service.ts`, and may hold
  view-shaping helpers for that page (`siteState()` in `sites/page.tsx`).
  Business rules belong in the API.
- **Reads go through a service, writes through an action.**
  `lib/<domain>/service.ts` builds on `lib/api/http.ts`, which imports
  `next/headers`, so it can never reach a client component.
  `lib/<domain>/actions.ts` is what a client component calls.
- **One server fetcher for the chrome.** `components/shared/app-shell.tsx` reads
  session, organizations, the active organization, modules and counts once per
  render and passes props down. Don't fetch chrome data inside a chrome
  component.
- **Navigation has one source.** `components/shared/nav-items.tsx` feeds the
  sidebar, the mobile drawer and the command menu, and lists only routes that
  exist; `pnpm run check:routes` fails on a link that would 404.
- **UI capability gating is an aid, not a permission.** A nav group with a
  `moduleKey` hides when the module is off; the API is the authority (ADR-003,
  `backend-auth-and-access.md`).
- **Every app has `app/error.tsx` and `app/loading.tsx`,** and a route group that
  can fail on its own gets its own boundary. accounts, admin, app and saroh.app
  have them; templates, saroh.in and ui do not yet.
- **Place components by who uses them.** One domain: `components/<domain>/`.
  Several domains in one app: `components/shared/`. Another app would need it
  and it is product-agnostic: `packages/ui`. A block on a merchant's site:
  `packages/site-blocks`, never an app.
- **Split big components along their panels.** `site-editor.tsx` already has
  sibling `pages-panel`, `style-panel`, `review-panel` and `section-fields/`;
  continue that rather than growing the root.

## The other apps

- **`accounts.saroh.in`** is identity UI only, built client-side around
  `authClient` from `@saroh/auth/client`. It has no Server Actions.
- **`admin.saroh.in`** reads through `lib/control-plane.ts`; the API decides who
  is staff.
- **`saroh.app`** renders publications only — `[domain]/` for tenant hosts and
  `preview/[token]/` for drafts — and draws from the `--site-*` layer.

## Not adopted

- `modules/<feature>/index.tsx` exporting a `<Feature>Module`, and the
  hook → view → index split. Both assume client-side data fetching; Server
  Components already separate reading from rendering.

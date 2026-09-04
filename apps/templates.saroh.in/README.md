# templates.saroh.in

Storefront templates for Saroh sites. **Scaffold** — the app shell, design
system and auth status are wired up, but the catalogue itself is not built yet:
`app/page.tsx` renders a "check back soon" placeholder.

Dev port **3010** · package name `ecom-templates` (`pnpm --filter ecom-templates …`)

## What's here

- [`app/layout.tsx`](app/layout.tsx) — the shared shell: `@saroh/ui` globals and
  wordmark, self-hosted Geist and Bricolage Grotesque from `packages/ui/fonts`,
  and `AuthStatus` from `@saroh/auth`
- [`app/page.tsx`](app/page.tsx) — the placeholder

Nothing here reads from an API and there are no environment variables. There is
no `env.ts`, because there is nothing yet to validate.

## Where the real template machinery lives

Not in this app. Site templates are defined and instantiated in
[`packages/templates`](../../packages/templates):

- `manifest.ts` / `registry.ts` — the template definitions and the registry
- `instantiate.ts` — turning a template into a site's initial pages and sections

`api.saroh.in`'s `sites` module calls `instantiate` when a merchant creates a
site, and its specs run the real starter template rather than a fixture. Build
this app against that package rather than defining a second, parallel notion of
a template.

## Local development

```bash
pnpm install
pnpm --filter ecom-templates dev     # https://templates.saroh.localhost
```

## Verification

```bash
pnpm --filter ecom-templates typecheck
pnpm --filter ecom-templates lint
pnpm --filter ecom-templates build
```

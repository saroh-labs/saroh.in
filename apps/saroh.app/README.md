# saroh.app

The public, multi-tenant renderer. It serves the websites merchants publish
from `app.saroh.in` — on `<subdomain>.saroh.app` and on verified custom domains.

Dev port **3009** · package name `sites` (`pnpm --filter sites …`)

## How a request resolves

[`middleware.ts`](middleware.ts) rewrites by hostname. Anything that is not this
service's own apex (`saroh.app`, or `localhost:3009` in dev — so
`acme.localhost:3009` behaves like a real subdomain) is treated as a tenant
lookup and rewritten under `app/[domain]/`. The `domain` route param is the full
request hostname.

[`lib/publication.ts`](lib/publication.ts) then resolves that host to a
**publication snapshot** from the public read API on `api.saroh.in`. That client
sends no auth and no cookies, and the single thing it can read back is a site's
current immutable snapshot. The API returns 404 for unknown or unpublished
sites and never exposes drafts — so a `null` here means "nothing is published at
this address", the page renders a clean 404, and there is no draft data
reachable from this app to render by mistake.

## Rendering

`app/[domain]/page.tsx` renders the home page's ordered sections;
`app/[domain]/[slug]/page.tsx` does the same for any other published page.
[`components/sections/section-renderer.tsx`](components/sections/section-renderer.tsx)
dispatches on section type:

`hero` · `rich-text` · `gallery` · `cta` · `enquiry` · `booking`

`app/[domain]/checkout/[orderId]/` handles storefront checkout.

The section-content types in `lib/publication.ts` are a **local replica** of
`packages/database/src/cms/section-contract.ts` (v1) — Prisma and
`@saroh/database` are not importable here, and ESLint enforces that. Unknown
section types render as nothing rather than crashing, so a server contract that
gains a new type degrades instead of breaking every published site. When the
contract versions up, add the new shapes here too.

> [`lib/fetchers.ts`](lib/fetchers.ts) is a leftover set of DB-free stubs from
> the pre-snapshot renderer and is no longer imported by anything. The live path
> is `lib/publication.ts`.

## Local development

```bash
pnpm install
pnpm --filter sites dev      # http://localhost:3009
```

Visit a tenant as `http://<subdomain>.localhost:3009`. `api.saroh.in` must be
running and the site must be **published** — an unpublished site is a 404 here
by design, not a misconfiguration.

## Environment

See [`env.ts`](env.ts) for the validated schema.

```dotenv
NEXT_PUBLIC_ROOT_DOMAIN=saroh.app        # drives hostname → tenant resolution
API_URL=http://localhost:3333            # server-only; the public read API
NEXT_PUBLIC_API_URL=http://localhost:3333
# REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS=true   # 302 a tenant to its verified domain
# NGROK_URL=                                 # dev tunnel origin
```

`NEXT_PUBLIC_ROOT_DOMAIN` is `saroh.app` — this service's own apex — and it is
the same variable `app.saroh.in` reads when it tells a merchant where their site
lives, so the two cannot disagree. It is **not** `saroh.in`: that is the
marketing site, a different app on a different deployment, and treating it as
this app's apex would answer a request for `saroh.in` with "nothing is published
at this address".

## Verification

```bash
pnpm --filter sites typecheck
pnpm --filter sites lint
SKIP_ENV_VALIDATION=1 pnpm --filter sites build
```

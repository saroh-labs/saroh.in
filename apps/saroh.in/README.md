# saroh.in

The marketing site (Marketing Site V2): what Saroh is, what each part does,
who it is for, and the waitlist until sign-up opens. No page names a
price, a plan limit or what a plan includes until Pricing is published.

Package name `web` (`pnpm --filter web …`) · served at
`https://saroh.localhost` through portless. Design rules: [`DESIGN.md`](DESIGN.md).

## Routes

| Route                         | What it is                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `/`                           | Home                                                                          |
| `/features/[slug]`            | Eight feature pages, one template (`content/features.ts`)                     |
| `/solutions/[slug]`           | Shops, gyms, clinics, one template (`content/solutions.ts`)                   |
| `/pricing`                    | Not published yet: a temporary (302) redirect to `/waitlist`                  |
| `/waitlist`                   | The waitlist, the site's ask while `NEXT_PUBLIC_LAUNCH_MODE=waitlist`         |
| `/api/waitlist`               | POST forwarder to the API's public waitlist endpoint                          |
| `/sitemap.xml`, `/robots.txt` | Every indexable page (`lib/site-pages.ts`); robots keeps crawlers off the API |

Route groups: `(v2)` has the shared nav and footer; `(standalone)` (the
waitlist) draws its own chrome.

Old addresses (the first site's `/modules/*` and `/about`, and V1's `/sell`,
`/website`, `/bookings`, `/contacts`, `/insights`, `/how-it-works`,
`/coming-soon`) redirect to their V2 pages in one 301 hop (none to
`/pricing`): the table is
[`redirects.js`](redirects.js), checked by `redirects.test.ts`.

## SEO

Every page builds its metadata with `pageMetadata()` (`lib/seo.ts`): title,
description, a canonical on `https://www.saroh.in`, Open Graph and a Twitter
large card. Share images are each route's `opengraph-image.tsx`, drawn by
`lib/og-card.tsx`. Home carries Organization and SoftwareApplication JSON-LD,
with no offers (`lib/structured-data.ts`).

## Why the waitlist is a route handler

Only `api.saroh.in` touches the database, so `/api/waitlist` is a thin
forwarder to the public waitlist endpoint there. It stays a server route
rather than the form posting to the API directly: that keeps the API origin
out of the browser bundle, avoids a CORS preflight on the conversion path,
gives one place to sign the visitor's address for the API's rate limit, and
one place to translate the API's answer into the `{status}` shape the form
reads. It answers 500 when `API_URL` is unset rather than acknowledging a
signup it did not store.

## Local development

```bash
pnpm install
pnpm --filter web dev        # https://saroh.localhost
```

The pages render without a backend; the waitlist POST and its launch offer
need `api.saroh.in`.

## Environment

See [`env.ts`](env.ts) for the schema and [`.env.example`](.env.example) for
what each variable does: `API_URL`, `NEXT_PUBLIC_ACCOUNTS_URL`,
`NEXT_PUBLIC_LAUNCH_MODE`, `SITE_RELAY_SECRET`.

## Verification

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

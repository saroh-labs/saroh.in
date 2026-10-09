# Frontend data and state

> **Read when:** reading or writing API data from a Next.js app, or adding
> client or URL state.
> Adapted from claude-patterns `frontend/02-data-and-state.md`. The library
> routes server state through React Query; this repo does not, by design
> (DEC-004).

## Where each kind of state lives — all **Current**

| State                                      | Mechanism                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Server data                                | Server Components through `lib/<domain>/service.ts`, request-cached with React `cache()`                                   |
| Writes                                     | Server Action → service → `mutate()` → `{ ok: true, data }` or `{ ok: false, error }`, then `router.refresh()` or navigate |
| Shareable filters, tabs, the selected page | The URL, read from the page's `searchParams` on the server (8 pages)                                                       |
| Active organization                        | The `active_org` cookie, sent as `x-organization-id`; the API re-validates membership                                      |
| Open/closed, draft input, hover            | `useState` in the component                                                                                                |

There is no client-side server-state library and no global client store.
`@tanstack/react-query` was installed, never used, and removed (`5ec5560`).

## Rules

- **Current** — **A failed read is not an empty read.** `getJson` throws
  `ApiError` on a non-2xx, and `getList` throws rather than returning `[]`. Let
  the error reach the segment boundary, or catch it into a named failed state —
  never into an empty list.
- **Current** — **"We don't know" is `null`, not `[]`.** `AppShell` keeps a
  failed module fetch as `null` so the navigation fails open instead of
  blanking.
- **Current** — **A page that aggregates several sources degrades per source.**
  Home's service attempts each source separately and names the ones that failed,
  rather than failing the whole page (`saroh-product-states` skill).
- **Adopted** — **Refresh server data after a write** with `router.refresh()`, or
  navigate to the new resource; don't mirror server data into `useState` to keep
  it current. Not measured across the app.
- **Current** — **Request-cache reads repeated within one render** with React
  `cache()`, as `getActiveOrgId` in `lib/api/http.ts` does.
- **Current** — **Never trust the client for the organization.** The header is a
  hint; the API derives membership from the session.

## Merchant sites: the page cache — **Current** (#863)

`saroh.app` on its Worker keeps rendered public pages
(`apps/saroh.app/lib/page-cache/`, switch `SITE_PAGE_CACHE`), so a page you
add or change there may be served to the next visitor without rendering.

- **Only a page the render vouches for is kept.** The site layout tags each
  page with its site (`pageCacheRules`); a page that reads products tags
  them (`listsProducts`, `showsProduct`). Untagged pages are never kept.
- **Anything about one visitor, or a read that failed, refuses.** Call
  `dontCachePage(reason)` (`lib/page-cache/site-rules.ts`) when a page shows
  a signed-in customer's data or an "unavailable" state drawn from a failed
  read. The Worker already passes by private paths
  (`lib/private-paths.ts`), previews, review links, test hosts and any
  request with a session cookie (`lib/page-cache/request-rules.ts`); a new
  private path goes in `private-paths.ts`.
- **A live read outside the publication shortens the page's life.** The
  head (trackers, codes; DEC-108) keeps it 60 seconds at most
  (`keepPageAtMost`). Everything else lives `SITE_PAGE_CACHE_TTL` (five
  minutes) unless the API revalidates its tags: a new API write that
  changes what a published page shows queues `site.pages.revalidate`
  (`backend-jobs.md` → Site page cache).
- **Outside the Worker** (`next dev`, Vercel) none of it runs: pages render
  per request, as before.

## If you think you need React Query

You probably need a Server Component read plus `router.refresh()`. Genuine
client-side polling or optimistic updates across many components is a decision
to make explicitly: write it into this file and AGENTS.md → Triggers before
adding the dependency.

# Frontend data and state

> **Read when:** reading or writing API data from a Next.js app, or adding
> client or URL state.
> Adapted from claude-patterns `frontend/02-data-and-state.md`. The library
> routes server state through React Query; this repo does not, by design
> (DEC-004).

## Where each kind of state lives

| State                                      | Mechanism                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Server data                                | Server Components through `lib/<domain>/service.ts`, request-cached with React `cache()`                                   |
| Writes                                     | Server Action → service → `mutate()` → `{ ok: true, data }` or `{ ok: false, error }`, then `router.refresh()` or navigate |
| Shareable filters, tabs, the selected page | The URL, read from the page's `searchParams` on the server                                                                 |
| Active organization                        | The `active_org` cookie, sent as `x-organization-id`; the API re-validates membership                                      |
| Open/closed, draft input, hover            | `useState` in the component                                                                                                |

There is no client-side server-state library and no global client store.
`@tanstack/react-query` was installed, never used, and removed.

## Rules

- **A failed read is not an empty read.** `getJson` throws `ApiError` on a
  non-2xx, and `getList` throws rather than returning `[]`. Let the error reach
  the segment boundary, or catch it into a named failed state — never into an
  empty list.
- **"We don't know" is `null`, not `[]`.** `AppShell` keeps a failed module
  fetch as `null` so the navigation fails open instead of blanking.
- **Refresh server data after a write** with `router.refresh()`, or navigate to
  the new resource. Don't mirror server data into `useState` to keep it
  current.
- **Request-cache reads repeated within one render** with React `cache()`, as
  `getActiveOrgId` in `lib/api/http.ts` does.
- **Never trust the client for the organization.** The header is a hint; the
  API derives membership from the session.

## If you think you need React Query

You probably need a Server Component read plus `router.refresh()`. Genuine
client-side polling or optimistic updates across many components is a decision
to make explicitly: write it into this file and AGENTS.md → Triggers before
adding the dependency.

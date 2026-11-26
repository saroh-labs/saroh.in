# Frontend data and state

> **Read when:** reading or writing API data from a Next.js app, or adding
> client or URL state.
> Adapted from claude-patterns `frontend/02-data-and-state.md`. The library
> routes server state through React Query; `app.saroh.in` adopts it screen by
> screen (DEC-259). Everything else stays server-rendered (DEC-004).

## Where each kind of state lives

Two patterns run side by side. A route is one or the other, never both
(boundary rule below). The registry is `lib/query/rq-routes.ts`.

- **Current** — the Server Component + `router.refresh()` pattern, for every
  route not yet migrated, for `accounts`, `saroh.app` and `admin`.
- **Adopted** — React Query, for the routes in the registry (DEC-259). Home
  first; it is Current per section as each screen ships.

| State                                      | Unmigrated route (**Current**), accounts, merchant sites, admin                                                                                                                                       | Migrated `app.saroh.in` route (**Adopted**)                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Server data                                | Server Components through `lib/<domain>/service.ts`, request-cached with React `cache()`                                                                                                              | Read in the browser by `useQuery` through `lib/<domain>/use-<domain>.ts`, over a GET read route; the server awaits only the gates |
| Writes                                     | Server Action → service → `mutate()` → `{ ok: true, data }` or `{ ok: false, error }`, then `router.refresh()` or navigate. Called from the client through `runAction` (`frontend-error-feedback.md`) | The same Server Action, called through `useActionMutation`, which declares `invalidates`; no `router.refresh()`                   |
| Shareable filters, tabs, the selected page | The URL, read from the page's `searchParams` on the server                                                                                                                                            | The URL; the value is part of the query key                                                                                       |
| Active organization                        | The `active_org` cookie, sent as `x-organization-id`; the API re-validates membership                                                                                                                 | The same cookie; the organization id is also in every key and sent with every read and write, and the server refuses a mismatch   |
| Open/closed, draft input, hover            | `useState` in the component                                                                                                                                                                           | `useState` in the component                                                                                                       |

There is no global client store. React Query holds server state only, in
`app.saroh.in`, and nowhere else.

## Boundary rule: a route is React Query or refresh, never both

- Routes are registered by **route glob** in `lib/query/rq-routes.ts`, not by
  domain.
- On a registered route anything that shows changeable data is a Client
  Component reading a query; the server component checks access and renders
  the frame, nothing more (DEC-259, amended 24 Nov 2026).
- A registered route never calls `router.refresh()`. An unregistered route keeps
  it. The exceptions are chrome a write changes on the server (unread count,
  tab title, module badges, active business name), listed in
  `lib/query/chrome-refresh.ts` and capped.
- Mixed state lasts at most one batch: a domain's routes migrate together.

## React Query — **Adopted** (DEC-259)

- **One definition.** A domain's `lib/<domain>/queries.ts` defines the key
  factory and each read once; the browser calls the read route, which pairs
  the read with its service (`ServerRead`). A contract test per domain
  (`expectReadContract`) asserts the service and the route give the same JSON.
- **Hooks, not fetches.** Components import `use-<domain>.ts`; none writes its
  own fetch or key. Presentational components stay props-in; a thin container
  calls the hook.
- **Data loads on the client** (owner, 24 Nov 2026; DEC-259 amended). The
  page awaits only gates: session, the active business, role and permissions,
  module guards, redirects, `notFound`/`forbidden`, and facts that decide what
  is offered (payments on, the business's zone, money shown). It renders the
  container and **prefetches no display read**: no `prefetchRead`, no
  `HydrationBoundary`.
- **The real screen at once, skeletons only where data goes** (owner,
  25 Nov 2026). Before its first `useQuery` lands the container draws the
  screen's real frame from the page's gate props: heading, header actions
  (New, Add, Export), tabs, filters, search, date and view switchers. They
  work at once: a search or filter typed before the data keys the read as
  usual. Only the data regions are skeletons, drawn with the route loader's
  own pieces (`PageLoading bare` with a region shape: `rows`, `figures`,
  `panels`, `home`, `calendar`, `diary`), so `loading.tsx` and the container
  share one source of shapes and nothing moves when the rows replace them.
  A control that depends on the data (a count, Export, Count stock, a
  bulk select) is a `FigureLoading` bar, disabled or left out until then,
  never a wrong number or a 0; a figure bar is a span (a div inside a `<p>`
  breaks hydration). The failed state stays what it was (`throw` to
  `error.tsx`, or the screen's own in its region). A record's page whose
  title, tabs and actions all come from the record keeps its loader
  (`skeleton`) until the record lands. Check it on a throttled build: the
  first row's region at the same y before and after the data. A screen that draws several queries
  waits for the ones that would otherwise say "couldn't be read" while still
  on their way. A record's page may keep a `notFound` only when it shares the
  tab title's `cache()`d read (`readOrderOnce`, `readInvoiceOnce`). What a
  screen says from its data (a moment, the first-run share, Home's news)
  comes with that screen's read, never from a page that read it first.
- **Security, unchanged.** Every read goes through a read route (`readRoute`:
  session, `x-organization-id` = the active business or 409, same origin, GET
  only, `private,no-store`, generic errors); the API checks membership,
  paused seats and permission on every call; no screen's data is in the
  page's HTML (the shell's own seed is, on a full load: see below); the middleware sends a signed-out request for a page to
  sign-in and a read route answers it 401; the cache is per business key and
  cleared on sign-out in every tab.
- **Keys.** `[domain, orgId, kind, ...params]`, built only through
  `domainKey(domain, orgId)`, a branded tuple; a key without the organization
  fails the typecheck. Each mutation declares `invalidates`; invalidation fires
  only on `ok !== false`, and the mutation resolves after the refetch settles.
  Optimistic updates only where DEC-259 names them.
- **A screen whose address is its key** (the calendar's `?month`, `?view`):
  its links stay `<Link>`s and change the address in place
  (`<ScreenPending inPlace>`, `history.pushState`, no server render); the
  container reads `useSearchParams`, keys the query on what it asks for,
  holds the last answer greyed (`keepPreviousData`) until the new one lands,
  and Back draws a seen one from the cache. The page and the container turn
  the address into the key through one pure function (`calendarAt`).
- **Sibling routes drawn in place** (Settings › Team, Your profile,
  Business, Modules, Integrations, Plan and billing, Your data and
  Activity): each page checks its own gate and renders one client screen
  (`SettingsTabScreen`) that draws the tab its address names; the side
  list's links between them `pushState` (`onNavigate`) instead of asking the
  server, and the title follows the address. Their reads are `settings`
  tier, so a tab seen before is drawn with no read. A save there reads the
  tab shown again and marks the others stale (`useSettingsSave`); one the
  shell draws (a membership, an invitation: who is paused) calls
  `afterSettingsSave()`; a role or membership marks `['organizations']`
  stale. Nothing `router.refresh()`es; the Business tab's actions keep their
  `revalidatePath` (the header's name, the words for what is set up), and
  "Help improve Saroh" revalidates the layout, whose gate starts the
  recorder. Modules, Integrations and Plan and billing are keyed under
  `settings` too (`['settings', orgId, 'modules' | 'providers' |
'billing']`), so one Settings save reads them; a module on or off, a
  provider connected or disconnected, a plan, an add-on or a payment
  confirmed calls `afterSettingsSave()` (the rail). Their parts shared with
  a screen still drawn on the server (Change plan, a module's gate) draw it
  again only off a React Query route (`useServerRefresh`). The side list's
  Integrations line follows Integrations' read once held.
- **A write from a shared component** (a sheet used by a React Query screen
  and by a server-rendered one, like the bookings cancel sheet): it saves
  through the domain's save context (`useBookingSave`), whose default is
  `runAction` then `router.refresh()` and whose React Query provider is
  `useActionMutation` with the tab's business and nothing after. The page
  puts the provider around everything that writes, New booking's host too.
- **Optimistic quick edits** (Products only, owner 23 Nov 2026: archive or
  publish, add stock, price): a control calls the screen's
  `QuickEdits.run(ids, patch, action)` (`components/commerce/quick-edits/`);
  the host (`useQuickEditsHost`) writes the patch into every cached list page
  and the product's reads (`lib/products/cache.ts`), runs the action with the
  tab's business, puts the snapshot back on any refusal and hands the refusal
  to the caller untouched, and reads Products once after a save that landed.
- **A record's read route** (`/api/products/[productId]`): the read's path
  names the segment (`path: "/api/products/[productId]"`), `apiRead` fills it
  from the param of that name, and `readRoute` takes it from Next's segment,
  never from the query (named again there, a 400). Another business's id is a 404.
- **A React Query page is not `force-dynamic`**: the session cookie already
  makes it dynamic, and `force-dynamic` turns off Next's fetch memo, so two
  readers of one URL in a render (the shell and a module gate) both reach
  the API. Read routes keep it.
- **A business switch keeps the cache** (owner, 25 Nov 2026): every key is
  `[domain, orgId, ...]`, so businesses sit side by side and a switch back
  draws from cache at once, reading again behind it (`gcTime` 30 min). The
  switch's Server Action sets the cookie, which makes Next render the page
  in the action's own response: no `router.refresh()` after it, that was a
  second render. It announces `switch` on a `BroadcastChannel`; the other
  tabs `router.refresh()`. A tab never hears its own message (each carries
  the tab's id; BroadcastChannel only skips the sending object).
- **Sign-out is the only `clear()`**, announced the same way; the other tabs
  clear and reload.
- **A business gone from the list** (removed or left elsewhere): when a
  fresh `['organizations']` replaces the held one, that business's keys are
  removed (`dropLeftBusinesses`). Membership is still the API's to check on
  every read, and a route answers 409 when the key's business isn't the
  open one.
- **How fresh a read is comes from its tier** (owner, 25 Nov 2026; see
  [Reads by how often they change](#reads-by-how-often-they-change)), not
  one `staleTime` for all; `retry: false`, no refetch on window focus or
  reconnect (live refresh owns those).
- **The business list is the exception** (owner, 24 Nov 2026):
  `['organizations']`, the person's and not a business's, is held for the
  whole visit (`staleTime` and `gcTime` `Infinity`), seeded from the shell's
  server read and marked stale only by its writers (create, rename, leave,
  an invitation taken: `invalidateOrganizations()`). A 409
  `org_mismatch` or a non-role 403 on a read marks it stale and draws the
  page again once. On the server a render asks the API for the list once:
  `getActiveOrgId` and `organizationsOnce` share `memberOrganizations`; read
  the list through `organizationsOnce` (or `resolveActiveOrganization()`),
  never `listOrganizations`, which is for a Server Action that changed it.
- **Never cached:** billing secrets, API keys, tokens, provider credentials. A
  key, a webhook address, an AI app's connection or a data download crosses
  its route field by field (a key as its `prefix`); a new key's token or a
  webhook's secret is shown once from its action's own answer, and a
  download's link is made when Download is pressed (Settings › API and AI
  apps, Your data; tested with a leaky API answer). The
  dehydrate allowlist (`dehydrate-allow.ts`) stays explicit, though no page
  dehydrates any more.

### Reads by how often they change

Every `defineRead` names its `tier` (`lib/query/freshness.ts`), and
`pnpm check:query-keys` fails a read without one. The tier sets `staleTime`,
`gcTime` and `refetchInterval`; the API stays the boundary, the tier only
decides how often the browser asks.

| Tier       | Who changes it                  | Rule                                                                                                                                                                                                                      | Reads                                                                                                                                                                                                                                           |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings` | someone in Settings, rarely     | `staleTime`/`gcTime` `Infinity`; read again by its saves (`afterSettingsSave()`, which tells the other tabs on the `BroadcastChannel`), by any 403 on a read (`onReadError`, once per 10 s), and quietly every 10 minutes | `/api/shell`, Settings › Team, Your profile, Business, Modules, Integrations, Plan and billing, Share, API and AI apps' tabs (not Usage), Locations (the list, a location), categories, Product settings                                        |
| `records`  | the team                        | `staleTime` 5 min; its own saves invalidate what they changed                                                                                                                                                             | products, product, customers, customer, requests, invoices, invoice, invoice summary, stock levels, log, checks, order options, Home setup, Settings › Your data, Activity, discount codes, discount code, collections, reviews, review invites |
| `live`     | customers and the outside world | `staleTime` 30 s; the 45 s live refresh and coming back to the tab read it again (no timer of its own)                                                                                                                    | Home, orders, order, tickets, bookings list and diary, calendar, `/api/shell/live`, API usage (Refresh reads it), notifications                                                                                                                 |

- **Before moving a page to the browser, list what its server render did besides reading data** (a refusal with its own wording, a remount after `revalidatePath`, a redirect) and keep each on purpose; run the screen's browser specs (`pnpm prepush --e2e`) before calling it done (DEV_LEARNINGS, 25 Nov).
- **The shell reads in the browser.** The `(shell)` layout's server render
  reads only what a gate needs: the session, the business list, the open
  business (the role) and, only when needed, a closing business's refunds
  and the person's recording choice. What the rail, top bar, tab bar,
  command menu and plan banners draw is one `settings` read, `/api/shell`
  (modules, plan locks and banners, sites, storefronts, Track stock, the
  account manager, Ask AI, the Website area switch), and the bell and the
  rail's badges are one `live` read, `/api/shell/live`, which the live
  refresh reads again on every page (`shell-reads.tsx`). Until the settings
  land the frame is drawn with skeleton rows in the rail and tab bar; a
  badge, a count and a plan banner appear when their read does.
- **On a full load the layout seeds the shell's two reads** (owner,
  25 Nov 2026): a document request (`sec-fetch-dest: document`) makes
  `AppShell` start `readShellSettings()` and `readShellLive()` without
  awaiting them (`startShellSeed`) and hand the promises to `ShellSeed`,
  which fills `['shell', orgId, 'settings' | 'live']` from them in a layout
  effect, after hydration and before the readers subscribe, so they join
  that read and neither `/api/shell` nor `/api/shell/live` is asked. The
  frame streams at once and the answers follow later in the same response
  (the HTML carries only the shell's own fields, as the route sends them,
  `toWire`; never a screen's data). A seed that failed asks its route once;
  every later read of the key is the route's (a save's
  `afterSettingsSave()`, the live refresh, a 403, another tab). A client
  render (`router.refresh()`, a Server Action, a switch) starts nothing:
  Next strips its `RSC` headers, so the check is the browser's
  `sec-fetch-dest`. Keyed by the business like every key; a switch never
  clears another's. Its gates and the seed share the request's `cache()`d
  reads (`activeOrganizationOnce`, `modulesForRequest`, `stockTrackingOnce`).
- **A save that changes a shell setting calls `afterSettingsSave()`** after
  it worked: a module on or off, a plan, an add-on or checkout, Ask AI on or
  off, a new site or web address, a storefront made or closed, Track stock.
  A new kind of setting the shell draws adds its writers here.

### The read-route contract

Every `app/api/<area>/route.ts` is built with `readRoute(...)` and nothing else:

- `export const dynamic = "force-dynamic"`; GET only, no side effects; every
  other method answers 405.
- `Cache-Control: private, no-store` and `Vary: Cookie` on every answer, errors
  included. The edge never caches `/api/*`.
- The organization is resolved on the server. The client sends the one it
  believes it is in; when that equals the `active_org` cookie it is settled
  without the business list (the API refuses a non-member or a paused seat on
  every call, a 403 that marks the tab's list stale). Otherwise
  `getActiveOrgId()` decides (fails closed: none is 401), and a difference
  answers 409 `{ code: "org_mismatch" }` with no data.
- Params are an allowlist parsed per route; unknown params are rejected, page
  size and search length are capped.
- Generic bodies only (400, 401, 403, 404, 409, 429, 503): no upstream message, stack
  or id. Another organization's id is a 404, never a 403.
- Same origin only: reject cross-site requests, send no CORS headers.
- Each handler authorises itself, with the same per-domain gate
  (`lib/<domain>/access.ts`) its page uses, run before the service. Each route
  has a test that proves the gate across owner, member, Reviewer, calendar-only,
  signed-out and another organization's id.

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
- **Current** — **A draft copied from a published version says which one.**
  The admin console's plans draft sends the version it copied when it
  starts (`baseVersion`), and the API refuses the start, and later the
  publish, when a newer version has been published since
  (`catalogue-writes.service.ts`, `components/plans/draft-store.tsx`). The
  page is read again when it comes back into view
  (`components/plans/use-page-return.ts`); a page the browser's Back
  restored is loaded again, because Next drops a `router.refresh()` asked
  for as it restores. DEV_LEARNINGS, 13 Oct 2026.

## The screen updates by itself: live refresh — **Current** (10 Oct 2026)

One hook, `useLiveRefresh` (`components/shared/live-refresh/use-live-refresh.ts`),
mounted once in the app shell by `LiveRefresh`. It is `router.refresh()`,
nothing more: the server reads the page again and React keeps what is on
screen. No page keeps a timer of its own, and there is still no client
cache.

- **When.** On coming back to the tab (`visibilitychange`) and on the
  connection returning (`online`), on every page. Every 45 seconds while
  the tab is in view, only on the pages in `LIVE_ROUTES`
  (`lib/live/refresh.ts`): Home, Orders and its tickets, the bookings
  calendar and list, Notifications. A new watched page is added there,
  by exact address, never a record's own page or a form.
- **Never** while a sheet, a dialog or the command menu is open, while a
  field is being typed in, while a form on the page was typed into and
  not sent, while the tab is hidden or the browser is offline, or while a
  refresh is still on its way (`pageBusy`, one at a time).
- **Unsaved work holds it.** `useLeaveGuard` holds the shared signal
  (`holdLiveRefresh`) for every guarded form while it is dirty. A screen
  with unsaved work and no leave guard calls `holdLiveRefresh()` itself
  and lets go when it is saved.
- **On a React Query route** (`lib/query/live-routes.ts`, route glob →
  domains) the same triggers and guards invalidate that route's domains for
  the open business instead, so its shown queries read again; it also waits
  while those queries are reading or any save is on its way. A route in
  `lib/query/chrome-refresh.ts` (capped at 6) also calls `router.refresh()`,
  for its server-drawn chrome; its queries read again in the browser all the
  same, since its render sends no rows. A route on neither list keeps the
  path above.
- **Outside a render, `cache()` doesn't share.** A read route's handler runs in
  `inReadScope` (`lib/api/read-scope.ts`, via `readRoute`), one API answer per
  URL; a Server Action called from a React Query screen takes the tab's
  `orgId` last and goes through `writeAsOrg`, which refuses a moved tab, reads
  the business list once, and revalidates nothing (the screen invalidates).
- **A row that arrived by itself** enters and wears an edge until touched:
  `useArrivals(ids, scope)` and `arrivalProps` (`use-arrivals.ts`,
  `.wk-arrived`). Orders and Home's Needs you use it. `scope` is what the
  list is showing, so a change of tab or filter marks nothing.
- **The unread count is in the tab's title** on every page, "(3) Orders ·
  Saroh" (`useUnreadTitle`, `titleWithUnread`).
- No sound, no push and no service worker. The app is installable
  (`app/manifest.ts`, `lib/pwa/manifest.ts`) and nothing more.

## Streaming from the API — **Current** (13 Nov 2026, Ask AI)

An answer read as it arrives (Ask AI's question, plan 2026-11-13-001 U9)
goes browser → an app route handler → the API, never browser → API.

- **The API** writes `text/event-stream` from a Nest handler with `@Res()`:
  `flushHeaders()` at once, `event:`/`data:` frames, a `:keepalive`
  comment every 15 seconds, no compression on the route. The work behind
  it is read to its end even when the reader leaves; only an explicit
  request (Stop) ends it early (`ask-ai.controller.ts`).
- **The route handler** (`app/api/ask-ai/turns/route.ts`) calls
  `apiStream()` from `lib/api/http.ts`, not `apiFetch()`: the same headers
  (session cookie, Origin, `x-organization-id` from `getActiveOrgId()`,
  never from the browser), but no read of the body and no 20-second
  limit. It returns the upstream body as is with only `content-type:
text/event-stream`, `cache-control: no-store` and `x-accel-buffering:
no`; never an upstream header, never `set-cookie`. A refusal before the
  stream opens comes back as ordinary JSON with its status.
- **The client** reads with `fetch` and the body's reader, not
  `EventSource` (which can't POST).
- **Test it** with a `ReadableStream` that holds its second chunk until
  the test has read the first (`route.test.ts` beside the handler).

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
  private path goes in `private-paths.ts`. That one list also decides what
  `robots.txt` disallows and which responses carry
  `X-Robots-Tag: noindex, nofollow` (`privatePathHeaders`, set by the
  middleware; DEC-142), so a new private path needs nothing else.
- **The customer's account streams a held layout; a public page does not.**
  Every page under `[domain]/account` has a `loading.tsx` (DEC-142). They
  are private and never indexed, so the 200 a streamed "not found" answers
  with costs nothing there. A public page still renders before its first
  byte so `notFound()` answers 404 (DEV_LEARNINGS, UX-071): no `loading.tsx`
  above one.
- **A constant a server page reads lives in a plain module.** An export of
  a `"use client"` file reaches a server component as a reference, not its
  value: the account's addresses are in `site-blocks/account/hrefs.ts` for
  that reason, not in the tab bar.
- **A fact that changes by the minute is a live fact, read in the browser**
  (DEC-172, U8, #1042): "Next free", places left, "Open now", stock.
  Never on the server, never with `dontCachePage`: read it with
  `useLiveRead` and draw it with `LiveFact` (`site-blocks/src/live/`). One read
  per address on a page, once a minute while the page is in view, none while
  it is hidden. The box keeps its height in every state (loading, fresh,
  stale, unknown, failed); the cached HTML is always "loading", holding the
  plain way in ("See times"). A count shows only while fresh (75 s,
  `FRESH_FOR_MS`) and 5 or fewer (`placesLeftWords`); an older answer keeps
  the time and hides the count. The API works each site's answer out once
  and shares it 30 s (`LiveReadCache`, review #4), so a new live read is
  one answer per site, never per visitor, and names nobody. `e2e/tests/site-live-facts.spec.ts` fetches the page with no
  scripts and finds no time and no count.
- **A look is part of the publication** (DEC-172). The renderer draws the
  look the publication names and reads no flag; a value this build doesn't
  know draws Classic (`lookOf`). Choosing a look changes the draft, and
  customers see it only after a publish, which revalidates the page as any
  publish does. A resized photo is not page state either: the Worker's
  `/_img/…` route keeps each size in the Cache API by host, key, width and
  format, apart from the page cache (`frontend-design-system.md` → "A photo is sized for the screen").
- **A live read outside the publication shortens the page's life.** The
  head (trackers, codes; DEC-108) and `/book`, which draws the services offered
  now (`showsServicesOffered`), keep it 60 seconds at most
  (`keepPageAtMost`). Everything else lives `SITE_PAGE_CACHE_TTL` (five
  minutes) unless the API revalidates its tags: a new API write that
  changes what a published page shows queues `site.pages.revalidate`
  (`backend-jobs.md` → Site page cache).
- **A temporary redirect is never kept, by anyone.** Only a 200 goes in
  the cache, and the Worker marks every 302, 303 and 307 `no-store`
  (`neverStoreTemporaryRedirect`), cache on or off: an old address that
  forwards (DEC-069) and a domain its plan has paused (DEC-139) both stop
  being true. Use `redirect()` for a hop like these, never
  `permanentRedirect()`.
- **Where a visit came from is not part of the page.** The key drops
  `utm_*`, `fbclid`, `gclid`, `igshid` and `src` (a QR scan's tag), and a
  page that may be kept is drawn for the address without them
  (`keyedSearch`, `drawnRequest` in `request-rules.ts`), so an ad click, a
  shared link and a scan meet the kept page and nothing of one visitor's
  click is in what the next is sent. A page must never read one of these
  on the server; the browser reads `src` from its own address
  (`qr-source.ts`).
- **Outside the Worker** (`next dev`, a test) none of it runs: pages render
  per request, as before.

## Merchant sites: a read that failed, and what a page offers — **Current** (4 Nov 2026)

- **A failed read is never "none" and never kept.** A reader in
  `apps/saroh.app/lib` tells the API's real "none" (a 404: the module is off,
  the shop closed) from a failure (anything else, no answer, the wrong shape).
  On a failure it calls `dontCachePage(reason)` itself, so no caller can forget;
  `lib/read-failures.test.ts` fails a new reader that doesn't, unless it says
  why not.
- **What each failure draws:** a feed-backed block (Plans, Class packs, Product
  grid, Journal) gets `feed.failed`, stays on the page and says so with Try
  again (`FeedFailed`); it keeps its menu entry. An empty feed still draws
  nothing. The blog index and a post throw to the site's error boundary, and a
  host whose site read failed throws from the layout (`siteReadFailed`): never
  "Nothing here yet", a 404, or "no website at this address" for what was a
  restart of the API.
- **A module route offers what its flow offers.** A published page at `/book`
  or `/shop` is the way in, so it can't be narrower than the route it dresses:
    - `/book` always lists everything offered, so a visitor can pick one (owner,
      4 Nov 2026). It draws its list from the booking flow's own read
      (`lib/book-page-offer.ts`), so a frozen snapshot can't disagree with
      `/book?service=` and a new service shows with no republish. Stored ids keep
      the merchant's order, followed by every other service offered, and never
      narrow it; the section's layout, prices, button label and heading stay. A
      page with no list keeps its Booking and Timetable blocks, each counted only
      for what it can really draw (a Timetable by its week's read), and gets a list
      of what they don't reach.
    - `/shop` keeps the merchant's grids and adds "See all products"
      (`?all=1`, the built-in listing) for what they don't draw
      (`lib/shop-page-offer.ts`).
    - With nothing to offer or a failed read, the route draws its own state
      (`ClosedCard`, `ShopEmpty`, `BookingUnavailable`, `ShopUnavailable`): words
      and how to reach the business, out of search. A title over nothing is a bug.
    - A block elsewhere (a home page, Prices' "Try it once") keeps to its stored
      list and is hidden when nothing is left: the page has other things to say.
- **A server read waits 8 seconds; a read in the browser's booking flow 15, and
  asks once more.** `serverReadSignal()` (`lib/api-url.ts`) goes on every public
  read a page is drawn from, never on a write, and an abort lands in that reader's
  failure path. `fetchDays` and `fetchHold` (`booking-flow/api.ts`) retry on no
  answer or a 5xx, and the page says "Still finding times…" after 4 seconds.
- **A reader shared in one render goes in React's `cache()`.** A `signal` turns
  off Next's `fetch` dedupe, so every read in `lib` is a separate request unless
  `cache()` shares it: without it a layout, a page, a menu or `generateMetadata`
  each spend the visitor's rate limit and can get different answers. Give it
  primitive arguments only (an object is a new key each time). Outside a render
  it calls straight through, so a test proves it only with a `cache` stand-in
  (`lib/site-read-failed.test.ts`).
- **A page reads its site with `getSiteForPage`, not `getSiteForHost`.** Null then
  only means the API said nothing is here, so `notFound()` is never a 404 for a
  live site on a blip; a failed read throws to the error page. The layout's own
  check isn't enough: moving between pages renders a page without its layout.
- **A custom domain is only ever looked up by hostname.** Under a set
  `NEXT_PUBLIC_ROOT_DOMAIN`, `shop.client.com` has no subdomain, so whatever its
  read answers can't draw the merchant whose address is `shop`.
- **A read that failed doesn't take a page out of search.** `routeHasNothing` is
  told `empty` only for a read that answered with nothing; a blip keeps the page
  indexed and unkept.

## Merchant sites: what a customer typed, kept for the visit — **Current**

Signing in is the last step of buying, and the email code is read in another
app; a phone (the browsers inside WhatsApp and Instagram above all) often
loads the page again on the way back. So what the customer typed before
that step is kept in `sessionStorage` and restored on mount: the bag's way,
address, discount code and checkout key (`site-blocks/src/shop/bag-draft-store.ts`),
the sign-in sheet's email and step (`account/sign-in-draft.ts`), and the
booking page's service, weeks, person, time, where and way to pay
(`booking-flow/booking-draft.ts`). The booking page keeps no phone number
and no note: what is about the person is not written to the browser's
storage, and a signed-in customer's phone comes back from their account.

- **`sessionStorage` only**: no cookie, never `localStorage` for anything
  typed. Every read is narrowed field by field and every call is wrapped;
  a storage that refuses leaves the page's own state.
- **Only what was typed**, never a sign-in code, a QR source or a price.
- **Cleared on success**: the order placed, the customer signed in.
- **Never drawn on the server's render**: read it into state that draws
  nothing until a sheet opens, or in an effect.
- **Never a note that may be about someone's health.** The booking's
  "Anything we should know?" and the bag's "Note for ‹business›" stay in
  the page's memory. Only that a booking note had been typed is kept, so
  the page can say it wasn't; the bag's kept checkout print carries a
  number worked out from its note, never the words.
- **A kept time is checked before it is shown as chosen.** The booking page
  brings a draft back only on the address it was made on, looks the time up
  in the times free now, and says what it kept (or that the time went and
  which it chose instead).
- **Signing in from the header doesn't leave a booking** (owner, 4 Nov 2026).
  While `[data-booking-step]` is on the page the header's Sign in stays there,
  by a page event the flow can take (`booking-flow/header-sign-in.ts`), no
  store. It books nothing; only the step's own button does.
- **A returning customer's delivery address is not a draft.** It is read
  from their last placed order (`GET public/sites/:siteId/checkout/address`)
  and nothing new is stored for it.

## Links never fetch ahead in the merchant app — **Current** (24 Nov 2026)

Owner, 24 Nov: nothing in the merchant app is prefetched; only what's
needed is loaded. A hovered prefetch was measured to cost two more Worker
requests and make the click no faster (the click still fetches the page,
and the section's `loading.tsx` already paints at once), so the app's root
`providers.tsx` sets `<LinkPrefetchProvider mode="never">`: an
`IntentLink` there never prefetches, even on hover or focus. saroh.in and
the other sites keep the default, prefetch on intent.

- **Every in-app link is `IntentLink`** (`@saroh/ui/intent-link`):
  `prefetch={false}` until a pointer enters, a touch starts or it takes
  focus, then Next's own prefetch. In `apps/app.saroh.in` the default
  import of `next/link` is a lint error (`eslint.config.mjs`); `TextLink`,
  `TabStrip`, `Segmented`, `ListToolbar` paging, `DataView` rows and the
  other `@saroh/ui` pieces use it too. `useLinkStatus` stays allowed.
- **Why.** Every app page is dynamic, so a plain `<Link>` on screen costs
  two Worker requests (the route tree, `next-router-segment-prefetch:
/_tree`; then the page from its first unshared segment down to its
  `loading.tsx`, which runs that section's layout gates and the
  `generateMetadata` business read). The sidebar, Home's cards and list rows
  made ~35 a page load, 56 on Home; a search re-prefetched the list's tabs
  and pages on every keystroke. Now 0 on load.
- **A click is not slower.** The prefetch only ever held the part down to
  `loading.tsx`; the click asks for the page anyway, and the router shows
  the loading state at once without it (production build, 24 Nov: a cold
  sidebar click paints the new heading and skeleton in ~20 ms, the page in
  ~330 ms, the same as after a hover).
- No `router.prefetch` anywhere in the app. Add one only for a flow that
  measurably needs it, with the reason beside it.

## Loading inside a screen — **Current** (21 Nov 2026)

A change inside a screen (another post, page, tab, filter or sort) greys
only the region whose data changes; the frame around it stays mounted and
keeps its state. Owner, 21 Nov: "Only the main editor and the other
components which have the related data should load, and that too by showing
a skeleton only, not the full section."

- **The frame is a layout, or above a boundary.** What doesn't depend on the
  changing data (a bar, a rail, a list, a right column, a header and its
  tabs) lives in a `layout.tsx` above the part that changes, or above a
  `<Suspense>`. A layout keeps its state and doesn't render again on
  navigation (the bundled Next docs, `node_modules/next/dist/docs/01-app/`:
  `01-getting-started/03-layouts-and-pages.md` "layouts preserve state,
  remain interactive, and do not rerender"; `03-api-reference/03-file-conventions/layout.md`).
- **Each data region has its own boundary**, with a skeleton shaped like
  that region: the same boxes at the same sizes, so nothing shifts when it
  lands. `PageLoading` draws it (`bare`, and a region shape: `writing`,
  `canvas`, `inspector`, or a page shape for a tab's body); `SettingsLoading`
  inside Settings. Never a full-screen skeleton for a change inside a screen.
- **Switching keeps the frame.** Either the region shows its skeleton, or
  the old content stays visible and is marked as loading: `router.push` in
  `useTransition` (`isPending`), or `useLinkStatus` inside a `<Link>`
  (`03-api-reference/04-functions/use-link-status.md`). It never blanks
  the frame.
- **Errors are caught per region**: an `error.tsx` at the changing segment
  (it renders inside the parent layout), or an error boundary around a
  `<Suspense>`, so one region failing leaves the frame working.
- **Which tool:**
    - `loading.tsx` — the region is a route segment (a dynamic `[id]`, a tab
      folder). Next wraps that segment in `<Suspense>` inside its parent's
      layout and shows the fallback at once on navigation
      (`03-api-reference/03-file-conventions/loading.md`). Put it at the
      segment that changes, not above the layout that should stay.
    - `<Suspense>` — the region is part of one page: several reads that
      arrive at different times (`02-guides/streaming.md`). A search-param
      change does **not** show `loading.tsx` (seen in the browser, 21 Nov: the
      old page holds, unmarked, until the new render lands), so a filter, sort or `?page=` switch marks itself
      with `useTransition`, or keys a `<Suspense>` by the param when the old
      rows would mislead.
    - Parallel routes (`@slot`) — two regions navigate on their own (a list
      beside a detail), each with its own `loading.tsx` and `error.tsx`
      (`03-api-reference/03-file-conventions/parallel-routes.md`).
      Not used yet; reach for one before nesting a second router by hand.
- **Client-held frames.** When the frame needs the changing record's
  client state (a draft), the record hands it up after each render and the
  frame draws its parts from it, grey while none is there: the post editor's
  `PostFrame` (`components/sites/posts/editor/post-frame.tsx`,
  `app/(editor)/sites/[siteId]/write/layout.tsx`). The site editor's `?page=`
  switch is a transition (`components/sites/editor/page-switch.tsx`) that
  greys the canvas and inspector, and offline says "Couldn't load this page"
  in the canvas instead of letting Next fall back to a full page load.
- `post-shell.test.tsx` "the frame stays from post to post" checks the
  frame's nodes survive a post change; copy it for a new frame.
- **The site editor stays one mounted editor across a `?page=` change**:
  the frame (bar, rail, Pages tree, right column, Ask AI) keeps its nodes;
  the draft, autosave, per-page Undo, sheets, canvas and inspector re-seed
  for the new page (`site-editor.test.tsx`, `read-only.test.tsx`).
- **A failed load while online** is caught in its region, not turned into
  a full page load: `lib/navigation/caught-full-load.ts` (the Navigation
  API stops Next's fallback; a second failure after Try again is let
  through, so a new deploy or an expired session still reloads). It leans
  on Next 16.4.5 internals: check it on every Next upgrade.
- **Pieces to reuse:** `LinkPending` (`@saroh/ui`, inside a `Link` that
  only changes a view; `TabStrip` and `SectionList` draw it), the app's
  `ScreenPending` / `PendingRegion` (`components/shared/page/screen-pending.tsx`)
  for a region greyed during a transition, admin's `TableSkeleton` (the
  list's real column count) and `RegionError`. On merchant sites,
  `SiteLink` (`packages/site-blocks`) makes a same-site link a soft
  navigation while the server HTML keeps its `<a href>`, and a pending mark
  uses the site's own tokens and never loops (DEC-172).

## If you think you need React Query — **Adopted** (DEC-259)

On a registered `app.saroh.in` route, you have it: add a query in
`lib/<domain>/queries.ts`, a hook in `use-<domain>.ts`, and a read route built
with `readRoute`. Anywhere else (accounts, merchant sites, admin, an unmigrated
route), use a Server Component read plus `router.refresh()`. Moving a route to
React Query means registering it, removing its `router.refresh()` calls and
declaring `invalidates` on its mutations in the same batch.

# Frontend data and state

> **Read when:** reading or writing API data from a Next.js app, or adding
> client or URL state.
> Adapted from claude-patterns `frontend/02-data-and-state.md`. The library
> routes server state through React Query; this repo does not, by design
> (DEC-004).

## Where each kind of state lives — all **Current**

| State                                      | Mechanism                                                                                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server data                                | Server Components through `lib/<domain>/service.ts`, request-cached with React `cache()`                                                                                                              |
| Writes                                     | Server Action → service → `mutate()` → `{ ok: true, data }` or `{ ok: false, error }`, then `router.refresh()` or navigate. Called from the client through `runAction` (`frontend-error-feedback.md`) |
| Shareable filters, tabs, the selected page | The URL, read from the page's `searchParams` on the server (8 pages)                                                                                                                                  |
| Active organization                        | The `active_org` cookie, sent as `x-organization-id`; the API re-validates membership                                                                                                                 |
| Open/closed, draft input, hover            | `useState` in the component                                                                                                                                                                           |

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
- **A row that arrived by itself** enters and wears an edge until touched:
  `useArrivals(ids, scope)` and `arrivalProps` (`use-arrivals.ts`,
  `.wk-arrived`). Orders and Home's Needs you use it. `scope` is what the
  list is showing, so a change of tab or filter marks nothing.
- **The unread count is in the tab's title** on every page, "(3) Orders ·
  Saroh" (`useUnreadTitle`, `titleWithUnread`).
- No sound, no push and no service worker. The app is installable
  (`app/manifest.ts`, `lib/pwa/manifest.ts`) and nothing more.

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

## If you think you need React Query

You probably need a Server Component read plus `router.refresh()`. Genuine
client-side polling or optimistic updates across many components is a decision
to make explicitly: write it into this file and AGENTS.md → Triggers before
adding the dependency.

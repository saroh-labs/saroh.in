# Error handling and feedback

> **Read when:** showing a toast, an error, or an empty, loading or failed state;
> adding an error boundary; or touching anything that redirects to sign-in.
> Adapted from claude-patterns `frontend/05-error-feedback.md`. Also read
> `.agents/skills/saroh-product-states/SKILL.md`; copy rules are in
> `docs/design-system/07_STYLE_GUIDE.md` §1 and §7.

## One layer presents each failure — **Current**

1. **Segment boundaries** (`error.tsx`): a read that threw.
2. **Named states** from `@saroh/ui/data-state`: `EmptyState` (first run and
   no results), `ModuleOffState`, `PlanLockedState`, `LimitReachedState`,
   `ProviderDisconnectedState`, `NotPublishedNotice`, `PermissionDeniedState`,
   `PausedState`, `SignedOutState`, `FailedState`, `PartialNotice`,
   `LoadingState`. Each comes in `page`, `panel` and `inline` size and takes
   its words from `@saroh/ui/lib/state-copy`
   (`.agents/skills/saroh-product-states/SKILL.md`).
3. **Toasts**: the outcome of something the user just did.
4. **Field messages**: validation, and server errors that name a field,
   drawn by `Field` / `FieldError` under the field as an alert
   (`frontend-forms.md`). Gap: the service editor still joins its
   problems into one strip under the header, a post with no title says so
   in a toast, and the product editor draws its own help line.
5. **`Notice`** (`@saroh/ui/notice`): something to know beside the content
   that is none of the above. A problem, a warning, a fact, a success that
   should stay on screen. One component, five tones (`info`, `warning`,
   `error`, `success`, `neutral`), as a card or an edge-to-edge banner. An
   error is `role="alert"`, a neutral note `role="note"`, the rest
   `role="status"`. Never a hand-built box with a role: the scan in
   `apps/app.saroh.in/lib/consistency/shared-pieces.test.ts` fails one.

## Rules

### Toasts

- **Current** — **One seam.** `showSuccess`, `showError`, `showWarning` and
  `showInfo` from `@saroh/ui/toast`, all `(message, description?)`. ESLint
  rejects sonner's `toast` in the apps. `showSuccess` takes a third
  argument, one action (`{ label, onClick }`): the way to the thing just
  made, for an overlay that keeps the merchant where they were.
- **Current** — **One grammar for what an overlay says when it worked**
  (UX audit, 10 Oct): "{Thing} saved." or "{Thing} added.", with a full
  stop, the detail on the second line, and Undo where the write can be
  taken back. Never "Saved", "Done", "{Thing} updated" or "queued".
- **Current** — **One grammar for every toast** (10 Oct 2026), in the
  merchant app:
    - What worked is a sentence in the past tense that names the thing, and
      ends with a full stop: "Booking moved.", "Code saved.", "Tax rate set
      to 12%.". Never "successfully", never an exclamation mark, never a
      bare "Saved." or "Done". A second fact is a second sentence or the
      description, not a dash.
    - What failed says what happened and what to do next: "Couldn't save
      that role.", "The photos weren't added." with the API's guarded
      sentence as the description, "That didn't go through. Try again.".
      It is "Couldn't", never "Could not", and it has its full stop. Never
      an exception's `error.message`, a status code, or the API's sentence
      glued on after a colon.
    - A date, a time, an amount or a count in a toast comes from
      `lib/format` like any other (`frontend-design-system.md` → Numbers
      and dates).
    - `scripts/check-formats.mjs` (in `pnpm prepush`) fails "successfully"
      or an exclamation mark in a toast call, and `scripts/check-app-copy.mjs`
      (`pnpm check:copy`) fails an em dash, a semicolon or a word the
      product never says in anything the app shows (`saroh-product.md` →
      One word each).
- **Adopted** — **Toast copy is product copy.** Show the API's guarded message
  (`res.error`) or your own sentence — never an exception's `error.message`, an
  API `detail` or a response body. Gap: `saroh.in`'s `join-waitlist.tsx`
  forwards `error.message`.
- **Adopted** — **Never put the only way to do something in a toast,** and keep
  error toasts on screen long enough to read (15 §5).
- **Current** — **A copy is acknowledged by its button, not a toast.**
  `CopyButton` says "Copied" for 1.6 seconds and comes back. A toast only
  where the link was also just made (it says who to send it to). When the
  browser refuses there is one sentence, `copyFailedMessage()`: "Couldn't
  copy the link. Select it and copy it instead.", with the link shown
  selected.
- **Current** — **One Undo, ten seconds, and it says how it went** (UX
  audit, 10 Oct). `showUndo(message, undo, options?)` lasts ten seconds
  everywhere (`UNDO_MS`). No screen has a duration or a timer of its own
  (`overlay-frames.test.ts`). `undo` returns its result (a promise of
  `true`, or the action's `{ ok, error }`), and `showUndo` itself says
  "Undone." or "Couldn't undo. It stays as saved." with the reason under
  it. So no caller words an Undo's outcome and none fails silently. An
  `undo` that returns nothing at once has kept the outcome for itself (a
  hold card that draws its own state). **`dismissToasts()` clears the
  stack** when a screen starts an Undo of its own: two Undos on screen at
  once, for two different things, is how the wrong one gets pressed.
- **Current** — **The ten-second hold is `apps/app.saroh.in/lib/hold-undo.ts`**
  (round-2 G3; default 136), never a timer of a screen's own. `startHold`
  takes `commit` (what happens if nobody presses Undo: on time out, "now",
  or leaving) and `undo`; `createHoldSlot` keeps one hold at a time. A
  failed callback ends the hold as `failed` for the caller to word. The site
  editor's `use-undo.ts` is the reference caller of the helper itself.
  With a toast, use **`useHold`** (`components/shared/use-hold.ts`):
  `hold(key, message, commit, onUndo)` shows the thing as done and writes
  it when the ten seconds are up, `send(key, { run, sent })` is the same
  for anything that tells a customer ("Sending in 10 seconds", then "Sent
  to {name}."), and `undo(key)` is the screen's own Undo beside the thing.
  The bookings calendar, Home's Today, invites, sends and held cancels all
  use it. `showUndo` returns the toast's id, and `dismissToast(id)` takes
  that one Undo away when its window closes early.
- **Current** — **Undo or confirm, never both, never neither.** Reversible:
  do it and offer Undo, no dialog. Irreversible: the one `ConfirmDialog`,
  which waits for the action and says a refusal inside itself. No way back
  in the API, but not final yet: hold it (`useHold`).

### A save that got no answer — **Current** (10 Oct 2026)

Two sentences, in `lib/api/unreached.ts`, and no screen words its own:

- **`UNREACHED`**: "We couldn't confirm that was saved. Check your connection, see whether it went through, then try again." It never says nothing changed: a write that timed out
  may have landed.
- **`SIGNED_OUT`**: "You've been signed out. Sign in again and what you
  typed stays here."

How they are reached:

- **A write never throws, and has 20 seconds.** `apiFetch` gives every
  request that isn't a GET or HEAD a 20-second limit. A network failure
  or the limit answers as an ordinary error response carrying
  `UNREACHED`, and a 401 carrying `SIGNED_OUT`. So `mutate`, `destroy`
  and every service that reads its own response say the same thing
  through `readError`; `mutate` and `destroy` also mark the result
  `unreached` or `expired`. Reads are untouched: a failed read still
  rejects into the page's failed state or boundary.
- **Signed out is one toast that stays, with a way back.** The shell
  registers the sentence with `setErrorAction` (`@saroh/ui/toast`), so
  every `showError(res.error)` that says it draws the same toast with a
  "Sign in" button. It opens accounts in a new tab: the page and what
  was typed on it are still there to send again.
- **A client calls a server action through `runAction`**
  (`lib/api/run-action.ts`), never `setBusy(true); await save();
setBusy(false)`:

    ```ts
    const res = await runAction(() => saveService(id, values), { setBusy });
    if (!res) return; // it never got there, and has been said
    if (!res.ok) …
    ```

    It clears the busy state in a `finally`, says `UNREACHED` once when the
    action throws (the browser couldn't reach this app) and answers
    `undefined`. `quiet` with `onUnreached` puts the sentence in the
    sheet's own error line instead. An `await` inside
    `startTransition(async () => …)` goes through it too: a server action
    that throws there reaches the error boundary and replaces the form
    being typed with an error page.

- **After the guard, undo what was drawn early.** A switch flipped before
  its save is put back (`if (!res) return setOn(!next)`), a promise a
  hold is waiting on is resolved, and anything about money is read again,
  since a reply that was lost may still have gone through.
- `run-action.test.ts` scans the app: between a busy setter going on and
  off, and inside a transition, every `await` is one that can't throw.

### An unreachable API is not a signed-out user — **Current**

Use `requireSession()`, built on `resolveServerSession()` in
`packages/auth/src/next.ts`:

- no cookie, or a 401/403 from the API: redirect to sign-in;
- a network failure, 5xx, 429 or 404: throw `SessionUnavailableError` to the
  nearest `error.tsx`, which offers a retry.

`getServerSession()` returns `null` for both, and is only for code that renders
the same either way (`AppShell`, the onboarding layout, the accounts proxy).
Before the split, one API restart signed out every user.

### Boundaries

- **Adopted** — **Every app root has `error.tsx` and `loading.tsx`.** Gap:
  templates, saroh.in and ui have no `loading.tsx`.
- **Current** — **One error page, in three layers** (DEC-115). A Saroh app's
  root `error.tsx` draws `ErrorPage` from `@saroh/ui/error-page` — the 404's
  shape (mono eyebrow "500", display heading, one sentence, Try again and
  the surface's home, the digest as a reference); `kind="unavailable"` is
  the 503 "Back shortly". Every app has a `global-error.tsx` drawing
  `CrashDocument` from `@saroh/ui/crash-page`, which carries its own
  `<style>`, because the root layout and its CSS are what failed; help and
  docs (Nextra, no Tailwind for `@saroh/ui`) use its inline `CrashPage` in
  `error.jsx` too. Each Cloudflare app's `worker.ts` wraps OpenNext's
  handler in `withCrashPage` (`@saroh/ui/lib/crash-page`), so a throw before
  Next renders is the same page as static HTML, not Cloudflare's screen.
  Merchant sites use `SiteError` (`apps/saroh.app/components/site-error.tsx`)
  and the `neutral` crash page, never Saroh's brand.
- **Current** (10 Oct 2026) — **A segment boundary passes what it knows, not a
  sentence.** Every `error.tsx` in `app.saroh.in` renders `SectionError`
  (`components/shared/section-error.tsx`; a settings tab,
  `SettingsSectionError`) with Next 16.3's `retry`, which reads the segment
  again. `reset` only redraws the failed read, and no boundary takes it.
  It passes `heading` (the page's title, kept above the card), `things`
  ("Couldn't load {things}"), an optional `reassurance` (one true sentence
  after "Nothing has been changed."), and `backHref` with `place`, the
  menu's name ("Back to Orders"). A 403 draws the denial and a 401 the
  signed-out card. The eight `not-found.tsx` are titled "{Thing} not found".
  `states-scan.test.ts` fails a boundary that words its own.
- **Current** — **Say nothing was lost only when it is true.** A failed read
  leaves saved work alone ("Anything you'd already saved is safe"); a
  boundary a write can reach doesn't promise it.
- **Adopted** — **Show `error.digest` as a reference** — the only handle a user
  can give support. Report the error with `reportError(error, { boundary,
digest })` from `@saroh/ui/lib/report-error` (#103): it logs, and it forwards
  to PostHog where the app registered a reporter and has a key (DEC-125: the
  workspace, accounts, admin and saroh.in; never a merchant site, whose
  boundaries only log). Never import a tracker's SDK in a boundary or a
  component. Never call `console.error` directly in a
  boundary. Current in every app's root and global boundaries and in
  `SectionError`.
- **Current** — **A 403 from a server read calls `forbidden()` instead of throwing
  an ordinary error.**
    - `getJson` does it (`lib/api/http.ts`).
    - `forbidden.tsx` in `(shell)`, `(editor)` and the `app.saroh.in` root renders
      `AccessDenied`.
    - Production replaces a thrown server error's message with a digest, so an
      `error.tsx` cannot tell a 403 from a 500 there (`DEV_LEARNINGS.md`, #274).
    - Required page reads must let `forbidden()` propagate. A catch that returns
      `null` swallows the interrupt and hides failures as missing data. Optional
      navigation reads may deliberately fall back without blocking the page.
- **Current** (10 Oct 2026) — **One sentence for a denial, and it is asked
  before the form.**
    - The words are `whoCanChange()` (`lib/access/who-can-change.ts`,
      re-exported beside `AccessDenied` and `ReadOnlyNote`): "You can't open
      {thing}", "Your role in {business} is {role}. It doesn't include
      {thing}.", "An owner or admin can change this in Settings › Team."
      (owner-only: "Only the owner can change this."). `thing` is the menu's
      name (Sell, Contacts), never the registry's. No screen words its own,
      and none says "organization", how the person got there, an em dash or a
      semicolon. `who-can-change.test.ts` scans for the old wordings.
    - Every `new`, `edit` and `import` page under `app/(shell)` starts with
      `requireCan(action, { thing })` (`lib/access/require-can.tsx`), with the
      permission the API asks of the save. It denies only when the API said
      what the person may do and it isn't there; unknown opens and the API
      decides. A page the person may read but not change is drawn to read
      (no inputs, no action buttons, `ReadOnlyNote` on top).
      `guarded-pages.test.tsx` fails a new such page with no guard.
    - A denial is `PermissionDeniedState`: never a hand-drawn dashed card
      (that is "nothing here yet"), never `FailedState` (nothing broke).
    - A write the API refused by role arrives with `details.code`
      `ROLE_DENIED` and the permission. `toFailure` and `readError` say it
      in `lib/api/role-denied.ts`'s words and mark the result `denied`;
      `reportFailure` shows a denied result with `showRefusal`, not the
      red error.
    - **A refusal by role is never red, from any call site** (10 Oct 2026).
      Most screens only hold `res.error`, so the sentence says what it is:
      `isRoleRefusal` (`lib/api/role-denied.ts`) knows the two ways a
      refusal by role is worded ("Your role …", "Only an owner can …"), and
      an endpoint's own sentence is marked `denied` too. `app/providers.tsx`
      registers it once (`setRefusalTest`, `@saroh/ui/toast`), so every
      `showError(res.error)` says a refusal through `showRefusal`: the
      neutral toast, ten seconds, closable. Inside a sheet, dialog or
      confirm that is still open it is `Refusal`
      (`components/shared/refusal.tsx`): a neutral `Notice` for a refusal
      by role, the error `Notice` for anything else. `ConfirmDialog` draws
      its refusal with it. A new refusal by role in the API starts "Your
      role " or carries `ROLE_DENIED`, or it is shown as an error. A
      save's sentence under a form is `Refusal` too, never a red line drawn
      by hand: a hand-written `role="alert"` line is for a field's own
      problem (validation, or an API sentence that names the field) only.
      `refusal-call-sites.test.tsx` fails a form that prints `refusal`,
      `failure` or `res.error` that way.
- **Current** — **Calm, recoverable copy**: "Couldn't load {things}", "Nothing
  has been changed.", and **Try again** reads again (`retry`, a refetch or
  `router.refresh()`), never "reload the page" and never "Retry". A part of
  a page that couldn't be read is `FailedRead`
  (`components/shared/failed-read.tsx`), and a page that is drawn without
  it says so above with `PartialRead`: "Couldn't load {things}.", one
  sentence on what that leaves unsaid (`so`), and Try again. Both take
  `onRetry` for a read the component made itself (a preview, a picker's
  library, a sheet's catalogue): that read is called again, since
  refreshing the route would not ask for it. A card that keeps the page's
  first read in state starts from it when it arrives (`ChangesCard`).
  `partial-read.test.tsx` fails a page that words its own. In accounts it
  never hints at
  whether an account or a password was right.
- **Current** — **Accounts never shows the auth library's message.** Every
  failed `authClient` call goes through `authErrorCopy(code)`
  (`apps/accounts.saroh.in/lib/auth-error-copy.ts`): a sentence for a wrong
  email or password, too many tries, no connection, a weak password, and one
  fallback ("That didn't work. Try again."). Wrap the call in `settle`, since
  the client rejects when the request never leaves the browser. Sentences end
  with a full stop. `lib/copy.test.ts` reads the app's source and fails on
  "Log in", "workspace", "organization", "storefront", an em dash or a
  semicolon in anything a person reads.
- **Current** — **An API that did not answer has not said no.** An invitation
  page tells four states apart (`apps/app.saroh.in/lib/invitations/outcome.ts`,
  and `lib/invitations.ts` in accounts): couldn't check (Try again), can no
  longer be used (one title on all three pages), for someone else ("Sign out
  and use {email}", "Go to Home"), and refused in the API's words. Keep the
  status when a read or an accept fails. Without it every failure reads as
  the worst one.
- **Current** — **Merchant pages** (`apps/saroh.app`) draw boundaries from
  `--site-*`, never Saroh's brand. A throw inside `[domain]/layout.tsx` lands in
  the _root_ boundary, where the merchant's palette never loaded, so that
  boundary mounts `SiteTheme` on its neutral defaults. New files there go on the
  G6 allowlist (`frontend-design-system.md`).
- **Current** — **One loading shell: `PageLoading`**
  (`components/shared/page-loading.tsx`, 10 Oct 2026). Every `loading.tsx`
  under `app/(shell)` returns it with the page's `shape` (`list`, `detail`,
  `form`, `editor`, `dashboard`, `settings`) and the page's own `width`,
  the same `PageContainer` width its `page.tsx` sits at, left-aligned. It
  draws the page's REAL header (the breadcrumb and title the route knows,
  and its tabs: the tab component itself or just the labels, without
  counts) and greys only the body. A record's page leaves `title` out and a
  bar stands in its place. A Settings section returns `SettingsLoading`
  (`components/settings/settings-loading.tsx`), so it loads inside the
  panel with the side list in place. A tab whose layout already drew the
  header passes `bare`. The two arrival screens use `ArrivalLoading`.
  One drawing (`Skeleton`'s sweep; never `animate-pulse`, a spinner, a bare
  `bg-muted` block or "Loading…" as a page or panel loader) and one way of
  saying it: `role="status"`, `aria-busy`, one `sr-only` sentence, the grey
  `aria-hidden`. A new route gets its own `loading.tsx` when its shape or
  width differs from its parent's. `components/shared/page-chrome.test.ts`
  fails on a page with no loader of its width, on one that falls back to
  Home's, and on a loader drawn by hand.

### States are part of the product

- **Current** — **A failed read is never an empty read**: `getList` throws, and
  `FailedState` exists for the case you catch.
- **Adopted** — **Never say "No X yet" when the data was never computed or never
  loaded.** Insights' "No views recorded in this range yet" is true since a
  live site sends a view beacon (UX-032) and the rollups are scheduled
  (DEC-075, `backend-jobs.md`). Its takings show "No takings
  yet" only when the read came back and the business has never been paid.
- **Adopted** — **Every important workflow handles** loading, empty, partial,
  error, permission denial, module off, provider disconnected, provider
  error, stale information and retry (PRODUCT_STRATEGY §30), and the activation
  gate adds setup, attention and forbidden (`docs/design-system/18_ACTIVATION_RELEASE_GATE.md`).
  `@saroh/ui/data-state` has no named state yet for stale data.
- **Current** (10 Oct 2026) — **One empty card.** `EmptyState` in three sizes
  and two kinds. A page-size first run has an icon, "No {things} yet", one
  sentence and the header's own action ("New {thing}"), or no button and no
  promise of one for someone who may not create. No results keeps the full
  card and offers "Clear search", "Clear filters" or "Show all {things}".
  `DataView` draws it. A picker says `noMatchLine(things, q)`. A tab, a
  sheet section, a rail or a menu with nothing in it is the same card at
  `size="inline"`: a title ("No values yet") and, only where the reader's
  role has a next step, one line or a text action. Never a bare "No X"
  paragraph (`one-line-empties.test.tsx`).
- **Current** (10 Oct 2026) — **A plan prompt has one label**, `planLabel`:
  "See {Plan}" when one plan unlocks the thing, "See plans" otherwise.
  Someone who can't change the plan reads who can, as text: "The owner
  can change the plan in Settings › Plan and billing." The shell says once
  whether the reader may (`mayChangePlan`: `billing:manage`,
  `lib/billing/plan-access.ts`, through `PlanAccessProvider`), and a prompt
  never passes it: it wraps its link in `PlanWay`
  (`components/billing/plan-way.tsx`), or draws `PlanLockedCard` /
  `LimitReachedCard`. `LimitNoticeBlock` and the plan refusal dialog do it
  themselves. A link that is only sometimes to the plans passes
  `when={isPlanHref(href)}`. Plan and billing opens to `billing:read`
  (`mayOpenPlan`), the same rule as its Settings tab and the API (DEC-128).
  A setup checklist's plan row is row data: `planRow`
  (`components/settings/ready-rows.tsx`) leaves the button out and puts
  who can after the row's line, and `PlanAsides` wraps its button in
  `PlanWay`. The site editor's route group mounts `PlanAccessProvider` as
  the shell does.
- **Gap** — A load-more or a search that failed inside a list (Stock's
  three lists, the order product filter, a picker's search) still prints
  its action's sentence in a line of its own.

### Silent catches and API errors

- **Current** — Silent `catch {}` only for genuinely background work nobody asked
  for; the one in the repo is the pre-paint theme script.
- **Current** — Error responses are
  `{ error: { code, message, statusCode, correlationId, details? } }`, 5xx
  messages are generic, and `readError` in `lib/api/http.ts` maps them. Never
  render a raw body or an HTTP code ("Calm under errors", 07 §1).

### Production permission regression tests

Run `pnpm --filter @saroh/e2e test:permissions` with the Portless proxy running.
This builds the workspace app and tests its real production routes against an
isolated API fixture on desktop and phone. It covers permission boundaries,
server failures, disabled modules, and read-only site access without a database.
Backend guard/service tests separately verify role authorization; the fixture
is not a substitute for the seeded-stack authentication suite.

Before running it, know what its build touches (`DEV_LEARNINGS.md`, #274):

- **`@saroh/database`'s `dist` is rebuilt.** A `pnpm dev` API watching at the
  same time compiles against the half-built package, then keeps serving its last
  good build. Stop `pnpm dev` first, or restart it afterwards.
- **`apps/app.saroh.in/.next` is overwritten** with the fixture's API URLs
  inlined. Rebuild before any other `next start`.
- **CI does not run it yet.** The `browser-e2e` job runs `test:e2e` only.

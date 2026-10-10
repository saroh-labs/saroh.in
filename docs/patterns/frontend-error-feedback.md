# Error handling and feedback

> **Read when:** showing a toast, an error, or an empty, loading or failed state;
> adding an error boundary; or touching anything that redirects to sign-in.
> Adapted from claude-patterns `frontend/05-error-feedback.md`. Also read
> `.agents/skills/saroh-product-states/SKILL.md`; copy rules are in
> `docs/design-system/07_STYLE_GUIDE.md` §1 and §7.

## One layer presents each failure — **Current**

1. **Segment boundaries** (`error.tsx`): a read that threw.
2. **Named states** from `@saroh/ui/data-state`: `EmptyState`,
   `CapabilityOffState`, `PermissionDeniedState`, `FailedState`,
   `PartialNotice`, `LoadingState`.
3. **Toasts**: the outcome of something the user just did.
4. **Field messages**: validation, and server errors that name a field
   (`frontend-forms.md`).

## Rules

### Toasts

- **Current** — **One seam.** `showSuccess`, `showError`, `showWarning` and
  `showInfo` from `@saroh/ui/toast`, all `(message, description?)`. ESLint
  rejects sonner's `toast` in the apps.
- **Adopted** — **Toast copy is product copy.** Show the API's guarded message
  (`res.error`) or your own sentence — never an exception's `error.message`, an
  API `detail` or a response body. Gap: `saroh.in`'s `join-waitlist.tsx`
  forwards `error.message`.
- **Adopted** — **Never put the only way to do something in a toast,** and keep
  error toasts on screen long enough to read (15 §5).
- **Current** — **`showUndo` takes a `duration`** for a screen whose Undo
  window is a rule of its own (Order Detail's ten-second steps, ADR-008), and
  **`dismissToasts()` clears the stack** when a screen starts an Undo of its
  own — two Undos on screen at once, for two different things, is how the
  wrong one gets pressed.
- **Current** — **The ten-second hold is `apps/app.saroh.in/lib/hold-undo.ts`**
  (round-2 G3; default 136), never a timer of a screen's own. `startHold`
  takes `commit` (what happens if nobody presses Undo: on time out, "now",
  or leaving) and `undo`; `createHoldSlot` keeps one hold at a time. A
  failed callback ends the hold as `failed` for the caller to word. The site
  editor's `use-undo.ts` is the reference caller; B6 and F4 reuse it.
  `showUndo` returns the toast's id, and `dismissToast(id)` takes that one
  Undo away when its window closes early, leaving any error toast beside it.

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
  and the `neutral` crash page, never Saroh's brand. New boundaries take
  Next 16.3's `retry` (re-fetches), not `reset`.
- **Current** — **Say nothing was lost only when it is true.** A failed read
  leaves saved work alone ("Anything you'd already saved is safe"); a
  boundary a write can reach doesn't promise it.
- **Adopted** — **Show `error.digest` as a reference** — the only handle a user
  can give support. Report the error with `reportError(error, { boundary,
digest })` from `@saroh/ui/lib/report-error` (#103): it logs, and it forwards
  once a tracker is registered. Never call `console.error` directly in a
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
      `reportFailure` shows a denied result with `showInfo`, not the red
      error. Gap: most screens still call `showError(res.error)` directly,
      so they show the readable sentence in the error style.
- **Current** — **Calm, recoverable copy**: it is usually temporary, and **Try
  again** calls `reset`. In accounts it never hints at whether an account or a
  password was right.
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
  error, permission denial, capability off, provider disconnected, provider
  error, stale information and retry (PRODUCT_STRATEGY §30), and the activation
  gate adds setup, attention and forbidden (`docs/design-system/18_ACTIVATION_RELEASE_GATE.md`).
  `@saroh/ui/data-state` has no named state yet for provider-disconnected or
  stale data.

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

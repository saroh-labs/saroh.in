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
  templates, saroh.in and ui have neither.
- **Adopted** — **Show `error.digest` as a reference** — the only handle a user
  can give support — and log the error (`TODO(#103)`: forward it to a tracker
  once one exists). Current in the accounts, admin and saroh.app boundaries; gap:
  `app.saroh.in/app/error.tsx` does not show it.
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
- **Current** — **Calm, recoverable copy**: it is usually temporary, and **Try
  again** calls `reset`. In accounts it never hints at whether an account or a
  password was right.
- **Current** — **Merchant pages** (`apps/saroh.app`) draw boundaries from
  `--site-*`, never Saroh's brand. A throw inside `[domain]/layout.tsx` lands in
  the _root_ boundary, where the merchant's palette never loaded, so that
  boundary mounts `SiteTheme` on its neutral defaults. New files there go on the
  G6 allowlist (`frontend-design-system.md`).
- **Current** — **A loading state has the shape of the page.** 49 of 51
  `loading.tsx` files use `Skeleton` or `LoadingState`; none use a spinner.

### States are part of the product

- **Current** — **A failed read is never an empty read**: `getList` throws, and
  `FailedState` exists for the case you catch.
- **Adopted** — **Never say "No X yet" when the data was never computed or never
  loaded.** Gap: Insights shows "No views recorded in this range yet" to
  organizations whose rollups have never been built (`backend-jobs.md`).
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

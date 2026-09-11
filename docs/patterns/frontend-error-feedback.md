# Error handling and feedback

> **Read when:** showing a toast, an error, or an empty, loading or failed state;
> adding an error boundary; or touching anything that redirects to sign-in.
> Adapted from claude-patterns `frontend/05-error-feedback.md`. For the named
> product states, also read `.agents/skills/saroh-product-states/SKILL.md`.

## One layer presents each failure

1. **Segment boundaries** (`error.tsx`): a read that threw.
2. **Named states** from `@saroh/ui/data-state`: `EmptyState`,
   `CapabilityOffState`, `PermissionDeniedState`, `FailedState`,
   `PartialNotice`, `LoadingState`.
3. **Toasts**: the outcome of something the user just did.
4. **Field messages**: validation, and server errors that name a field
   (`frontend-forms.md`).

## Rules

### Toasts go through one seam

`showSuccess`, `showError`, `showWarning` and `showInfo` from
`@saroh/ui/toast`, all `(message, description?)`. ESLint rejects sonner's
`toast` in the apps. `description` is product copy — never `error.message`, an
API `detail` or a response body. (`saroh.in`'s `join-waitlist.tsx` still
forwards `error.message`; known, awaiting copy.)

### An unreachable API is not a signed-out user

Use `requireSession()`, built on `resolveServerSession()` in
`packages/auth/src/next.ts`:

- no cookie, or a 401/403 from the API: redirect to sign-in;
- a network failure, 5xx, 429 or 404: throw `SessionUnavailableError` to the
  nearest `error.tsx`, which offers a retry.

`getServerSession()` returns `null` for both, and is only for code that renders
the same either way (`AppShell`, the onboarding layout, the accounts proxy).
Before this split, one API restart signed out every user.

### Boundaries

- Every app root has `error.tsx` and `loading.tsx`. Show `error.digest` as a
  reference — it is the only handle a user can give support — and log the
  error (`TODO(#103)`: forward it to a tracker once one exists).
- Copy says it is usually temporary and offers **Try again** (`reset`). In
  accounts it never hints at whether an account or password was right.
- **Merchant pages** (`apps/saroh.app`) draw boundaries from `--site-*`, never
  Saroh's brand. A throw inside `[domain]/layout.tsx` lands in the _root_
  boundary, where the merchant's palette never loaded, so the root boundary
  mounts `SiteTheme` on its neutral defaults. New files there go on the G6
  allowlist (`frontend-design-system.md`).
- A loading state has the shape of the real layout, not a spinner.

### A failed read is never an empty read

Throw, or render `FailedState`; never show "No X yet" because a fetch failed.
The Insights dashboard currently says "No views recorded in this range yet" to
organizations whose rollups have never been computed — exactly the sentence
this rule exists to stop (`backend-jobs.md`, known gaps).

### Silent catches

Only for genuinely background work nobody asked for, such as analytics pings.
Everything a user triggered surfaces its failure.

### API errors

Error responses are `{ error: { code, message, statusCode, correlationId, details? } }`,
and 5xx messages are generic. `readError` in `lib/api/http.ts` maps them. Never
render a raw body.

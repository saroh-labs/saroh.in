# 18 · Modular activation release gate

> Cross-release quality + activation gate for the cross-product UX epic (#111,
> Task 10 / issue #125). Every UX change to an activation journey must pass this
> gate before merge. The browser checks run with the repo's `agent-browser`
> approach against a running, seeded stack; the API-side authorization/leakage
> checks run in the api unit + integration suites.

## 1. Activation variants (run every journey against each)

| Variant       | Modules enabled                    | Actors                     |
| ------------- | ---------------------------------- | -------------------------- |
| service-only  | CRM, Appointments, Communications  | OWNER, restricted MEMBER   |
| commerce-only | Commerce, Payments, Communications | ADMIN, direct-grant MEMBER |
| hybrid        | all initial modules                | OWNER, team-grant MEMBER   |
| no-module     | none                               | OWNER                      |

Journeys: enable a module · publish a site · create + progress a lead · create a
service + booking · create a product + fulfil an order · connect a provider ·
find one customer's history (baselines in [17_CURRENT_STATE_DELTA](./17_CURRENT_STATE_DELTA.md)).

## 2. Quality thresholds (every journey, every variant)

- **No inaccessible module/action leakage** — a disabled/unselected/unauthorized
  module never appears in operational nav, quick-create, command menu, or Home
  actions. (Enforced server-side by the availability projection; the fail-open
  nav rule applies only during dark rollout.)
- **No client-side-only authorization or entitlement gate** — every gate is
  enforced by the API; the UI only reflects it.
- **Keyboard**: no traps; visible focus; focus restored after dialogs/drawers.
- **Contrast**: WCAG AA in light AND dark.
- **Reduced motion**: honored (`prefers-reduced-motion`).
- **Reflow**: 320px and 390px with no hidden operations; no forced horizontal
  scroll for core operations.
- **States**: deliberate loading, empty, error, success, disabled, setup,
  attention, and forbidden states — each visually and semantically distinct.

## 3. Activation metrics (canonical AnalyticsEvent model, no customer PII)

Capture, per Organization: module enabled · setup completed · first
publish/lead/booking/order · first provider connection · time-to-first-value.
Emit through the existing versioned `AnalyticsEvent` contract only — never
free-form logs, never customer identifiers.

## 4. Final gates (before merge)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && git diff --check
```

Plus `agent-browser` rendered checks for every changed route (attach evidence to
the PR). DB-backed activation/e2e specs require a real Postgres (`test:int`).

## Status

The gate is defined here and cross-linked from the accessibility/responsive
guides. Automated `agent-browser` activation specs under
`apps/app.saroh.in/tests/activation/` require a running seeded stack and are the
remaining work; the API-side leakage/authorization guarantees are already unit-
tested (capabilities, home, customer-workspace, provider-health suites).

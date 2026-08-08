# Module capabilities — rollout & rollback runbook

Operational guide for turning on ADR-003 Organization modules safely. Everything
ships **dark**; nothing below changes behavior until the explicit steps are run.

## The four gates (recap)

A capability operation is available only when all pass: **rollout flag** (Saroh
kill-switch, `MODULE_*` flags default false) · **module installation** (the
Organization enabled it, and the Project selected it) · **entitlement** · **authorization**.
Readiness (`SETUP_REQUIRED`/`ACTIVE`/`ATTENTION_REQUIRED`) is derived, never stored.

## Switches

| Switch                   | Where                             | Default | Effect                                                                                                                                                                                        |
| ------------------------ | --------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MODULE_*` rollout flags | FeatureFlag registry (per module) | off     | Saroh-side kill switch per module surface                                                                                                                                                     |
| `MODULE_ENFORCEMENT`     | env (api)                         | unset   | When `1`/`true`, `ModuleEnforcementGuard` actually refuses unavailable modules. Runtime kill-switch (live `process.env` read, mirrors `RLS_ENFORCEMENT`). Declared in `turbo.json` globalEnv. |

The frontend nav (`filterNavGroups`) is **fail-open**: while no module reports
available it shows the full nav, so dark rollout never empties the app.

## Rollout order

1. **Schema only** — the additive `OrganizationModule`/`ProjectModule` tables +
   constraints are deployed (`20260722120000_add_organization_modules`). Nothing
   reads them yet. Run `prisma migrate deploy`, then the migration verification
   queries in the plan (`§Migration verification queries`) — both must return
   zero rows.
2. **Backfill** — run `backfillOrganizationModules()` (post-`migrate deploy`
   step). Reconcile: every Organization has one row per module; no duplicates;
   evidence-derived modules are `ENABLED`. Enforcement stays off.
3. **Shadow** — with `MODULE_ENFORCEMENT` still unset, sample `evaluate()` for
   live traffic and log where computed availability would differ from current
   behavior. Investigate every mismatch before proceeding.
4. **Internal Organization** — set `MODULE_ENFORCEMENT=1` for a controlled test
   Organization/deploy; exercise Settings → Modules, enable/disable, and the
   annotated endpoints.
5. **Selected beta** — confirm service-only, commerce-only, and hybrid
   Organizations behave correctly, including retained historical reads.
6. **Default on** — enable enforcement broadly after seven days with no
   unexplained shadow mismatches or reconciliation failures.

## Adopting enforcement on an endpoint

Enforcement is opt-in per endpoint and safe to ship ahead of the flip:

```ts
// in a domain module
imports: [CapabilitiesModule]           // exports ModuleEnforcementGuard

// on the controller — AFTER OrganizationGuard so the context is resolved
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("CRM")
```

Guidance: annotate **new commands first**, then existing create/update/publish
handlers, module by module. NEVER annotate public checkout/booking/publication,
webhook inboxes, refund/delivery-status, or historical/reconciliation reads —
those must keep working after a module is disabled.

## Rollback

1. Set `MODULE_ENFORCEMENT` off (unset / `0`).
2. Leave tables, selections, and audit rows intact — **never** down-migrate or
   delete module configuration during an incident.
3. Confirm public checkout/booking/publication + webhook handling match
   pre-enforcement behavior.
4. Investigate with correlation IDs + blocker codes; forward-fix only.

Re-enabling restores the same selected modules and derived readiness — no data
is lost across a disable/re-enable cycle.

## Remaining verification (needs a live Postgres)

- `pnpm --filter @saroh/api test:int` incl. the module backfill + persistence
  integration spec.
- The per-domain enforcement e2e matrix (enabled/disabled org, selected/unselected
  project, role denial, retained historical reads) as endpoints adopt the guard.
- First-journey e2e with modules enabled.

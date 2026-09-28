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
the guard needs an organization context a visitor or provider does not have,
and most of these must keep working after a module is disabled.

Public booking is the exception to "keep working": it stays unannotated, but
`BookingsService` answers **410** on availability and booking when the
Organization's `APPOINTMENTS` row exists and is not `ENABLED`
(`modules/bookings/appointments-open.ts`; a missing row counts as on). This
check reads the row directly and does not depend on `MODULE_ENFORCEMENT`, so
turning enforcement off does not reopen booking for a merchant who switched
Appointments off.

## Splitting a module out: Class packs (E12)

Class packs was part of Appointments until round 2, and is now its own
module, `CLASS_PACKS`, which needs Appointments. The API gates `/class-packs`
and "use a pack on a booking" on it, and refuses a sale when the business's
CLASS_PACKS row is off. The flag resolver fails closed on an unregistered
flag, so without a step first, every business that sells packs would lose
them the moment the new API is live under `MODULE_ENFORCEMENT`.

1. **Before deploying the API**, run the backfill on the instance:
   `pnpm --filter @saroh/database exec tsx src/backfill/class-packs-module.cli.ts`.
   It needs no migration (`OrganizationModule.moduleKey` is a string). It:
    - registers `MODULE_CLASS_PACKS` with `MODULE_APPOINTMENTS`'s value for
      everyone, and copies each business's Appointments override, with a
      `FeatureFlagAudit` row for every write (actor
      `system:class-packs-backfill`). A flag already registered is left alone;
    - writes a CLASS_PACKS row for each business without one: ENABLED where it
      has a pack or a purchase and Appointments isn't switched off, DISABLED
      otherwise. A row that is already there is never changed.
      It prints what it did and is safe to run again (a second run writes
      nothing). The admin console's module repair (`backfillOneOrganization`)
      now also counts a pack or a purchase as Class packs evidence.
2. Deploy the API, then the app. The previous app keeps working against the
   new API: its rail still keys Class packs on Appointments, and the routes
   answer as long as step 1 ran.
3. Check one business that sells packs still reaches Bookings › Class packs,
   and one that never did (a clinic) no longer lists it.

Rollback: redeploy the previous API. The flag and the rows can stay: the
previous API lists and gates only the keys it knows. One exception, also true
between step 1 and step 2: its admin-console module repair counts a
business's rows and refuses one that has the extra CLASS_PACKS row, so repair
a business only on the new API.

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

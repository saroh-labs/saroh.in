---
name: saroh-module-capability
description: Use when adding or changing a capability module, a capability-gated route or endpoint, or navigation that depends on what an Organization has switched on
---

# Saroh Capability Modules

## Overview

Ten customer-owned capability modules (ADR-003 / DEC-016; Courses joined in ADR-007, Class packs in round 2's E12), selected per
Organization and optionally per Project. **Separate from feature flags and
entitlements**: a flag is ours, an entitlement is billing, a module is the
merchant's answer to "what does your business need to do?".

**Core principle:** turning a capability off never deletes what it held. Say so
in the copy, every time — a merchant who believes otherwise will never turn
anything off again.

## The registry is the source of truth

`apps/api.saroh.in/src/modules/capabilities/module-registry.ts`. Each
descriptor declares its key, label, `rootRoutes`, `requiredAction`,
`dependencies`, `rolloutFlag`, readiness adapter and deactivation policy. It is
validated at startup: unknown keys, dependency cycles and routes that do not
start with `/` all fail loudly.

Adding a module means adding a descriptor — not scattering a string literal.

## Four gates, and they are not the same question

A module is _available_ only if all of them hold. Getting these confused is the
usual bug:

1. **Rollout flag** — is this module switched on for the platform at all?
2. **Selection** — has the Organization (or Project) enabled it?
3. **Dependencies** — Appointments depends on CRM; a dependency that is off
   makes the dependant unavailable, not broken.
4. **Permission** — does the actor hold the descriptor's `requiredAction`?

Readiness (`ACTIVE` / `SETUP_REQUIRED` / `ATTENTION_REQUIRED` / `DISABLED`) is
**derived, never stored**.

**`ACTIVE` and "available" are different, and Home depends on the difference.**
`ACTIVE` means ready to take NEW work; a module can be `SETUP_REQUIRED` and
still hold real records. Appointments with no availability windows is exactly
that: it cannot take a new booking, but the ten already on the books are real.
Gate read-only bands (a schedule, a count) on availability; gate ACTIONS on
`ACTIVE`. Gating the schedule on `ACTIVE` hid bookings from Home while the
sidebar still linked to them — the workspace contradicting itself.

## Shipping dark

Modules ship behind `MODULE_*` rollout flags that default off, with
`MODULE_ENFORCEMENT` unset. To see them in a dev database you must insert the
`FeatureFlag` rows yourself; nothing seeds them.

**Splitting a module out of one that exists** (Class packs out of
Appointments, E12) needs more than a descriptor: production resolves an
unregistered flag to off, so everyone who used the feature loses it on the
release. Ship a backfill that registers the new flag with the old module's
value and overrides, and writes each business's row from evidence (never
over a row that is there). Run it before the API that gates on the new key
(`packages/database/src/backfill/class-packs-module.ts`,
`runbooks/MODULE_ROLLOUT.md`).

## Gating an endpoint

`@RequireModule` + `ModuleEnforcementGuard`. The annotation rollout is complete
(#117, `c3d09f9`): 19 controllers across all eight modules carry it, some per
handler where routes must survive the module being switched off.
`apps/api.saroh.in/src/modules/capabilities/module-annotations.spec.ts` is the
source of truth for which routes are gated and which must never be — a new
controller in a gated domain gets the decorator and an entry in that spec.

A read of records already made (orders, bookings, customers, plans and
subscriptions, class packs and their purchases, courses and enrolments) is
history: put `@RequireModule` on the controller's write handlers, never on the
class, so switching the module off hides the screens but keeps the history
readable. Cancelling a commitment already made (an order, a booking, a
subscription, a course enrolment), refund included, is **wind-down** and is
left ungated too; role permissions still apply (owner, 9 Oct, DEC-057).
`history-reads.gate.spec.ts` names every handler as read, wind-down or gated. Before turning enforcement on, run
`MODULE_ENFORCEMENT=shadow` and read the `module_enforcement_would_refuse`
lines (`runbooks/MODULE_ROLLOUT.md`, step 3).

## Gating a surface

`ModuleGate` at a section's `layout.tsx`, so a deep link to a detail page is
covered by one check rather than each page remembering. It renders
`CapabilityOffState`, visibly distinct from an empty list, because "Commerce
is turned off" and "you have no orders" are different facts
([[saroh-product-states]]).

The exception is an `UNAUTHORIZED` blocker, which renders `AccessDenied`.
Readiness is `DISABLED` whenever any gate is closed, permission included, and
"turned off" is only true of the other gates. Before #274, a MEMBER was told
Website was switched off for the whole organization.

**Fail open, not closed.** `moduleAccess` renders the section when availability
is UNKNOWN. Claiming a capability is off because a lookup failed would be worse
than showing a section the server will refuse anyway once enforcement is on.

## Rules

- `requiredAction` is who may REACH the module: make it the read action a
  read-only role holds, and let `authorize()` refuse writes per route. WEBSITE
  was gated on `site:update`, which hid it from MEMBER and REVIEWER and would
  have 404'd every review route under enforcement (#274).
  `module-enforcement.roles.spec.ts` checks every role against every module.
- Never hard-code a module key in a component; read the registry.
- Never emit an action for a module the actor cannot see — that is a leak.
- Deactivation runs a policy; it does not delete rows.
- A capability that is configured-but-broken reports `ATTENTION_REQUIRED`, not
  healthy.

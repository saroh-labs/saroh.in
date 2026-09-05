---
name: saroh-module-capability
description: Use when adding or changing a capability module, a capability-gated route or endpoint, or navigation that depends on what an Organization has switched on
---

# Saroh Capability Modules

## Overview

Eight customer-owned capability modules (ADR-003 / DEC-016), selected per
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

## Gating an endpoint

`@RequireModule` + `ModuleEnforcementGuard`. **The annotation rollout is
incomplete**: as of 2026-09-05 it covers Commerce alone — categories,
customers, orders, products, product-details, imports. Bookings, sites,
contacts, leads, communications and analytics carry none. If you are adding an
endpoint in one of those domains, you are probably the person who should
annotate it (#117).

## Gating a surface

`ModuleGate` at a section's `layout.tsx`, so a deep link to a detail page is
covered by one check rather than each page remembering. It renders
`CapabilityOffState` — visibly distinct from an empty list, because "Commerce
is turned off" and "you have no orders" are different facts
([[saroh-product-states]]).

**Fail open, not closed.** `moduleAccess` renders the section when availability
is UNKNOWN. Claiming a capability is off because a lookup failed would be worse
than showing a section the server will refuse anyway once enforcement is on.

## Rules

- Never hard-code a module key in a component; read the registry.
- Never emit an action for a module the actor cannot see — that is a leak.
- Deactivation runs a policy; it does not delete rows.
- A capability that is configured-but-broken reports `ATTENTION_REQUIRED`, not
  healthy.

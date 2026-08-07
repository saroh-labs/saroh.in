# Product Design-System Audit Design

**Date:** 2026-07-20
**Status:** Approved
**Scope:** Every Saroh frontend, shared UI package, route, state, viewport, and theme

> **2026-08-08:** the renderer listed below as `sites.saroh.in` is now `apps/saroh.app`, served from `saroh.app`; merchant sites hang off `*.saroh.app`.

## Objective

Create a complete, evidence-backed product-design audit and a coherent design-system specification before changing production UI. The output must make redesign work independently actionable while preserving the architectural decisions already accepted in `docs/architecture/DECISIONS.md`.

The audit covers:

- `accounts.saroh.in`
- `admin.saroh.in`
- `app.saroh.in`
- `docs.saroh.in`
- `help.saroh.in`
- `marketing.saroh.in`
- `sites.saroh.in`
- `templates.saroh.in`
- `ui.saroh.in`
- `packages/ui`
- shared Tailwind, theme, typography, icon, animation, and layout foundations

No production interface redesign is part of this phase.

## Decision precedence

The design brief supplies the product-design ambition. Accepted architecture decisions remain authoritative where the two differ. In particular:

- Organization is the tenant boundary; Projects sit within Organizations.
- OWNER and ADMIN have Organization-wide access; MEMBER access can be restricted by team or direct Project grants.
- `api.saroh.in` is the business-data and authentication boundary.
- AI functionality remains deferred until the approved non-AI platform stages are complete.

AI may appear only as a clearly marked future design principle or deferred concept. It must not shape the current information architecture as though it already exists.

## Four audit gates

### 1. Inventory

Build a reproducible inventory of routes, layouts, navigation surfaces, forms, tables, dialogs, settings, empty/loading/error states, shared components, local component copies, tokens, themes, icons, motion, and responsive rules.

### 2. Evidence-based audit

Audit source and rendered behavior. Each finding records:

- application, route, and affected state;
- evidence through `file:line`, screenshot, or both;
- severity and confidence;
- accessibility, usability, consistency, performance, and responsive impact;
- recommended resolution and dependencies.

Rendered audits use a fixed route matrix, deterministic data, and fixed viewports. The current Vercel Web Interface Guidelines are the minimum interaction and accessibility baseline, supplemented by WCAG-oriented keyboard, contrast, semantics, reduced-motion, zoom, and reflow checks.

### 3. Design definition

Define the intended product-design system without implementing it. The definition covers philosophy, information architecture, journeys, tokens, components, layouts, style rules, and Figma organization.

Every target-state proposal distinguishes:

- current behavior;
- approved near-term target;
- planned later-stage behavior;
- explicitly deferred concepts.

### 4. Prioritized backlog

Translate findings into independently executable tasks. Each item includes an ID, title, problem, proposed solution, files/components, effort, dependencies, acceptance criteria, priority, and milestone.

## Audit execution order

1. Foundations and tooling: tokens, CSS, Tailwind, fonts, themes, icons, motion, shared UI.
2. Application shells: layouts, navigation, Organization/Project context, responsive shells.
3. Core authenticated product: onboarding, contacts, leads, pipeline, services, bookings, sites, stores, analytics, notifications, settings.
4. Supporting and public products: accounts, admin, marketing, sites, templates, docs, help, and UI showcase.
5. Cross-cutting states: empty, loading, error, validation, permissions, long content, keyboard, responsive, dark mode, reduced motion.
6. Synthesis: scores, inconsistency patterns, target system, prioritized backlog, and implementation order.

## Deterministic audit fixture

Rendered evidence must not depend on an arbitrary developer account. A guarded audit fixture will provide:

- multiple Organizations;
- multiple Projects per Organization;
- OWNER, ADMIN, and restricted MEMBER scenarios;
- team and direct Project access;
- populated and empty modules;
- long names and content;
- validation and error cases;
- restricted and forbidden states;
- representative records for every core module.

The fixture must be deterministic, idempotent, restricted to non-production databases, and documented with safe reset instructions.

## Required deliverables

The final design-system package is:

1. `docs/design-system/01_PRODUCT_DESIGN_PHILOSOPHY.md`
2. `docs/design-system/02_INFORMATION_ARCHITECTURE.md`
3. `docs/design-system/03_USER_JOURNEYS.md`
4. `docs/design-system/04_DESIGN_TOKENS.md`
5. `docs/design-system/05_COMPONENT_LIBRARY.md`
6. `docs/design-system/06_LAYOUT_SYSTEM.md`
7. `docs/design-system/07_STYLE_GUIDE.md`
8. `docs/design-system/08_PRODUCT_AUDIT.md`
9. `docs/design-system/09_DESIGN_BACKLOG.md`
10. `docs/design-system/10_FIGMA_STRUCTURE.md`

Supporting evidence lives under `docs/design-system/_evidence/` and is linked from the audit rather than duplicated.

## Completion criteria

The phase is complete only when:

- every discovered route and shared component has an audit disposition;
- every critical route has desktop and mobile rendered evidence, with tablet evidence where layout behavior changes;
- authenticated, empty, populated, error, loading, permission, and long-content scenarios are represented;
- all ten required documents are internally consistent and reference evidence;
- the final summary includes UX, consistency, accessibility, and scalability scores; the top 50 improvements; top 20 inconsistencies; highest-impact work; implementation order; effort; and first milestone;
- no production UI redesign has been mixed into the audit commit.

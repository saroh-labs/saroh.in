# Product Design-System Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a complete, reproducible UX/UI audit and ten-document design-system specification for every Saroh frontend and shared UI layer, without changing production interface behavior.

**Architecture:** Treat the audit as a small evidence pipeline: deterministic fixture data feeds a route/state matrix; static inventory and rendered inspection produce normalized findings; those findings feed target-system documents and an independently executable backlog. Existing architecture decisions are constraints, not subjects for silent redesign.

**Tech Stack:** Turborepo, pnpm, Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/Radix UI, Prisma/PostgreSQL, Vitest/Jest where already configured, `agent-browser`, Markdown, JSON, CSV.

---

## Guardrails

- Do not change production page, component, CSS, token, or navigation behavior in this phase.
- Do not introduce AI features. Label AI concepts as deferred according to `DEC-015`.
- Do not treat planned routes or features as current. Mark every item `Current`, `Target`, `Planned`, or `Deferred`.
- Do not store secrets, real customer data, or production identifiers in fixtures or evidence.
- Use `agent-browser` for rendered audits and screenshots.
- Fetch the current [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) at audit start; record its retrieval date in the evidence index.
- Use these baseline viewports: desktop `1440x1000`, tablet `1024x768`, mobile `390x844`. Add `320x568` reflow checks for dense or high-risk screens.
- Commit evidence and documentation in reviewable slices. Screenshots may be grouped by application; never mix redesign work into these commits.

## Task 1: Establish the audit workspace and validation contract

**Files:**

- Create: `docs/design-system/_evidence/README.md`
- Create: `docs/design-system/_evidence/audit-manifest.json`
- Create: `scripts/design-audit/validate-manifest.mjs`
- Create: `scripts/design-audit/validate-manifest.test.mjs`
- Modify: `package.json`

**Step 1: Write the failing manifest validator test**

Test that validation fails when an application, route, state, viewport, required document, or finding evidence reference is absent. Use Node's built-in test runner so the audit tooling adds no dependency.

Run: `node --test scripts/design-audit/validate-manifest.test.mjs`
Expected: FAIL because the validator does not exist.

**Step 2: Implement the minimum validator**

The manifest schema must include:

```json
{
    "version": 1,
    "baselineDate": "2026-07-20",
    "applications": [],
    "viewports": ["desktop", "tablet", "mobile", "narrow-mobile"],
    "requiredStates": [
        "default",
        "loading",
        "empty",
        "error",
        "validation",
        "restricted",
        "long-content"
    ],
    "requiredDocuments": [],
    "routes": [],
    "components": [],
    "findings": []
}
```

Make the validator report actionable missing IDs and broken evidence paths.

**Step 3: Add audit scripts**

Add root scripts:

```json
"audit:design:validate": "node scripts/design-audit/validate-manifest.mjs docs/design-system/_evidence/audit-manifest.json",
"audit:design:test": "node --test scripts/design-audit/*.test.mjs"
```

**Step 4: Document evidence naming**

In `_evidence/README.md`, define finding IDs (`DSA-APP-001`), screenshot paths, severity (`critical/high/medium/low`), confidence (`high/medium/low`), status, and source-link format.

**Step 5: Verify and commit**

Run:

```bash
pnpm audit:design:test
pnpm audit:design:validate
```

Expected: PASS with an intentionally incomplete-but-schema-valid initial manifest whose completeness gates are marked pending.

Commit: `chore(design-audit): establish evidence manifest and validation`

## Task 2: Generate the repository UI inventory

**Files:**

- Create: `scripts/design-audit/inventory.mjs`
- Create: `scripts/design-audit/inventory.test.mjs`
- Create: `docs/design-system/_evidence/routes.json`
- Create: `docs/design-system/_evidence/components.json`
- Create: `docs/design-system/_evidence/foundations.json`
- Modify: `docs/design-system/_evidence/audit-manifest.json`

**Step 1: Write failing inventory tests**

Cover App Router groups, dynamic segments, nested layouts, loading/error/not-found files, components in every app and `packages/ui`, CSS entry points, Tailwind configs, fonts, theme providers, icon imports, and animation libraries.

Run: `node --test scripts/design-audit/inventory.test.mjs`
Expected: FAIL until the scanner exists.

**Step 2: Implement deterministic discovery**

Scan only tracked source directories. Normalize dynamic routes (for example `/contacts/[id]`) and attach their page, nearest layout, state files, application package, and auth classification.

The component inventory must distinguish:

- shared `packages/ui` components;
- app-local primitives under `components/ui`;
- feature components;
- likely duplicate primitives by filename and exported symbol.

The foundation inventory must include all global CSS files, Tailwind configs, CSS variables, hard-coded colors, font declarations, radius/shadow/spacing values, theme providers, icon packages, and animation dependencies.

**Step 3: Generate evidence and reconcile manually**

Run: `node scripts/design-audit/inventory.mjs`
Expected: route, component, and foundation JSON files are regenerated stably.

Check every discovered Next application against its `package.json`, including accounts, admin, app, docs, help, marketing, sites, templates, and UI showcase.

**Step 4: Update the manifest**

Assign stable IDs to all routes and components. Add purpose, primary user, auth level, Organization/Project context, primary action, required states, and audit status.

**Step 5: Verify and commit**

Run:

```bash
pnpm audit:design:test
pnpm audit:design:validate
git diff --check
```

Commit: `docs(design-audit): inventory routes components and foundations`

## Task 3: Create the deterministic UX audit fixture

**Files:**

- Create: `apps/api.saroh.in/test/fixtures/ux-audit.fixture.ts`
- Create: `apps/api.saroh.in/test/fixtures/ux-audit.fixture.spec.ts`
- Create: `apps/api.saroh.in/scripts/seed-ux-audit.ts`
- Create: `docs/design-system/_evidence/FIXTURE.md`
- Modify: `apps/api.saroh.in/package.json`

**Step 1: Write fixture contract tests**

Assert that the fixture is deterministic and contains:

- two Organizations and at least three Projects;
- OWNER, ADMIN, unrestricted MEMBER, and restricted MEMBER users;
- team grants and direct Project grants;
- empty and populated records for every implemented core module;
- long names, overflow text, zero values, high counts, past/future dates, and validation-edge data;
- forbidden and no-access scenarios.

Assert the seed refuses to run when `NODE_ENV=production` or when the database host/name is not explicitly approved for audit use.

**Step 2: Run the failing test**

Run the API package's existing test command scoped to `ux-audit.fixture.spec.ts`.
Expected: FAIL because the fixture is absent.

**Step 3: Implement idempotent fixture creation**

Use stable external IDs and upserts inside a transaction. Reuse existing service/repository boundaries where feasible. Do not bypass Organization constraints or RLS context.

**Step 4: Add guarded seed/reset commands**

Add `audit:seed` and `audit:reset` scripts. Reset must delete only records with the reserved audit fixture prefix and must print the targeted database before mutation.

**Step 5: Document accounts and scenarios**

Document local-only credentials, expected role behavior, and the route/state each record unlocks. Never commit a real secret.

**Step 6: Verify and commit**

Run fixture tests twice and compare results for idempotency. Then run the normal API test suite and typecheck.

Commit: `test(api): add deterministic product-design audit fixture`

## Task 4: Audit foundations, themes, and shared primitives

**Files:**

- Create: `docs/design-system/_evidence/audits/foundations.md`
- Create: `docs/design-system/_evidence/audits/shared-components.md`
- Create: `docs/design-system/_evidence/findings/foundations.csv`
- Modify: `docs/design-system/_evidence/audit-manifest.json`
- Inspect: `packages/ui/src/globals.css`
- Inspect: `packages/ui/src/components/ui/**`
- Inspect: `packages/ui/tailwind.config.ts`
- Inspect: `tooling/tailwind-config/tailwind.config.ts`
- Inspect: `apps/*/app/globals.css`
- Inspect: `apps/*/styles/globals.css`
- Inspect: `apps/*/tailwind.config.*`

**Step 1: Compare token sources**

Record every semantic token and divergent value. Explicitly assess the current primary/brand split, radius differences, duplicated global CSS, typography scales, shadows, z-index, spacing, breakpoints, dark mode, and focus treatment.

**Step 2: Compare primitive implementations**

For each primitive, record source of truth, local forks, API differences, accessibility behavior, states, and migration risk. Cover button, input, select, combobox, dialog, sheet, dropdown, tabs, table, card, badge, toast, tooltip, pagination, skeleton, and form field.

**Step 3: Inspect interaction foundations**

Check icons for accessible labeling, animations for reduced-motion support, interactive focus visibility, touch target size, hover-only behavior, portals/layers, dark-mode contrast, and hydration-sensitive theme behavior.

**Step 4: Record normalized findings**

Every finding must have an ID, evidence, severity, confidence, recommendation, affected applications, and dependencies. Link each finding to relevant manifest component IDs.

**Step 5: Verify and commit**

Run `pnpm audit:design:validate` and confirm every inventoried foundation and shared primitive has an audit disposition.

Commit: `docs(design-audit): assess foundations themes and shared UI`

## Task 5: Audit application shells and navigation

**Files:**

- Create: `docs/design-system/_evidence/audits/shells-and-navigation.md`
- Create: `docs/design-system/_evidence/findings/navigation.csv`
- Modify: `docs/design-system/_evidence/audit-manifest.json`
- Inspect: `apps/app.saroh.in/app/layout.tsx`
- Inspect: `apps/app.saroh.in/app/page.tsx`
- Inspect: `apps/app.saroh.in/components/organizations/organization-switcher.tsx`
- Inspect: `apps/app.saroh.in/components/stores/store-nav.tsx`
- Inspect: every other application's root and nested layouts

**Step 1: Map current navigation**

Document global, application, Organization, Project, store, contextual, utility, mobile, footer, and breadcrumb navigation. Identify dead ends, duplicated destinations, missing current-location feedback, inconsistent naming, and inaccessible controls.

**Step 2: Audit context and permission communication**

Assess how Organization, Project, store, team, and role context is shown and switched. Check that restricted MEMBER states are comprehensible without exposing unauthorized data.

**Step 3: Audit shell responsiveness**

At all baseline viewports, inspect content width, sidebars, sticky regions, safe areas, scroll containers, mobile menus, focus order, skip navigation, landmarks, and zoom/reflow.

**Step 4: Capture evidence**

Save screenshots beneath `_evidence/screenshots/shells/{viewport}/`. Capture default, expanded navigation, active location, context switcher, and restricted state.

**Step 5: Verify and commit**

Confirm every layout and navigation component from inventory has evidence and a disposition.

Commit: `docs(design-audit): audit product shells and navigation`

## Task 6: Audit the core authenticated product

**Files:**

- Create: `docs/design-system/_evidence/audits/app-saroh-in.md`
- Create: `docs/design-system/_evidence/findings/app.csv`
- Modify: `docs/design-system/_evidence/audit-manifest.json`
- Inspect: `apps/app.saroh.in/app/**`
- Inspect: `apps/app.saroh.in/components/**`

**Step 1: Start the fixture-backed product**

Run the API and `application` package using local audit configuration. Seed the deterministic fixture. Record exact commit, environment mode, and fixture version in the evidence index.

**Step 2: Audit every route group**

Cover dashboard/home, onboarding, contacts and detail, leads and detail, pipeline, services list/create/detail, bookings, sites list/create/detail, stores and nested products/orders/customers/content/members/settings, analytics, notifications, and settings.

For each route capture:

- purpose, user, context, and primary action;
- default, loading, empty, populated, error, validation, restricted, and long-content behavior where applicable;
- navigation and deep-link behavior;
- desktop and mobile evidence, plus tablet where structure changes;
- keyboard sequence, semantics, accessible names, contrast, reduced motion, and 200% zoom/reflow;
- responsive table/form/dialog behavior;
- API-backed completeness versus placeholder or mock UI;
- avoidable performance problems such as layout shift, waterfalls, excessive client boundaries, or unbounded lists.

**Step 3: Use consistent browser evidence commands**

For every scenario use `agent-browser open`, `snapshot -i`, `screenshot`, and viewport changes. Reset browser state between role/context scenarios. Store screenshots under `_evidence/screenshots/app/{route-id}/{viewport}-{state}.png`.

**Step 4: Normalize findings**

Do not write isolated page opinions. Link repeated problems to a shared pattern finding and list every affected route ID.

**Step 5: Verify and commit**

Manifest validation must report zero unaudited `app.saroh.in` routes and zero missing critical-route mobile screenshots.

Commit: `docs(design-audit): audit authenticated product experience`

## Task 7: Audit accounts and administration

**Files:**

- Create: `docs/design-system/_evidence/audits/accounts-and-admin.md`
- Create: `docs/design-system/_evidence/findings/accounts-admin.csv`
- Modify: `docs/design-system/_evidence/audit-manifest.json`
- Inspect: `apps/accounts.saroh.in/**`
- Inspect: `apps/admin.saroh.in/**`

**Step 1: Audit authentication journeys**

Cover login, signup, forgot password, reset password, callback/redirect behavior, authenticated app handoff, invalid/expired states, password-manager compatibility, autofill, validation, error recovery, loading, and mobile keyboard behavior.

**Step 2: Audit admin safety and clarity**

Cover admin landing, navigation, authorization failures, destructive/action confirmation patterns, data density, empty states, auditability, and separation from Organization-facing controls.

**Step 3: Capture all baseline viewports and keyboard paths**

Store evidence under `_evidence/screenshots/accounts/` and `_evidence/screenshots/admin/`.

**Step 4: Verify and commit**

Manifest validation must report zero unaudited accounts/admin routes.

Commit: `docs(design-audit): audit accounts and administration`

## Task 8: Audit public, content, template, and reference applications

**Files:**

- Create: `docs/design-system/_evidence/audits/public-and-supporting-apps.md`
- Create: `docs/design-system/_evidence/findings/public-supporting.csv`
- Modify: `docs/design-system/_evidence/audit-manifest.json`
- Inspect: `apps/marketing.saroh.in/**`
- Inspect: `apps/sites.saroh.in/**`
- Inspect: `apps/templates.saroh.in/**`
- Inspect: `apps/docs.saroh.in/**`
- Inspect: `apps/help.saroh.in/**`
- Inspect: `apps/ui.saroh.in/**`

**Step 1: Audit marketing and waitlist**

Assess proposition clarity, information hierarchy, navigation, CTA hierarchy, form states, trust, readability, responsive behavior, page metadata, and consistency with the actual product stage.

**Step 2: Audit generated/public sites**

Cover home, post/detail, and checkout routes; variable content lengths; missing images; pricing/amount formatting; cart/checkout errors; loading; mobile; performance; and Organization-brand versus Saroh-brand boundaries.

**Step 3: Audit templates**

Assess template discovery, preview context, responsive preview, component consistency, empty/error states, and the path from preview to use.

**Step 4: Audit docs and help**

Assess content hierarchy, search/navigation, code/content readability, heading structure, keyboard access, mobile tables/code blocks, broken/dead-end paths, and visual relationship to the product.

**Step 5: Audit the UI showcase as design-system evidence**

Compare documented/showcased states with components that actually ship. Record missing states, misleading examples, inaccessible examples, and drift.

**Step 6: Verify and commit**

Manifest validation must report zero unaudited routes across these six applications.

Commit: `docs(design-audit): audit public and supporting experiences`

## Task 9: Run cross-cutting accessibility, responsiveness, and state audits

**Files:**

- Create: `docs/design-system/_evidence/audits/cross-cutting.md`
- Create: `docs/design-system/_evidence/findings/cross-cutting.csv`
- Modify: `docs/design-system/_evidence/audit-manifest.json`

**Step 1: Run global interaction checks**

Across representative routes from every shell, verify:

- keyboard-only operation and logical focus order;
- visible focus and focus restoration after dialogs/sheets;
- semantic landmarks, headings, labels, descriptions, and live regions;
- contrast in light/dark themes and all component states;
- reduced-motion behavior;
- 200% zoom and narrow-width reflow;
- touch target sizes and hover independence;
- safe-area and fixed/sticky overlap;
- localization expansion and long unbroken strings;
- loading, empty, error, offline/retry, forbidden, and destructive states.

**Step 2: Audit forms and data displays as systems**

Compare validation timing, error placement, required/optional cues, submission locking, success feedback, table density, responsive alternatives, sorting/filter state, pagination, URLs, and bulk actions.

**Step 3: Audit performance-visible UX**

Record layout shifts, image sizing, font loading, skeleton mismatch, expensive animations, oversized client components, and interaction delays. This is a UX performance audit, not a full infrastructure benchmark.

**Step 4: Verify and commit**

Every required cross-cutting state in the manifest must have at least one evidence example and all critical components must have keyboard/mobile coverage.

Commit: `docs(design-audit): assess cross-cutting product quality`

## Task 10: Define philosophy, information architecture, and journeys

**Files:**

- Create: `docs/design-system/01_PRODUCT_DESIGN_PHILOSOPHY.md`
- Create: `docs/design-system/02_INFORMATION_ARCHITECTURE.md`
- Create: `docs/design-system/03_USER_JOURNEYS.md`
- Reference: `docs/architecture/DECISIONS.md`
- Reference: `docs/architecture/TARGET_ARCHITECTURE.md`

**Step 1: Write product-design principles**

Define calmness, clarity, progressive disclosure, trustworthy automation, Organization/Project context, accessibility, responsive behavior, and India-first operational realities. Mark AI assistance as deferred, not present-day product behavior.

**Step 2: Write current and target IA**

Include application boundaries, global/product navigation, Organization and Project hierarchy, role-aware navigation, stores/sites/services relationships, admin separation, mobile navigation, URL conventions, and current/target/planned/deferred labels.

**Step 3: Write end-to-end journeys**

Cover account creation, first Organization, first Project, inviting members, team/project access, first site/store/service, first customer/lead, booking/order/payment, provider setup, self-test communication, analytics, settings, errors, and leaving/switching context.

For each journey include actor, prerequisites, happy path, alternate/permission/error paths, key UI surfaces, trust/accessibility requirements, and success signal.

**Step 4: Review against evidence and architecture**

Every proposed IA or journey change must link to a finding or an explicit architecture decision.

**Step 5: Verify and commit**

Run `pnpm audit:design:validate` and a broken-link check over `docs/design-system`.

Commit: `docs(design-system): define philosophy IA and journeys`

## Task 11: Define tokens, components, layouts, and style rules

**Files:**

- Create: `docs/design-system/04_DESIGN_TOKENS.md`
- Create: `docs/design-system/05_COMPONENT_LIBRARY.md`
- Create: `docs/design-system/06_LAYOUT_SYSTEM.md`
- Create: `docs/design-system/07_STYLE_GUIDE.md`

**Step 1: Specify semantic tokens**

Define naming and intended values/relationships for color, typography, spacing, size, radius, border, shadow, opacity, motion, z-index, breakpoints, container widths, and density. Include light/dark mappings, contrast requirements, and a migration map from every current token source.

**Step 2: Specify the component library**

For each primitive and product pattern define anatomy, variants, sizes, states, accessibility contract, content rules, responsive behavior, composition rules, source-of-truth package, and deprecation/migration notes.

Include navigation, Organization/Project switchers, forms, tables, filters, dialogs, sheets, command/search, empty/error/loading, permission states, metrics, timelines, editors, upload, checkout, and notifications.

**Step 3: Specify layout systems**

Define application shells, navigation modes, content grids, detail/list/master-detail patterns, form widths, dashboards, settings, mobile structure, sticky regions, safe areas, and density modes.

**Step 4: Specify the style guide**

Cover voice, labels, capitalization, dates/times/currency/Indian numbering, icons, imagery, charts, motion, empty/error/success copy, destructive language, accessibility writing, and do/don't examples.

**Step 5: Verify and commit**

Cross-check every audited inconsistency category against a target rule or an explicit deliberate exception.

Commit: `docs(design-system): specify tokens components layouts and style`

## Task 12: Synthesize the product audit and scores

**Files:**

- Create: `docs/design-system/08_PRODUCT_AUDIT.md`
- Modify: `docs/design-system/_evidence/audit-manifest.json`

**Step 1: Define scoring before calculating**

Document a 0–5 rubric for usability, visual consistency, accessibility, scalability, navigation, responsive quality, state completeness, and performance-visible UX. Weight critical routes and repeated system failures more heavily than isolated cosmetic issues.

**Step 2: Write every-page audit summaries**

For every route include current state, UX issues, visual issues, navigation issues, accessibility, performance-visible UX, inconsistencies, recommended changes, priority, and evidence links.

**Step 3: Write cross-product synthesis**

Include:

- overall UX score;
- visual consistency score;
- accessibility score;
- scalability score;
- top 50 UX improvements;
- top 20 design inconsistencies;
- highest-impact improvements;
- recommended implementation order;
- effort summary;
- recommended first milestone.

**Step 4: Quality-check claims**

Every numeric score, top-list entry, and high/critical finding must trace to normalized evidence. Remove unsupported impressions and duplicate findings.

**Step 5: Verify and commit**

The manifest validator must report zero missing route dispositions, zero orphan findings, and zero broken screenshot/source references.

Commit: `docs(design-system): publish evidence-backed product audit`

## Task 13: Create the implementation backlog and Figma structure

**Files:**

- Create: `docs/design-system/09_DESIGN_BACKLOG.md`
- Create: `docs/design-system/10_FIGMA_STRUCTURE.md`

**Step 1: Convert findings into independently grabbable tasks**

Every backlog item must include:

- ID and title;
- problem and evidence/findings;
- proposed solution;
- exact applications/files/components;
- effort (`XS/S/M/L/XL`);
- dependencies;
- acceptance criteria;
- priority and milestone;
- accessibility/responsive verification where applicable.

Organize work as vertical milestones: foundations, shell/navigation, first complete core journey, remaining modules, public/supporting apps, and polish. Avoid a months-long tokens-only phase that leaves users with no completed journey.

**Step 2: Define Figma organization**

Specify files/pages for foundations, components, patterns, application shells, journeys, explorations, archived work, and developer handoff. Define naming, variants, variables/modes, responsive frames, annotations, status, ownership, versioning, and code linkage.

Do not claim a Figma file exists unless one is actually created later.

**Step 3: Reconcile backlog coverage**

Every accepted recommendation in the audit must map to one backlog item; every backlog item must trace back to evidence or an approved target-system requirement.

**Step 4: Verify and commit**

Run manifest validation and documentation link checks.

Commit: `docs(design-system): prioritize redesign backlog and Figma model`

## Task 14: Final completeness and handoff gate

**Files:**

- Modify: `docs/design-system/_evidence/audit-manifest.json`
- Modify: any of the ten design-system documents only to resolve verified inconsistencies

**Step 1: Run automated checks**

```bash
pnpm audit:design:test
pnpm audit:design:validate
pnpm typecheck
pnpm lint
git diff --check
```

Expected: all pass. If unrelated baseline failures exist, capture the exact command/output and distinguish them from audit changes.

**Step 2: Run the completeness matrix**

Confirm:

- every application, route, layout, shared component, and foundation is inventoried;
- every route has a disposition;
- critical routes have required viewport/state evidence;
- all ten required documents exist;
- current/target/planned/deferred labels are consistent;
- Organization/Project/role terminology matches architecture decisions;
- AI remains deferred;
- every high/critical finding maps to backlog work;
- every score and summary claim is evidence-backed;
- no production UI file changed.

**Step 3: Review the diff boundary**

Run `git diff --name-only <audit-base>...HEAD`. Expected changed paths are limited to audit tooling, guarded audit fixture files, `.gitignore`, and `docs/design-system/**`/`docs/plans/**`.

**Step 4: Final commit**

Commit: `docs(design-system): complete product audit and redesign plan`

## Handoff after this plan

The next implementation effort should begin only after the audit package is reviewed. Start with the first vertical milestone named in `09_DESIGN_BACKLOG.md`, execute it on an isolated branch/worktree, use test-driven implementation for behavior changes, and validate affected routes with browser evidence before merging.

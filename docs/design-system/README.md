# Saroh Canvas — Design System & UX Audit

The design language, component system, and full UX audit for Saroh (the
AI-powered Business OS). **Design language: _Saroh Canvas_** — calm,
content-first, single-product; one primary action per screen; progressive
disclosure; every screen answers _Where am I / What can I do / What next_.

> **Status: audit + specification (docs only).** No UI/app/config code is
> changed by these documents. Per the brief, implementation does not begin until
> this plan is reviewed. Ground truth: `apps/app.saroh.in` (35 routes) +
> `@saroh/ui` (46 primitives), 2026-07-20.

## Start here

- **[00_FINAL_REPORT.md](./00_FINAL_REPORT.md)** — capstone: 5 headline scores,
  Top-100 UI / Top-50 UX / Top-30 inconsistencies / Top-20 components, effort per
  milestone, file-impact map. **Overall UX 5.3/10.**

## Foundations

| #   | Doc                                                            | What it defines                                 |
| --- | -------------------------------------------------------------- | ----------------------------------------------- |
| 01  | [Product Design Philosophy](./01_PRODUCT_DESIGN_PHILOSOPHY.md) | Vision + the 6 Saroh Canvas principles          |
| 02  | [Information Architecture](./02_INFORMATION_ARCHITECTURE.md)   | Goal-based nav; all 35 routes mapped            |
| 06  | [Design Tokens](./06_DESIGN_TOKENS.md)                         | Type/space/color/radius/elevation/motion tokens |
| 07  | [Style Guide](./07_STYLE_GUIDE.md)                             | Voice, copy, iconography, formatting            |

## Structure

| #   | Doc                                            | What it defines                               |
| --- | ---------------------------------------------- | --------------------------------------------- |
| 03  | [Application Shell](./03_APPLICATION_SHELL.md) | Sidebar · top bar · search · ⌘K · breadcrumbs |
| 04  | [Layout System](./04_LAYOUT_SYSTEM.md)         | 12 page templates; container widths           |
| 05  | [Component Library](./05_COMPONENT_LIBRARY.md) | All 46 primitives audited + specs             |

## Audit

| #   | Doc                                          | What it defines                         |
| --- | -------------------------------------------- | --------------------------------------- |
| 09  | [Screen Inventory](./09_SCREEN_INVENTORY.md) | Every route: purpose, actions, problems |
| 10  | [UX Audit](./10_UX_AUDIT.md)                 | 1–10 scorecard across 14 categories     |

## Strategy

| #   | Doc                                                | What it defines                     |
| --- | -------------------------------------------------- | ----------------------------------- |
| 08  | [User Journeys](./08_USER_JOURNEYS.md)             | 11 ideal flows, before/after clicks |
| 11  | [Design Backlog](./11_DESIGN_BACKLOG.md)           | 60 ranked, actionable items         |
| 12  | [Implementation Plan](./12_IMPLEMENTATION_PLAN.md) | Milestones M1–M5, ~100–135 pd       |

## Quality

| #   | Doc                                                | What it defines                        |
| --- | -------------------------------------------------- | -------------------------------------- |
| 13  | [Accessibility Guide](./13_ACCESSIBILITY_GUIDE.md) | WCAG 2.2 AA; concrete pass/fail        |
| 14  | [Responsive Guide](./14_RESPONSIVE_GUIDE.md)       | Mobile-first; per-template layouts     |
| 15  | [Motion Guidelines](./15_MOTION_GUIDELINES.md)     | Duration/easing tokens; reduced-motion |
| 16  | [Figma Structure](./16_FIGMA_STRUCTURE.md)         | Code-first Figma mirror                |

## The one-line finding

Saroh is **not broken — it is unfinished at the composition layer.** The tokens
and primitives are good (and were single-sourced this session, #91–#102/#108);
what drags the product to **5.27/10** is inconsistent _composition_ — three
component sources, two toast systems, eight container widths, hand-rolled forms,
**no mobile navigation**, and a shell that answers none of the orientation
questions. The redesign is mostly **assembling primitives that already ship
unused** — not new authoring. **First move:** mobile nav via the existing
`Sheet` + retire the duplicate `apps/app.saroh.in/components/ui/` source.

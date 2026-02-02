# Documentation and Help Sites Design

**Date:** 2026-02-02  
**Status:** Design  
**Scope:** docs.saroh.in (developer docs) and help.saroh.in (product help for end users)

---

## 1. Overview and goals

Saroh.io is an educational, non-commercial project. We need two documentation surfaces:

-   **docs.saroh.in** – For developers who want to learn software development and use this project to build new things (run & tweak, or use as a template). Audience: contributors and learners, not product end users.
-   **help.saroh.in** – For end users of the Saroh product: people who use the dashboard, pricing, and other product features. Content is “how to use the product” (features, pricing, product sections), not “how to use the codebase.”

Both live in this repo under `apps/`. help.saroh.in will use the same stack and packages as docs.saroh.in (Nextra, @saroh/ui, shared tooling) for consistency and reuse.

---

## 2. docs.saroh.in – Developer documentation

### 2.1 Purpose and audience

-   **Audience:** Developers learning software development who will use this project to run, tweak, or use it as a template.
-   **Prerequisites:** Tiered. We support both experienced devs (Quick start) and beginners (Full setup from zero). A Prerequisites section makes expectations clear; two entry paths avoid overwhelming either group.

### 2.2 Structure (Approach B – linear with “Going further”)

1. **Prerequisites**  
   Single page: what readers should have (Git, Node, basic terminal). Links to “Quick start” if they’re ready, or “Full setup” if they need environment setup.

2. **Quick start**  
   Minimal steps: clone, install (pnpm), env (DATABASE_URL etc.), run (`pnpm dev` or filtered dev). Assumes Prerequisites are met.

3. **Full setup**  
   For beginners: install Node/pnpm, clone repo, set up env, first run. Can reference external “how to install Node” etc. where useful.

4. **Getting around the repo**  
   Monorepo layout: `apps/`, `packages/`, `tooling/`. What each app is for (dashboard, sites, accounts, etc.). Root scripts: `pnpm dev`, `pnpm dev:dashboard`, `pnpm build`, `pnpm db:push`, etc. Where the shared Prisma schema lives and how apps use `@saroh/database` and other packages.

5. **Core workflow**  
   One main path: run the monorepo (or a subset) → open an app (e.g. dashboard) → make a small change (e.g. UI text) → see it run. Reinforces “clone, run, edit, learn.”

6. **Going further**  
   Short sections: using the repo as a template (fork, strip/customize, deploy), deployment notes, contributing (PRs, code style). Keeps “use as template” and “run & tweak” in one doc set without maintaining two full paths.

7. **Reference**  
   Tech stack summary, folder structure, key packages (@saroh/auth, @saroh/database, @saroh/ui, etc.). Optional: per-app one-liners. No deep API docs unless we add them later.

### 2.3 Implementation notes

-   Keep using **Nextra** in `apps/docs.saroh.in` with MDX. Restructure `pages/` to match the sections above (e.g. `getting-started/`, `prerequisites.mdx`, `quick-start.mdx`, `full-setup.mdx`, `repo-overview.mdx`, `core-workflow.mdx`, `going-further.mdx`, `reference.mdx`).
-   Reuse existing auth/Nextra content where it still applies; move or remove the rest so the narrative matches the new structure.
-   No new backend or APIs: static/docs content only. Links to README, env example, and repo root scripts are enough for “how to run.”

---

## 3. help.saroh.in – Product help for end users

### 3.1 Purpose and audience

-   **Audience:** End users of Saroh: people who use the dashboard, pricing, and other product surfaces to create blogs, portfolios, or storefronts. Not developers contributing to the repo.
-   **Content:** Product-focused: how to use features, where things are in the UI, pricing and plans, account/settings, and other product-related sections. No codebase or contribution guides.

### 3.2 Scope

-   Dashboard features (e.g. creating a site, managing content, settings).
-   Pricing and plans (what’s included, limits, upgrades).
-   Other product areas (e.g. account, billing, notifications) as they exist in the product.
-   Content should stay in sync with the actual dashboard and product UI; avoid documenting unimplemented features.

### 3.3 Implementation

-   **Location:** New app under `apps/help.saroh.in` in this repo.
-   **Stack:** Same as docs.saroh.in: Nextra (or equivalent doc framework), @saroh/ui, same tooling (@saroh/eslint-config, @saroh/tsconfig) so styling and structure stay consistent.
-   **Content:** MDX (or markdown) pages organized by product area (e.g. dashboard, pricing, account). No backend or auth required for the help site itself; it’s read-only documentation.
-   **Navigation:** Sidebar/toc by section (Dashboard, Pricing, Account, etc.). Link from dashboard and marketing site to help.saroh.in for “Help” or “Docs.”

### 3.4 Boundaries

-   **docs.saroh.in** = “How do I run, change, or reuse this codebase?” (developers).
-   **help.saroh.in** = “How do I use the product?” (end users).

Cross-links are optional (e.g. “Building your own version? See docs.saroh.in”). No product help content in docs.saroh.in; no contributor/code content in help.saroh.in.

---

## 4. Summary

| Site          | Audience      | Purpose                          | Location           | Stack (shared)    |
| ------------- | ------------- | -------------------------------- | ------------------ | ----------------- |
| docs.saroh.in | Developers    | Learn & use the project (B path) | apps/docs.saroh.in | Nextra, @saroh/ui |
| help.saroh.in | Product users | How to use product & features    | apps/help.saroh.in | Same as docs      |

-   **docs.saroh.in:** Prerequisites → Quick start / Full setup → Getting around repo → Core workflow → Going further → Reference.
-   **help.saroh.in:** Product-focused help (dashboard, pricing, other sections); same repo, same packages as docs; content only, no backend.

This design is enough to implement docs restructuring and to add the help.saroh.in app when you’re ready.

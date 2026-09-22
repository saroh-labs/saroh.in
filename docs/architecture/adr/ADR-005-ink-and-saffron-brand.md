# ADR-005 — Ink & Saffron: the brand system

**Status:** Accepted — 2026-09-19 (landing on `feat/brand-system`)
**Source:** the "Saroh Brand System" page in the Claude Design project _Saroh
logo and design system_ (22 sections, v1). That page is the source of truth;
this record says how it lands in the repo, the choices made on the way, and
what is deliberately left for later.

## Decisions

- **The brand becomes the default, nothing is removed.** Ink & Saffron moves
  into the base `:root` / `.dark` register in `packages/ui/src/globals.css`.
  The old monochrome base moves, unchanged, into a legacy block that the four
  existing skins (`mono`, `panel`, `instrument`, `stockroom`) sit on. The three
  coloured skins keep their own blocks. The skin switcher hides them until the
  brand has settled; bringing one back is a one-line change in
  `apps/app.saroh.in/lib/skins.ts`.
- **Every Saroh app takes it:** app, accounts, admin, marketing (`saroh.in`),
  templates, ui, docs and help.
- **`saroh.app` does not.** Merchant sites have their own `--site-*` themes. The
  Saroh-drawn surfaces there (404, error, checkout chrome) are pinned to the
  legacy `mono` register and keep their current fonts, so nothing a shopper
  sees changes.
- **One departure from the brand file:** `--input` (the form-control edge) is
  Ink 400 rather than the file's `#D9D6CC`. The file's value measures 1.45:1 on
  a white field, and WCAG 1.4.11 needs 3:1 on a control's boundary. Ink 400
  gives 3.23:1 in light mode; in dark mode Ink 500 gives 3.38:1 on the sunken
  field.

## Phase 1 — foundations (this branch)

1. **Tokens.** Ink and Saffron ramps, Paper, Raised and Sunken surfaces, the
   status colours with their subtle pairs, the W6 chart palette, radius, Ink
   shadows and motion (100/140/200ms, ease-out), in both light and dark.
   New tokens: `-hover`/`-active` action steps, `--border-strong`, `--field`,
   `--disabled`, and `success`/`destructive`/`info` `-subtle` pairs.
2. **Type.** Geist (all UI, body copy, labels and eyebrows, `--font-sans`),
   Space Grotesk (display to H3, money and large figures, `--font-display`),
   JetBrains Mono (only for measured values like SKUs, order references,
   timestamps and routes, `--font-mono`), all self-hosted woff2 in
   `packages/ui/fonts`. The wordmark's own face, Plus Jakarta Sans 600, ships
   outlined inside `<Wordmark>`, so no app loads it. (The brand file moved UI
   and labels from Plus Jakarta Sans and mono to Geist on 2026-09-19. Checked
   against the live file.)
3. **Primitives.**
    - `Button`: 32, 38 and 45px heights with weight 600; hover one ramp step,
      pressed two; one disabled treatment; `highlight` becomes the Saffron fill.
    - `Badge`: status pills (success, warning, destructive, info, draft) and a
      neutral outline tag.
    - `Input`, `Textarea` and `Select`: white field, visible edge, disabled
      vocabulary.
4. **The mark.** A `Logo` (symbol plus wordmark) replaces the text-only
   wordmark, with an SVG favicon and app icon.
5. **Nextra docs and help.** Their restated token subset and fonts move to the
   brand.
6. **Docs.** Update `docs/patterns/frontend-design-system.md`.

## Phase 2 — structure (follow-up PRs, one per area)

These are specified in the brand file but are screen work, not tokens:

- Navigation (§13): the grouped sidebar Sell / Reach / Run, the section vs page
  states, the 2px detached Saffron marker, the flyout, and five mobile tabs.
- Tables (§10): row states, the 28px row-action target, 50-row pages, and
  two-line mobile rows under 560px.
- Forms and form layouts (§11–12): the five archetypes and their save models.
- Overlays and feedback (§14), and states (§22): loading thresholds, the
  disabled reason, the working state and the failed region.
- Data and formatting (§15), voice (§18), transactional email (§19),
  breakpoints at 1100/760/480 (§21), and the chart hairline and gridline rules
  (§8).
- Retiring the hidden skins for good, once the brand has settled.

# Verifying UI changes

> **Read when:** before calling a UI change done.
> Adapted from claude-patterns `frontend/06-verification.md`.

A UI change is done when someone has looked at it in the scenes it will be used
in, not when it compiles.

## Rules

- **Run the real stack through portless** (`pnpm dev`) and look at the
  `.localhost` hostname the app ships as. Bare ports break CORS and the shared
  session (AGENTS.md).
- **Check the four scenes, dark included:**
  `.agents/skills/saroh-four-scenes/SKILL.md`.
- **Break the source and look** at any screen that reads data. The named failed
  and partial states must appear, and nothing may turn into a zero
  (`.agents/skills/saroh-product-states/SKILL.md`).
- **Cross-origin, layout and touch questions need a browser:**
  `.agents/skills/saroh-browser-tests/SKILL.md`, `e2e/`, with
  `E2E_IGNORE_HTTPS_ERRORS=1` locally.
- **Merchant pages:** check a seeded site
  (`https://northwind.saroh.app.localhost`) and a draft preview, in the
  merchant's palette and on the neutral defaults.
- **Say what you checked.** Name the scenes and viewports. "Looks good" without
  a list means it was not checked.

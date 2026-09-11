# Verifying UI changes

> **Read when:** before calling a UI change done.
> Adapted from claude-patterns `frontend/06-verification.md`, with the gate in
> `docs/design-system/18_ACTIVATION_RELEASE_GATE.md` and the widths in
> `.agents/skills/saroh-four-scenes/SKILL.md`.

A UI change is done when someone has looked at it in the scenes it will be used
in, not when it compiles. "Testing only a desktop light-mode happy path is
insufficient" (PRODUCT_STRATEGY §18).

## Rules

- **Current** — **Run the real stack through portless** (`pnpm dev`) at the
  `.localhost` hostname the app ships as. Bare ports break CORS and the shared
  session (AGENTS.md).
- **Adopted** — **Check the four scenes at real widths:** 320px (the floor),
  390px (a phone) and 1440px (the desk), in light and dark, with a touch pointer
  for the phone. Emulate the viewport — resizing a Chrome window stops at about
  500px and silently looks fine. Check for horizontal overflow
  (`scrollWidth > innerWidth`) and for controls overlapping, which an overflow
  check misses.
- **Adopted** — **Check more than one skin** when the change touches colour,
  radius or density; the four skins differ in both (`frontend-design-system.md`).
- **Adopted** — **Break the source and look** at any screen that reads data: the
  named failed and partial states must appear, and nothing may turn into a zero
  (`saroh-product-states` skill).
- **Adopted** — **Activation journeys pass the release gate** (18): run them
  against the service-only, commerce-only, hybrid and no-module variants, with
  the actors it lists. No module or action leaks into navigation, quick-create,
  the command menu or Home; no gate lives only in the client; no keyboard trap,
  focus restored after dialogs; AA contrast in light and dark; reduced motion
  honoured; nothing hidden at 320px or 390px; loading, empty, error, success,
  disabled, setup, attention and forbidden states each distinct. Gap: the
  automated activation specs the gate calls for are not written yet.
- **Current** — **Cross-origin, layout and touch questions need a browser:**
  `e2e/` (Playwright) and `.agents/skills/saroh-browser-tests/SKILL.md`, with
  `E2E_IGNORE_HTTPS_ERRORS=1` locally.
- **Adopted** — **Critical journeys have browser coverage** — sign-in, organization
  creation, onboarding, capability configuration, an order, a booking, customer
  and follow-up creation, dark mode, loading and error states (PRODUCT_STRATEGY
  §27). Coverage against that list has not been measured.
- **Adopted** — **Merchant pages:** check a seeded site
  (`https://northwind.saroh.app.localhost`) and a draft preview, in the merchant's
  palette and on the neutral defaults.
- **Adopted** — **Say what you checked.** Name the scenes, widths, skins and
  variants, and attach rendered evidence to the PR (18 §4). "Looks good" without
  a list means it was not checked.

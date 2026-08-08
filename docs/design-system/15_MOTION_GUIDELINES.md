# 15 · Motion Guidelines

> Part of the Saroh design system. Companions: `04_DESIGN_TOKENS.md`,
> `05_COMPONENT_LIBRARY.md`, `13_ACCESSIBILITY_GUIDE.md`.

**Anchor — "Saroh Canvas": calm, fast, legible, minimal motion, one product.**
"Minimal motion" is a design commitment, not a limitation. Motion in Saroh
exists to explain a change (where did this come from, where did it go), confirm
an action, and maintain spatial continuity — never to decorate or entertain. If
an animation doesn't answer "what just changed?", it doesn't ship.

Grounded in: `tooling/tailwind-config/tailwind.config.ts` (keyframes/animation),
`packages/ui/src/components/ui/*` (Radix `data-[state]` transitions),
`packages/ui/src/components/ui/sonner.tsx`, `packages/ui/src/globals.css`.

---

## 1. Motion tokens

The codebase has **implicit** durations scattered across primitives; this
formalizes them into named tokens. Current real values found in code:

| Source                | Value                                                               | Where                                      |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| Accordion open/close  | `0.2s ease-out`                                                     | `tailwind.config.ts` l.83–84 (`animation`) |
| Dialog content        | `duration-200`                                                      | `dialog.tsx` l.44                          |
| Chevron rotate        | `duration-200`                                                      | `accordion.tsx` l.36                       |
| Sheet in / out        | `data-[state=open]:duration-500` / `closed:duration-300`            | `sheet.tsx` l.34                           |
| Button/opacity states | `transition-colors` / `transition-opacity` (browser default ~150ms) | `button.tsx` l.8, `dialog.tsx` close       |

### Proposed named tokens (per the anchor's 120/160/200ms scale)

| Token           | Duration    | Use for                               | Why                                                                                       |
| --------------- | ----------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--motion-fast` | **120ms**   | hover/press feedback, color & opacity | Below ~100ms feels instant; 120ms registers as responsive without lag                     |
| `--motion-base` | **160ms**   | most enter/exit, toggles, tabs        | The default; long enough to perceive direction, short enough to feel fast (_fast_ anchor) |
| `--motion-slow` | **200ms**   | dialogs, popovers, accordion          | Larger surfaces need slightly more time to be tracked by the eye                          |
| _(cap)_         | **≤ 300ms** | overlays/sheets max                   | Anything longer reads as sluggish on a productivity tool                                  |

**Action:** the Sheet's `duration-500` (open) is **off-anchor — too slow**;
bring it to ≤ 300ms so the mobile nav drawer (see doc 14) feels snappy.

### Easing

| Token           | Curve                                           | Use                                              | Why                                                                 |
| --------------- | ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `--ease-out`    | `cubic-bezier(0.16, 1, 0.3, 1)` (or `ease-out`) | **enter** — element arriving                     | Decelerating: fast start, gentle settle — feels like it's "landing" |
| `--ease-in`     | `ease-in`                                       | **exit** — element leaving                       | Accelerating out reads as "dismissed"                               |
| `--ease-in-out` | `ease-in-out`                                   | position/size changes that start & end on screen | Symmetric for continuous moves                                      |

**Spring vs ease:** use **ease curves, not springs**, for the product surfaces.
Springs (bouncy, overshoot) draw attention to the motion itself — the opposite
of _calm_. Reserve any spring for at most micro-feedback (a toggle knob) if ever.
The current stack (`tailwindcss-animate` + Radix) is ease/keyframe-based, so
this is already the grain of the system.

---

## 2. What to animate — and what not to

| Category                                                               | Animate?                    | How                                       | Why                                                                    |
| ---------------------------------------------------------------------- | --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| **Enter/exit of overlays** (dialog, sheet, popover, dropdown, tooltip) | ✅ Yes                      | fade + small scale/slide, base/slow token | Preserves spatial origin so the surface doesn't "teleport"             |
| **Disclosure** (accordion, collapsible)                                | ✅ Yes                      | height animation (`accordion-down/up`)    | Shows content is expanding _from_ the trigger, not appearing elsewhere |
| **State feedback** (hover, press, focus, checked)                      | ✅ Yes                      | `transition-colors`/opacity, fast token   | Confirms the control received input                                    |
| **Toast** (sonner)                                                     | ✅ Yes                      | slide-in + fade                           | Signals a new, non-blocking message arriving                           |
| **Tab / view switches**                                                | ⚠️ Minimal                  | crossfade only, no slide                  | A slide implies spatial relationship tabs don't have                   |
| **List reordering, page transitions**                                  | ❌ No                       | —                                         | Adds latency to core workflows; off _fast_ anchor                      |
| **Loading**                                                            | ⚠️ Restrained               | `skeleton.tsx` pulse / `progress`         | A calm shimmer, not a spinner carnival                                 |
| **Decorative / looping / parallax / bounce**                           | ❌ **Never** in the product | —                                         | Violates _calm_ and _minimal motion_; distracts from data              |

**Principle — animate the change, not the object at rest.** Nothing should move,
pulse, or shimmer once it has settled (except genuine loading state). A resting,
still canvas is the point.

---

## 3. What already exists (verified)

The animation system is **`tailwindcss-animate` + Radix `data-[state]`
attributes**, wired in `tailwind.config.ts` (plugin, l.88) and consumed by the
primitives:

| Primitive       | Animation classes (real)                                                                                                      | Verdict                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `accordion.tsx` | `data-[state=open]:animate-accordion-down` / `-up` (keyframes in config l.72–85), chevron `transition-transform duration-200` | ✅ Calm, height-based                                    |
| `dialog.tsx`    | `data-[state=open]:animate-in fade-in-0 zoom-in-95 slide-in-from-…`, `data-[state=closed]:…out`, `duration-200`               | ✅ Good — subtle 5% zoom + fade                          |
| `sheet.tsx`     | `slide-in-from-{side}`, `data-[state=open]:duration-500`                                                                      | ⚠️ Correct pattern, **too slow (500ms)** — cap at ≤300ms |
| `sonner.tsx`    | sonner's built-in slide/fade, themed via `next-themes`                                                                        | ✅ Good defaults                                         |
| `button.tsx`    | `transition-colors`                                                                                                           | ✅ Feedback only                                         |

**Observation:** motion is already restrained and consistent because it comes
almost entirely from shared primitives — authors rarely hand-write animations,
which is exactly what keeps the product calm. **Rule: get motion from the
primitives; do not add bespoke `@keyframes` in app code.** The only sanctioned
custom keyframes live in `tailwind.config.ts` (accordion) — extend there, not
per-app.

---

## 4. Reduced motion (required — this is the one gap)

**WCAG 2.3.3** and basic vestibular safety: honor `prefers-reduced-motion`.

**Current state: there is NO global reduced-motion override** in
`packages/ui/src/globals.css` (the file ends at the `body` base layer, l.85).
So the dialog's `zoom-in-95`, the sheet's `slide-in-from-*` at 500ms, and the
accordion height animations **all still play** for users who asked their OS to
reduce motion. This is the top motion **action item**.

**Add to `globals.css` (spec):**

```css
@media (prefers-reduced-motion: reduce) {
    *,
    ::before,
    ::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

Why blanket + `!important`: `tailwindcss-animate` and Radix set durations via
utility classes and inline data-attributes; a targeted override can't reach them
all, so the safe pattern is a global cap that still lets state _change_
instantly (opacity/enter still applies, just without the movement). Keep
`disableTransitionOnChange` on the `ThemeProvider` (already set in
`app.saroh.in/app/layout.tsx` l.35) so theme flips don't animate either.

---

## 5. Toast / sonner behavior

| Setting  | Guidance                                                             | Why                                                                    |
| -------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Position | one consistent corner (bottom-right desktop / bottom-center mobile)  | Predictability — users learn where to look                             |
| Duration | ≥ 4s for info, longer/`Infinity` for errors with an action           | Must be readable; auto-dismiss must not race a slow reader (doc 13 §8) |
| Stacking | sonner collapses a stack — keep it                                   | Prevents a wall of toasts covering content                             |
| Motion   | slide-in + fade (default), respects reduced-motion via §4            | Arrival cue without alarm                                              |
| Never    | put a _sole_ action only in a toast; never animate a toast on a loop | Toasts vanish; keyboard/SR users may miss them                         |

---

## 6. Do / Don't

**Do**

- Use `--motion-base` (160ms) as the default and ease-out for entrances.
- Let Radix/`tailwindcss-animate` drive it; extend keyframes in the shared config.
- Cap overlay motion at 300ms; keep the resting canvas still.
- Ship the reduced-motion override before any new motion.

**Don't**

- Springs/bounce/overshoot on product surfaces.
- Page-transition or list-reorder animations that add latency.
- Bespoke per-app `@keyframes`.
- Motion longer than 300ms (fix Sheet's 500ms).

**Two motion action items:** (1) add the global `prefers-reduced-motion`
override to `globals.css` (currently missing — accessibility + anchor); (2) cut
the `Sheet` open duration from 500ms to ≤300ms so the mobile nav drawer feels
_fast_.

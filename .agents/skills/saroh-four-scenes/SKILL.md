---
name: saroh-four-scenes
description: Use when building or changing any merchant-facing UI in app.saroh.in — layout, header, tables, cards, or anything with a touch target
---

# Saroh's Four Scenes

## Overview

`PRODUCT.md` names four scenes, **all primary**. A design that serves only the
desk fails three of them.

| Scene                    | Demands                                                      |
| ------------------------ | ------------------------------------------------------------ |
| Desk, long sessions      | Density and scanning; hover available but never load-bearing |
| Phone, one-handed bursts | Large targets, no hover, thumb-reachable actions             |
| Shop floor, bright light | Contrast well above the WCAG floor; glanceable               |
| Evening, low light       | Dark is a first-class surface, not an inversion              |

**Core principle:** §18 — "Testing only a desktop light-mode happy path is
insufficient." Two real bugs shipped past desk-width review and were invisible
until someone opened a 320px viewport.

## Verify in a browser, at these widths

Run the stack under portless (see the root `AGENTS.md` — never bare ports), then
emulate a real viewport. **Resizing the window is not enough**: Chrome has a
~500px minimum window width, so `resize_page` to 320 silently gives you 500 and
everything looks fine.

```
emulate viewport 320x740x1     # the floor
emulate viewport 390x844x1     # a normal phone
emulate viewport 1440x900x1    # the desk
```

The one-line check that would have caught both bugs:

```js
({
    vw: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
});
```

And for overlapping controls — pairwise rect intersection over the header's
buttons and links. Nothing was unreachable in the overlap bug; two controls
simply occupied the same pixels, which on a phone means tapping one and getting
the other.

## The two traps that actually bit

### `min-width: auto` on a grid or flex item

A grid item defaults to `min-width: auto`, so it **refuses to shrink below its
content's min-content width** — and that floor propagates all the way up. One
action card whose header held a title beside a `whitespace-nowrap` button had a
min-content width of 396px. At a 320px viewport the entire Home page scrolled
sideways by 100px.

- Put `min-w-0` on every grid/flex column that contains text or cards.
- Let rows `flex-wrap` rather than forcing a nowrap child to fit. The button
  drops to its own line **at full size** — §17 forbids tiny controls, so
  wrapping beats shrinking.

### A `justify-end` group with nowhere to go

When the right-hand group of a header runs out of room, `justify-end` lays its
children out **over** the left group rather than pushing the page wider — so a
horizontal-overflow check reports clean while two buttons sit on top of each
other. Check for overlaps separately.

When something must give below 380px, give up **gaps and padding first**, then
whatever is purely decorative. Never strand a control that has no other home:
the skin picker lives only in the header, so hiding it on phones would remove
it entirely.

## Rules

- **No hover-only affordance, ever** (§19). The phone and shop floor have no
  hover at all. If a tooltip is the only place something is explained, it is
  not explained.
- **Touch targets stay comfortable.** Shrinking a control under 44px to win
  space is not a fix.
- **Dark is defined, not derived.** Give every colour a light definition and a
  dark one; never let a surface inherit a transparent background.
- **Contrast materially above 4.5:1** for body text — bright ambient light
  makes this functional, not a compliance box. `--warning` is a FILL and cannot
  double as text on a pale tint; that is what `--warning-subtle` /
  `--warning-subtle-foreground` are for (see `globals.css`).
- **Check the states too** ([[saroh-product-states]]) — an empty, failed or
  capability-off surface has four scenes as much as a full one does.

---
name: Saroh Marketing (saroh.in)
description: A monochrome registry — pure grounds, 1px hairlines, and one blue spent only where a relationship needs a colour.
colors:
    background: "hsl(0 0% 100%)"
    background-dark: "hsl(0 0% 0%)"
    foreground: "hsl(0 0% 9%)"
    foreground-dark: "hsl(0 0% 93%)"
    card: "hsl(0 0% 100%)"
    card-dark: "hsl(0 0% 4%)"
    primary: "hsl(0 0% 9%)"
    primary-dark: "hsl(0 0% 93%)"
    primary-foreground: "hsl(0 0% 100%)"
    primary-foreground-dark: "hsl(0 0% 4%)"
    muted: "hsl(0 0% 96%)"
    muted-dark: "hsl(0 0% 12%)"
    muted-foreground: "hsl(0 0% 45%)"
    muted-foreground-dark: "hsl(0 0% 63%)"
    accent: "hsl(0 0% 96%)"
    accent-dark: "hsl(0 0% 14%)"
    border: "hsl(0 0% 92%)"
    border-dark: "hsl(0 0% 18%)"
    input: "hsl(0 0% 56%)"
    input-dark: "hsl(0 0% 42%)"
    brand: "hsl(212 100% 42%)"
    brand-dark: "hsl(212 100% 62%)"
    ring: "hsl(212 100% 48%)"
    ring-dark: "hsl(212 100% 60%)"
    destructive: "hsl(0 84% 45%)"
    destructive-dark: "hsl(0 90% 60%)"
typography:
    display-hero:
        fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui"
        fontSize: "clamp(2.5rem, 5.6vw, 3.875rem)"
        fontWeight: 600
        lineHeight: 1.04
        letterSpacing: "-0.038em"
    display-page:
        fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui"
        fontSize: "clamp(2.125rem, 4.4vw, 3.25rem)"
        fontWeight: 600
        lineHeight: 1.06
        letterSpacing: "-0.035em"
    headline:
        fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui"
        fontSize: "clamp(1.625rem, 3vw, 2.25rem)"
        fontWeight: 600
        lineHeight: 1.14
        letterSpacing: "-0.03em"
    title:
        fontFamily: "Geist, ui-sans-serif, system-ui"
        fontSize: "15.5px"
        fontWeight: 600
        lineHeight: 1.4
        letterSpacing: "-0.01em"
    lede:
        fontFamily: "Geist, ui-sans-serif, system-ui"
        fontSize: "17px"
        fontWeight: 400
        lineHeight: 1.625
        letterSpacing: "normal"
    body:
        fontFamily: "Geist, ui-sans-serif, system-ui"
        fontSize: "14px"
        fontWeight: 400
        lineHeight: 1.625
        letterSpacing: "normal"
    control:
        fontFamily: "Geist, ui-sans-serif, system-ui"
        fontSize: "13.5px"
        fontWeight: 500
        lineHeight: 1
        letterSpacing: "normal"
    micro-label:
        fontFamily: "ui-monospace, monospace"
        fontSize: "11px"
        fontWeight: 400
        lineHeight: 1.2
        letterSpacing: "0.16em"
rounded:
    sm: "4px"
    md: "6px"
    lg: "8px"
    xl: "12px"
    full: "9999px"
spacing:
    gutter: "24px"
    control-gap: "10px"
    card-padding: "24px"
    row-padding: "16px 20px"
    block: "56px"
    section: "112px"
components:
    button-primary:
        backgroundColor: "{colors.primary}"
        textColor: "{colors.primary-foreground}"
        typography: "{typography.control}"
        rounded: "{rounded.md}"
        padding: "0 18px"
        height: "38px"
    button-primary-hover:
        backgroundColor: "{colors.primary}"
        textColor: "{colors.primary-foreground}"
    button-secondary:
        backgroundColor: "{colors.background}"
        textColor: "{colors.foreground}"
        typography: "{typography.control}"
        rounded: "{rounded.md}"
        padding: "0 18px"
        height: "38px"
    button-secondary-hover:
        backgroundColor: "{colors.accent}"
    button-nav:
        backgroundColor: "{colors.primary}"
        textColor: "{colors.primary-foreground}"
        rounded: "{rounded.md}"
        padding: "0 14px"
        height: "32px"
    chip-dependency:
        backgroundColor: "hsl(212 100% 42% / 0.1)"
        textColor: "{colors.brand}"
        typography: "{typography.micro-label}"
        rounded: "{rounded.md}"
        padding: "0 8px"
        height: "22px"
    chip-neutral:
        backgroundColor: "{colors.background}"
        textColor: "{colors.foreground}"
        rounded: "{rounded.md}"
        padding: "0 12px"
        height: "30px"
    tag-pill:
        backgroundColor: "{colors.card}"
        textColor: "{colors.muted-foreground}"
        rounded: "{rounded.full}"
        padding: "0 12px"
        height: "26px"
    card:
        backgroundColor: "{colors.card}"
        textColor: "{colors.foreground}"
        rounded: "{rounded.xl}"
        padding: "40px 24px"
    input:
        backgroundColor: "{colors.background}"
        textColor: "{colors.foreground}"
        rounded: "{rounded.md}"
        padding: "8px 12px"
        height: "40px"
    table-row:
        backgroundColor: "{colors.background}"
        textColor: "{colors.foreground}"
        padding: "16px 20px"
    table-row-hover:
        backgroundColor: "hsl(0 0% 96% / 0.4)"
---

# Design System: Saroh Marketing (saroh.in)

## Overview

**Creative North Star: "The Registry Sheet"**

This surface argues by tabulation, not by illustration. Saroh is eight
capability modules with enforced dependencies between them, and the site shows
that as a ruled table with a Requires column — because the honest form for
structured, verifiable data is a sheet, not eight marketing cards. Everything
visual follows from that decision: the ground is a single flat colour, the
divisions are 1px rules, and the only hue on the page marks the one thing that
is a relationship rather than a label.

The palette is inherited, not invented here. `packages/ui/src/globals.css`
("Midnight & Lime") and the Tailwind colour mappings are shared with the
merchant workspace, the accounts app and the admin plane; the marketing site
consumes exactly the same semantic tokens the product renders itself with. That
is the whole point of the screenshots — the site and the software in the
screenshots are the same visual system, so the frame around the product shot and
the product inside it agree.

Density is low and the rhythm is large: a 1152px measure, 112px between
sections, and headlines capped at 16–24 characters. Nothing floats. The register
is deliberately Linear/Vercel — precise, achromatic, tight-tracked — and it
refuses the category-page hero: no angled floating device, no gradient confetti,
no logo cloud, no illustrated abstractions. Light and dark are equal halves,
following the OS by default with a toggle in the nav; the dark register is true
`#000` with a `#0a0a0a` raised surface, so a card reads as lit by its border
rather than by being paler.

**Key Characteristics:**

- Pure white / pure black grounds; page and card are the same colour
- 1px hairlines do all separation — no tint, no shadow, no elevation
- One chromatic token (`--brand`, a blue) spent in four places on the whole site
- Filled buttons are near-black inverting to near-white — never coloured
- Bricolage Grotesque for headings, Geist for everything else, both self-hosted
- Two radii only: 6px controls, 12px containers
- Every claim on screen is registry-backed; screenshots are labelled as demo data

## Colors

An achromatic system with one held-back blue: greys carry structure, and hue is
reserved for information that is genuinely relational.

### Primary

- **Ink** (`hsl(0 0% 9%)` light / `hsl(0 0% 93%)` dark): The `--primary` token
  and the text colour of the page. As a fill it is every solid button on the
  site — "Start free", "Join the waitlist" — with its inverse as the label.
  There is no coloured call to action anywhere on this surface; emphasis is
  contrast, and it flips wholesale with the register.

### Secondary

- **Signal Blue** (`hsl(212 100% 42%)` light / `hsl(212 100% 62%)` dark): The
  `--brand` token, anchored on `#0070f3`. It is interactive-and-relational
  only, and the build spends it exactly four ways: the dependency chip in the
  module table (`bg-brand/10` fill, `border-brand/30` edge, `text-brand`
  label), the "Requires …" line on the modules index, the 5px dot inside the
  hero tag pill, and one very faint radial field behind the hero
  (`from-brand/12`, 880×540, once). It lightens in dark mode because it must
  stay legible on black; the fill token `--brand-surface` is a separate thing
  and stays deep. `--ring` (`hsl(212 100% 48%)` / `hsl(212 100% 60%)`) is the
  same blue at focus strength and is the only other place it appears.

### Neutral

- **Paper / Void** (`hsl(0 0% 100%)` light / `hsl(0 0% 0%)` dark): The page
  ground. Pure, not off-white and not near-black — a tinted ground is what lets
  a designer avoid drawing real lines, and this system draws real lines.
- **Card** (identical to the ground in light; `hsl(0 0% 4%)` in dark): The
  raised surface. In light it is literally the same colour as the page, so a
  card is defined by nothing but its border.
- **Hairline** (`hsl(0 0% 92%)` light / `hsl(0 0% 18%)` dark): `--border`. Every
  section divider, every table rule, every card edge, every frame. Held below
  3:1 on purpose — a heavier rule between every row of a dense table reads as a
  spreadsheet cage — but raised until the line is unmistakably present at arm's
  length in both registers.
- **Control Boundary** (`hsl(0 0% 56%)` light / `hsl(0 0% 42%)` dark):
  `--input`, materially darker than the hairline and held at 3:1 against its
  ground (3.23:1 light, 3.94:1 dark) so form controls meet WCAG 1.4.11. A field
  edge is not decoration and does not use `--border`.
- **Quiet Ink** (`hsl(0 0% 45%)` light / `hsl(0 0% 63%)` dark):
  `--muted-foreground`, at 4.74:1 and 8.1:1 respectively. Carries every lede,
  every body paragraph, nav links at rest, table descriptions and all micro
  labels. Most text on this site is this colour, not full ink.
- **Wash** (`hsl(0 0% 96%)` light / `hsl(0 0% 12–14%)` dark): `--muted` and
  `--accent`. Table header strip (`bg-muted/40`), row hover (`hover:bg-muted/40`),
  and the hover state of every outlined control (`hover:bg-accent`). Note that
  `--accent` is shadcn's neutral hover surface, **not** a brand accent — it must
  stay achromatic.

### Tertiary

The inherited system also ships chromatic status tokens (`--destructive`,
`--success`, `--warning`, `--info`) and a five-step chart series
(`--chart-1…5`), all deliberately hue-bearing because hue is the information
there — a monochrome error state is an error state nobody sees. **This surface
spends none of them except `--destructive`,** which reaches the page only
through the destructive toast variant on a failed waitlist submission. Do not
introduce status colour here to decorate; introduce it only when something has
actually gone wrong.

### Named Rules

**The Same-Ground Rule.** The page and the card are the same colour. Separation
is a 1px hairline, never a tint, never a shadow. If you find yourself reaching
for an off-white panel to make a block "sit apart", draw a border instead.

**The Blue-Is-Not-A-Button Rule.** `--brand` is for things you click _through_
or that mark a relationship — links, focus rings, the dependency chip. Filled
buttons take `--primary`. A blue CTA on this site is a bug, not a variant.

**The Four-Spends Rule.** The blue appears roughly four times on the whole site.
Its rarity is what makes the dependency chip read as information rather than
decoration. Adding a fifth chromatic element costs the fourth its meaning.

## Typography

**Display Font:** Bricolage Grotesque (variable, 200–800, latin subset,
self-hosted at `packages/ui/fonts/BricolageGrotesque-latin.woff2`, exposed as
`--font-display` / `font-display`)
**Body Font:** Geist (variable, 100–900, latin subset, self-hosted at
`packages/ui/fonts/Geist-latin.woff2`, exposed as `--font-sans`; the `<body>`
class sets `font-sans` globally)
**Label/Mono Font:** the platform monospace stack. `--font-mono` is deliberately
never assigned — no mono file is shipped — so `font-mono` falls through to
`ui-monospace, monospace`.

**Character:** Bricolage is a variable grotesque with optical sizing (globals.css
pins `font-variation-settings: "opsz" 32` on `.font-display`), so headlines
tighten as they grow rather than simply scaling. Geist underneath is neutral and
data-shaped — `cv11` and `ss01` are on globally, and table cells and any
`[data-numeric]` element get `tabular-nums` so figures never reflow. The pairing
reads engineered rather than expressive: the display face supplies the only
personality on the page and the body face gets out of the way.

### Hierarchy

- **Display / Hero** (600, `clamp(2.5rem, 5.6vw, 3.875rem)` = 40→62px, 1.04,
  −0.038em): The one hero headline on the home page. Capped at `16ch`.
- **Display / Page** (600, `clamp(2.125rem, 4.4vw, 3.25rem)` = 34→52px, 1.06,
  −0.035em): The `h1` on `/modules` and each module page. Capped at `22ch`.
- **Headline** (600, `clamp(1.625rem, 3vw, 2.25rem)` = 26→36px, 1.14, −0.03em):
  Section `h2`s. Capped at `24ch`. The closing section runs a slightly larger
  variant (`clamp(1.75rem, 3.2vw, 2.5rem)`, 1.1) because it is centred and
  alone.
- **Title** (600, 15.5px, −0.01em): Step headings, dependency-card links. Set in
  Geist, not the display face — below ~22px Bricolage stops paying for itself.
- **Lede** (400, 17px, ~1.625, muted): The paragraph under a page headline.
  Capped at 52–58ch.
- **Body** (400, 14–16px, ~1.625, muted): Section paragraphs (16px), table cell
  descriptions and step copy (14px), card copy (14.5px), footer copy (13.5px).
- **Control** (500, 13–13.5px): Button labels, nav links, chips.
- **Micro Label** (400, 11px, uppercase, tracking 0.16em, mono, muted): Table
  column headers, figure captions (0.14em), footer meta (0.14em), the "Requires"
  line (0.1em), step ordinals (0.14em) and the dependency chip (0.06em, not
  uppercased).

### Named Rules

**The Two-Face Rule.** Bricolage carries headings at 22px and above and nothing
else — including the wordmark, which is `--font-display` at 700/−0.03em. Geist
carries every other word on the site. There is no third weight of decision here.

**The Tightening Rule.** Negative tracking scales with size: −0.01em at 15.5px,
−0.02em at 22px, −0.03em at section headlines, −0.038em at the hero. Large type
without negative tracking reads loose against 1px hairlines.

**The Measure Rule.** Headlines are capped in `ch`, not pixels — 16ch for the
hero, 22–24ch for page and section headings, 46–58ch for prose. A headline that
runs the full 1152px container has lost the left-aligned rhythm the page is
built on.

## Layout

One centred column: `max-w-6xl` (1152px) with `px-6` (24px) gutters, used
identically on every page, in the nav and in the footer. The sticky header is
56px tall (`h-14`) with `bg-background/70` and `backdrop-blur-xl`.

Vertical rhythm is coarse and consistent. Top-level sections are `py-28` (112px)
on the home page and `py-24` (96px) on the modules pages; the footer is `py-14`
(56px). Inside a section the ladder is fixed: micro label → 14px → headline →
14px → lede → 28px → buttons → 56px → product shot. Control clusters use a 10px
gap (`gap-2.5`), card interiors 24px (`p-6`), table rows `px-5 py-4`.

Responsive behaviour is honest rather than elaborate. The module table collapses
from a three-column grid (`170px 1fr 110px`) to a single stacked column below
`sm`, hiding the "What it does" and "Requires" column headers rather than
squeezing them. Equal-tile groups go from `sm:grid-cols-3` to stacked; the
product-shot pair goes from `md:grid-cols-2` to stacked. The nav drops its link
row and the Waitlist button below `sm`, keeping only the wordmark, the theme
toggle and "Start free" — the two things a phone visitor needs.

### Named Rules

**The Full-Bleed Rule Rule.** Section separation is a `border-t` on the section
element itself, so the hairline crosses the full viewport while the content
inside stays capped at 1152px. Sections never separate by background colour.

**The Gutter-Is-The-Border Rule.** Equal-tile groups (the three "How it works"
steps, the three dependent modules) are built as a `bg-border` container with
`gap-px` and `bg-background` children inside a `rounded-xl border overflow-hidden`
wrapper. The 1px gap _is_ the divider — there are no per-tile borders to
double up at the seams.

## Elevation & Depth

**This surface is flat.** The inherited system defines a five-step shadow scale
(`--shadow-xs` through `--shadow-xl`, neutral black because a tinted shadow
would be the only hue on an achromatic surface) and this site uses none of it.
The single exception is the toast, which is a genuine overlay and keeps
`shadow-lg`.

Depth is produced three other ways, each used once or twice: the 1px hairline
(the primary and almost only device); `backdrop-blur-xl` on the translucent
sticky nav, which is the only place content is visibly _behind_ something; and
one radial `from-brand/12` field bleeding off the top of the hero, 880×540,
pointer-events-none and `aria-hidden`. The product-shot frame implies a third
dimension without a shadow: a `rounded-xl` bordered `bg-card` box with 6px
padding (`p-1.5`) around a `rounded-md` image that carries its own
`border-white/[0.06]` — a bezel, not a lift.

### Named Rules

**The No-Lift Rule.** Nothing in the page flow casts a shadow. Only elements
that genuinely float above the document — toasts, dialogs, popovers, dropdowns —
may take one, and they take it from the shared scale. A card with a shadow on a
white-on-white ground is implying depth that isn't there.

## Shapes

Two radii and a pill, derived from the `--radius: 0.5rem` anchor in
`globals.css`. On this app the Tailwind config maps `lg → var(--radius)` (8px),
`md → calc(var(--radius) - 2px)` (6px) and `sm → calc(var(--radius) - 4px)`
(4px); `xl` (12px) and `2xl` (16px) come from Tailwind's own defaults here and
therefore do **not** track a change to `--radius` on this surface, unlike the
shared `tooling/tailwind-config` where all five steps are derived.

What the build actually uses, counted: `rounded-md` 21 times, `rounded-xl` 5
times, `rounded-full` 3 times. Nothing else.

- **6px (`rounded-md`)** — every control: buttons, nav CTA, theme toggle, input,
  the dependency chip, the neutral module chips, and the screenshot image
  itself.
- **12px (`rounded-xl`)** — every container: the module table, the product-shot
  frame, the step and dependency grids, the waitlist card.
- **Pill (`rounded-full`)** — the hero eyebrow tag and the 5px blue dot inside
  it, plus the hero's radial field.

Borders are uniformly 1px and always `--border`, except form controls, which use
`--input`. `overflow-hidden` on the rounded containers is load-bearing: the
table's row borders and the grids' gutters are clipped by the parent radius
rather than each child re-stating a corner.

### Named Rules

**The Two-Radius Rule.** 6px if you press it, 12px if it holds things. A pill
only for a status tag or a dot. Any third radius on this surface is a drift.

## Components

### Buttons

- **Shape:** 6px corners (`rounded-md`), fixed heights — 38px for page CTAs,
  32px (`h-8`) in the nav, 40px (`h-10`) beside the waitlist input.
- **Primary:** near-black fill inverting to near-white (`bg-primary
text-primary-foreground`), 18px horizontal padding, 13.5px/500 label. Used for
  "Start free" everywhere and "Join the waitlist" in the form.
- **Hover / Focus:** the site's hand-rolled CTAs fade with
  `transition-opacity hover:opacity-90`; outlined controls use
  `transition-colors hover:bg-accent`. Focus is `focus-visible:ring-2
focus-visible:ring-ring` — the blue, never an outline colour of its own. (The
  shared `Button` primitive dims with `hover:bg-primary/90` instead; both land
  in the same place visually.)
- **Secondary:** transparent on the page ground with a 1px `--border` edge, same
  height and padding, filling to `--accent` on hover. This is the "See the
  modules" / "Join the waitlist" partner to every primary.
- **Ghost:** the theme toggle only — a 32px square grid-centred icon button,
  muted at rest, `hover:text-foreground hover:bg-accent`.

### Chips

- **Dependency chip:** 22px tall, 6px corners, `bg-brand/10` fill with a
  `border-brand/30` edge and `text-brand` label, set in 11px mono at 0.06em. The
  only chromatic element in the table, and the one carrying the page's argument.
  Its long form on a module page is the same treatment at `px-3 py-1.5` with
  uppercase 0.1em tracking.
- **Neutral chip:** 30px tall, 6px corners, `--border` edge on the page ground,
  13px label, `hover:bg-accent`. Used for the "Other modules" cross-links.
- **Tag pill:** 26px tall, `rounded-full`, `bg-card` on a `--border` edge, 12px
  muted label, with a 5px `bg-brand` dot as the first child. Exactly one of
  these exists — the hero's "Modular business platform".
- **Empty state:** a mono em-dash at `text-muted-foreground/60`, never a chip.
  An absent dependency is absence, not a "None" badge.

### Cards / Containers

- **Corner Style:** 12px (`rounded-xl`).
- **Background:** `bg-card` — identical to the page in light, one step above
  black in dark.
- **Shadow Strategy:** none. See The No-Lift Rule.
- **Border:** 1px `--border`, always. It is the entire definition of the
  container.
- **Internal Padding:** 24px (`p-6`) for tiles; the waitlist card runs
  `px-6 py-10` widening to `sm:px-10`; the product-shot frame runs 6px
  (`p-1.5`) because it is a bezel, not a card.

### Inputs / Fields

- **Style:** 40px tall, 6px corners, `bg-background` with a 1px `--input` border
  — visibly darker than the surrounding hairlines, which is intentional and
  contrast-verified.
- **Focus:** `focus-visible:ring-2 focus-visible:ring-ring` with
  `ring-offset-0`, i.e. the blue ring sits flush on the field edge rather than
  floating off it.
- **Error:** handled by the form's `FormMessage`, plus a destructive toast for
  request failures. The field itself does not turn red.
- **Disabled:** `disabled:opacity-50` with `cursor-not-allowed`; the submit
  button is disabled until the field has content and while submitting, swapping
  its label to "Joining…".

### Navigation

- **Style:** sticky, `z-50`, 56px tall, `bg-background/70` + `backdrop-blur-xl`,
  one `border-b` hairline. No shadow, no background swap on scroll.
- **Typography:** 13px links, muted at rest, `hover:text-foreground` on a colour
  transition. No underline, no active-state indicator.
- **Right cluster:** links (hidden below `sm`), theme toggle, outlined Waitlist
  button (hidden below `sm`), filled Start free button (always visible).
- **Mobile:** no hamburger and no drawer. The nav sheds its links rather than
  hiding them behind a menu; the module list is fully reachable from the footer,
  which links all eight.
- **Wordmark:** `Wordmark` from `@saroh/ui`, inline-styled at 1.0625rem here, in
  `--font-display` 700 at −0.03em, coloured `--foreground` — the page's ink, so
  it inverts with the register and never reads as a link.

### Module Table (signature component)

The site's one distinctive component and the reason the register exists. A
`rounded-xl` bordered container with `overflow-hidden`, a `bg-muted/40` header
strip carrying three mono uppercase column labels, and eight rows that are each
a whole `<Link>`: `170px 1fr 110px` grid, `px-5 py-4`, `border-b` hairline
(dropped on the last row), `hover:bg-muted/40` and a `focus-visible:ring-2`
with `-outline-offset-2` so the ring stays inside the clipped corners. The row's
label goes to full ink on group hover; the Requires column carries the
dependency chip or an em-dash. Below `sm` it becomes a stack and the two
secondary column headers disappear.

### Product Shot (signature component)

A `<figure>` holding a 12px bordered `bg-card` frame with 6px padding around a
6px-cornered screenshot, optionally captioned in mono micro type below. Both
theme variants (`{name}-light.png` / `{name}-dark.png`) are always rendered and
swapped with `dark:hidden` / `hidden dark:block` — CSS, never JavaScript,
because `next-themes` resolves after hydration and a JS-picked image flashes the
wrong variant on the largest element on the page. Images are authored at 2× the
~1040px frame. Only the above-fold shot takes `priority`.

## Do's and Don'ts

### Do:

- **Do** separate with a 1px `--border` hairline. It is the system's primary
  device and it works because the grounds are flat.
- **Do** use `--primary` for any filled button, and let it invert with the
  theme rather than picking a colour.
- **Do** reserve `--brand` for relationships, links and focus. If a new element
  wants blue, ask what relationship it is expressing; if there isn't one, it
  gets ink.
- **Do** use `--input` (not `--border`) for form-control edges, so the 3:1
  boundary that WCAG 1.4.11 requires survives.
- **Do** keep to two radii: 6px on controls, 12px on containers.
- **Do** cap headlines in `ch` (16–24ch) and prose at 46–58ch, left-aligned,
  and use the display face only at 22px and above.
- **Do** ship both theme variants of any screenshot and swap them in CSS.
- **Do** build equal-tile groups as `bg-border` + `gap-px` + `bg-background`
  children so the gutter is the divider.
- **Do** set section rhythm at 96–112px with a full-bleed `border-t`, content
  capped at `max-w-6xl px-6`.
- **Do** state on screen that screenshots show seeded demo data — the footer
  does, and every new screenshot context should.

### Don't:

- **Don't** put a shadow on anything that sits in the page flow. Shadows belong
  to toasts, dialogs, popovers and dropdowns only.
- **Don't** tint a panel to make it separate from the page. Both grounds are
  pure by design; draw the line instead.
- **Don't** colour a call to action. There is no blue, green or gradient button
  in this system.
- **Don't** repoint `--accent` at the brand — it is shadcn's neutral hover
  surface with 32 component usages and every menu hover would follow it.
- **Don't** use `--warning` as a text colour on a pale tint; the
  `--warning-subtle` / `--warning-subtle-foreground` pair exists for that. Same
  for `--brand` and `--highlight`.
- **Don't** introduce status hue (success/warning/destructive) decoratively.
  This surface earns its calm by having almost none; use it only when something
  is genuinely wrong or waiting.
- **Don't** add a third radius, a second easing curve, or a second display
  weight. The scale is small on purpose.
- **Don't** hide navigation behind a hamburger here; drop links and keep the
  footer complete instead.
- **Don't** select a theme-dependent asset in JavaScript — it flashes the wrong
  variant on first paint.
- **Don't** claim a capability the module registry in `lib/modules.ts` does not
  carry, and do not reintroduce the "one customer record behind an order and a
  booking" claim until auto-linking ships.

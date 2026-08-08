# 01 · Product Design Philosophy — "Saroh Canvas"

> The design language for saroh.io. Read this before touching any screen.
> Companion docs: [02 Information Architecture](./02_INFORMATION_ARCHITECTURE.md) · [06 Design Tokens](./06_DESIGN_TOKENS.md) · [07 Style Guide](./07_STYLE_GUIDE.md)

---

## 1. Product vision

Saroh is **one product**, not a bundle of tools: an AI-powered Business OS where a
single small-business owner runs their website, customers, appointments, commerce,
marketing and insights from one place. The design language, **"Saroh Canvas,"** exists
to make that "one product" promise felt on every screen — the same shell, the same
tokens, the same voice, whether the user is editing a storefront product
(`/stores/[storeId]/products`) or reviewing a lead (`/leads/[leadId]`).

Today the app (`apps/app.saroh.in`) is **35 routes** rendered with the shared
`@saroh/ui` primitive library (**46 primitives** in
`packages/ui/src/components/ui/`), a single light theme, and an org-scoped data model.
The primitives already exist and are consistent; the job of Saroh Canvas is to make the
_composition_ of those primitives consistent too, so the product reads as one calm,
coherent surface rather than 35 independently-built pages.

**Saroh Canvas in one line:** a calm, content-first, single-product design language —
restraint over decoration, one clear next action per screen, and every module inheriting
the same shell and tokens.

---

## 2. The six principles

Each principle below states the **rule**, the **why** (the usability payoff), and a
**concrete Saroh example** grounded in the current codebase.

### Principle 1 — Calm over loud

**Rule.** Restraint is the default. Generous whitespace, one accent colour
(`--brand`, blue-600), a muted neutral palette, and no decoration that doesn't carry
information.

**Why.** A business owner opens Saroh to _get something done_ — fulfil an order, reply
to a lead — usually while distracted. Every competing colour, shadow or animation is a
micro-decision that steals attention from the task. Calm surfaces lower cognitive load,
so the eye lands on content and the primary action first, and the user finishes faster
with fewer errors.

**Saroh example.** The stores index (`apps/app.saroh.in/app/page.tsx`) is already calm:
a single `h1` ("Your stores"), one primary `Button` ("New store"), and a plain
`grid gap-4 sm:grid-cols-2` of cards. No hero, no gradient, no illustration. That page
is the reference standard — every other screen should feel as quiet.

### Principle 2 — One primary action per screen

**Rule.** Each screen has exactly **one** visually-dominant primary button
(`Button` default variant, `bg-primary`). Everything else is `secondary`, `outline`,
`ghost`, or a `link`.

**Why.** When two buttons look equally important, the user has to stop and choose —
that hesitation is friction and a frequent source of wrong clicks. A single primary
action answers "what next?" instantly and makes the screen self-explaining.

**Saroh example.** On the home page the only primary button is "New store"; the org
switcher and sign-out in `AppHeader` are deliberately `outline`/quiet
(`components/shared/app-header.tsx`, `components/organizations/organization-switcher.tsx`
uses `variant="outline" size="sm"`). Contrast this with the per-store layout
(`app/stores/[storeId]/layout.tsx`), which currently offers a "← Dashboard" link, an org
switcher, a title and a section nav with no single dominant CTA — a candidate for
tightening under this principle.

### Principle 3 — Progressive disclosure

**Rule.** Show the 20% people need first; reveal the rest on demand (detail routes,
drawers, `Accordion`, `Collapsible`, tabs). Never dump every field on first paint.

**Why.** Density scales badly with anxiety. A short, scannable screen that expands when
asked keeps novices from feeling lost and lets experts drill in. It also keeps the
initial render fast and the mental model small.

**Saroh example.** Commerce already models this: a store's data is split across list
routes (`products`, `orders`, `customers`) with dedicated detail routes
(`products/[productId]`, `orders/[orderId]`, `customers/[customerId]`) and `new` sub-routes
for creation. The list answers "what do I have?"; the detail answers "tell me
everything." The `Drawer`, `Sheet`, `HoverCard` and `Tooltip` primitives already in
`@saroh/ui` are the sanctioned tools for the next layer of disclosure.

### Principle 4 — Every screen answers _Where am I / What can I do / What next_

**Rule.** Three questions, answered on every screen: **Where am I** (title +
breadcrumb + active nav), **What can I do** (a page header with primary CTA + secondary
actions), **What next** (empty states, inline guidance, obvious follow-on links).

**Why.** Orientation is the antidote to the "lost in a SaaS" feeling. When a user always
knows their location and their options, they explore confidently instead of clicking
Back. This is the single biggest driver of perceived ease-of-use.

**Saroh example.** `StoresEmptyState` (`components/stores/stores-empty-state.tsx`)
answers all three for a new user: it states the situation ("No stores yet"), the reason
("Create your first store to start building."), and the next action ("Create a store"
button). Generalising this pattern — a consistent page header + breadcrumb on _every_
route — is the target (see [02 IA](./02_INFORMATION_ARCHITECTURE.md)); today only the
store section has a `StoreNav` and only some pages carry a heading.

### Principle 5 — Fast & legible

**Rule.** Inter (self-hosted), a clear type hierarchy, and **no** heavy shadows,
gradients, glassmorphism, or over-animation. Motion is 120–200ms ease-out and respects
`prefers-reduced-motion`.

**Why.** Legibility _is_ usability — if the hierarchy is clear, the user parses the
screen in one pass. Decorative effects cost render time and, worse, they blur the line
between "chrome" and "content," making the screen harder to read. Self-hosting the font
(`packages/ui/fonts/InterVariable-latin.woff2`, loaded via `next/font/local` with
`display: "swap"` in `app/layout.tsx`) avoids a flash of unstyled text and a network
round-trip.

**Saroh example.** The app already ships one self-hosted variable font and a light,
border-first surface treatment (`border-b` headers, `rounded-lg border` cards). No
gradient or glass exists in the current app screens — Saroh Canvas codifies keeping it
that way.

### Principle 6 — One product, one shell

**Rule.** Every module inherits the **same** app shell and the **same** tokens. New
features compose existing `@saroh/ui` primitives and the shared
`tooling/tailwind-config` preset; they do not invent local chrome.

**Why.** Consistency is learnability. When the switcher, search, nav and page header sit
in the same place with the same behaviour everywhere, a skill learned in Commerce
transfers for free to Appointments. It also slashes maintenance: one shell to fix, not 35.

**Saroh example.** The recent `AppHeader` (`components/shared/app-header.tsx`) is the
right instinct — its own doc comment says it exists "so the brand, org switcher, primary
nav, and sign-out are present on EVERY authenticated page… New pages inherit the full
chrome for free." The gap: the per-store layout re-implements its own mini-shell
(back-link + switcher + title in `app/stores/[storeId]/layout.tsx`) instead of inheriting
the global one, and the app currently vendors a **second** copy of the shadcn primitives
in `apps/app.saroh.in/components/ui/` alongside consuming `@saroh/ui`. Both are
one-product debt to retire.

---

## 3. What to avoid — and why

| Avoid                                    | Why it hurts usability                                                                                                | Saroh rule                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clutter / dense screens**              | More elements = more scanning = slower decisions and more misclicks.                                                  | Progressive disclosure (P3); whitespace is a feature, not wasted space.                                                                                                                 |
| **Too many colours / a rainbow palette** | Colour is a signal; if everything is coloured, nothing reads as important. Users can't tell a status from decoration. | **One** accent (`--brand`). Colour is reserved for meaning: brand, and the four semantic states (destructive + the success/warning/info tokens defined in [06](./06_DESIGN_TOKENS.md)). |
| **Heavy shadows / big elevation**        | Strong shadows imply importance and depth everywhere, flattening real hierarchy and adding visual noise.              | Borders first; a single `shadow-sm` only for true overlays (popover, dropdown, dialog).                                                                                                 |
| **Glassmorphism / blur**                 | Reduces text contrast, hurts accessibility, and is pure decoration with no informational value.                       | Not used anywhere in Saroh Canvas.                                                                                                                                                      |
| **Over-animation**                       | Motion that isn't feedback is a distraction and makes the app feel slow; it also harms motion-sensitive users.        | Motion only communicates state change; 120–200ms ease-out; honour `prefers-reduced-motion`.                                                                                             |
| **Gradients**                            | Trend-driven, ages fast, and competes with content for attention.                                                     | Flat fills only. The brand is a solid colour, not a gradient.                                                                                                                           |

**Grounded risk to watch:** the app already carries small colour-discipline leaks —
`components/crm/activity-timeline.tsx` uses raw `border-amber-400` / `border-blue-400` /
`border-emerald-400`, and `components/stores/order-payments.tsx` uses
`text-amber-700 dark:text-amber-400`. These are exactly the "rainbow creep" this section
guards against, and are why [06 Design Tokens](./06_DESIGN_TOKENS.md) defines semantic
`success` / `warning` / `info` tokens to replace them.

---

## 4. The three questions, applied to Saroh

Every screen must let the user answer these without thinking. This is the operational
form of Principle 4.

| Question           | What answers it                                                     | Current Saroh state                                                                                             | Target                                                                                                                     |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Where am I?**    | Wordmark + org switcher + active nav item + breadcrumb + page title | Wordmark + org switcher + flat nav exist in `AppHeader`; breadcrumbs mostly absent; some pages have no heading. | Sidebar highlights the active goal-area; `Breadcrumb` primitive on every non-home route; page header title always present. |
| **What can I do?** | Page header with one primary CTA + secondary actions                | Present on home (`New store`), store settings, `new` routes; inconsistent elsewhere.                            | A standard page-header component (title, description, primary CTA, secondary actions, optional tabs) on every route.       |
| **What next?**     | Empty states, inline hints, obvious follow-on links                 | `StoresEmptyState` is exemplary; not every list route has an equivalent.                                        | Every list/detail route ships an empty state and a clear next step.                                                        |

---

## 5. Cognitive-load reduction tactics (the Saroh playbook)

1. **One decision at a time.** One primary action per screen (P2); push secondary paths
   into menus (`DropdownMenu`) and overflow.
2. **Recognition over recall.** Persistent goal-based nav, a global search + ⌘K command
   palette, and "recent/pinned" so users pick from what they see rather than remembering
   URLs. (The `command` primitive already exists in `@saroh/ui` but is not yet wired —
   see [02 IA §Command palette](./02_INFORMATION_ARCHITECTURE.md).)
3. **Consistent placement.** Switcher top-left, user menu top-right, primary CTA
   top-right of the page header — the same on every screen, so muscle memory forms.
4. **Sensible defaults.** Pre-select the active org (`active_org` cookie →
   `x-organization-id`), default the theme to light, pre-fill obvious form values so the
   user confirms rather than composes.
5. **Chunking.** Group related fields and actions; use `Card`, `Separator`, `Tabs` and
   `Accordion` to break long screens into digestible units (P3).
6. **Feedback, not noise.** Confirm actions with a single `sonner` toast; reserve colour
   and motion for genuine state changes; never animate for delight alone (P5).
7. **Fail gently.** Empty states and error states explain _what happened_ and _what to do
   next_ in plain language (see [07 Style Guide](./07_STYLE_GUIDE.md)), never a raw code.

---

## 6. How to use this doc

- Designing a new screen? Walk the six principles and the three questions before you
  open Figma or a `.tsx` file.
- Reviewing a PR? Reject anything that adds a second primary action, a new colour outside
  the tokens, a gradient/glass/heavy-shadow, or per-page chrome.
- Every recommendation in the companion docs traces back to a principle here. If a rule
  doesn't reduce cognitive load or answer one of the three questions, it doesn't belong.

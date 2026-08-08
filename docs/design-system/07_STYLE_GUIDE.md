# 07 · Style Guide — Saroh Canvas

> Practical, day-to-day rules for writing UI copy, choosing icons, labelling controls,
> and formatting data. When [01](./01_PRODUCT_DESIGN_PHILOSOPHY.md) sets the philosophy
> and [06](./06_DESIGN_TOKENS.md) sets the tokens, this doc governs the _words and details_.
> Companion docs: [01 Philosophy](./01_PRODUCT_DESIGN_PHILOSOPHY.md) · [02 IA](./02_INFORMATION_ARCHITECTURE.md) · [06 Tokens](./06_DESIGN_TOKENS.md)

---

## 1. Voice & tone

Saroh talks to a busy small-business owner, not to a developer. The voice is **calm,
plain, and helpful** — the verbal counterpart of the calm visual language
([01 P1](./01_PRODUCT_DESIGN_PHILOSOPHY.md)).

| Attribute             | Do                                                 | Don't                                                           |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| **Plain**             | "No stores yet"                                    | "You currently have zero store entities"                        |
| **Direct**            | "Create a store to start building."                | "In order to begin, you may wish to consider creating a store." |
| **Human, not cute**   | "Something went wrong. Try again."                 | "Oopsie! Our hamsters fell off the wheel 🐹"                    |
| **Second person**     | "Your stores", "Switch organization"               | "The user's stores"                                             |
| **Active voice**      | "We saved your changes."                           | "Your changes have been saved."                                 |
| **Calm under errors** | "That organization isn't available. Pick another." | "ERROR 403: FORBIDDEN"                                          |

**Grounded example (the standard to match).** `StoresEmptyState`
(`components/stores/stores-empty-state.tsx`):

> **No stores yet** — Create your first store to start building. — _[Create a store]_

Three short lines that answer _where am I / what next_
([01 §4](./01_PRODUCT_DESIGN_PHILOSOPHY.md)) in plain, active, second-person voice. Every
empty and error state should read like this.

---

## 2. Capitalization

**Sentence case everywhere.** Capitalise the first word and proper nouns only — for
headings, buttons, labels, menu items, tabs, and toasts. This is already the app's
convention and it's more legible and less shouty than Title Case
([01 P5](./01_PRODUCT_DESIGN_PHILOSOPHY.md)).

| Element     | Correct (sentence case)                                 | Wrong (Title Case)                                     |
| ----------- | ------------------------------------------------------- | ------------------------------------------------------ |
| Page title  | "Your stores" _(page.tsx)_                              | "Your Stores"                                          |
| Button      | "New store", "Create a store", "Create organization"    | "New Store", "Create A Store"                          |
| Nav / tab   | "Products", "Orders", "Customers" _(StoreNav)_          | fine (single nouns), keep sentence case for multi-word |
| Menu label  | "Organizations", "Create organization" _(org switcher)_ | "Create Organization"                                  |
| Empty state | "No stores yet"                                         | "No Stores Yet"                                        |

**Exceptions:** proper nouns (Saroh, the org/store name), and acronyms (AI, URL, SEO).
The product name is always **Saroh** — never "saroh" or "SAROH" in UI copy (the wordmark
component handles the logo treatment).

**Spelling:** the codebase uses American spelling in identifiers (`organization`,
`OrganizationSwitcher`, `color`). Keep UI copy consistent with that — "organization,"
"color," "canceled" — so labels and code don't diverge.

---

## 3. Iconography

**Verified library usage:**

- **`lucide-react` is the standard** — it's a dependency of both the app
  (`apps/app.saroh.in/package.json`) and `@saroh/ui` (`packages/ui/package.json`), and is
  imported in **15** app source files (e.g. `ChevronsUpDown`, `Plus` in the org switcher;
  `X`, `ChevronLeft/Right`, `ChevronDown` in primitives).
- **`react-icons` is a declared dependency but effectively unused** — it appears in
  `apps/app.saroh.in/package.json` yet has **zero imports in app source**. It should be
  treated as non-standard and, ideally, removed to avoid two icon systems drifting.

**Rules:**

| Rule                                                                                                          | Why                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use **lucide-react only**. Don't introduce `react-icons`, emoji-as-icons, or custom SVGs for standard glyphs. | One icon family = one visual weight and metrics, so icons read as a set ([01 P6](./01_PRODUCT_DESIGN_PHILOSOPHY.md)). Mixing libraries yields mismatched stroke widths. |
| Default size **`size-4`** (16px), aligned to `text-sm`. Use `size-5` only for standalone/nav icons.           | Matches the body type; the app already standardises on `size-4` (org switcher `ChevronsUpDown`, `Plus`).                                                                |
| Icons are **`currentColor`** — never hard-code an icon colour.                                                | They inherit the semantic text token and adapt to dark mode/state for free ([06 §10](./06_DESIGN_TOKENS.md)).                                                           |
| Icons **support** labels; they rarely replace them. Icon-only controls need `aria-label`.                     | An unlabeled glyph forces recall/guessing; the org switcher pairs `aria-label="Switch organization"` with its icon — copy that.                                         |
| Use icons **consistently by meaning**: `Plus` = create, `ChevronsUpDown` = switch/select, `X` = dismiss.      | Consistent icon semantics let users predict behaviour before clicking.                                                                                                  |
| Don't decorate. No icon just to fill space.                                                                   | Decorative icons are visual noise ([01 §3](./01_PRODUCT_DESIGN_PHILOSOPHY.md)).                                                                                         |

---

## 4. Buttons & labels

**One primary per screen** ([01 P2](./01_PRODUCT_DESIGN_PHILOSOPHY.md)). Map intent to
the existing `Button` variants (`packages/ui/src/components/ui/button.tsx`):

| Intent                 | Variant                 | Example                                       |
| ---------------------- | ----------------------- | --------------------------------------------- |
| The one main action    | `default`               | "New store", "Create a store"                 |
| Supporting action      | `secondary` / `outline` | Org switcher trigger (`outline`, `size="sm"`) |
| Low-emphasis / in-menu | `ghost`                 | Menu rows, toolbar actions                    |
| Destructive            | `destructive`           | "Delete store"                                |
| Inline navigation      | `link`                  | "← Dashboard" (store layout)                  |

**Writing button labels:**

| Rule                                  | Do                                            | Don't                                        |
| ------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| **Verb + noun**, describe the outcome | "Create a store", "New order", "Save changes" | "Submit", "OK", "Go"                         |
| Sentence case                         | "New store"                                   | "New Store"                                  |
| Keep it short (1–3 words)             | "New product"                                 | "Click here to add a new product"            |
| Match the destination/action exactly  | "Create organization" → creates an org        | vague "Continue" when the action is specific |
| Destructive actions name the object   | "Delete store"                                | "Delete" (alone, in a list of many)          |

**Labels & form fields:** every input has a visible `Label` (the `label.tsx` /
`form.tsx` primitives), sentence case, no trailing colon. Helper text goes below in
`text-muted-foreground text-sm`. Required fields are marked; don't rely on colour alone.

**Empty-state / next-step copy** follows the `StoresEmptyState` template: a heading (the
situation), one line of `text-muted-foreground` (the reason/benefit), one primary button
(the next action).

---

## 5. Numbers, dates & currency formatting

Consistency here is a usability feature: predictable formatting lets users scan columns
and compare values without re-reading ([01 P5](./01_PRODUCT_DESIGN_PHILOSOPHY.md)).

| Data                     | Rule                                                                                                 | Notes                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Tabular numbers**      | Use `tabular-nums` for any column/aligned figures (prices, totals, counts).                          | Already used in `components/stores/order-payments.tsx`; figures line up so the eye compares magnitudes at a glance. |
| **Currency**             | Format via `Intl.NumberFormat` with the store/org currency; symbol + grouped thousands + 2 decimals. | Never hand-concatenate `"$" + amount`. Locale-aware formatting handles grouping and symbol placement.               |
| **Dates**                | Human, unambiguous: "20 Jul 2026" or "Jul 20, 2026" — not `07/20/2026` (ambiguous across locales).   | Use `Intl.DateTimeFormat`. For recent events, relative time ("2 hours ago") in timelines.                           |
| **Relative time**        | "just now", "2h ago", "yesterday" for < 1 week; absolute date beyond.                                | Matches the activity-timeline context; reduces mental math for recent items.                                        |
| **Percentages / counts** | Whole numbers unless precision matters; group thousands (`1,240` not `1240`).                        | The notification badge already shows a bare count — fine for small integers.                                        |
| **Empty / zero**         | Show "—" or "None", not "0" or blank, where zero is a state not a measurement.                       | Distinguishes "no data" from "a value of zero".                                                                     |

Centralise these in shared formatters (a `lib/format` module) so no screen re-implements
them — one place to fix, consistent everywhere ([01 P6](./01_PRODUCT_DESIGN_PHILOSOPHY.md)).

---

## 6. Status & badges

Statuses (order paid/pending, lead stage, booking confirmed) must use the **semantic
status tokens** and `Badge` variants defined in [06 §2](./06_DESIGN_TOKENS.md) — not
ad-hoc coloured text.

| Status meaning                      | Token / variant | Example label                   |
| ----------------------------------- | --------------- | ------------------------------- |
| Success / done / paid / active      | `success`       | "Paid", "Active", "Completed"   |
| Pending / needs attention / at risk | `warning`       | "Pending", "Needs attention"    |
| Informational / in progress         | `info`          | "Draft", "In progress"          |
| Danger / failed / cancelled         | `destructive`   | "Failed", "Cancelled"           |
| Neutral / not-yet-built             | `secondary`     | "Soon" (the `StoreNav` pattern) |

**Do:** one word or two, sentence case, consistent token per meaning across the whole
app. **Don't:** invent a new colour per module (today's `activity-timeline.tsx` and
`order-payments.tsx` do exactly this — see [06 §12](./06_DESIGN_TOKENS.md)).

---

## 7. Feedback: toasts, loading, errors

| Situation               | Pattern                                                                                                                                    | Why                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Action succeeded/failed | One `sonner` toast (`toast.success` / `toast.error`) — the app's standard (used across server actions like `setActiveOrganization`).       | A single, consistent, non-blocking confirmation. Don't stack multiple toasts for one action.               |
| Loading                 | `Skeleton` for content; `disabled` + pending state for buttons (`disabled={pending}` in the org switcher).                                 | Skeletons preserve layout and set expectations better than a spinner; disabling prevents double-submit.    |
| Error copy              | Plain language + the recovery step. Show the server's guarded message (e.g. the org switcher surfaces `res.error`), never a raw HTTP code. | The user needs _what to do next_, not a stack trace ([01 §5 tactic 7](./01_PRODUCT_DESIGN_PHILOSOPHY.md)). |
| Empty state             | `StoresEmptyState` template (§4).                                                                                                          | Turns a dead-end into a next step.                                                                         |

Toast copy is sentence case, one sentence, no exclamation-mark spam: "Store created."
not "Store Created!!!".

---

## 8. Do / Don't — pulled from real Saroh screens

| #   | Do                                                                              | Don't                                                        | Source / rule                                                                  |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1   | "Your stores" as a single `h1`, one "New store" primary button.                 | Two primary buttons competing in the page header.            | `app/page.tsx` · [01 P2](./01_PRODUCT_DESIGN_PHILOSOPHY.md)                    |
| 2   | Mark the active nav item with `aria-current="page"` + `bg-accent`.              | Style the active tab with a raw colour or leave it unmarked. | `components/stores/store-nav.tsx` · [06 §11](./06_DESIGN_TOKENS.md)            |
| 3   | Pair icon-only controls with `aria-label` ("Switch organization").              | Ship a bare `ChevronsUpDown` with no accessible name.        | `components/organizations/organization-switcher.tsx` · [07 §3](#3-iconography) |
| 4   | Show a guarded error via `toast.error(res.error)`.                              | Let an unauthorized org selection 403 silently downstream.   | org switcher · [07 §7](#7-feedback-toasts-loading-errors)                      |
| 5   | Use `text-muted-foreground` for secondary text (`/{store.slug}`, helper lines). | Reach for a grey hex or `text-gray-500`.                     | store layout, empty state · [06 §1](./06_DESIGN_TOKENS.md)                     |
| 6   | Tokenise status: `text-warning` for an amount that needs attention.             | `text-amber-700 dark:text-amber-400`.                        | `components/stores/order-payments.tsx` · [06 §2/§12](./06_DESIGN_TOKENS.md)    |
| 7   | `text-xs` (12px) for a badge.                                                   | `text-[10px]` arbitrary size.                                | `components/stores/store-nav.tsx` · [06 §12](./06_DESIGN_TOKENS.md)            |
| 8   | Render "Soon" as a `secondary` `Badge` on a disabled item with `aria-disabled`. | A dead link that 404s.                                       | `StoreNav` `comingSoon` pattern · [01 §4](./01_PRODUCT_DESIGN_PHILOSOPHY.md)   |
| 9   | `tabular-nums` for money columns.                                               | Proportional figures that misalign in a table.               | `order-payments.tsx` · [07 §5](#5-numbers-dates--currency-formatting)          |
| 10  | Sentence case labels ("Create organization").                                   | Title Case ("Create Organization").                          | org switcher · [07 §2](#2-capitalization)                                      |

---

## 9. Quick checklist (paste into PR reviews)

- [ ] One primary action; correct `Button` variant per intent.
- [ ] Sentence case for all copy; product is spelled "Saroh".
- [ ] Plain, active, second-person voice; error copy states the next step.
- [ ] lucide-react icons only, `size-4`, `currentColor`, `aria-label` on icon-only controls.
- [ ] Status uses semantic tokens/`Badge` variants — no raw palette colours.
- [ ] Numbers/dates/currency via shared `Intl` formatters; `tabular-nums` on figure columns.
- [ ] Empty & error states present, following the `StoresEmptyState` template.
- [ ] No arbitrary Tailwind values in app code (`*-[…]`); no hard-coded hex/px.
- [ ] Focus ring intact; disabled/hover/active states use the tokenised utilities.

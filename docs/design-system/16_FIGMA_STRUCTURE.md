# 16 · Figma Structure

> Part of the Saroh design system. Companions: `04_DESIGN_TOKENS.md`,
> `05_COMPONENT_LIBRARY.md`, `06_LAYOUT_SYSTEM.md`, `07_STYLE_GUIDE.md`,
> `13`–`15`.

**Anchor — "Saroh Canvas": calm, fast, legible, minimal motion, one product.**

**The one governing principle: Saroh is code-first. Figma MIRRORS the code; it
never leads it.** The source of truth for tokens is
`packages/ui/src/globals.css` + `tooling/tailwind-config/tailwind.config.ts`;
the source of truth for components is `packages/ui/src/components/ui/*` (46
shadcn/Radix primitives). Figma's job is to be a faithful, navigable reflection
of that system for design exploration and handoff — so every name, variant, and
token in Figma must be traceable back to a file. When they disagree, **code
wins and Figma is corrected.**

Why code-first (not Figma-first): the product already _ships_ from these
primitives, tokens already exist as CSS variables, and there is no design team
maintaining a parallel spec. A Figma library that diverges would create
authority ambiguity and drift; a mirroring library stays cheap to keep true.

---

## 1. File & project structure

Recommended: **one library file + consumer files**, matching the monorepo split.

```
Saroh (Figma project)
├── 📚 Saroh Canvas — Library         ← the published library (mirrors @saroh/ui)
│   ├── Cover
│   ├── 1 · Foundations
│   ├── 2 · Tokens
│   ├── 3 · Components
│   ├── 4 · Patterns
│   └── 5 · Changelog
├── 🧩 Templates                       ← the 12 page templates (doc 14 §4)
├── 🔀 Flows                           ← end-to-end journeys (mirrors 03_USER_JOURNEYS)
└── 🧪 Explorations (unpublished)      ← WIP; never a source of truth
```

Why one published library: `@saroh/ui` is a single shared package consumed by
every app — the Figma library should be equally single and shared, so
`app.saroh.in`, `accounts`, marketing, etc. all pull from one place, exactly as
they all import from `@saroh/ui`.

---

## 2. Pages inside the Library file

| Page                | Mirrors in code                            | Contents                                                                                                                                                             | Why                                                             |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **1 · Foundations** | `07_STYLE_GUIDE.md`, `globals.css`         | Grid/spacing (Tailwind 4px scale), Inter type scale (self-hosted `InterVariable`), radius (`--radius` 0.5rem → lg/md/sm), elevation/`shadow-*`, iconography (lucide) | The invisible rules everything inherits                         |
| **2 · Tokens**      | `globals.css`, `tailwind.config.ts` colors | Every CSS variable as a Figma **Variable** (see §4), light + `.dark` modes, brand ramp                                                                               | One-to-one token parity is the backbone of the mirror           |
| **3 · Components**  | `packages/ui/src/components/ui/*` (46)     | One frame per primitive, variants matching code props (§3)                                                                                                           | The heart of the library                                        |
| **4 · Patterns**    | app usage (headers, empty states, forms)   | Composed molecules: AppHeader, form field (`FormItem`), card-list row, kanban column, toast                                                                          | Shows how primitives combine — where a11y/responsive rules live |
| **5 · Changelog**   | git history of `@saroh/ui`                 | Dated entries when a component/token changes in code                                                                                                                 | Keeps the mirror honest; every code change logs a Figma sync    |

---

## 3. Component naming & variant/prop parity

**Naming rule: the Figma component name = the exported component name in
`@saroh/ui`, PascalCase.** No synonyms, no "Primary Button" — it is `Button`
with a variant, exactly as the code exposes it.

### The parity contract (variants = code props)

Figma **variant properties** must map 1:1 to the component's real props. Using
the two most-used primitives as the template:

**`Button`** (`button.tsx`, `cva` l.7–35):
| Figma property | Values | Code source |
|----------------|--------|-------------|
| `variant` | default · destructive · outline · secondary · ghost · link | `variants.variant` |
| `size` | default (h-10) · sm (h-9) · lg (h-11) · icon (h-10 w-10) | `variants.size` |
| `state` | rest · hover · focus-visible · disabled | pseudo-classes in the class string |
| `asChild` | (not a visual variant — omit) | slot behavior, no Figma equivalent |

**`Badge`, `Alert`, `Toggle`, `Sheet(side)`** likewise expose their `cva`
variants as Figma variant props. **Rule:** if code has a `variant` the code
`cva` map is the allowed enumeration — do not invent Figma-only variants, and do
not omit code variants. A reviewer can diff the Figma variant set against the
`cva` block and they must match.

### The 46 components → Figma frames

Every file in `packages/ui/src/components/ui/` gets a component/component-set:
`accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb,
button, calendar, card, carousel, chart, checkbox, collapsible, command,
context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, label,
menubar, pagination, popover, progress, radio-group, resizable, scroll-area,
select, separator, sheet, skeleton, slider, sonner (Toast), switch, table, tabs,
textarea, toggle, toggle-group, tooltip, wordmark` (+ `theme-provider` has no
visual). **Do not add a Figma component that has no code counterpart** — if a
design needs one, it must land in `@saroh/ui` first (code-first).

### State/interaction

Figma can't run Radix, so represent interactive states as **variant states**
(rest/hover/focus/open) and annotate motion with the tokens from
`15_MOTION_GUIDELINES.md` (e.g. "enter: 160ms ease-out") rather than
prototyping bouncy transitions. Keep prototypes calm to match the anchor.

---

## 4. Token sync approach

**Figma Variables mirror the CSS variables — same names, same modes.**

| CSS variable (`globals.css`)                                                                                                                                                                             | Figma Variable                                          | Collection / Mode                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--primary(-foreground)`, `--secondary`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--brand(-foreground)` | `color/background`, `color/foreground`, … `color/brand` | **Color** collection, modes **Light** (`:root`) + **Dark** (`.dark`) |
| `--radius` (0.5rem) → `lg/md/sm`                                                                                                                                                                         | `radius/lg`, `radius/md`, `radius/sm`                   | **Radius** collection                                                |
| Tailwind spacing (4px scale)                                                                                                                                                                             | `space/1`…`space/8`                                     | **Spacing** collection                                               |
| Inter type scale                                                                                                                                                                                         | `text/sm`, `text/base`, `text/2xl` …                    | **Type** collection                                                  |

Sync mechanics:

1. **HSL fidelity:** tokens are authored as HSL triplets (e.g. `--brand: 221.2
83.2% 53.3%`). Store the same HSL in Figma so brand-blue-600 is _identical_,
   not eyeballed.
2. **Two modes only** (Light/Dark) to match the `:root` / `.dark` split — and
   note in the token page that **`.dark` is under-exercised in product** (doc 13
   §4), so Dark-mode component work is exploratory until a surface ships it.
3. **Direction of sync is code → Figma.** When a token changes in `globals.css`,
   update the Figma Variable and log it on the Changelog page. A token existing
   only in Figma is a bug.
4. Optionally automate with the **Tokens Studio** plugin or the Figma Variables
   REST API reading a JSON export of `globals.css`, so the mirror can be
   regenerated rather than hand-edited.

---

## 5. Templates & Flows files

**Templates file** — one page/section per archetype from `14_RESPONSIVE_GUIDE.md`
§4, each drawn at the doc's test widths (360 / 768 / 1024 / 1440):

Marketing landing · Auth/login (light card on dark) · App shell · Onboarding ·
List/card-grid · Record detail · Kanban board · Dashboard · Form/create ·
Notifications feed · Data table · Docs/help.

Each template frame must:

- compose only **library components** (no detached instances),
- show the **responsive tiers** side by side, and
- flag the known gaps as Figma annotations — e.g. on the **App shell** frame,
  annotate the mobile tier: _"nav must open the `Sheet` drawer; today it is
  `hidden lg:flex` with no fallback (doc 14 §2)."_

**Flows file** — clickable prototypes of the real journeys (mirrors
`03_USER_JOURNEYS.md`): sign-up → onboarding (zero-org) → create store → invite
member, etc. Prototypes stay calm (doc 15): fades/slides ≤300ms, no springs.

---

## 6. Handoff conventions

| Convention                           | Rule                                                                                                  | Why                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Token names in specs**             | Redlines reference the Variable/utility name (`bg-brand`, `text-muted-foreground`), never a raw hex   | Devs paste the class; no hex-matching, no drift             |
| **Component = code component**       | Handoff says "`Button` variant=outline size=lg", which maps to `<Button variant="outline" size="lg">` | Removes translation between design and `@saroh/ui`          |
| **Spacing in 4px units**             | Use `space/*` tokens, not arbitrary px                                                                | Matches Tailwind's scale; `p-4/6/8` etc.                    |
| **A11y notes travel with the frame** | Focus order, `--ring`, target ≥44px, label/error wiring (doc 13) annotated on the frame               | Accessibility is speced, not rediscovered                   |
| **Motion notes**                     | duration/easing token per interaction (doc 15)                                                        | Dev applies the right `tailwindcss-animate` class           |
| **"Don't shrink desktop"**           | Templates ship all responsive tiers, not one scaled artboard (doc 14 §3)                              | Prevents the single-breakpoint trap the product already has |
| **No orphan components**             | Anything in Figma must exist (or be committed to land) in `@saroh/ui`                                 | Preserves code-first authority                              |

---

## 7. Governance — keeping the mirror true

1. **Code is canonical.** Any conflict resolves to `packages/ui` + `globals.css`
    - `tailwind.config.ts`.
2. **New component?** It lands in `@saroh/ui` first, then gets a Figma frame —
   never the reverse. This keeps Figma from proposing components the engineering
   system can't back.
3. **Every `@saroh/ui`/token PR** notes whether it changes visual API; if yes, a
   Figma sync + Changelog entry is part of "done."
4. **Quarterly drift audit:** diff the Figma component set and Variables against
   the 46 files and `globals.css`; delete Figma-only artifacts, add missing ones.

**Net:** Figma gives designers a fast, shared canvas to think in — while the 46
primitives and the token file remain the one product's single source of truth.

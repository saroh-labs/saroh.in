# Design system and theming

> **Read when:** styling anything; adding a token, a skin, an icon or an
> animation; checking accessibility; or drawing on a merchant's page.
> Adapted from claude-patterns `frontend/04-design-system.md`, reconciled with
> `docs/design-system/` — `06_DESIGN_TOKENS.md`, `07_STYLE_GUIDE.md`,
> `13_ACCESSIBILITY_GUIDE.md`, `14_RESPONSIVE_GUIDE.md`, `15_MOTION_GUIDELINES.md`.
> Those are a July 2026 audit; several gaps they describe have since closed,
> and dated notes in them say which. This file is the current state.

## Two token layers, never mixed

| Layer    | Where it is defined                                               | Where it is used                                                |
| -------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Saroh    | `packages/ui/src/globals.css`, `tooling/tailwind-config`          | The product apps                                                |
| Merchant | `--site-*` via `packages/site-blocks` (`SiteTheme`, `siteColors`) | `apps/saroh.app`, the editor preview, the `ui.saroh.in` catalog |

- **Current** — A merchant's site never inherits Saroh's brand, and
  `pnpm run check:blocks` enforces it. **G2:** no Saroh design token inside a
  site block. **G6:** the `--site-*` layer only inside `packages/site-blocks`,
  plus an allowlist in `scripts/check-blocks.mjs` of Saroh surfaces on a
  merchant's page (404, error and loading boundaries, checkout, the site header
  and footer, preview frames). A surface that draws no block goes on the list
  with its reason; a block goes in the package. **G7:** no Saroh typeface on a
  merchant's site — no `font-sans`, `font-display` or `font-mono` in a block,
  no `packages/ui/fonts` path in `apps/saroh.app`, and `next/font` only in its
  merchant font list, `lib/site-fonts.ts`.
  Blocks set type with `font-site-heading` and `font-site-body`, and small
  machine facts (a time, a year, a handle) with `font-site-mono`, which falls
  back to the body face for a pair without a mono (see "Type and the mark").
- **Current** — Every `siteColors` key has a default in `SiteTheme` (`muted` and
  `border` did not until `00cd219`).
- **Current** — **A template may carry exact colours and a type scale
  (DEC-090)**, never a merchant: `Site.style.palette` (`#RRGGBB` per role,
  every text pairing 4.5:1, `parsePalette` in `@saroh/block-contract`) and
  `Site.style.type` (`parseTypeScale`). The API accepts either only as one of
  the site's template's colourways (`site-style-offer.ts`), and publishes the
  hex as HSL triples, so `SiteTheme`'s guard never admits a `#`. A block reads
  the type scale as `var(--site-display-size, <today's size>)`,
  `--site-body-size` and `--site-measure` with today's value as the fallback,
  and marks a section title `data-site-title` (the eyebrow rule `SiteTheme`
  writes from `--site-label-style`). Section headings use `font-site-heading`.
- **Current** — **A section's frame and the page's column** (industry
  templates, polish pass). Every section may carry `anchor`, `navLabel` and
  `band` beside its own fields (`section-frame.ts` in `@saroh/block-contract`;
  `parseSectionContent` keeps them for every block, so a block schema never
  names them). `PageSections` puts the anchor on the wrapper as its `id` and
  the band as `data-site-band`; `SiteTheme` recolours the section's own
  `--site-*` tokens inside a band (through `--site-band-*` aliases), so a block
  never knows it is in one. A home-page section with a menu label leads the
  header's menu as `/#anchor`, resolved at publish (`withInPageNavigation`).
  A template's `type.contentWidth` (720–1320px) becomes `--site-content-width`:
  the chrome reads it as `max-w-site-content`, and while it is set `SiteTheme`
  sets the blocks' `max-w-screen-md/lg/xl` inside sections to it. The footer
  may be laid out `left` (`Site.footer.layout`), which a save of the line
  alone keeps. `left` is the designs' row (name, line, and on Free
  "Made with Saroh" at the end, DEC-102) with its margins inside `max-w-site-content`, as the header's.
  Under either layout, "Sold by ‹legal name›" with the business's
  registered address and contact (`sold-by.tsx`, DEC-121), in the footer's
  own colours; on Free, "Report" follows the credit.
- **Current** — **Template round 2.** A palette may name two optional
  status roles, `status` (the "open now" dot on the page) and
  `statusInverse` (over a hero photo's wash or an inverse band), each held
  to 3:1 (a graphic, WCAG 1.4.11) on its ground and never filled in: unset,
  `bg-site-status`/`bg-site-status-inverse` fall back to the accent, so a
  palette without them draws as before; an inverse band swaps them and an
  accent band clears them. A text block may set its own `h2`/`h3` as the
  site's section titles (`headingStyle: "label"`, `data-site-headings`),
  its `dl` terms as quiet uppercase labels (`factsStyle: "labels"`,
  `data-site-facts`) and carry a small `label` over it (`data-site-title`);
  the rules are `SiteTheme`'s. `features.introStyle: "display"` sets the
  intro as one large heading-face line; `productGrid.columns` (3–5) fixes
  the bare cards' count across at the desk.

## Saroh tokens — Ink & Saffron

- **Current** — **The brand is the "Saroh Brand System" page in the Claude
  Design project** (22 sections, v1); every value there is decided. How it
  landed, what is still to build and the one departure (`--input`) are in
  `docs/architecture/adr/ADR-005-ink-and-saffron-brand.md`. Ink `#1C1C1A` is the primary;
  Saffron `#D98A15` is the one accent; Paper `#F5F2EC` is the page, white the
  raised surface.
- **Current** (10 Oct 2026) — **Saffron is the menu's current-page marker
  and `Button variant="highlight"`, nothing else in the merchant app.** A link
  is Ink and underlined, selection (a tab, a table row, a segmented option, a
  chip) is Ink, a progress fill is Ink, and a tint that says "yours, in play"
  is the `active` badge (a solid Ink edge). `lib/consistency/shared-pieces.test.ts`
  fails on `text-brand`, `bg-brand-subtle`, `bg-highlight`, `decoration-brand`,
  `border-brand` and `hsl(var(--brand))` in `apps/app.saroh.in` outside its
  two allowed files, the rail and the phone tab bar. The readiness cards
  carry no tint. Saffron 500 is for fills; text in Saffron is 700 on light
  and 400 on dark.
- **Current** — Semantic colours `primary`, `secondary`, `muted`, `accent`,
  `destructive`, `success`, `warning` and `info`, each with `-foreground`; a
  `-subtle` pair for `success`, `warning`, `destructive`, `info`, `brand` and
  `highlight`; `-hover`/`-active` steps on the filled actions; `border-strong`,
  `field` and `disabled`. Scales: `brand-*` is Saffron, and `highlight-*` and
  `neutral-*` are both Ink. Warning is red-orange, never amber, because amber
  reads as Saffron.
- **Current** — **`--primary` is the Ink button; `highlight` is the Saffron
  one;** `--brand` is Saffron that sets text. The `brand` Button variant renders
  Ink, like `default`. Only `highlight` is Saffron, and it goes on one action
  per screen.
- **Current** — **Hover moves one ramp step, pressed two**, never a new hue and
  never an opacity. **De-emphasis is a colour, not an opacity:** Ink 500 on
  light. (The calendar's past-day chips were `opacity-80`, which took their
  words under 4.5:1; they are `saturate-50` now.)
- **Current** — **`--layer-1`…`--layer-7` are the Business Calendar's layer
  fills** (umber, green, slate, clay, bronze, navy and stone — invoices' own,
  E21 — as the design draws them, kept on dark), with `--layer-foreground` for the count written on them.
  Which layer takes which is `lib/calendar/layers.ts`; the class strings sit
  in `components/calendar/tones.ts` because Tailwind does not scan `lib/`.
- **Current** — **`--accent` is a shadcn neutral** with about 32 component
  usages, not a brand accent. Don't rename it.
- **Adopted** — **Never an arbitrary value, a hex literal or a raw palette class
  in app code** (06, "the cardinal rule"); add a token instead. Arbitrary values
  are fine inside `packages/ui` primitives. Gap: one raw palette class in
  `app.saroh.in`; arbitrary values in app code are not counted.
- **Adopted** — **Add a token only when the pattern recurs** (three or more
  places) and nothing existing fits, with a comment saying what it is for.

## Skins and dark mode

- **Current** — **Skins are token scopes, nothing more.** The brand (`saroh`)
  is the base `:root` / `.dark` register and the default, so it has no block of
  its own. The four pre-brand skins (`mono`, `panel`, `instrument` and
  `stockroom`) sit on a legacy block that holds the old base verbatim. They are
  hidden in the switcher until the brand settles, and the switcher renders
  nothing while only one skin is visible. `saroh.app` pins `data-skin="mono"`,
  so merchant-facing Saroh surfaces keep the pre-brand register. A skin is
  selected by `data-skin` on `<html>` and composes with `.dark`. A new skin is a
  CSS block in `globals.css` plus an entry in `apps/app.saroh.in/lib/skins.ts`.
  Never branch on a skin in a component.
- **Current** — `--radius` differs by skin (0 to 0.5rem), so `rounded-sm` on a
  16px control is at most 4px and never turns a checkbox round. **Adopted** — a
  skin that raises `--radius` must re-check small fixed controls.
- **Current** — Dark mode is the `class` strategy through `next-themes`; the app
  defaults to light with system preference enabled, and theme flips don't
  animate (`disableTransitionOnChange`). **Adopted** — every colour token defines
  a light and a dark value in every skin; dark is defined, never derived
  (`saroh-four-scenes` skill).

## Components and status

- **Current** — **Variants over colour classNames.** Don't paint `bg-*` or
  `text-*` over a primitive; add a variant. `Button` has `default`, `brand`,
  `highlight`, `success`, `destructive`, `outline`, `secondary`, `ghost` and
  `link`.
- **Current** (10 Oct 2026) — **One of each small piece.** A screen never
  draws its own; the scan in `apps/app.saroh.in/lib/consistency/shared-pieces.test.ts`
  fails when one does, and its allowlists are the record of what is left.

    | Piece                                 | Where                                                   | The rule                                                                                                                                                                                  |
    | ------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `TabStrip`                            | `@saroh/ui/tabs`                                        | The one tab look: Ink underline, 14px, optional count, one line inside `ScrollX` on a phone, 44px on touch. Links (`href`, `aria-current="page"`) or buttons (`role="tab"`, arrows move). |
    | `SectionList`                         | `components/shared/section-list.tsx`                    | The one vertical list of sections (Settings, Website › Settings).                                                                                                                         |
    | `Segmented`                           | `@saroh/ui/segmented`                                   | The one either/or: a grey track, the chosen option Ink. A radio group, or a `nav` of links.                                                                                               |
    | `Chip`, `chipClass`                   | `components/shared/chip.tsx`                            | A choice among a few (radio) or a filter (`as="toggle"`). One size.                                                                                                                       |
    | `ListSearch`                          | `@saroh/ui/list-search`                                 | "Search {things}" (required), icon, 38px, 180ms, Escape clears, "/" focuses, "Searching…" while the list is read. DataView draws it.                                                      |
    | `StatusBadge`, `Badge`                | `components/shared/status-badge.tsx`, `@saroh/ui/badge` | Sentence case, words always, never pressed. `size="sm"` is 11px, `dot` adds a dot.                                                                                                        |
    | `CountBadge`                          | `@saroh/ui/count-badge`                                 | Unread and tab counts: `neutral`, `strong` (Ink, something waits), `danger`. `null` is "—", never 0.                                                                                      |
    | `Notice`                              | `@saroh/ui/notice`                                      | `tone`, `title`, `action`, `role`, `layout` (`card`, `banner`). The `-subtle` tokens, never an alpha tint. `ReadOnlyNote` and `SinceNotice` are thin wrappers.                            |
    | `TextLink`, `textLinkClass`           | `@saroh/ui/text-link`                                   | Ink, underlined at rest, focus ring. `external` adds the glyph and the new tab.                                                                                                           |
    | `IconButton`, `Tip`                   | `@saroh/ui/icon-button`, `@saroh/ui/tooltip`            | `label` is required: the name and the tooltip. `Tip` replaces `title=` and is the control's `aria-description`.                                                                           |
    | `CopyButton`, `ShareLink`, `copyText` | `@saroh/ui/copy-button`                                 | "Copied" in the label for 1.6s, no toast. One failure sentence, with the value shown selected. `ShareLink` opens the phone's share sheet. The only code that touches the clipboard.       |
    | `ProgressBar`, `doneOf`               | `@saroh/ui/progress-bar`                                | `value`, `max`, `size`, `tone`, `label` (required). A checklist's count is "2 of 4 done".                                                                                                 |
    | `.label`                              | `packages/ui/src/globals.css`                           | 11px, 600, uppercase at 0.1em: every table and list header and eyebrow. The only `uppercase` in the app (code fields excepted).                                                           |

- **Current** (10 Oct 2026) — **"Draft" and "Live" for every kind of
  thing.** Whether customers can get a product, plan, course, pack, post,
  service or discount code is one of six words, the same whatever the thing:
  Draft, Scheduled, Live, Paused, Ended, Archived. The thing's own sentence
  ("Taking bookings.", "Open to sign-ups.", "On sale.") is the badge's hint.
  The table is `apps/app.saroh.in/lib/status/vocabulary.ts`
  (`<StatusBadge thing="plan" status={plan.status} />`); database values and
  API fields keep their names.
- **Current** — **Status reads through `Badge` variants,** never coloured text.
  State is a filled pill (`success`, `warning`, `error`, `info`): the
  status tint with its 700 text, always saying the status in words. `draft`
  is a dashed neutral edge and `active` ("in play, yours to act on") a solid
  Ink edge; both were Saffron tints. Kind is the neutral outline `tag`, for
  categories a shop owner invents.
- **Current** (10 Oct 2026) — **A screen's tabs are `?tab=`; a list's saved
  filter is `?view=`.** Products' Collections and Inventory, Invoices and
  Team moved to `?tab=`; their old `?view=` links still land
  (`readListQuery`, `tabFromView`, `useTabParam`'s `alias`). The section
  screens (Settings › Business, Location, Website › Settings) keep
  `?section=`, which deep links and Search settings use.
- **Current** — **Overlays come in fixed sizes and one head and foot**
  (UX audit, 10 Oct), baked into `@saroh/ui/dialog`, `sheet` and
  `alert-dialog` so no caller patches them: `DialogContent size="sm" |
"md" | "lg"` (420, 460, 560px), the title in `font-display` at 18px, a
  30px close target that is 44px on a touch pointer, and a footer that
  stacks on a phone with `gap-2` and the main button on top. Never pass a
  footer its own gap or a title its own type. The app draws them through
  `FormSheet`, `FormDialog` and `ConfirmDialog` (`frontend-forms.md`).
- **Current** — **Border-first elevation.** `Card` is `rounded-xl` (14px) with
  no shadow, and `Button` and `Input` carry none. Shadows are Ink at low alpha,
  never black, and are for overlays that float above content: raised 8%, menu
  10%, modal 14%. On dark, depth comes from a surface step instead.
- **Current** — **The work area is white in light and the ground in dark.**
  In light the rail sits on Paper and the page you work on is the raised white
  card. In dark it is the ground (`--background`), as on the marketing site,
  and the tables and cards on it are the step up (`--card`). So a table
  container carries `bg-card` itself, not relying on the page behind it
  (`app-shell.tsx`, `data-view.tsx`).
- **Current** — **Button sizes are 28 / 32 / 38 / 45px** (`xs`, `sm`,
  `default`, `lg`), set explicitly and weight 600, with `icon`, `icon-sm`
  and `icon-xs` as the same heights square and `inline` (with the `link`
  variant) for a text action in a line of words. A call site never sets a
  button's height, radius, type size or padding: pick a size. An icon-only
  button is `IconButton`, which requires its label.
- **Current** — **Busy is not disabled.** `Button busy busyLabel="Saving…"`
  says it is working (`aria-busy`), takes no press and keeps its colour and
  its width: both labels are laid out in one cell, so nothing beside it
  moves. One wording per action, the verb's "-ing" form alone ("Saving…",
  "Adding…", "Making…", "Trying again…"). `disabled` is for "you can't",
  and a button that only waits on another's action (Cancel while saving)
  is disabled, not busy.
- **Current** — **Disabled is one treatment, on tokens of its own:**
  `--disabled`, `--disabled-foreground` and `--disabled-border`, none of
  them `muted`, so a disabled button on a muted panel keeps an edge and a
  disabled value does not read as a placeholder. The label still clears
  4.5:1. Never `disabled:opacity-*` (ESLint fails it). Say why a control is
  disabled beside it, or keep it on and explain on submit.
- **Current** — **A field's states come from the primitive.** `Input`,
  `Textarea` and the select's box share one hover step, one focus ring
  (`focus-visible:` only), the disabled tokens, the error look from
  `aria-invalid`, and a read-only look (a hairline, no fill, the value at
  full contrast: `readOnly` on a field, `readOnly` on `OptionSelect`).
  `Input dense` is the 32px field for a table row. Checkbox and radio share
  one 1.5px edge in `border-input` (3.17:1 on white). `Switch` has a `sm`
  size. A call site never sets a field's height, radius or type size.
- **Current** — **No hand-made controls in `app.saroh.in`.** ESLint
  (`tooling/eslint-config-custom/controls.js`) fails a raw `<button>`,
  `<input>`, `<select>`, `<textarea>` or `<label>`, `disabled:opacity-*`,
  and `focus:ring*` / `focus:outline*`. What is still drawn by hand (a row
  that is a button, a chip, a calendar cell, a file picker, a label that
  wraps its control) is listed by file in `controls-allowlist.js` with what
  it is, and `lib/controls-allowlist.test.ts` fails a stale line. Add a
  line only for a genuinely different control.
- **Adopted** — **One primary action per screen;** button labels are verb plus
  noun; sentence case everywhere; the product is always "Saroh" (07 §2, §4).
- **Current** — **One page header: `PageHeader`** (`@saroh/ui/page-header`,
  10 Oct 2026). Every list, record, editor and Settings section in
  `app.saroh.in` draws it and nothing else: the breadcrumb inline above the
  title, in the menu's names ("Bookings › Class packs", each step but the
  last a link where it has a page); the title at 30px, wrapping balanced
  rather than cut; then its slots. `count` is how many the page holds, in
  the thing's own word ("3 bookings", from `countLabel`), and is left out
  at zero. `badge` is a record's status pill, `lead` its picture or
  initials. `description` is one line. `meta` is what sits before the
  buttons and is not one: a view switch, or a figure that is not a count
  ("₹12,400 owed to you · 2 overdue"). `actions` are the buttons: the
  primary LAST, a default `Button` with no icon and no custom height or
  radius, named "New {thing}" when it starts a new record; secondary
  actions before it. No bordered breadcrumb strip, no hand-written `<h1>`
  and no hand-written `aria-label="Breadcrumb"`: a screen that needs
  something the header lacks adds a slot to it.
  `components/shared/page-chrome.test.ts` fails on either. A Settings
  section's header is `SettingsPanelHeader`, which draws the same component
  with "Settings › {section}". An editor's sticky bar holds it too
  (`components/editor-shell/publish-banner.tsx`).
- **Current** — **A list names its rows.** `DataView`'s `noun` is required
  ("No codes match…", never "rows"), and a screen whose header carries the
  count passes `showTotal={false}`: the list then speaks only when it is
  narrowed ("3 of 12 bookings").
- **Current** — **One width per kind of screen, through `PageContainer`**
  (04 §1): lists, boards and dashboards `full`; create and edit forms
  `form`; a record keeps its named width (`default`, or `full` where its
  page runs edge to edge). No inner `max-w-*` wrapper narrows a list inside
  a wider container. A settings-style screen made of rows (Sell › Location,
  Website › Settings, Settings › Business) lays out through
  `SettingsColumns` (`components/shared/settings-columns.tsx`): rows at
  760px, growing to 1040px from a 1440px window, with the one "what's left"
  card above the tabs and to their right from 1440px (1760px where a list
  already sits beside the rows). The other Settings sections share that
  measure through `SettingsPanel` (`rows`), or take the panel (`full`) for
  a table.
- **Current** (10 Oct 2026) — **One setup checklist: `SetupChecklist`**
  (`components/shared/setup-checklist.tsx`, rules in
  `lib/setup-checklist.ts`). Home's and Settings › Business's "Finish
  setup", a location's and the website's "Before you share your site" are
  all it, each passing its own rows. A title, "2 of 4 done" (`doneOf`), the
  shared `ProgressBar`, done rows ticked first then what is left, and ONE
  button a row that opens its task in place (a `?edit=` link, or a press).
  When the last step is done the bar fills, the heading says the true thing
  (`doneTitle`, a sentence), and the card stays for that visit and is one
  quiet line on the next (`foldKey`; `fold="once"` lets the line go after,
  on Home). "Hide for now" with Undo is the screen's to keep (`hide`); it
  is kept per browser, since there is no per-person preference store on the
  server. The checklist on Home and Settings is named **Finish setup**
  wherever it is referred to (`FINISH_SETUP`, `checklistWords` in
  `lib/settings/ready.ts`), with a line saying what its steps are for.
  Never draw a fifth checklist by hand.
- **Current** — **`desk:` is 760px**, where the rail appears and the phone
  layouts end, and `max-desk:` is its exact complement. New code uses them.
  The older `min-[760px]:` and `max-[759px]:` mean the same and are not yet
  replaced; `max-[760px]:` overlapped by a pixel and is gone.
- **Current** — **`--warning` is a fill;** text on a pale tint uses
  `--warning-subtle-foreground`.
- **Current** (10 Oct 2026) — **A state has one look.** Nothing here, couldn't
  load, you can't, turned off, comes with a plan, limit reached, not
  connected and not published are the named states in
  `@saroh/ui/data-state`, each at `page`, `panel` or `inline` size. Dashed
  is a space to fill, solid a wall, red an alert. Never a dashed box, a red
  line or a grey sentence drawn by hand (`frontend-error-feedback.md`,
  `.agents/skills/saroh-product-states/SKILL.md`).

## Touch, reflow and accessibility

- **Current** — **A sticky bottom bar reports its height.** Anything stuck to
  the foot of the screen (an editor's phone bar, a count's Save, a settings
  Save) calls `useBottomBarInset(ref)` (`lib/hooks/use-bottom-bar-inset.ts`);
  the Toaster adds `--bottom-bar-inset` to its offsets, so a toast never
  covers, and swallows the tap on, the button the merchant reaches for next.
- **Current** — **Touch targets reach 44px on a touch pointer.** Every
  primitive carries it through the `coarse:` variant (a pointer media query,
  not a width) and keeps its desk size under a mouse: every `Button` size,
  `Input`, the select's box, `Toggle`, menu, select and command items,
  calendar days and month buttons, the dialog and sheet close, a toast's
  Undo, cancel and close, and the table's bulk bar. Where growing the box
  would break a layout (checkbox, radio, switch, a slider's thumb, an
  inline text button) an unseen area around the control takes the tap.
  `controls.test.tsx` pins each.
- **Current** — **A field is 16px on a touch pointer** (`coarse:text-base`
  on `Input`, `Textarea`, the select's box and the command menu's search),
  because iOS Safari zooms the page when a smaller field takes focus. A
  call site never sets a field's type size.
- **Current** — **A form control on a merchant's site is 16px or more**
  (`text-base` at least). iOS Safari zooms the page when a smaller field
  takes focus, and leaves it zoomed. Each also carries the keyboard and
  autofill its field needs (`inputMode`, `autoComplete`, `maxLength` for a
  PIN code). `site-blocks/src/form-controls.test.tsx` renders every one;
  a new control gets a line there.
- **Current** (10 Oct 2026) — **On a merchant's site, what a phone needs
  stays under the thumb, and CSS decides the layout.** A sheet's footer is
  pinned while its body scrolls (`SheetFrame`'s `footer`: the bag's total
  and button); sheets are sized in `dvh` and hold the page behind them
  still (`lib/sheet-shell.ts`). Add to bag and the booking page's summary
  are bars pinned to the foot of the screen under 700px. Both layouts are
  in the page the server sends, shown by `max-[699px]:` and
  `min-[700px]:` classes: never a script's reading of the screen's width,
  which draws the desk layout first on every phone. Tests pick a width
  with `viewport("phone")` (`src/test-viewport.ts`).
- **Current** (10 Oct 2026) — **A line that answers a doubt is body colour
  at 14px** on a merchant's site (`text-site-body text-sm`): how you pay,
  cancel rules, pick-up hours, returns, tax and delivery. `text-site-muted`
  is the merchant's own colour and can fall near 3:1 on their ground, so it
  is for labels and decoration, not for what a customer decides on.
- **Current** (10 Oct 2026) — **Every picture on a merchant's site loads by
  one rule**, `siteImage()` (`site-blocks/src/lib/site-image.ts`), spread
  onto a plain `<img>`: lazy below the fold, decoded off the main thread,
  the first section's hero fetched first. Give the `<img>` its width and
  height, or a box with an aspect ratio. No `srcset`: storage keeps one
  file per photo and nothing resizes on request.
- **Current** (10 Oct 2026) — **The customer's words**: Pick-up (never
  collect or pickup), bag (never basket), booking (never appointment, save
  where a merchant typed it), the payment window (never the provider's
  name), "Pay at the desk" only for a service attended in person ("Pay
  later" for one held online). No long dashes or semicolons.
  `site-blocks/src/customer-words.test.tsx` scans for them.
- **Adopted** — **Reflow at 320px and 390px** with no hidden operation and no
  page-level horizontal scroll; wide content scrolls inside its own container
  (14, 18, 04 §4). Put `min-w-0` on grid and flex columns holding text.
- **Current** — **A long value wraps whole; its buttons never move**
  (2026-09-29, P2). An email or a name a merchant typed wraps with
  `[overflow-wrap:anywhere]` rather than `truncate` where it is the thing
  being confirmed, and the button beside it is `shrink-0`. `DialogContent`
  and `AlertDialogContent` hold one `minmax(0,1fr)` column, break long words
  and scroll inside past the screen's height, so no value can push a
  dialog's actions off a phone. `e2e/tests/phone-reflow.spec.ts` checks the
  dialogs and sheets at 320 and 390 with a 60-character email.
- **Adopted** — **No hover-only affordance, ever** (PRODUCT_STRATEGY §19): the
  phone and the shop floor have no hover.
- **Current** — **The focus ring is Ink 900 with a Paper offset** (Saffron 400
  on dark), so it reads on white, Paper, Ink and Saffron alike.
- **Current** — **Every clickable shows the pointer and has a hover, a
  keyboard focus and a pressed state of its own** (the user's standing rule,
  P3). The primitives carry all four — Button, tabs, menu, select and command
  items, checkbox, radio, switch, toggle, the dialog and sheet close, the
  data view's rows and filters — and a base rule in `globals.css` gives the
  pointer to every ARIA widget role, so a hand-rolled radio or tab inherits
  it. A hand-rolled control pairs its `hover:` with an `active:` one step
  further along the ramp (`hover:bg-muted active:bg-accent-active`; a text
  link `hover:text-foreground active:text-muted-foreground`; a calendar block
  `hover:brightness-110 active:brightness-90`), and a focus ring is
  `focus-visible:`, never `focus:`, so a mouse click paints none. Two guards:
  `packages/ui/src/components/ui/interaction-states.test.tsx` pins the states
  on each primitive (and forbids `cursor-default` on a clickable one), and
  `e2e/tests/a11y.spec.ts` runs axe (WCAG 2.0/2.1 A and AA; serious and
  critical fail), checks every visible control's computed cursor and tabs
  through each main screen for a visible ring, desk and phone. Its ALLOW list
  is where a known debt goes, with its reason.
- **Current** — **A link is Ink and underlined at rest** (`TextLink`).
  Colour alone does not tell it from the text around it (axe
  `link-in-text-block`).
- **Adopted** — **Contrast materially above 4.5:1** for body text, in light and
  dark and every skin (`PRODUCT.md`); never colour alone; the focus ring is never
  removed; `muted-foreground` is never set below 14px or given opacity
  (13 §4); every dialog renders a `DialogTitle` (13 §8).
- **Current** — **An icon-only control is `IconButton`,** which cannot be
  made without a `label` (its name and its tooltip). **A hint is `Tip`, never
  `title=`** on something pressed: it shows on hover and on keyboard focus
  and is the control's `aria-description`. A thumb sees neither, so a reason
  a control is off is still written beside it. Gap: `title=` remains on text
  that is cut with an ellipsis (it carries the whole value), and about 100
  decorative icons lack `aria-hidden`.

## Icons

- **Current** — **`lucide-react` only**, `size-4` by default, `currentColor`,
  lucide's own 2px stroke (no `strokeWidth` on an icon), one glyph per
  meaning: `Plus` creates, `X` dismisses, `Pencil` edits, `ExternalLink`
  leaves the app, `MoreHorizontal` opens more actions, `TriangleAlert`
  warns (07 §3). Gap: `react-icons`
  is imported in `accounts.saroh.in` `components/auth/login-form.tsx` and
  `ui.saroh.in` `components/shared/header/index.tsx`.

## Type and the mark

- **Current** — **Three product faces, self-hosted in `packages/ui/fonts`:**
  Geist (`font-sans`) for all UI, body copy, labels and eyebrows, with 600 for
  buttons and emphasis. Space Grotesk (`font-display`) for display through H3,
  money and large figures, never body copy. JetBrains Mono (`font-mono`) **only
  where a value is measured**: a SKU, an order reference, a timestamp, a token
  value, a route. A label or eyebrow is 11px Geist 600, uppercase at 0.1em —
  never mono. Nothing is set below 11px. The wordmark's face (Plus Jakarta Sans 600) ships outlined inside `<Wordmark>`; the logo is always `<Wordmark>`. The one exception that loads the face is `saroh.in`, for the Marketing Site V2 phone menu's live "Menu" title (not preloaded, so it is fetched only when that sheet opens).
- **Current** — **`saroh.app` loads no Saroh face** (H1). A merchant's text is
  set through `--site-font-heading` and `--site-font-body` (`font-site-heading`
  and `font-site-body`, from the site-blocks preset). `SiteTheme` defaults both
  to a neutral system stack with `Noto Sans Devanagari`, and each class carries
  that stack as its `var()` fallback for a surface drawn before `SiteTheme`
  mounts. The root layout imports no `next/font`, and a block never writes
  `font-sans`, `font-display` or `font-mono`, which all resolve to Saroh's
  faces. Gate G7 enforces both.
- **Current** — **A site's typeface is a pair from `FONT_PAIRS`**
  (`@saroh/block-contract`, industry templates KTD-2): `Site.style.fontPair`
  holds a key, the API refuses any other, and `siteStyleVariables()` emits the
  KEY as `--site-font-heading/body` (nothing for the default `system` pair).
  `SiteTheme` turns the key into stacks from the list — a snapshot's value is
  never written into CSS — using the faces the app loaded (`faces` prop). The
  faces are loaded with `next/font/google` (latin, swap, `preload: false`) in
  `apps/saroh.app/lib/site-fonts.ts` and, for the editor's previews,
  `apps/app.saroh.in/lib/sites/site-fonts.ts` (`SiteFacesProvider`); a
  browser fetches only the pair the page is set in. A new pair is a list entry
  plus a loader in both files; tests hold the three in step. A pair may name a
  third, `mono` face (`archivo-narrow`: IBM Plex Mono; `geist`: JetBrains
  Mono), emitted as `--site-font-mono` only when it has one.
- **Current** — **The mark is one SVG master** in `packages/ui/brand`, with
  `<Wordmark>` / `<SarohSymbol>` from `@saroh/ui/wordmark`. Never re-draw it.
  The stroke is never Saffron, and the dot drops below 20px. Every brand app
  ships `favicon.ico`, `icon.svg` and `apple-icon.png` in `app/`, rendered from
  that master.
- **Current** — **`saroh.app` ships no icon file** (DEC-124). A merchant's
  site shows its own icon (Website › Settings), else the business logo, else
  a plain tile with its initial in `--site-accent`
  (`plainSiteIconSvg`, `@saroh/site-blocks/site-icon`, which the site serves
  at `/site-icon.svg` and the workspace previews). The public site read
  resolves which, and `[domain]/layout.tsx` declares it
  (`lib/site-icon.ts`); `/favicon.ico` on a merchant's address forwards to
  it. Never add `favicon.ico`, `icon.*` or `apple-icon.*` under
  `apps/saroh.app/app`: Next would serve it on every merchant's address
  (`lib/site-icon.test.ts` fails if one appears).

## Motion

- **Current** — **Reduced motion is honoured globally:** `globals.css` clamps
  every animation and transition under `prefers-reduced-motion`. 15 §4's gap is
  closed.
- **Current** — **Durations come from the tokens:** 100ms (`fast`) under the
  finger, 140ms (`base`) as the default, 200ms (`slow`) for drawers and sheets,
  always ease-out and never overshooting. That settles the old cap: nothing is
  longer than 200ms. Every `transition-*` in the merchant app carries
  `duration-fast`, `-base` or `-slow`; `transition-all`, `animate-pulse`,
  `ease-linear` and a literal `duration-200` fail the scan. Exit faster than entry, and never animate position and size
  together. Motion only explains a change, so there is no decorative, looping,
  parallax or bounce motion on product surfaces.
- **Adopted** — **Motion comes from the primitives and the shared Tailwind
  config, not per-app `@keyframes`** (15 §3). Gap, and a contradiction to
  resolve rather than copy: `accounts.saroh.in/app/auth.css` defines 8 keyframes
  and `app.saroh.in/app/workspace.css` 3, some on curves named `--sa-spring` and
  `--wk-spring`. Don't add a third file.

## Numbers and dates

- **Current** (10 Oct 2026) — **One formatter each, in
  `apps/app.saroh.in/lib/format`, and nowhere else.** No screen calls
  `Intl`, `toLocaleString` or builds a plural by hand:
  `scripts/check-formats.mjs` (in `pnpm prepush`) fails it.
    - **Money** (`money.ts`): `formatMoney(paise, currency)` and
      `formatMoneyMajor("1250.50", currency)` write "₹1,250" and
      "₹1,250.50": the currency's sign, Indian grouping, no ".00". A ledger
      or invoice column asks for `{ decimals: "always" }` ("₹1,250.00").
      Null in, null out, so the caller words what is missing.
      `formatNumber(1204)` is "1,204". The sign and the decimal places are
      `moneySign` and `moneyDecimals` from `@saroh/ui/lib/money`, the same
      ones `MoneyInput` shows and keeps.
    - **A day** (`datetime.ts`): `formatDate(at, zone)` is "12 Oct" this
      year and "12 Oct 2025" otherwise. Options add the weekday ("Mon 12
      Oct"), the long month, `relative` ("Today", "Tomorrow", "Yesterday";
      `"lower"` mid-sentence) and `year: "always" | "never"`. A
      "YYYY-MM-DD" key is read as written, never moved by a zone.
      `formatDay(key, { today })` is for a key with no zone to hand.
    - **A time**: the 12-hour clock, as the pickers are. `formatTime(at,
zone)` is "9:30 am", lowercase, no leading zero. `formatClock` does
      the same for a wall-clock value ("09:30", or minutes); its `short`
      is for an hour axis ("7 am"). `clockValue` is the "HH:MM" a time
      field holds, never words.
    - **Together**: `formatDateTime` is "12 Oct, 9:30 am". A range is
      `formatTimeRange` or `formatClockRange`: "9:30 to 10:15 am", and
      "11:30 am to 12:15 pm" across noon.
    - **How long ago**: `formatRelative` ("5 minutes ago"), only where a
      screen already says it.
    - **A count** (`plural.ts`): `count(3, "booking")` is "3 bookings",
      `count(2, "person", "people")` "2 people". `plural(n, "is", "are")`
      is the word alone.
    - Every date function takes the zone. Which zone is the caller's: the
      booking's own, the business's (`businessZone`, `BusinessDate`), or
      the viewer's through `ViewerDate`, which is also the only safe way
      to draw one in a server-rendered component.
    - A test whose words carry a date and no `now` calls `pinClock()`
      (`lib/format/test-clock.ts`), or it passes this year and fails the
      next.
- **Adopted** — `tabular-nums` on columns of figures, and "—" where zero is a
  state rather than a measurement (07 §5).

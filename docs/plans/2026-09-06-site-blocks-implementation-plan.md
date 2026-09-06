# Site blocks: one renderer, two packages, a catalog

Written 2026-09-06, against `development` at `aa5f326`. Implements the decision
on [#252](https://github.com/saroh-labs/saroh.in/issues/252), under map
[#251](https://github.com/saroh-labs/saroh.in/issues/251).

## The finding this plan is organised around

A block is defined **five times** in this repository, and drawn **twice**.

| What              | Where                                                                |
| ----------------- | -------------------------------------------------------------------- |
| Authoring schema  | `packages/database/src/cms/section-contract.ts`                      |
| Rendered shape    | `apps/saroh.app/lib/publication.ts:37-121` — hand-typed              |
| Draft shape       | `apps/app.saroh.in/lib/sites/service.ts:32-184` — hand-typed         |
| Renderer, live    | `apps/saroh.app/components/sections/`                                |
| Renderer, preview | `apps/app.saroh.in/components/sites/section-preview.tsx` — 362 lines |

Both hand-typed copies say so in their own comments. `publication.ts:14-17` even
carries the instruction: _"If the server contract gains a new version, add it
here."_

#189 is what that costs: a merchant set a section's padding, the editor obeyed,
the published site ignored it. `section-preview.tsx:41-43` predicts its own bug —
_"a preview using a different rule from the site it previews is a preview that
lies about something small on every screen."_

**The divergence is partly mechanical, not carelessness.** The `site.*` Tailwind
colour namespace is declared in exactly one place,
`apps/saroh.app/tailwind.config.ts:31-50`. So `hero.tsx` can write
`bg-site-hero-bg` and `section-preview.tsx` physically cannot — it writes
`bg-[hsl(var(--site-bg))]` instead. Two files drawing the same thing in two
notations, because only one of them had the vocabulary.

That is why this plan moves the **token layer** with the components. Moving the
components alone would let the two drift apart again for the same reason.

## What exists when this is done

```
@saroh/block-contract        zod · both shapes · ctaHref · toRendered · fixtures
   ├── api.saroh.in          validates on save, resolves at publish
   ├── @saroh/database       re-exports  →  API import lines unchanged
   ├── @saroh/templates      types (comes off the frontend ban list)
   └── @saroh/site-blocks    components · SiteTheme · tailwind preset
          ├── app.saroh.in   the builder previews with it
          ├── saroh.app      live merchant sites render with it
          └── ui.saroh.in    the catalog shows it
```

No app is added, removed or renamed. No schema change, no migration. Packages go
from eight to ten.

## A block's two shapes

This is the distinction the whole plan turns on, and it had no name before.

**Authoring** — what the editor writes and the contract validates:

```ts
{ label: "Call us", action: { kind: "call", number: "+91 98765 43210" } }
```

**Rendered** — what a publication snapshot carries and a component draws:

```ts
{ label: "Call us", href: "tel:+919876543210", action: { kind: "call" } }
```

`ctaHref()` maps between them at publish. The renderer never sees `action`'s
payload — deliberately, because a renderer that resolved page IDs would need the
draft tables it must never read.

The rendered shape has never had a schema. It gets one here, and `toRendered`
becomes the declared, per-block mapping.

---

# Step 0 — Prerequisites

**0.1 Decide the Tailwind preset's shape.** `site.*` must reach three apps.
`packages/site-blocks` exports a preset; each app merges it the way
`apps/saroh.app/tailwind.config.ts` merges `sharedConfig` today. Add
`../../packages/site-blocks/src/**/*.{ts,tsx}` to the shared `content` globs —
`packages/ui/src` is already there and is the precedent.

**0.2 Confirm the byte-identical baseline.** Before touching anything, capture
the rendered HTML of every section on the seeded Northwind site. This is G5's
reference and it cannot be reconstructed afterwards.

```bash
pnpm --filter @saroh/database db:seed
pnpm dev
# capture https://northwind.saroh.app.localhost and each of its pages
```

**Verification:** none yet. Nothing has changed.

---

# Step 1 — Extract the contract

Creates `packages/block-contract`. Pure TypeScript and zod. No React, no Prisma.

**1.1** Move `packages/database/src/cms/section-contract.ts` into the new
package. It imports only `zod`, verified — nothing about it is database-shaped.

**1.2** `@saroh/database` re-exports it, so `packages/database/src/index.ts:2`
keeps working and **the API's import lines do not change**. Its two real
consumers — `apps/api.saroh.in/src/modules/sites/pending-changes.ts:2` and
`packages/database/src/seed/run.ts:4` — are untouched.

**1.3** Declare the **rendered shape** per block, as zod, beside the authoring
schema. This is new: it exists today only as hand-typed TS in `publication.ts`.

**1.4** Move `resolveCtaHrefs` out of `pending-changes.ts` and generalise it.
Today it sniffs:

```js
if ("action" in c) return withHref(c);
if ("cta" in c)    return { ...c, cta: … };
return content;                              // silently untouched
```

It becomes a per-block declared `toRendered(draft, ctx)`. **Required on every
block, even when it returns its input unchanged** — a block author who does not
think about it gets a type error, not a silent pass. `sanitizedFields` is the
precedent: the block declares, the pipeline acts.

**1.5** Add `variant` to the rendered shape, optional. Now, not later: an added
optional field is not a breaking change (`paddingOverride` established that at
`section-contract.ts:46-50`), so it costs one line per block today versus a
version bump per block after a dozen have shipped.

**1.6** Add the fixture slot. One example content object per block per variant.

**1.7** Take `@saroh/templates` off the frontend ban list in
`tooling/eslint-config-custom/nextjs.js:19-30` — it imported types from
`@saroh/database`, and now imports them from a package with no Prisma in it.

**1.8** Correct the header comment. It claims the public renderer "validates what
it reads back"; `section-renderer.tsx` casts. The comment is wrong, not the code
— see Step 3.4 for where validation actually lands.

**Gates landing here:** G3 (registry typed `Record<BlockType, …>`, so a block
missing `toRendered`, variants or a fixture fails the build — precedent
`SECTION_LABELS: Record<SectionType, string>`), G4 (fixtures parse against their
own schemas in CI).

**Verification:**

```bash
pnpm run lint && pnpm run typecheck
pnpm --filter @saroh/api test:unit
TEST_DATABASE_URL=... pnpm --filter @saroh/api test:int
pnpm run check:cycles
```

**Stop point.** Safe. Live sites untouched; the API behaves identically.

---

# Step 2 — Extract the components and the token layer

Creates `packages/site-blocks`. React components only.

**2.1** Move the six renderers from `apps/saroh.app/components/sections/` and
`section-renderer.tsx`. Keep the unknown-type-renders-`null` behaviour exactly —
it is deliberate forward-compatibility, not an oversight.

**2.2** Move `SiteTheme` out of `apps/saroh.app/components/site-chrome.tsx`. Give
it **subtree scoping**, with `:root` staying the default — `saroh.app` serves one
site per document and is correct as-is; the catalog needs several palettes on one
page.

**2.3** Consolidate the style resolver. `SiteStyle → Record<string,string>` is
implemented twice, at `apps/api.saroh.in/src/modules/sites/site-style.ts:313` and
`apps/app.saroh.in/lib/sites/style.ts:110`. One implementation, in
`@saroh/block-contract` (it is pure data, no React).

**2.4** Ship the Tailwind preset carrying `site.*`, lifted from
`apps/saroh.app/tailwind.config.ts:31-50`. Wire it into `saroh.app`,
`app.saroh.in` and `ui.saroh.in`.

**2.5** Point `saroh.app` at the package. Collapse the type mirror in
`publication.ts` — the content types go; the fetching stays.

**Gates landing here:** G1 (ESLint: the package imports React and
`@saroh/block-contract`, nothing else — not `@saroh/ui`), G2 (`check:blocks`
fails on Saroh token classes in block source), G5 (migration equivalence against
the Step 0.2 baseline), G6 (`check:blocks` fails if a component drawing
`--site-*` exists outside the package).

`check:blocks` is a bespoke node script following
`scripts/check-app-routes.mjs`, wired into the root `package.json` and added to
the AGENTS.md "Before you finish" list.

**Verification:**

```bash
pnpm run lint && pnpm run typecheck && pnpm run check:blocks
pnpm run check:routes && pnpm run check:cycles
E2E_IGNORE_HTTPS_ERRORS=1 pnpm --filter @saroh/e2e test:e2e
```

Plus G5 by hand: the Northwind pages must render byte-identically to the Step 0.2
capture. **A difference here is a defect, not a judgement call** — this path
serves every published merchant site.

**Stop point.** Safe, and the important one. Live sites verified unchanged;
`app.saroh.in` has not been touched at all.

---

# Step 3 — The catalog

**3.1** `ui.saroh.in` depends on `@saroh/site-blocks` and the preset. Fill in the
placeholder list components — all four currently return `<div>ChartsList</div>`
and friends; the routing and the `lib/data/pages.ts` registry already work.

**3.2** A block's catalog page renders **the real component** against its
fixture. Every variant, both themes, at least two merchant palettes (this is what
2.2's subtree scoping buys), phone and desk widths. Not a lookalike — a lookalike
is the thing this whole plan exists to delete.

**3.3** Show the authoring shape beside the rendering, so a reader can see what
to type into the editor to get what they are looking at.

**3.4** Validation lands here and in tests, **not on the live render path**. A
published snapshot was validated at publish and is immutable, so it cannot be
invalid; `publication.ts` fetches `no-store` (lines 280, 328, 429), so every
visitor would pay for a re-check that can catch nothing. Worse, strict validation
would turn today's graceful degradation of an unrecognised field into a blank
section. Fixtures are hand-authored and genuinely can be wrong, so they are
checked.

**Gate landing here:** G4 extends to the catalog's own fixtures.

**Verification:**

```bash
pnpm --filter ui lint && pnpm --filter ui typecheck && pnpm --filter ui build
```

Plus looking at it. The catalog is a visual artefact; a green build says nothing
about whether it reads.

**Stop point.** This is where the plan delivers what was asked for. Two packages,
a working catalog, type mirrors collapsed, live sites unchanged — and
`app.saroh.in` still previewing with its own code.

**Everything above is additive-and-moves. Step 4 is the only deletion.**

---

# Step 4 — One renderer

The step that pays off the whole plan, and the only one that can go wrong in a
way the earlier steps cannot.

**4.1** Run `toRendered` client-side in the editor. The editor holds _draft_
content — `action` unresolved, a booking with no service picked, an image not yet
uploaded. It knows its own pages, so it can build the `resolvePage` map that
`ctaHref` needs.

**4.2** Swap `site-editor.tsx`'s preview to the shared components.

**4.3** Delete `apps/app.saroh.in/components/sites/section-preview.tsx`. 362
lines.

**4.4** Collapse the third type mirror in `apps/app.saroh.in/lib/sites/service.ts`.

**Gate landing here:** G7 — a unit test asserting that draft → `toRendered` →
HTML equals published-snapshot → HTML. **This is the gate that matters most.**
After step 4 the two surfaces share a component, so they cannot disagree about
_drawing_ — but the resolver now runs in two places, client-side in the editor
and server-side at publish, and those two can still disagree. G7 is what says
they do not. It is the #189 class of bug, guarded at its actual source.

**Care needed — three things a naive split breaks:**

- `site-editor.tsx:857-897` syncs a backing `Form` record for enquiry sections
  before save. Cross-cutting logic living inside what looks like per-type code.
- `site-editor.tsx:791` loads the org's services once on mount for the booking
  picker. Per-type code with a shared lifecycle.
- `section-preview.tsx` skips HTML sanitization, on the honest grounds that a
  merchant only ever sees their own draft. A shared renderer must keep that
  boundary **explicit** rather than accidental — sanitization happens at publish,
  and the preview's exemption needs to be stated in code, not inherited.

**Interaction with [#260](https://github.com/saroh-labs/saroh.in/issues/260).**
`site-editor.tsx` is 2759 lines against a repo standard of 400, and this step
edits it. Doing #260 first makes 4.2 smaller; doing 4.2 first makes #260's
per-type form modules smaller. **Recommendation: #260 first**, because a 2759-line
file is a bad place to debug a resolver.

**Verification:**

```bash
pnpm run lint && pnpm run typecheck && pnpm run check:blocks
pnpm --filter @saroh/api test:unit
TEST_DATABASE_URL=... pnpm --filter @saroh/api test:int
E2E_IGNORE_HTTPS_ERRORS=1 pnpm --filter @saroh/e2e test:e2e
```

Plus by hand: edit a hero in the builder, watch the preview, publish, compare
against the live site. That round trip is the entire point of the plan and no
automated check substitutes for doing it once.

---

# The gates

| Gate | Lands      | Catches                                                                                   |
| ---- | ---------- | ----------------------------------------------------------------------------------------- |
| G1   | Step 2     | `@saroh/site-blocks` importing anything but React + the contract                          |
| G2   | Step 2     | Saroh token classes (`bg-primary`, …) in block source — the recorded 35-usage palette bug |
| G3   | Step 1     | A block missing its variants, `toRendered`, or fixture                                    |
| G4   | Steps 1, 3 | A fixture that does not match its own schema                                              |
| G5   | Step 2     | The renderer move changing live merchant sites. **Temporary** — delete after slice 1      |
| G6   | Step 2     | A component drawing `--site-*` outside the package, i.e. renderer #3                      |
| G7   | Step 4     | Editor-side and publish-side resolution disagreeing                                       |

Each maps to a failure this repository has already had, not a hypothetical.

# Slice 1 scope

**`hero`, end to end. No new block types.**

`hero` exercises every mechanism decided here — the implicit variant
(`Boolean(content.image?.src)` picks its layout today, invisible in the editor
and unnameable in a template), a CTA, an image — and it exists in **both**
renderers, which is what makes "byte-identical to what ships now" a checkable
claim rather than a hope. A brand-new block would test none of that: nothing to
compare against, and the riskiest part of this work is the renderer merge.

Slice 2 adds one new block and **measures what it cost**. That number decides
whether the library expands quickly or the pipeline gets fixed first — and it is
the question [#258](https://github.com/saroh-labs/saroh.in/issues/258) exists to
answer.

# Explicitly out of scope

- **New block types.** Slice 2, and [#255](https://github.com/saroh-labs/saroh.in/issues/255).
- **Header and footer.** They are chrome, not sections
  (`site-chrome.tsx:183`, `site-navigation.ts`, `site-footer.ts`).
  [#253](https://github.com/saroh-labs/saroh.in/issues/253) decides whether that
  changes.
- **Which variants `hero` gets.** [#254](https://github.com/saroh-labs/saroh.in/issues/254).
  This plan establishes that variants exist and reserves the field; naming
  `hero`'s own is part of slice 1's execution, not its architecture.
- **Per-block merchant styling.** Decided against in #252. Design is the variant
  choice plus the site-wide Style panel plus the `padding` override.
- **Publication caching.** [#262](https://github.com/saroh-labs/saroh.in/issues/262).
  Its `no-store` finding informed the validation decision here; fixing it does
  not.
- **A public component registry.** #251 scopes `ui.saroh.in` internal for v1.
- **The template gallery.** Needs [#256](https://github.com/saroh-labs/saroh.in/issues/256),
  and only one template (`starter`) is registered today.

# Block libraries, variants and versioning: what the category already did

Research ticket #257, under map #251. Primary sources only — official docs,
developer references, source code, changelogs. Where a claim could not be traced
to a source that owns it, it is marked **NOT SOURCED** rather than asserted.

Products covered: WordPress/Gutenberg, Shopify (Online Store 2.0), Webflow,
Framer, Wix, Builder.io, Plasmic.

Scope note: this document reports what other products do and what it cost them.
It does not re-litigate decisions Saroh has already made (immutable publication
snapshots; per-`(type, version)` contracts; content-only merchant editing).

---

## What the evidence actually says

Leading with the findings that would change a decision.

**1. Nobody in the category can migrate stored content across a renamed field.
Every product's documented answer to a breaking change is the same: ship the new
one beside the old one and never delete the old one.** This is unanimous across
seven products with wildly different architectures, and each says it in its own
words. WordPress lists _"Do not deprecate the block and create a new one (a
different name)"_ as its **first** recommended strategy. Builder.io: _"keep that
previous version registered with Builder so that any instances still in use
continue to work properly."_ Plasmic: _"If you need to release breaking changes,
consider creating a new separate component that contains your second version, and
making the first one deprecated."_ Wix is the bluntest — _"**You can't delete the
old extension—doing so breaks the widget or plugin for everyone who already has it
installed.** Keep both extensions in your app."_ Saroh's `(type, version)` decision
is not merely defensible; it is the only thing the category has found that works.

**2. WordPress is the one product that built the alternative, and it is the most
expensive thing in the category.** Block deprecations are the best-documented
migration mechanism anywhere — and after eight years the core block library carries
**~16,200 lines of retained deprecation code across 55 of its 117 blocks**, with
`core/cover` alone holding 14 retained versions in a 2,006-line file. The docs
themselves warn that deprecations are _"not… a chain of updates"_, that a new
migration _"may need to update the migrate methods in multiple deprecations"_, and
that importing a shared helper into a deprecation risks _"inadvertently breaking
the deprecations."_ Gutenberg's own tracker has an open issue about 500-line
deprecation files ([#35412](https://github.com/WordPress/gutenberg/issues/35412),
open since 2021) and a closed one where two sequential deprecations silently ate an
attribute ([#59694](https://github.com/WordPress/gutenberg/issues/59694)).
**Critically, most of that cost is self-inflicted by storing content as serialized
HTML that `save()` must reproduce byte-for-byte** — a problem Saroh does not have,
because content is JSON and publications are immutable snapshots. Do not import
WordPress's mechanism along with its vocabulary.

**3. On variants, the category splits — and the split is exactly Saroh's #254.**
Shopify persists the chosen preset name into content: `name` _"is persisted in the
JSON template when you add a section."_ WordPress does **not**, and pays for it with
`isActive`, a re-derivation API that exists solely because _"the Editor cannot
distinguish between an instance of the original block and your variation"_ without
it — plus an `isDefault` collision problem the docs document as unfixable except by
unregistering someone else's variation. **Persist the variant name.** Saroh's
reserved `variant` field is on the right side of this.

**4. "Hero image left" vs "hero image right" is one unit with one setting — every
product that models the axis at all agrees.** Dawn's `image-with-text` has
`"id": "layout"` with `image_first`/`text_first`; WordPress's `core/media-text` has
`mediaPosition` defaulting to `left`. Two independent products, same answer. Wix's
merchant-facing product does not model the axis at all — the two looks are two
thumbnails and the distinction evaporates on insert.

**5. Chrome is converging on "a placeable unit carrying a site-level scope and a
semantic role" — and Shopify and Wix both migrated _towards_ it.** Shopify moved
header/footer out of hardcoded layout into **section groups**, JSON files whose
required `type` is `header`/`footer`/`aside`/`custom.<name>`, referenced from the
layout as `{% sections 'header-group' %}`. Wix Studio went further: header and
footer are _"the two default global sections"_, and _"you can set any section as a
global section."_ WordPress's `core/template-part` is the same shape — a block in
the tree whose attributes are only `slug` + `theme` + `area`. **The unit is in the
library; the content is stored once; a role tag says where it belongs.** Nobody who
rebuilt chrome recently rebuilt it as configuration.

**6. Every product's conditional-field mechanism is editor-only. None of them
changes what the schema stores.** Shopify `visible_if` (a Liquid expression string),
Builder.io `showIf` (marked `@hidden` in the SDK, never seen by the renderer),
Framer `hidden(props)`, Webflow switch props. **A variant must not change which
fields exist** — five products independently declined to build that.

**7. Empty states are where the category is weakest, and the good answers are
strikingly good.** Webflow makes the empty state a **structural part** of the
Collection list with default copy (_"No items found"_) and a Designer toggle to
preview it. WordPress makes it an authored block (`core/query-no-results`). Dawn
renders **placeholder product cards** so the section keeps its shape. Wix and
Builder.io render **nothing at all** — Wix: _"the connected elements will not appear
on the live site"_; Builder's SDK literally returns `canShowBlock: false`. The
failure mode is a heading stranded over a void. Whatever Saroh ships in #255 should
have an empty state in the contract from day one.

**8. Bind by query and by reference, never by resolved record list — then collapse
every failure into one falsy value.** WordPress's Query Loop stores a _query_
(`postType`, `order`, `taxQuery`…), not IDs, so a deleted record cannot dangle.
Shopify's resource settings all share one documented degradation: _"`blank`, if no
selection has been made, **the selection isn't visible, or the selection no longer
exists**"_ — three causes, one value, one branch for the block author. Saroh already
does this (`href: ""` for a removed page); make it the house rule for #255.

**9. Two useful negatives about the products often cited as models.** Plasmic
**pins, it does not coexist**: _"A project's imports (including transitive imports)
must all be on the same version"_ — one project cannot hold two versions of a
dependency. And Wix is **abandoning** Blocks, its own most contract-driven,
best-versioned system: _"Wix Blocks apps aren't supported in the Wix Harmony
editor"_, with the advice to _"rebuild."_

**10. On catalog previews, the split is render-vs-raster, and rendering wins.**
Shopify: _"The theme editor automatically generates a preset preview."_ Wix asks
developers to upload a static thumbnail and then warns that starting from a template
leaves you shipping _"the template's images"_. WordPress previews a canned `example`
attribute set at a declared `viewportWidth`. Saroh's fixture-rendered catalog with a
CI gate is the strongest version of this in the survey.

---

## Per-product comparison

### WordPress / Gutenberg — the open-source case, and the only one with a fully public versioning mechanism

**1. The unit.** A **block**, registered by `block.json` metadata plus a JS
`edit`/`save` pair. `"Hero with image on the right"` is _not_ a different block:
`core/media-text` carries a single `mediaPosition` attribute,
`{"type": "string", "default": "left"}`. Image-left and image-right are one
block type with one attribute value apart.
([core/media-text block.json](https://github.com/WordPress/gutenberg/blob/trunk/packages/block-library/src/media-text/block.json),
[Block metadata](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/))

**2. Variants — WordPress has five separate reuse mechanisms and deliberately
did not unify them.** This is the most instructive negative finding in the set.

| Mechanism                                | What it is                                             | Where the name lives            | May it change which fields exist? |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------- | --------------------------------- |
| **Block style** (`styles`)               | "adding a class name to the block's wrapper"           | Code (`block.json`)             | No — CSS only                     |
| **Block variation** (`variations`)       | Initial attributes/inner blocks applied _at insert_    | Code (`block.json`/JS/PHP)      | No — same attribute schema        |
| **Block pattern**                        | Multi-block layout **copied** into content             | Code (`register_block_pattern`) | n/a — it is content               |
| **Synced pattern** (`core/block`)        | A **reference** (`ref: number`) to content stored once | Content (a post)                | n/a                               |
| **Template part** (`core/template-part`) | A **reference** (`slug` + `area`) to site chrome       | Theme/site                      | n/a                               |

The docs draw the style/variation line explicitly: _"The main difference between
block styles and block variations is that a block style just applies a CSS class
to the block… If you want to apply initial attributes or inner blocks, this falls
into block variation territory."_
([Variations](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-variations/))

**The finding that matters most for #254: a WordPress variation's name is never
stored in the content.** A variation _"differs from the original block by a set
of initial attributes or inner blocks. When you insert the block variation into
the Editor, these attributes and/or inner blocks are applied."_ It is an
insertion-time preset and nothing more. Because the name is not persisted,
WordPress had to add `isActive` to _re-derive_ which variation an existing block
is, by comparing attribute values:

> "While the `isActive` property is optional, it's recommended. This API is used
> by the block editor to check which variation is active… **If `isActive` is not
> set, the Editor cannot distinguish between an instance of the original block
> and your variation, so the original block information will be displayed.**"

The canonical example is exactly Saroh's hero question — a variation that only
pre-sets `mediaPosition: 'right'`:

```js
wp.blocks.registerBlockVariation("core/media-text", {
    name: "media-text-media-right",
    title: __("Media & Text"),
    isDefault: true,
    attributes: { mediaPosition: "right" },
});
```

The docs also record a second cost of unnamed variants — `isDefault` collisions:
_"If another variation for the same block uses `isDefault`, your variation will
not necessarily become the default. The Editor respects the first registered
variation with `isDefault`, which might not be yours."_
([Variations](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-variations/))

**3. Chrome — WordPress's answer is "both", via a reference block.**
`core/template-part` is a block a user places in the block tree, but its
attributes carry only a _reference_, never the content:

```json
"attributes": {
  "slug":  { "type": "string" },
  "theme": { "type": "string" },
  "tagName": { "type": "string" },
  "area":  { "type": "string" }
}
```

Its description: _"Edit the different global regions of your site, like the
header, footer, sidebar, or create your own."_ `area` is a semantic
classification (`header` / `footer` / `uncategorized`) declared in the theme, not
free text — Twenty Twenty-Five declares seven parts across three areas.
"Appears on every page" is expressed by the _template_ referencing the part, and
the part's content living once. The block also sets `"reusable": false` and
`"renaming": false`.
([core/template-part block.json](https://github.com/WordPress/gutenberg/blob/trunk/packages/block-library/src/template-part/block.json),
[Twenty Twenty-Five theme.json](https://github.com/WordPress/wordpress-develop/blob/trunk/src/wp-content/themes/twentytwentyfive/theme.json))

Related, and directly relevant to "shared chrome but per-instance content":
`core/block` (synced patterns) pairs a `ref` with a `content` object and
`"providesContext": { "pattern/overrides": "content" }` — one shared definition,
a named set of per-instance overrides.
([core/block block.json](https://github.com/WordPress/gutenberg/blob/trunk/packages/block-library/src/block/block.json))

**4. Versioning — the mechanism, and what it cost.**

WordPress content is stored as **serialized HTML**, and on load the editor
regenerates each block's markup from parsed attributes and compares:

> "During editor initialization, the saved markup for each block is regenerated
> using the attributes that were parsed from the post's content. If the
> newly-generated markup does not match what was already stored in post content,
> the block is marked as invalid."

([Edit and Save](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-edit-save/))

The `deprecated` array is the escape hatch. Each entry is a full frozen snapshot
of `attributes`, `supports` and `save`, plus optional `migrate` and `isEligible`.
The docs are emphatic that these are **not** chained migrations:

> "Deprecations do not operate as a chain of updates in the way other software
> data updates, like database migrations, do."

The lookup is by _trial_: the first deprecation whose `save` reproduces the
stored markup wins, and only then does its `migrate` run.

> "It is important to note that if a deprecation's save method does not produce a
> valid block then it is skipped completely, including its migrate method, even
> if isEligible would return true for the given attributes. This means that if
> you have several deprecations for a block and want to perform a new migration…
> **you may need to update the migrate methods in multiple deprecations** in
> order for the required changes to be applied to all previous versions."

And the maintenance trap, stated by the docs themselves:

> "if a deprecation's save method imports additional functions from other files,
> changes to those files may accidentally change the behavior of the deprecation.
> You may want to add a snapshot copy of these functions to the deprecations file
> instead of importing them in order to avoid inadvertently breaking the
> deprecations."

([Deprecation](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-deprecation/))

Note also the strategy the docs list _first_, before deprecations: _"Do not
deprecate the block and create a new one (a different name)."_ That is Saroh's
`hero@2`-beside-`hero@1` approach, and WordPress recommends it as a peer option.

**What it cost, measured.** A scan of the core block library on `trunk`
(2026-09-07) gives the price of eight years of this mechanism:

|                                      |                                       |
| ------------------------------------ | ------------------------------------- |
| Core blocks with a `deprecated` file | **55 of 117**                         |
| Total retained deprecation code      | **~16,200 lines**                     |
| Retained block versions              | **at least 158**                      |
| `migrate` functions                  | **135**                               |
| Deepest single block: `core/cover`   | 2,006 lines, **14** retained versions |
| `core/button`                        | 1,745 lines, **15** retained versions |
| `core/image`                         | 1,390 lines, 9 versions               |

(Counted from `packages/block-library/src/*/deprecated.jsx` on
[WordPress/gutenberg trunk](https://github.com/WordPress/gutenberg/tree/trunk/packages/block-library/src);
e.g. [cover/deprecated.jsx](https://github.com/WordPress/gutenberg/blob/trunk/packages/block-library/src/cover/deprecated.jsx)
ends `export default [ v14, v13, …, v1 ];`.)

The project's own tracker records the pain, unresolved:

- **[#35412](https://github.com/WordPress/gutenberg/issues/35412)** (open since
  2021): _"When debugging deprecation issues it is hard work going through the
  likes of a 500+ line `Object[]` definition…"_ and _"all the methods used by the
  save function need to continue to return the same output as when that version
  was the current one."_
- **[#59694](https://github.com/WordPress/gutenberg/issues/59694)**: two
  deprecations each renaming one attribute — the second silently overwrote the
  first's result and an attribute was lost. The trial-not-chain design is a real
  data-loss footgun, not a theoretical one.

**When no deprecation matches**, the user — not the developer — pays: the block
shows an invalidation prompt whose remedies are lossy. "Convert to Classic
Block" _"Protects the original markup from the saved post content as correct.
Since the block will be converted from its original type to the Classic block
type, **it will no longer be possible to edit the content using controls
available for the original block type**."_
([Edit and Save](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-edit-save/))

**Negative finding — `block.json`'s `version` field is not content versioning.**
The one field literally called `version` is for asset caching:

> "The current version number of the block, such as 1.0 or 1.0.3… **This field
> might be used with block assets to control cache invalidation**, and when the
> block author omits it, then the installed version of WordPress is used
> instead."

Core blocks do not set it at all (`core/media-text` has no `version` key).
WordPress has **no per-block content schema version**; compatibility is entirely
the `deprecated` array's job.
([Block metadata](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/))

**Where WordPress _does_ use explicit numbered versions: `theme.json`.** Site
config is versioned globally (v1 → v2 → v3) with published rename tables and this
policy: _"**Using older versions will continue to be supported.** Upgrading is
recommended because new development will continue in the newer versions."_
([theme.json migrations](https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/theme-json-migrations/))
So WordPress reaches for numbered-version-with-old-retained for _config_, and for
trial-and-migrate only for _serialized HTML content_ — the shape it cannot
change.

**5. Data-backed blocks.** `core/query` (Query Loop) stores a **query, not a
resolved list of records**:

```json
"attributes": {
  "queryId": { "type": "number" },
  "query": { "type": "object", "default": {
      "perPage": null, "pages": 0, "offset": 0, "postType": "post",
      "order": "desc", "orderBy": "date", "author": "", "search": "",
      "exclude": [], "sticky": "", "inherit": true, "taxQuery": null,
      "parents": [], "format": [], "excludeCurrent": null } },
  "namespace": { "type": "string" }
}
```

Because the binding is a query and not IDs, deleting a record cannot dangle — the
next render simply returns fewer rows. The **empty state is itself an authored
block**: `core/query-no-results`, _"Contains the block elements used to render
content when no query results are found,"_ constrained by
`"ancestor": ["core/query"]` so it can only exist inside a Query Loop. The
merchant writes what "nothing here yet" says.
([core/query](https://github.com/WordPress/gutenberg/blob/trunk/packages/block-library/src/query/block.json),
[core/query-no-results](https://github.com/WordPress/gutenberg/blob/trunk/packages/block-library/src/query-no-results/block.json))

The `namespace` attribute exists so query _variations_ can be told apart by
`isActive` — the same re-derivation tax as above, paid a second time.

**6. The catalog surface.** Previews are built from a declared, fake example —
never real content:

> "Example provides structured example data for the block. This data is used to
> construct a preview for the block to be shown in the Inspector Help Panel when
> the user mouses over the block and in the Styles panel when the block is
> selected."

`example.viewportWidth` sets the preview container width in pixels, and per the
variations docs a variation may _"set to `undefined` to disable the preview."_
Variations appear as separate inserter entries via `scope: ['inserter']`; `scope`
also has a `block` value used by `Columns` and `Query` for an in-place variation
picker.
([Block registration](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-registration/),
[Variations](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-variations/))

Saroh's `fixtures.ts` — one hand-authored example per variant, parsed against the
block's own rendered schema in CI — is a strictly stronger version of the same
idea. WordPress's `example` is not validated against `attributes` by any gate the
docs describe (**NOT SOURCED** that one exists).

### Method note on the deprecation count

The table above was produced by fetching every `packages/block-library/src/*/deprecated.{jsx,js}`
on `WordPress/gutenberg` `trunk` (2026-09-07) and counting top-level entries in
each file's exported deprecation array with a bracket-depth parser. Five files
(`embed`, `file`, `heading`, `query`, `video`) use an export form the parser did
not match, so **158 is a lower bound, not an exact figure**; line counts and the
55/117 file count are exact. Per-block counts quoted above (`cover` 14,
`button` 15, `image` 9) were each verified by reading the array directly.

---

### Shopify — Online Store 2.0

The most widely deployed section system in the category, and the one with **no
content-versioning mechanism at all**. That absence is the finding.

**1. The unit.** JSON template → **sections** (a Liquid file in `sections/` with a
`{% schema %}`) → **blocks** (declared inside a section's schema; newer _theme
blocks_ live in `blocks/` and are reusable across sections). Section data is
stored in the JSON template keyed by section id, with `type` (the section
**filename**, without extension), `settings`, `blocks`, `block_order` and
`disabled`. Settings are stored as `<SettingID>: <SettingValue>` where the id is
_"The ID of a setting as defined in the schema of the section or the block."_
([JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates))

**Image-left vs image-right is one section with one `select` setting.** From
Dawn's [`sections/image-with-text.liquid`](https://github.com/Shopify/dawn/blob/main/sections/image-with-text.liquid):

```json
{
    "type": "select",
    "id": "layout",
    "options": [
        { "value": "image_first", "label": "…" },
        { "value": "text_first", "label": "…" }
    ],
    "default": "image_first",
    "label": "…"
}
```

**Shopify and WordPress converged independently on the same answer** — Dawn's
`layout: image_first|text_first` and `core/media-text`'s `mediaPosition: left|right`
are the same design. Neither ships two section/block types for the two looks.

Note also that Dawn's `image-with-text` has exactly **one** preset, and that preset
supplies only default _blocks_ (`heading`, `text`, `button`) — **not** a layout.
The layout axis is a merchant-facing setting; the preset is an insertion default.

**2. Variants — Shopify's `presets`, and the one place it beats WordPress.**

> "Presets are predefined section configurations that merchants can select when
> adding sections to a JSON template. Presets help you quickly provide merchants
> with different layouts and use cases by adjusting section settings. **For
> example, a "Testimonials" section might include presets for a single
> testimonial, a carousel, and a grid layout.**"

Preset attributes: `name`, `category`, `settings`, `blocks`. And the sentence that
matters most for #254:

> "`name` — The preset name displayed in the theme editor's Add section picker and
> sidebar, and **is persisted in the JSON template when you add a section**."

([Section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema))

**This is the direct counter-example to WordPress.** Shopify persists the chosen
preset name into content; WordPress does not and must re-derive it with `isActive`.
Shopify pays no re-derivation tax and has no `isDefault`-collision problem.

**A preset cannot change which settings exist.** A section has exactly one
`settings` schema; a preset supplies _default values_ for it plus a default set of
blocks. Nothing in the preset attribute list can add, remove or retype a setting.
Presets are pre-populated values, not alternative schemas.

**Two operational details worth stealing:**

- _"Settings of type `collection` are not updated when switching presets."_
  ([Input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings))
  **Switching variant must not clobber the merchant's data selections.** Shopify
  carves resource settings out of preset application explicitly.
- _"Section files must define presets in their schema to support being added to
  JSON templates using the theme editor. Section files without presets should be
  included in the JSON file manually, and can't be removed using the theme
  editor."_ — having a preset is what makes a section _placeable at all_. Presets
  double as the catalog-visibility mechanism, the way Saroh's `variants` list
  doubles as the catalog entry.

**Conditional fields:** Shopify's answer is `visible_if`, a Liquid boolean
expression string —

```json
"visible_if": "{{ block.settings.layout_style == 'flex' }}"
```

> "Most setting types may be conditionally set using the `visible_if` attribute."

([Settings](https://shopify.dev/docs/storefronts/themes/architecture/settings))
Like Builder's `showIf`, this governs **editor visibility only**; the setting still
exists in the schema and its stored value is untouched when hidden. `color_palette`
is documented as not supporting it.

**3. Chrome — Shopify explicitly migrated from static chrome to placeable chrome.**
This is the strongest available evidence for #253, because it is a _direction of
travel_, not just a design.

> "A section group is a JSON data file that stores a list of sections and app
> blocks to be rendered, and their associated settings. **Merchants can add
> sections to the section group, as well as remove and reorder them, in the theme
> editor.**"
>
> "You can add a reference to a section group in a layout file to add support for
> sections in areas that are controlled by the layout, **such as the header or
> footer**."
>
> "**You can use section groups in place of static sections in layouts.** Learn how
> to migrate from static sections to section groups."

([Section groups](https://shopify.dev/docs/storefronts/themes/architecture/section-groups))

A section group's required `type` attribute takes **`header`, `footer`, `aside`, or
`custom.<name>`** — a semantic role, exactly like WordPress's template-part `area`.
"Appears on every page" is expressed by the layout rendering it:

```liquid
{% sections 'header-group' %}
```

Dawn does precisely this in [`layout/theme.liquid`](https://github.com/Shopify/dawn/blob/main/layout/theme.liquid)
(lines 333 and 345: `{% sections 'header-group' %}` … `{% sections 'footer-group' %}`).

Two warnings Shopify attaches, both directly relevant:

> "**In most themes, you should use section groups for only the header and
> footer.** If you create additional section groups for other areas of the theme,
> such as a navigation sidebar, then name the section group to reflect its
> intended purpose."

> "**Avoid using both section groups and static sections in the same layout file.**
> If you need to use both, then you should identify which sections are static in
> the section name."

So: chrome regions are placeable, but Shopify caps them at two by convention and
warns against mixing the two mechanisms in one layout.

**4. Versioning — the negative finding, and it is the loudest one in the report.**

**There is no `version` attribute on a section schema.** The word does not appear
in the [section schema reference](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema).
There is no `deprecated`, no `migrate`, no `isEligible`. Shopify versions **whole
themes**, never individual sections.

**A published Shopify page is not a snapshot.** Liquid renders on request against
the _current_ theme code and the _current_ settings JSON. Settings live in the JSON
template keyed by setting `id`; the section is located by `type`, which is the
section's **filename**. Two consequences follow mechanically:

- Rename a setting `id` → the stored value is orphaned and the new id reads as
  unset.
- Rename a section file → every `type` reference in every JSON template dangles.

**What Shopify actually does with orphaned settings is NOT SOURCED.** I searched
the section schema reference, the JSON templates reference, the settings reference
and the section groups reference; none states what happens to a stored value whose
`id` no longer exists in the schema. The widely held belief that orphaned data is
silently ignored is _not_ something I could trace to a Shopify-owned source, and I
am not asserting it. **The honest finding is that the most-deployed section system
in the category does not document its own content-compatibility behaviour.**

**Where Shopify _does_ document a migration, it is an indirection, not a
migration** — and it is a genuinely good pattern:

> "When a merchant deletes a palette color in the theme editor, Shopify asks them
> to choose a replacement. **The deleted color's value is stored as a reference to
> the replacement**, for example `{{ settings.colors.accent }}`. **This keeps all
> existing references intact without updating every template that uses the deleted
> color.**"

([Input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings))

This is directly applicable: Saroh already stores site style as **choice keys
rather than raw hex** for the same reason. Shopify's addition is the _human_ step —
on deletion, ask which replacement, then store the redirect.

**5. Data-backed — one uniform degradation contract, and a placeholder empty state.**

Every resource setting type (`collection`, `product`, `collection_list`,
`product_list`, `page`, `blog`, `article`, `image_picker`, `link_list`, `metaobject`…)
carries the **same** documented degradation, repeated verbatim across the reference:

> "`blank`, if no selection has been made, **the selection isn't visible, or the
> selection no longer exists**."

([Input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings))

**Three distinct causes — never-set, hidden, and deleted-after-publish — collapse
into one falsy value.** The theme is given exactly one case to handle. This is the
cleanest answer in the whole survey to "what does a data-backed block render when
the referenced record is deleted after publish", and Saroh already has the same
instinct (`href: ""` for a button naming a removed page).

Also documented: _"To ensure backwards compatibility with legacy resource-based
settings, outputting the setting directly will return the object's handle."_ — the
setting stores a reference that resolves to an object, with the legacy scalar form
preserved as the default string rendering.

**On zero records, Dawn does not collapse — it renders placeholders.** From
[`sections/featured-collection.liquid`](https://github.com/Shopify/dawn/blob/main/sections/featured-collection.liquid):

```liquid
{%- if section.settings.collection.products.size > 0 -%}
  … render real product cards …
{%- else -%}
  {%- for i in (1..section.settings.columns_desktop) -%}
    {%- assign placeholder_image = 'product-apparel-' | append: ridx -%}
    {% render 'card-product', …, placeholder_image: placeholder_image %}
  {%- endfor -%}
{%- endif -%}
```

It fills the grid with `columns_desktop` placeholder cards so the section **keeps
its shape**. That is a third distinct answer to the empty-state question, and it is
the one that behaves best in an editor: the merchant sees the layout they are
configuring before they have any products.

**6. Catalog surface.** The Add section picker shows **presets**, not sections:

> "Presets appear alphabetically based on their `name` attribute."
> "Presets can optionally be grouped into collapsible categories using the
> `category` attribute."
> "Uncategorized presets are always displayed first."
> "**The theme editor automatically generates a preset preview.** You can further
> customize this preview using visual preview mode."

([Section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema))

**Shopify generates the preview by rendering the preset, rather than asking the
developer for a raster thumbnail** — the opposite of Wix, and the same approach as
Saroh's fixture-rendered catalog. Placement is further constrained by `enabled_on`
/ `disabled_on`: _"The sections that are available to be added to a template in the
theme editor might be limited by the `enabled_on` or `disabled_on` attribute of the
section schema. If no `enabled_on` or `disabled_on` attribute is defined, then the
section can be added to any template."_

---

### Webflow

Coverage note: this section is thinner than the others — a fetch failure cost the
chrome and CMS-deletion questions. What is here is primary-sourced; the gaps are
listed in "What I could not establish".

**1. The unit.** Elements from the Add panel (categories: Layout, Basic,
Typography, CMS, Media, Forms, Components), plus **components** — a main component
with instances across the site.
([Add panel](https://help.webflow.com/hc/en-us/articles/33961270096659-Add-panel))

**2. Variants — Webflow has named variants, and the constraint is the finding.**

> "Variants let you define different layouts, colors, font styles etc. (e.g.,
> solid or outline buttons, or **horizontal and vertical card layouts**) for a main
> component. Then you can choose which variant to use on each instance."

> "**Components can only have a single variant property (with no limit to the
> number of variants).** For more advanced use cases, you can use the `class`
> custom attribute."

([Component variants](https://help.webflow.com/hc/en-us/articles/51307110086547-Component-variants))

**This is the closest match to Saroh's reserved single `variant` field anywhere in
the survey.** Webflow deliberately caps a component at **one** variant axis and
tells you to drop to custom attributes if you need more — the opposite of Plasmic,
which allows arbitrarily many variant groups. Two mature products, opposite
choices, both shipped.

Mechanics: creating a variant **auto-creates a variant prop**, which can be
renamed, grouped, and given a default in the Properties panel — so the variant name
lives in the component definition and the _selection_ lives on the instance.
_"Styles edited in the base variant are shared across all variants but styles
edited in other variants only apply to that variant."_

**Can a variant change which fields exist? No — but it can change what renders.**
Content property types are: _"Text… Rich text, Image, Link… Video, Number,
Switch."_ Visibility is a **Switch prop**:

> "You can create layout variations across component instances by showing or hiding
> specific elements… To control visibility per component instance, create a
> **switch prop** and use it to toggle elements on or off."

> "Elements set to 'hidden' are **removed from the Document Object Model (DOM)
> order**… this means hidden component elements won't be read by assistive
> technologies… It also eliminates repeated content and doesn't negatively affect
> SEO."

([Component properties](https://help.webflow.com/hc/en-us/articles/33961219350547-Component-properties))

So the property _schema_ is fixed; a boolean prop removes elements from the output
entirely. Webflow also separates manual from data-driven hiding: _"Switch props let
you show or hide elements manually per component instance. If you want elements to
show or hide automatically based on data — such as component properties, CMS
fields, or current locale — use conditionals instead."_

**3. Chrome. NOT SOURCED.** I could not retrieve a Webflow article stating whether
header/footer are site-level or per-page placed components. Do not infer from this
section.

**4. Versioning — Webflow Libraries, and the finding is who controls the update.**

> "You can convert a Library component to a site component via the right-click
> menu… **The new site component will not receive updates from the Library.**"

> "There are two ways to update Libraries once they're installed across site(s) on
> your Workspace: manually (site by site) or bulk updates."

> "**If you're using a Library installed from the Marketplace, the Library owner
> cannot push Library updates to your site.**"

> "If there are conflicts between installed and updated Library items, you can
> convert them to site-specific items."

([Libraries](https://help.webflow.com/hc/en-us/articles/33961304300819-Libraries))

**Webflow's third-party library model is pull-only and opt-in per site.** A library
author has _no_ mechanism to reach an already-built site — the exact opposite of
Wix, where a minor version reaches every live site within 15 minutes without the
merchant acting. Two mature products at opposite ends of the same axis. Conflict
resolution is "detach into a site-local copy", not migration.

Webflow's publishing workflow is staged: it _"displays differences between what's
in the Designer and what's on your staging site, as well as differences between
what's on your staging site and what's on your production site"_, with per-page
publishing of static and CMS template pages.
([Publishing workflow](https://help.webflow.com/hc/en-us/articles/33961412894483-Publishing-workflow))
**Whether a published Webflow page is a frozen static artifact is NOT SOURCED** —
I did not retrieve a Webflow statement on it.

**5. Data-backed — Webflow has the best empty-state affordance in the survey.**

The Collection list wrapper is a four-part structure: wrapper → Collection list →
Collection item → **Empty state** (+ pagination).

> "The **empty state replaces the Collection list when there are no items in the
> list to display**. By default, the empty state has a gray background and contains
> a text block that reads, "**No items found**." You can replace or add more
> elements and styles to customize the empty state."

> "The **UI state** setting lets you toggle between the items state and the empty
> state so you can style both states of the Collection list."

([Collection list](https://help.webflow.com/hc/en-us/articles/33961294051347-Collection-list))

Three things Saroh should copy directly: the empty state is **structural, not
optional**; it ships with **sensible default copy** so a merchant who ignores it
still gets something coherent; and the editor has an explicit **toggle to preview
the empty state** without emptying the data. WordPress requires you to add the
block; Wix and Builder render nothing at all.

Binding is per-element: _"Elements inside the Collection item are static (i.e.,
unchanging) until you connect them to Collection fields or apply conditional
visibility to them, at which point they become dynamic elements."_

**What a published Collection page does when its CMS item is deleted: NOT SOURCED.**

---

### Framer

Coverage note: only the **code-component** side (`framer.com/developers`) could be
sourced. Framer's visual variant feature is well known but
`framer.com/help/articles/what-are-variants/` returned 404 and I did not find a
replacement canonical URL — so **Framer's visual variants are NOT SOURCED here**,
along with chrome, publishing and CMS empty states. Treat this section as partial.

**1. The unit / property controls.** Code components declare a typed schema via
`addPropertyControls`. The full `ControlType` set
([Property controls](https://www.framer.com/developers/property-controls)):

`Array`, `Boolean`, `Border`, `BorderRadius`, `BoxShadow`, `Color`,
`ComponentInstance`, `Cursor`, `Date`, `Enum`, `EventHandler`, `File`, `Font`,
`Gap`, `Link`, `Number`, `Object`, `Padding`, `ResponsiveImage`, `String`,
`TrackingId`, `Transition`.

"Hero image left vs right" is `ControlType.Enum`: _"A property control that
represents a list of options. The list contains primitive values and each value has
to be unique. The selected option will be provided as a property."_

**2. Conditional fields — `hidden`, and it is editor-only like everyone else's.**

> "Controls can be hidden by adding the `hidden` function to the property
> description. The function receives an object containing the set properties and
> returns a `boolean`."

```js
text: {
  type: ControlType.String,
  title: "Text",
  hidden(props) { return props.toggle === false },
}
```

**3. Versioning — one concrete data point, and it is the good pattern.** Framer
deprecates _within_ the API surface rather than breaking it:

> "Note: `ControlType.SegmentedEnum` is **deprecated**, please use
> `ControlType.Enum` and enable `displaySegmentedControl`."

The old name keeps working and the doc points at the replacement — the same
"new alongside old, never in-place" shape Saroh has chosen. **Anything Framer says
about breaking changes to components already used on live sites is NOT SOURCED.**

---

### Wix — two incompatible models side by side

Wix is the clearest case of a product that **did not unify** its merchant-facing
and developer-facing composition models, and the split is instructive.

**1. The unit.** A page is a vertical stack of full-width **sections**:
_"Sections are the building blocks of a page"_, and they _"span the full width of
your visitors' browser and maintain their grouping when visitors view your site
on mobile devices."_
([About Sections](https://support.wix.com/en/article/wix-editor-about-sections),
[Studio: Adding and Managing Sections](https://support.wix.com/en/article/studio-editor-adding-and-managing-sections))

**The critical negative finding: an inserted Wix section has no contract.** The
library is a _seeding_ mechanism only. Merchants _"customize any section you add
to your site, whether it's pre-designed or blank"_, and Wix's own feature-request
page concedes the consequence:

> "For other saved design assets… once you add them to your canvas, they become
> independent from the original saved version. **This means there is no way to
> make global updates to the asset that automatically apply to all instances
> where it has been used.**"

([Request: Making Global Changes to Saved Assets](https://support.wix.com/en/article/studio-editor-request-making-global-changes-to-saved-assets))

So "hero image left" vs "hero image right" is **not modelled as an axis anywhere
in the merchant-facing product** — they are two thumbnails in a gallery, and
after insertion the distinction evaporates because the merchant can drag the
image. There is no `imageSide` setting to find. This is a NOT SOURCED-because-it-
does-not-exist finding.

**2. Variants — Wix Blocks design presets are the closest analogue to Saroh's
`variant`, and the rule is stated crisply.**

> "Design presets allow you to create various designs for the same widget. When
> you create design presets for a widget, its functionality, **elements**, code,
> APIs and data remain the same, while the way it looks can vary."

And the governing rule:

> "As a rule of thumb, **design changes are per-preset, while structure or data
> changes are global**."

Wix publishes the two lists explicitly. **Global** (affects every preset): add an
element, delete an element, reparent, group/ungroup, reorder repeater items,
**change text content**, and text _structural_ changes (heading level, links,
lists, heading tag). **Per-preset only**: resize the widget, **hide an element in
this preset**, change an element's design and layout, grid rows/columns/gaps,
flexbox properties, and text _design_ changes (font, size, colour, alignment).
([About Design Presets](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-blocks/widget-design/about-design-presets),
[Create and Manage Design Presets](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-blocks/widget-design/create-and-manage-design-presets))

So: **the element roster is the contract and is identical across presets; a
preset may only hide and restyle. Content is global, not per-preset.** Preset
names live in the Blocks app definition (developer-authored, versioned with the
app), not in site content. Wix's own worked example is exactly the hero question:
_"The first two presets are similar, but have a different layout. One has the
text beside the image and the second one has the text over the image."_

Presets are also **per-viewport**: _"presets for other viewports remain
unchanged"_, and a developer may set a distinct default preset for mobile. Two
independently-gated lists control catalog presentation — _"Shown in Add Panel"_
and _"Shown in Preset Panel"_ — so a preset can be offered at insert time but
withheld from later switching.
([Configure Blocks Installation Settings](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-blocks/deploy-and-manage-blocks-apps/configure-blocks-installation-settings))

Separately, `$widget.props` is Wix's typed field schema (Text, Number, Boolean,
Image, Date and Time, URL, Custom, List), each with a display name, description
and default, surfaced through a generated Settings panel.
([Blocks Widget Properties](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-blocks/widget-api/blocks-widget-properties))

**3. Chrome — Wix answered this twice, and changed its mind.**

_Wix Editor (older):_ header and footer are site-level primitives. _"Your site's
header appears across the top of your site, throughout all of your pages."_ They
cannot be deleted, only hidden — and only **both at once**: _"It is not possible
to only hide the footer or the header. If you choose the No Header & Footer
layout, neither of them are displayed."_ Wix's own feature-request page states
the cost: _"Currently, it is not possible to have different header or footer
designs on different pages of your Wix site."_
([About Your Site's Header](https://support.wix.com/en/article/wix-editor-about-your-sites-header),
[Hiding the Header and Footer](https://support.wix.com/en/article/wix-editor-hiding-the-header-and-footer-on-a-specific-page),
[Request: Different Header and Footer Designs](https://support.wix.com/en/article/wix-editor-request-different-header-and-footer-designs-on-different-site-pages))

_Wix Studio (newer):_ **header and footer are no longer special at all.** They are
simply the two default **global sections**:

> "By default, Studio Editor sites come with a global header and footer,
> appearing on all pages."
> "You can set any section as a global section."
> "Changes you make to a global section apply everywhere it appears. If you want
> to make a change to the section on a single page without affecting the rest,
> you can **detach** that specific one from the global version."

([Studio: Using Global Sections](https://support.wix.com/en/article/studio-editor-using-global-sections))

Setting a section global asks for a **type** — Header, Section, or Footer — and a
name. This is the same shape as WordPress's `core/template-part` `area`: chrome is
an ordinary unit carrying a site-level scope flag and a semantic role, not a
separate subsystem.

Two constraints Wix documents: global sections **cannot be saved as reusable
assets** (_"It is not possible to save global sections as assets"_ —
[Saving and Reusing Design Assets](https://support.wix.com/en/article/studio-editor-saving-and-reusing-design-assets)),
so live-linked and library-reusable are mutually exclusive; and **re-attaching a
detached section is NOT SOURCED**.

**4. Versioning — Wix has real major/minor propagation, and still cannot make a
breaking change.**

> - **"Major version.** Release a major version when you've made changes that
>   break compatibility. Your first release must be a major one. **Changes come
>   into effect after users manually update the app and publish their site.**"
> - **"Minor version.** Release a minor version when you've made small changes
>   that don't break compatibility. **A minor version will automatically change
>   on any site the app is installed on. It takes 5-15 minutes to update in the
>   live site.**"

([Manage Blocks App Versions](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-blocks/deploy-and-manage-blocks-apps/manage-blocks-app-versions))

Minors auto-propagate **only within a major line**: _"Wix users that have
installed the latest major version, automatically receive minor releases on top
of that version. If they are not on the latest major version, they will be
offered to update with the Update button."_ Wix therefore runs N concurrent live
major lines, one per un-updated cohort, and every installed instance carries its
own resolved version, retrievable per site (`"appVersion": "2.10.0"`).
([About App Versioning](https://dev.wix.com/docs/build-apps/manage-your-app/versioning/about-app-versioning),
[Retrieve an App Instance's Version Number](https://dev.wix.com/docs/build-apps/manage-your-app/versioning/retrieve-an-app-instance-s-version-number))

**Negative finding worth dwelling on: Wix's major/minor axis is consent-scoped,
not compatibility-scoped.** _Adding_ permissions is a major; _removing_ them is a
minor. _"Adding, changing or removing extensions"_ is classed **minor**. "Major"
means "this needs the user's affirmative agreement", not "this might break your
site".

**And Wix's actual prescribed answer to a breaking change is not a major bump —
it is permanent coexistence:**

> "**You can't delete the old extension—doing so breaks the widget or plugin for
> everyone who already has it installed.** Keep both extensions in your app:
> existing installations keep using the original, while new installations get the
> updated extension automatically."

The documented procedure is: ship a parallel extension; set the old one to _"Not
added automatically"_ and turn off _"Show this widget in the Add Elements
panel"_; for plugins, **rename it to include "Old" or "Previous"** so it _"doesn't
appear as a viable option in the plugin explorer"_; notify existing users with an
in-editor-only banner; release as a **minor**.
([Migrate to a New Site Widget or Plugin Extension](https://dev.wix.com/docs/build-apps/develop-your-app/extensions/site-extensions/migrate-to-a-new-site-widget-or-plugin-extension))

That the catalog has no deprecation state — so deprecation is expressed by
editing a display-name string — is a direct, cheap lesson for Saroh's catalog.

**NOT SOURCED: whether removing a Blocks widget property is a breaking change.**
The properties doc covers adding a property and editing its type but is silent on
deletion semantics for installed instances, and the "changes that require a major
version" list does not mention properties at all. A genuine documentation gap.

**A further constraint Saroh should note:** _"Installation settings apply only
**for the first install** on a site… the settings won't be updated unless the user
removes and reinstalls the app"_, and _"The installation settings you apply for
your Wix Blocks App are specific to a version of the app."_ The default preset is
frozen at first install and cannot be corrected by shipping a new version.

**Is a published Wix site a snapshot? Split answer, and it is the useful one.**
Layout and design _are_ versioned — _"Your site history is a record of every time
that you… has saved or published"_, and _"Restoring a version erases any changes
made after that specific version."_ But content is **not**:

> "Content in the following apps does not revert when restoring to a previously
> saved version of your site: Wix Stores, Wix Blog, Wix Events, Wix Bookings…"
> "**The content and data structure (schema) in your CMS collections are not
> reverted when restoring your site**"

and

> "**Any changes to this setting or your items' publishing statuses take effect
> immediately on your live site. You do not need to publish your site to make
> these changes go live.**"

([Restoring a Saved Version](https://support.wix.com/en/article/restoring-a-saved-version-of-your-site),
[CMS: Managing Collection Item Statuses](https://support.wix.com/en/article/cms-controlling-live-site-item-visibility-from-your-collection))

So: **a published Wix site is a snapshot of layout rendering live against current
content.** That is exactly Saroh's model, arrived at independently.

**5. Data-backed — Wix has no empty state, and it shows.**

The chain is Collection → Dataset (mode + filter + sort + page size) → element→field
bindings. And:

> "**If you add a filter to the dataset that returns no matching results from your
> collection, then the connected elements will not appear on the live site.**"

([CMS: Filtering and Sorting Live Site Content](https://support.wix.com/en/article/cms-formerly-content-manager-about-filtering-and-sorting-live-site-content-with-datasets))

There is no placeholder, no "no results" message, no fallback slot — the bound
elements silently vanish, stranding whatever non-bound chrome remains (a heading
over nothing). Achieving an empty state requires Velo code calling
`getTotalCount()` and toggling a message element. **A designed empty state is NOT
SOURCED anywhere in Wix's CMS docs.**

Draft items _"Cannot be read by datasets, so they cannot appear on your live
site"_, and status changes are immediate without republishing. **What happens to
an already-indexed dynamic page when its item is hard-deleted is NOT SOURCED** —
the troubleshooting article lists six 404/500 causes, none of which is this.

**6. Catalog surface — static thumbnails of plausible fake content.**

> "When site builders browse through the design presets of your widget in their
> **Add** or **Presets** panels, they see a thumbnail image of the widget."
> "The image should be a visual representation of the preset. **It's not a banner
> or an ad.**"
> "**If your widget has dynamic content, use dummy content to prepare your image.
> However, don't use Lorem Ipsum.**"

([Create Thumbnail Images for Your Presets](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-blocks/widget-design/create-thumbnail-images-for-your-presets))

Minimum 304×188 px, JPG/PNG, uncompressed. **It is a raster image, not a live
render** — Wix explicitly warns that a developer must _"go to the Wix Editor and
Wix Studio to see how your images appear in the actual panels"_, and that starting
from a template leaves you shipping _"the template's images"_. Saroh's approach —
a real render of a validated fixture — is strictly better and avoids exactly this
staleness class.

Wix Editor section categories are _"organized by topic such as Promotion, Team,
and List, and may include designs based on your business type (blog, store
etc.)"_ — the catalog is **business-type-filtered**, which is a direct precedent
for Saroh's capability gating.

**Context that reframes the above: Wix is walking away from Blocks.** Every Blocks
doc page now carries: _"Wix Blocks apps aren't supported in the Wix Harmony
editor."_ Site widgets and site plugins are marked unsupported in Harmony, and
Wix's advice is to _"rebuild these extensions with the Wix CLI or self-managing."_
([About Wix Harmony and Blocks](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-blocks/about-wix-harmony-and-blocks))
Wix's most contract-like, most versioned, most preset-driven system is the one its
next-generation editor drops.

---

### Builder.io — the fully late-bound case, and the clearest warning

**1. The unit.** A `BuilderBlock` in the content JSON, carrying
`component: { name, options }`. From
[`packages/sdks/src/types/builder-block.ts`](https://github.com/BuilderIO/builder/blob/main/packages/sdks/src/types/builder-block.ts):
`component.options?: any` — **untyped, unversioned, keyed only by input name**.
Registration is `Builder.registerComponent(Component, { name, inputs: [...] })`.
"Hero image left/right" is one component with an `enum` input; the chosen value is
just a string in `options`.
([Custom components](https://www.builder.io/c/docs/custom-components-setup),
[Input types](https://www.builder.io/c/docs/custom-components-input-types))

**Symbols are live references, not copies:** _"When you edit and Publish updates,
the Symbol updates apply immediately to all occurrences of that Symbol throughout
your app."_ An instance may be **detached**, becoming a normal block.
([Symbols](https://www.builder.io/c/docs/symbols-intro))

**2. Variants — Builder has none, and the word is taken.** The full
`ComponentInfo` interface
([`packages/sdks/src/types/components.ts`](https://github.com/BuilderIO/builder/blob/main/packages/sdks/src/types/components.ts))
has **no `variants` field**: `name`, `description`, `docsLink`, `image`, `inputs`,
`class`, `type`, `defaultStyles`, `canHaveChildren`, `fragment`, `noWrap`, `isRSC`,
`defaultChildren`, `defaults`, `hooks`, `hideFromInsertMenu`, `tag`, `static`,
`models`, `childRequirements`, `requiresParent`, `friendlyName`, `group`,
`requiredPermissions`, `hidden`, `override`, `shouldReceiveBuilderProps`, `meta`.

Builder's "variations" are something else entirely — **A/B test arms**: a whole
alternate `blocks` tree per content entry, with a `name` and `testRatio`, selected
randomly and cookie-persisted (`packages/sdks/src/helpers/ab-tests.ts`). Worth
naming as a **cautionary naming collision**.

For conditional fields Builder has `showIf`, but note what it is:

```ts
  /** @hidden */
  showIf?: ((options: Map<string, any>, …) => boolean) | string;
```

Marked `@hidden` in the SDK source. It hides a field **in the editor only** — it
does not narrow types, does not clear stored values for hidden inputs, and is
never seen by the renderer. Builder's conditional-field mechanism is presentational.

**3. Chrome — Builder has none, deliberately.** Your app renders the shell;
Builder renders sections into slots you place:

```jsx
<YourHeader />
<BuilderComponent model="announcement-bar" content={announce} />
<TheRestOfYourPage />
```

([Integrate section building](https://www.builder.io/c/docs/integrate-section-building))
Header-as-content is just a Symbol in a tree. **Builder has no page-layout or
page-wrapper entity at all.**

**4. Versioning — no mechanism, and the docs say so outright.** There is no
`version`, `since`, `deprecated` or `migrate` on `ComponentInfo`. The
[custom component versioning](https://www.builder.io/c/docs/custom-components-versioning)
page is the single most load-bearing quote in this report:

> "**Builder uses the current version of the custom component when rendering your
> content because that is the version that exists on your site–even if the content
> was originally created with a prior version of the component.**"

Its consequences, per the same page: new inputs must _"handle the case where that
input is `undefined`, since old content does not have a value for that input"_;
ship a second registration and put `hideFromInsertMenu` on the old one; encode the
version in the display name (`v2: Heading` — _"Builder omits anything that you put
before the colon"_); and for a non-backward-compatible change, register a new
component under a new name and _"keep that previous version registered with Builder
so that any instances still in use continue to work properly."_

**Builder's versioning is a naming convention plus discipline. There is no
machinery.** `hideFromInsertMenu` is documented in source as _"Hide your component
in editor, useful for gradually deprecating components."_

**What actually happens on a rename is NOT SOURCED in docs**, but is unambiguous in
the SDK — `get-block-component-options.ts` spreads stored `options` straight onto
props with no reconciliation, defaulting or rename map. A renamed input silently
delivers `undefined`.

**What renders for an unregistered component:** a `console.warn` and nothing.
From `packages/sdks/src/components/block/block.helpers.ts`:

```ts
// TODO: Public doc page with more info about this message
console.warn(`
      Could not find a registered component named "${componentName}". …`);
return undefined;
```

Worse, children survive the missing parent (`shouldRenderChildrenOutsideRef`), so
an unregistered wrapper drops out and its children render unwrapped and unstyled —
**silent structural corruption rather than a visible error**, with a `// TODO`
still sitting where the docs page should be.

**Published content is live-read.** `published` is a status field on a mutable
entry; `fetchOneEntry` does a live fetch of `cdn.builder.io/api/v3/content/<model>`
at call time, and `block.component.name` is resolved against the currently deployed
registry at render time. _"Content published by Builder Content is immediately
available to the Content API."_ ([Content API](https://www.builder.io/c/docs/content-api))

**5. Data-backed — no empty state, and the block simply vanishes.** Repeat is
`block.repeat = { collection, itemName }`. From
`packages/sdks/src/components/block/block.lite.tsx`:

```ts
    get canShowBlock() {
      if (props.block.repeat?.collection) {
        if (state.repeatItem?.length) return true;
        return false;
      }
```

Empty array → block not rendered. **No fallback, no placeholder, no author hook.**
NOT SOURCED in docs; definitively sourced in the SDK. A failed binding writes
`undefined` into the block property (`evaluate.ts` catches and returns `undefined`);
what the Content API returns for a dangling `reference` input is **NOT SOURCED**.

**6. Catalog surface.** `image` (insert-tab icon), `screenshot` (shown on hover —
Builder's "preview before insertion"), `group` (accordion sections), `description`,
`docsLink`, `friendlyName`, `hideFromInsertMenu`, `models` (restrict to model
types), `requiredPermissions`, plus `defaults`/`defaultChildren`/`defaultStyles`
applied on insert and `childRequirements`/`requiresParent` for placement
constraints (with a `message` shown when violated).
([registerComponent options](https://www.builder.io/c/docs/register-components-options))
**No live preview of a configured instance before insert.**

---

### Plasmic — the strongest variant model and the closest versioning precedent

**1. The unit.** _"A component is a reusable chunk of UI… built up of a tree of
elements."_ _"A page is a special type of component."_ Slots are _"sections of a
component that are meant for component instances to fill in with arbitrary
content. They are like 'holes' in a component."_
([Components](https://docs.plasmic.app/learn/components/),
[Pages](https://docs.plasmic.app/learn/pages/),
[Slots](https://docs.plasmic.app/learn/slots/))

Code components register via `registerComponent(component, meta)`; required fields
are `name`, `props`, `importPath`
([`packages/host/src/registerComponent.ts`](https://github.com/plasmicapp/plasmic/blob/master/packages/host/src/registerComponent.ts)).
**Like Builder, `CodeComponentMeta` has no `version` field** — Plasmic's versioning
lives one level up, at the project.

**There is no "Section" entity in Plasmic.** `section` is an insert-menu grouping
label; "section templates" are insert-time copies. Worth recording as a negative.

**2. Variants — the best case in the category, and they are not presentation-only.**

> "Variants allow you to create different visual states of a component and switch
> between them based on various circumstances."

Three kinds: _"Individual toggle variants"_, _"Single-choice variant groups"_
(only one active at a time), and _"Multiple-choice variant groups"_. Plus **global
variants** — _"Global variants apply across the entire project"_ (dark mode, screen
size, palettes, LTR/RTL, vendor branding) — screen/breakpoint variants as a
built-in global group, and interaction variants (hovered/pressed/disabled/focused).
([Variants](https://docs.plasmic.app/learn/variants/),
[Global variants](https://docs.plasmic.app/learn/global-variants/))

**May a variant change which elements exist? Yes — genuinely.** Plasmic documents
two distinct hiding modes ([Visibility](https://docs.plasmic.app/learn/visibility/)):

> "the element you are hiding will still be rendered to the page (the DOM elements
> will be created and styled), but just hidden with CSS property `display:none`"

> "the element you are hiding will not be rendered at all; in React speak, this is
> conditional rendering, like doing `{ifTrue && <Blah />}`"

The docs recommend `display:none` for interaction and responsive variants, and
**true conditional rendering for ordinary component variants**, specifically to
_"avoid unnecessary rendering of content, unwanted data fetches, and side effects."_

**Where the variant name lives: in the component definition, addressable in
generated code, and part of the semver contract.** Variants surface as props —
`<PlasmicButton role="primary" />`, `<PlasmicButton withIcons={["prefix","suffix"]} />`,
or consolidated as `variants={{…}}`
([Codegen components](https://docs.plasmic.app/learn/codegen-components/)). And
crucially, from [Versioned sync](https://docs.plasmic.app/learn/versioned-sync/), a
**major** bump _"Indicates a change that could result in breaking a developer's code
build, such as when components, **variants**, slots, or style tokens are renamed or
deleted."_ **Variant names are semver-load-bearing.** Nothing in Builder is.

**3. Chrome — two first-class layers.** A project gets _"a default Page Layout
component that is automatically added to all pages"_, itself _"a normal Plasmic
component"_, and any component can be designated the default page wrapper
([Page layouts](https://docs.plasmic.app/learn/page-layouts/)). Separately,
**global contexts** are _"React Components with global data and behaviors you want
accessible to all your pages and components"_
([Global contexts](https://docs.plasmic.app/learn/global-contexts/)). _(Exact
header/footer slot mechanics on the page wrapper: **NOT SOURCED**.)_

**4. Versioning — the closest precedent to Saroh's decision, with a caveat.**

_"Each time you publish/save, the current state of your project will be saved as a
new version."_ _"Saved versions are final and cannot be edited."_
([Publishing](https://docs.plasmic.app/learn/publishing/)) The semver semantics
([Versioned sync](https://docs.plasmic.app/learn/versioned-sync/)):

> **Major:** "…components, variants, slots, or style tokens are renamed or deleted"
> **Minor:** "…new components, variants, slots, and/or style tokens that can now be
> used by the developer, but no breaking changes"
> **Patch:** "…changes that do not affect the component's code interface (e.g.
> changing styles or layout)"

A production site renders _"the most recently published version"_ or a pinned
`version: '2.1.3'`; `preview: true` fetches unpublished revisions and is for
development only ([Fetching Plasmic data](https://docs.plasmic.app/learn/fetching-plasmic-data/)).
So a published Plasmic project is an **immutable, addressable, semver'd artifact** —
the exact opposite of Builder's live-read.

**On evolving code-component props, Plasmic is destructive-with-consent**
([App host dev workflow](https://docs.plasmic.app/learn/app-host-dev-workflow/)):

> "**Changing the type of a prop will prompt you to confirm removing usages of the
> old prop. Note that this removes all existing arguments/values passed into that
> prop.**"
> "**Changing the type or name of a prop in a way that carries over all old values
> passed in for that prop is not yet supported.**"

Studio _detects_ a missing registration and asks a human whether it was a rename;
Builder does not detect it at all. But note: **Plasmic has no value-carrying
migration either.**

Its explicit advice ([Libraries advice](https://docs.plasmic.app/learn/libraries-advice/)):

> "**You should always keep your components as backward compatible as possible**…
> For instance, renaming props, deleting props, changing types, etc. is something
> that you should try to avoid."
> "**If you need to release breaking changes, consider creating a new separate
> component that contains your second version, and making the first one
> deprecated.**"

That is Saroh's `hero@2`-beside-`hero@1` decision, recommended verbatim by the
product with the most mature versioning in the set.

**The caveat that cuts against using Plasmic as a coexistence precedent:**
_"A project's imports (including transitive imports) must all be on the same
version."_ ([Publishing and importing](https://docs.plasmic.app/learn/publishing-importing/))
Plasmic **pins**, it does not let one project hold two versions of a dependency
side by side. Coexistence happens across consuming projects, not within one.

**5. Data-backed.** Dynamic value bindings with a **loading** fallback: _"A fallback
value is used if the dynamic value includes a data query that is still loading."_
Repeated elements bind an element to an array exposing `currentItem`/`currentIndex`
([Repeated elements](https://docs.plasmic.app/learn/repeated-elements/)).
**An empty-state slot for repeated elements is NOT SOURCED** — the only documented
"nothing to show" mechanism is the loading fallback. Plasmic's variants plus
conditional visibility _could_ express an empty state, but that is inference, not
documentation.

**6. Catalog surface.** `displayName`, `description`, `section` (grouping),
`thumbnailUrl` (_"a link to an image that will be displayed as a thumbnail… if the
component has a `section` specified"_), `hideFromContentCreators`, `defaultStyles`,
`styleSections` (which style panels appear), `treeLabel`, `parentComponentName`,
`isRepeatable`, plus `templates` — a map of preconfigured starting points each with
its own `previewImg`. **Note there is no `previewImage` on the component itself**;
the thumbnail is `thumbnailUrl` and only takes effect when `section` is set.

**Templates are the inverse of Symbols:** _"when users insert a template, they are
inserting the **contents** of the component. They are always inserted 'detached'
from the component."_ ([Custom templates](https://docs.plasmic.app/learn/custom-templates/))
Both products ship both semantics — reference _and_ copy — under different names.

---

## What the evidence says about each open decision

### #253 — Are navbar and footer blocks a merchant places, or site chrome?

**What the evidence recommends: put them in the library as _reference_ units — a
placeable block whose content is stored once at site level, tagged with a semantic
role.** This is a third option distinct from both sides of the brief, and it is
what every product that has revisited chrome recently converged on.

Three independent implementations of the same shape:

| Product    | The unit                          | What it stores              | The role tag                                              |
| ---------- | --------------------------------- | --------------------------- | --------------------------------------------------------- |
| WordPress  | `core/template-part` block        | `slug` + `theme` only       | `area`: `header`/`footer`/`uncategorized`                 |
| Shopify    | section group JSON in `sections/` | list of sections + settings | `type`: `header`/`footer`/`aside`/`custom.<name>`         |
| Wix Studio | a section marked global           | the section, once           | type chosen at "Set as Global": Header / Section / Footer |

**The direction of travel is the strongest evidence.** Shopify's docs say outright:
_"You can use section groups **in place of static sections** in layouts. Learn how
to migrate from static sections to section groups."_ Wix Studio replaced the Wix
Editor's hardcoded, undeletable header — which could only be hidden **both at once**
(_"It is not possible to only hide the footer or the header"_) and whose per-page
design is still an open feature request (_"Currently, it is not possible to have
different header or footer designs on different pages"_). Saroh's nav-as-config-list
and footer-as-HTML-blob is the Wix Editor position, and Wix moved off it.

**"Appears on every page" is expressed by the reference, not by a flag on the
content.** Shopify: `{% sections 'header-group' %}` in `layout/theme.liquid`.
WordPress: the template references the part. Wix: the section carries a global
marker. In Saroh's terms, the Publication snapshot should carry the resolved chrome
once and each page reference it — not copy it into every page's section list.

**What the evidence warns against:**

- **Do not make chrome a normal placed section whose content lives per page.** No
  product does this, and Wix documents the cost of the copy-semantics half of its
  own product: _"once you add them to your canvas, they become independent from the
  original saved version… there is no way to make global updates."_
- **Cap the number of chrome regions.** Shopify: _"In most themes, you should use
  section groups for **only the header and footer**."_
- **Do not mix mechanisms in one layout.** Shopify: _"Avoid using both section
  groups and static sections in the same layout file."_ If nav/footer become
  library units, retire the config-list and the HTML blob rather than running both.
- **Design the detach/override escape hatch up front.** Wix has `detach` (one-way —
  **re-attaching is NOT SOURCED**), Webflow has "convert to site component"
  (_"will not receive updates from the Library"_), WordPress has `pattern/overrides`
  — a synced unit plus a named set of per-instance overrides, which is the least
  lossy of the three.
- Note WordPress marks `core/template-part` `"reusable": false` and
  `"renaming": false`. Chrome units get _fewer_ affordances than ordinary blocks,
  not more.

---

### #254 — What is a variant, and where does it live?

**What the evidence recommends: a single, named, persisted field on the content
contract, whose legal values are declared in code, and which may change layout and
visibility but never which fields exist.** That is what Saroh already reserved. The
evidence is unusually decisive on each clause.

**A field in the content, not derived.** Shopify persists it — the preset `name`
_"is persisted in the JSON template when you add a section."_ WordPress does not,
and the cost is documented: `isActive` exists only because _"the Editor cannot
distinguish between an instance of the original block and your variation"_, and
`isDefault` collisions are resolvable only by unregistering a competitor's
variation. Webflow's variants auto-create a **variant prop** persisted on the
instance. **Do not re-derive the variant from content values.**

**One axis, not many.** Webflow: _"**Components can only have a single variant
property** (with no limit to the number of variants). For more advanced use cases,
you can use the `class` custom attribute."_ Plasmic allows unlimited variant groups
plus global and interaction variants — powerful, and it is a design tool for
developers, not a merchant surface. For a product where _"merchants pick a variant
and edit content only"_, Webflow's cap is the closer precedent.

**The name lives in code; the selection lives in content.** Shopify presets are
declared in the section's `{% schema %}`; Wix preset names are authored in Blocks
and versioned with the app; Webflow variant names live on the main component.
Saroh's `fixtures.ts` `BlockVariant { id, label, description }` with the `id`
written into `content.variant` is exactly this shape and needs no change.

**A variant must not change which fields exist.** Wix states the rule most
crisply: _"design changes are per-preset, while **structure or data changes are
global**"_ — a preset may only **hide** an element and restyle it; adding or
deleting an element, and **changing text content**, are global to every preset.
Shopify presets supply default _values_ for one settings schema. And every product's
conditional-field mechanism — Shopify `visible_if`, Builder `showIf`, Framer
`hidden`, Webflow switch props — hides fields **in the editor only** and leaves
stored values untouched.

**Two operational rules worth adopting verbatim:**

- **Switching variant must not clobber data selections.** Shopify: _"Settings of
  type `collection` are **not updated when switching presets**."_ When a merchant
  moves `hero` from `centered` to `split`, their chosen image and CTA must survive.
- **An unknown variant must fall back, not blank.** Saroh's `rendered.ts` already
  says this. Wix's _"Hide on this Preset"_ and Webflow's base-variant inheritance
  are the same instinct: there is always a base to fall back to.

**What the evidence warns against:**

- **Do not name it "variation" if it can be confused with anything else.**
  Builder.io's "variations" are A/B test arms — whole alternate block trees per
  entry, selected randomly by cookie. A real, shipped naming collision.
- **Do not create a section type per look.** Nothing in the survey does this for a
  layout axis; Dawn and `core/media-text` both use a setting. It would also multiply
  the `(type, version)` matrix Saroh has to keep renderable.
- **Do not let variants become a restyling surface.** Wix Studio's editable-canvas
  sections are why Wix cannot centrally update anything, and why an empty dataset
  strands a heading over nothing.
- **Beware the existing overlap.** `renderedGallery` already carries **both**
  `variant` and `layout: grid|carousel|masonry`. That is two mechanisms for one
  question, and the survey says pick one. Dawn's `layout: image_first|text_first` is
  a _setting_ because the merchant flips it freely; Shopify presets are the _catalog
  entry_. Deciding which of those `gallery.layout` is — and folding it into
  `variant` if it is the latter — is the concrete first application of #254.

---

### #255 — Which block types ship first, and what does each contract carry?

The survey does not rank candidate block types; it constrains what their contracts
must carry. Four rules, each sourced:

**1. Every data-backed block needs an empty state in the contract, not as an
afterthought.** The best implementation is Webflow's: the empty state is a
**structural part** of the Collection list wrapper, ships with default copy
(_"No items found"_), and has a Designer **UI state** toggle to preview it without
emptying the data. WordPress makes it an authored block; Dawn renders placeholder
cards so the section keeps its shape. Wix and Builder.io render nothing —
_"the connected elements will not appear on the live site"_ — which is the failure
mode to avoid. For Saroh, "placeholder that preserves the layout" (Dawn) is probably
right for the editor and catalog, and "authored fallback text" (Webflow) for the
live site.

**2. Bind by query or reference, never by a resolved list of record IDs.**
WordPress's Query Loop stores `postType`/`order`/`orderBy`/`taxQuery`, not IDs, so a
deleted record cannot dangle. Where a single record _is_ referenced, Shopify
collapses every failure into one value: _"`blank`, if no selection has been made,
the selection isn't visible, or **the selection no longer exists**."_ Three causes,
one branch. That maps cleanly onto Saroh's existing `href: ""` convention and should
be the house rule for `productId`, `serviceId`, `formId`.

**3. Prefer indirection over rewriting content when a referenced thing is
deleted.** Shopify's palette mechanism is the pattern: _"When a merchant deletes a
palette color… Shopify asks them to choose a replacement. **The deleted color's
value is stored as a reference to the replacement**… This keeps all existing
references intact without updating every template that uses the deleted color."_
Saroh already stores site style as choice keys; the addition is the human step at
deletion time.

**4. Capability gating has a precedent, and it is at the catalog surface.** Shopify:
_"The sections that are available to be added to a template in the theme editor
might be limited by the `enabled_on` or `disabled_on` attribute."_ Wix filters
section categories by business type — _"may include designs based on your business
type (blog, store etc.)"_. Builder has `models` (_"restrict using the component to
only the models listed here"_). Gate at the picker, declaratively, in the block's
own metadata — not with a runtime check inside the renderer.

**On sequencing, the only ranking the evidence supports** is that the
non-data-backed candidates (features grid, FAQ, logo wall, testimonials, stats) each
need one thing Saroh already has — a repeated item schema — while the data-backed
ones (pricing, product/service lists) need all four rules above plus capability
gating. Shipping two or three non-data-backed types first would exercise the
`variant` decision from #254 across several blocks before the empty-state and
reference-degradation machinery has to exist. **This is an inference from the
constraints above, not a sourced recommendation — no product documents its
block-library sequencing.**

One concrete note: **a repeated-item block should have a documented minimum and a
declared cap.** Shopify: _"JSON templates can render up to 25 sections, and each
section can have up to 50 blocks."_ Wix Blocks: _"Items per load."_ Saroh's
`renderedGallery` already requires `.min(1)`; the same explicitness about the upper
bound belongs in every new list-shaped contract.

---

## What I could not establish

Listed explicitly rather than inferred. Nothing below should be treated as known.

**Highest-value gaps (worth a follow-up):**

1. **Shopify: what happens to a stored setting value whose `id` no longer exists in
   the section schema.** I searched the section schema reference, the JSON templates
   reference, the settings reference and the section groups reference. None states
   it. The widely repeated claim that orphaned data is silently ignored could not be
   traced to a Shopify-owned source. **The gap is itself the finding**: the most
   deployed section system in the category does not document its own
   content-compatibility behaviour. I also did not retrieve
   help.shopify.com's "update your theme" merchant docs or the changelog entry
   announcing section groups.

2. **Wix: whether removing a Blocks widget property is a breaking change.** The
   properties doc covers adding a property and editing its type but is silent on
   deletion semantics for installed instances, and the "changes that require a major
   version" list does not mention properties at all. A genuine documentation gap on
   Wix's side, not a search failure.

3. **Webflow: chrome.** Whether headers/footers are site-level or components placed
   per page, and whether Webflow has any global-navigation feature. Not sourced at
   all — a fetch failure, not a negative finding. Do not infer from the Webflow
   section.

4. **Webflow: whether a published page is a frozen static artifact.** The publishing
   workflow doc describes staging→production diffing and per-page publishing but I
   did not retrieve a statement on the nature of the published artifact.

5. **Framer: almost everything except property controls.** Framer's visual variants
   (named, in the component definition, able to add/remove layers), chrome,
   publishing model, CMS empty states, and any statement about breaking changes to
   components on live sites. `framer.com/help/articles/what-are-variants/` returned
   404 and I did not find a canonical replacement. Framer is widely understood to
   have first-class named variants; **this document does not evidence that.**

**Product-specific gaps:**

6. **Webflow:** what a published Collection page does when its CMS item is deleted
   (404, stale until republish, or auto-unpublish).

7. **Wix:** what happens to an already-indexed dynamic page when its CMS item is
   hard-deleted. The troubleshooting article lists six 404/500 causes, none of which
   is this. Also: no documented API to read the active preset name from widget code;
   no documented way to **re-attach** a detached global section; the Wix developer
   changelog (`dev.wix.com/docs/changelog`) returned 404 to every fetch.

8. **Wix "layouter"** — not present in the Help Center; the current noun is
   "repeater". The term survives only on Wix Studio Academy and the Wix Studio
   forum, apparently as an Editor X carry-over. **"Master page"** is likewise not
   current Wix layout terminology — it survives only as Velo's `masterPage.js`.

9. **Builder.io:** no documented statement of what happens when an input is renamed
   or removed (the behaviour is unambiguous in the SDK source, but Builder never says
   it); what the Content API returns for a dangling `reference` input; and there is
   no docs page at all for the unregistered-component warning — the SDK still
   carries `// TODO: Public doc page with more info about this message`.

10. **Plasmic:** an empty-state slot for repeated elements. Neither
    `/learn/repeated-elements/`, `/learn/dynamic-values/` nor
    `/learn/data-code-components/` documents an empty-collection branch; the only
    "nothing to show" mechanism is the _loading_ fallback. The plausible workaround
    (a variant or conditional visibility on `collection.length === 0`) is inference,
    **not documented**. Also: the exact header/footer slot mechanics of the Page
    Layout component; and no primary docs page for a Plasmic Community template
    marketplace.

11. **WordPress:** whether any gate validates a block's `example` attributes against
    its declared `attributes` schema. Saroh's fixtures do this in CI (gate G4); I
    found no evidence WordPress does.

**Methodological caveats:**

12. **The 158 retained-versions figure is a lower bound.** Five files (`embed`,
    `file`, `heading`, `query`, `video`) use an export form my parser did not match.
    The line count (~16,200) and the 55-of-117 file count are exact, and the
    per-block figures quoted in the summary (`cover` 14, `button` 15, `image` 9) were
    each verified by reading the array directly.

13. **Two of five research passes were lost to a rate limit** (Shopify, and
    Webflow/Framer). Shopify was re-done directly and is complete on the questions
    that matter most; Webflow was partly recovered from cached source pages; Framer
    was not. **Framer and Webflow-chrome are the two thinnest areas of this
    document.**

14. **Some Wix support.wix.com quotes are paraphrase-level** rather than verbatim,
    because those pages are client-rendered and came back through a summarising
    fetch. The Wix section marks these; `dev.wix.com` quotes are verbatim (fetched
    as raw markdown).

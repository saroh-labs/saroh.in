# @saroh/templates

Versioned site-template manifests + a registry that instantiate valid CMS
pages for Saroh.io. Pure data — no Prisma, no API.

## Concepts

- **`TemplateManifest`** — a versioned (`id@version`), declarative description
  of a site: its pages and, per page, the ordered CMS sections.
- **`TemplateContext`** — the business profile a template is instantiated
  against (`organizationName`, optional `legalName` / `tagline` /
  `description` / `contactEmail` / `websiteUrl`).
- **Content builders** — a section's `content` is either a literal or a
  builder `(ctx: TemplateContext) => content`. Builders weave business-profile
  defaults into the copy (e.g. the hero heading = the organization name)
  while staying fully type-checked. This is preferred over placeholder tokens:
  no parser, and builders can compute nested/conditional content.
- **`instantiateTemplate(template, context)`** — resolves a manifest into a
  plain `{ pages: { path, title, isHome, sections: { type, contractVersion,
order, content }[] }[] }`. Every section's content is validated + normalized
  through `parseSectionContent` from `@saroh/database`; an invalid section
  throws `TemplateInstantiationError`. A template can therefore never produce
  an invalid page. `order` is the section's array index.

## Usage

```ts
import { getTemplate, instantiateTemplate } from "@saroh/templates";

const template = getTemplate("starter"); // latest version
const site = instantiateTemplate(template!, {
    organizationName: "Acme Roasters",
    tagline: "Small-batch coffee, roasted with care.",
    contactEmail: "hello@acme.example",
});
// → site.pages ready to persist as Pages + Sections
```

## Templates

- **`starter` (v4, DEC-141)** — what a new site starts from
  (`templates/starter-v4.ts`). A look of its own (three colourways, a font
  pair and a type scale, `templates/starter-look.ts`). Home lays down a
  section for what the business has switched on (products, services,
  classes, plans, packs, its place and hours) around one primary action
  (`starterPrimaryAction`), and `modulePages` names the module pages it
  starts with (Shop, Book, Prices, Contact). It writes nothing that is not
  true of the business: its line is composed from the business's own names
  (`composeBusinessLine`), and where nothing true can be said the section or
  page is left out.
- **`starter` (v1 to v3)** — kept for the sites built from them, never
  edited, not listed for new sites; `getTemplate("starter", 3)` still
  resolves one. v1 pointed at images no app serves; v2 and v3 gave every
  site the same stock paragraphs, and v3 put a note to the owner under the
  headline. The pre-publish matcher (`placeholders.ts`) knows all of them.
- **`personal` and `portfolio` (v2)** — v1's pages in the starter's look.
- **`gym` (v1)** — industry template (plan U6), Services shape: Home (the
  name as a page title → the week's timetable → plans and packs → first
  visit → hours), Timetable, Membership and Trainers. Bound blocks only while
  their module is on; a page whose every section needs one module (Timetable,
  Membership) is laid down only with it (a page's `when`). Coaches are
  Person placeholders with photo briefs; no member quote is invented.

`listTemplates()` returns the latest version of each template (the picker and
the public catalogue); `getTemplate(id, version)` resolves any registered one.

## A new version and the sites already made

A site's sections are copied into it when it is made, so a new version
reaches no existing site by itself. `planTemplateUpgrade` (`upgrade.ts`) is
the rule that brings one up without destroying anything its owner wrote: an
untouched page becomes the new version's, an edited page keeps everything and
gains only the bound sections it lacks. The API reads the site and writes the
plan (`sites/template-sync.ts`), both when a version is released
(`docs/architecture/runbooks/TEMPLATE_UPGRADE.md`) and when a business
switches a module on after its site exists.

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

- **`starter` (v2)** — what a new site starts from: Home (centred hero → what
  it does → working together → CTA) and About (hero → how it started), all
  derived from the business profile. Its words fit a business, a person
  working for themselves or someone showing their work (DEC-070), it carries
  no image, and every link goes to the contact email or its own About page.
- **`starter` (v1)** — kept for the sites built from it: company copy and a
  gallery of `/templates/starter/*.jpg` paths that no app serves. Not listed
  for new sites; `getTemplate("starter", 1)` still resolves it.

`listTemplates()` returns the latest version of each template (the picker and
the public catalogue); `getTemplate(id, version)` resolves any registered one.

import type { ContractVersion, SectionType } from "@saroh/database";

/**
 * Site templates (Stage 2 — S2-002).
 *
 * A {@link TemplateManifest} is a VERSIONED, declarative description of a whole
 * site: the pages to create and, for each page, the ordered CMS sections to
 * lay down. Manifests are pure data — they never touch Prisma. Turning a
 * manifest into concrete Pages+Sections is the job of `instantiateTemplate`
 * (see `./instantiate.ts`), which resolves it against a {@link TemplateContext}
 * and validates every produced section through the `@saroh/database` section
 * contract. A manifest can therefore never produce an invalid page.
 *
 * BUSINESS-PROFILE DEFAULTS. A template needs to weave the merchant's own
 * details (their organization name, tagline, contact email, …) into the copy —
 * the hero heading should read as the business name, not a hard-coded string.
 * We model this with **content builders**: a section's `content` may be either
 *
 *   - a plain literal (`unknown`), used verbatim, or
 *   - a builder function `(ctx: TemplateContext) => unknown` that receives the
 *     business profile and returns the content object.
 *
 * The builder approach is chosen over placeholder-token strings because it is
 * fully type-checked, needs no token parser, and lets a section compute nested
 * / conditional content (e.g. omit a CTA when there is no contact email)
 * without a bespoke templating mini-language. `isContentBuilder` distinguishes
 * the two at instantiation time.
 */

/**
 * The business profile a template is instantiated against. `organizationName`
 * is the only hard requirement; everything else is optional so a barely
 * onboarded merchant still gets a complete, valid site (builders fall back to
 * sensible defaults derived from the name).
 */
export interface TemplateContext {
    /** The org/business display name — the primary default for headings. */
    organizationName: string;
    /** Registered legal entity name, if different from the display name. */
    legalName?: string;
    /** Short marketing tagline, e.g. used as a hero subheading. */
    tagline?: string;
    /** Longer one-line description of what the business does. */
    description?: string;
    /** Public contact email, used to build "Contact us" CTAs. */
    contactEmail?: string;
    /** Canonical website URL, if the merchant has one. */
    websiteUrl?: string;
}

/**
 * A section's content, either used verbatim or computed from the business
 * profile. `T` is the *resolved* content type; builders and literals both
 * resolve to it.
 */
export type TemplateContent<T = unknown> = T | ((ctx: TemplateContext) => T);

/** Narrow a {@link TemplateContent} to its builder-function form. */
export function isContentBuilder<T>(
    content: TemplateContent<T>,
): content is (ctx: TemplateContext) => T {
    return typeof content === "function";
}

/**
 * Resolve a {@link TemplateContent} against a context: run the builder, or pass
 * the literal through unchanged.
 */
export function resolveContent<T>(
    content: TemplateContent<T>,
    ctx: TemplateContext,
): T {
    return isContentBuilder(content) ? content(ctx) : content;
}

/** One CMS section within a template page. */
export interface TemplateSection {
    /** The section type — must have a registered contract in `@saroh/database`. */
    type: SectionType;
    /** The contract version this section's content targets (starts at 1). */
    contractVersion: ContractVersion;
    /**
     * The section content: a literal object, or a builder that derives it from
     * the business profile. Validated through the section contract at
     * instantiation, so it can never reach the DB in an invalid shape.
     */
    content: TemplateContent;
}

/** One page within a template. `order` of its sections is array position. */
export interface TemplatePage {
    /** URL path for the page, e.g. `/` or `/about`. */
    path: string;
    /** Human page title. */
    title: string;
    /** Marks the site's home page. At most one page should set this. */
    isHome?: boolean;
    /** Ordered sections; array index becomes the persisted `order`. */
    sections: TemplateSection[];
}

/**
 * A versioned, declarative site template. `id@version` is the registry key —
 * a template evolves by publishing a NEW version alongside the old one, so
 * sites already built from an earlier version keep working.
 */
export interface TemplateManifest {
    /** Stable template identifier, e.g. `"starter"`. */
    id: string;
    /** Manifest version, starts at 1; bumped on breaking template changes. */
    version: number;
    /** Human name shown in the template picker. */
    name: string;
    /** Optional longer description of the template. */
    description?: string;
    /** The pages this template lays down. */
    pages: TemplatePage[];
}

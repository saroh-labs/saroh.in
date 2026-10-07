/**
 * `@saroh/templates` — versioned site-template manifests + registry.
 *
 * A template is a pure, versioned description of a site (pages + ordered CMS
 * sections). `instantiateTemplate` resolves a manifest against a business
 * profile ({@link TemplateContext}) and validates every section through the
 * `@saroh/block-contract` section contract, yielding a plain, ready-to-persist
 * structure of Pages + Sections. This package never touches Prisma.
 */

// Manifest types + content-builder helpers
export { isContentBuilder, resolveContent } from "./manifest";
export type {
    TemplateContent,
    TemplateContext,
    TemplateManifest,
    TemplatePage,
    TemplateSection,
} from "./manifest";

// Registry
export { getTemplate, listTemplates } from "./registry";

// Instantiation (validates through the section contract)
export { TemplateInstantiationError, instantiateTemplate } from "./instantiate";
export type {
    InstantiatedPage,
    InstantiatedSection,
    InstantiatedTemplate,
} from "./instantiate";

// The starter production template: `starterTemplate` is the latest (v3,
// UX-070), `starterTemplateV2` and `starterTemplateV1` the versions earlier
// sites came from.
export {
    HERO_PROMPT,
    STARTER_TEMPLATE_ID,
    starterTemplate,
    starterTemplateV1,
    starterTemplateV2,
} from "./templates/starter";

// Blog/writing (DEC-070, K13). Registered; no kind's default.
export { WRITING_TEMPLATE_ID, writingTemplate } from "./templates/writing";

// The Personal/consultant template (DEC-070, K14): the default for "Just me".
export {
    PERSONAL_TEMPLATE_ID,
    personalServiceIds,
    personalTemplate,
} from "./templates/personal";

// The Portfolio template (DEC-070, K12): the default for "A site for my work".
export {
    PORTFOLIO_TEMPLATE_ID,
    portfolioTemplate,
} from "./templates/portfolio";

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

// The starter production template: `starterTemplate` is the latest (v2),
// `starterTemplateV1` the version sites built before DEC-070 came from.
export {
    STARTER_TEMPLATE_ID,
    starterTemplate,
    starterTemplateV1,
} from "./templates/starter";

// The Portfolio template (DEC-070, K12). Exported, not yet registered: K15
// registers it.
export {
    PORTFOLIO_TEMPLATE_ID,
    portfolioTemplate,
} from "./templates/portfolio";

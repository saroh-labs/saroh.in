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
export {
    TEMPLATE_KINDS,
    TEMPLATE_SHAPES,
    isContentBuilder,
    resolveContent,
    templateStylePreset,
} from "./manifest";
export type {
    TemplateContent,
    TemplateContext,
    TemplateKind,
    TemplateManifest,
    TemplatePage,
    TemplateSection,
    TemplateShape,
    TemplateStyle,
    TemplateStylePreset,
} from "./manifest";

// The font pairs a site (and a template's style) may name (KTD-2). Re-exported
// so the API, which depends on this package and not on the contract directly,
// validates `Site.style.fontPair` against the same list the renderer loads.
export {
    DEFAULT_FONT_PAIR,
    FONT_PAIRS,
    FONT_PAIR_KEYS,
    findFontPair,
    isFontPairKey,
} from "@saroh/block-contract";
export type { FontPairKey, SiteFontPair } from "@saroh/block-contract";

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

// Blog/writing (DEC-070, K13). Registered; no kind's default.
export { WRITING_TEMPLATE_ID, writingTemplate } from "./templates/writing";

// The Blogs industry template (Journal shape; industry templates U8).
export { BLOGS_TEMPLATE_ID, blogsTemplate } from "./templates/blogs";

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

// Ceramics, the gallery's "Store" (industry templates plan, U5).
export {
    CERAMICS_COLLECTION_COUNT,
    CERAMICS_TEMPLATE_ID,
    ceramicsSellsProducts,
    ceramicsTemplate,
} from "./templates/ceramics";
// The Gym industry template (industry templates plan, U6).
export { GYM_TEMPLATE_ID, gymTemplate } from "./templates/gym";
// The Bakery industry template (industry templates plan, U4).
export {
    BAKERY_IMAGE_BRIEFS,
    BAKERY_TEMPLATE_ID,
    bakeryTemplate,
} from "./templates/bakery";

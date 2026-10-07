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
    TemplateFooter,
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
    fontPairVariables,
    isFontPairKey,
} from "@saroh/block-contract";
export type { FontPairKey, SiteFontPair } from "@saroh/block-contract";

// A template's own palette and type scale (DEC-090), re-exported for the same
// reason: the API validates `Site.style.palette`/`type` with the rules the
// editor resolves its preview with.
export {
    LABEL_STYLES,
    PALETTE_CONTRAST_PAIRS,
    PALETTE_MIN_CONTRAST,
    PALETTE_ROLES,
    TYPE_SCALE_BOUNDS,
    contrastRatio,
    hexToHslTriple,
    paletteVariables,
    parsePalette,
    parseTypeScale,
    samePalette,
    sameTypeScale,
    typeScaleVariables,
} from "@saroh/block-contract";
export type {
    LabelStyle,
    PaletteProblem,
    PaletteRole,
    SitePalette,
    SitePaletteInput,
    SiteTypeScale,
} from "@saroh/block-contract";

// A site's look and its `--site-*` variables (#189), for the same reason:
// the API validates a saved style and publishes its variables with the
// rules the renderer's template renders (U14) draw a colourway with.
export {
    STYLE_ROWS,
    STYLE_ROW_KEYS,
    STYLE_ROW_LABELS,
    STYLE_SCALARS,
    STYLE_SCALAR_KEYS,
    contrastOk,
    defaultSiteStyle,
    presetSiteStyle,
    readableOn,
    siteStyleVariables,
} from "@saroh/block-contract";
export type {
    SiteStyle,
    StyleRow,
    StyleScalar,
    Swatch,
} from "@saroh/block-contract";

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
export {
    BLOGS_GALLERY_SAMPLE,
    BLOGS_TEMPLATE_ID,
    blogsTemplate,
} from "./templates/blogs";

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
    CERAMICS_GALLERY_SAMPLE,
    CERAMICS_TEMPLATE_ID,
    ceramicsSellsProducts,
    ceramicsTemplate,
} from "./templates/ceramics";
// The Gym industry template (industry templates plan, U6).
export {
    GYM_GALLERY_SAMPLE,
    GYM_TEMPLATE_ID,
    gymTemplate,
} from "./templates/gym";
// The Bakery industry template (industry templates plan, U4).
export {
    BAKERY_GALLERY_SAMPLE,
    BAKERY_IMAGE_BRIEFS,
    BAKERY_TEMPLATE_ID,
    bakeryTemplate,
} from "./templates/bakery";
// Studio, the gallery's "Portfolio" (industry templates plan, U10).
export {
    STUDIO_GALLERY_SAMPLE,
    STUDIO_PROJECT_BRIEFS,
    STUDIO_TEMPLATE_ID,
    studioHasEmail,
    studioTemplate,
} from "./templates/studio";
// Developer (industry templates U9): a one-page portfolio for an independent
// engineer.
export {
    DEVELOPER_GALLERY_SAMPLE,
    DEVELOPER_TEMPLATE_ID,
    developerTemplate,
} from "./templates/developer";
// The Dietician industry template (industry templates plan, U7).
export {
    DIETICIAN_GALLERY_SAMPLE,
    DIETICIAN_TEMPLATE_ID,
    dieticianServiceIds,
    dieticianTemplate,
} from "./templates/dietician";
// Salon and Clinic, designed in code (industry templates plan, U11).
export {
    CLINIC_GALLERY_SAMPLE,
    CLINIC_TEMPLATE_ID,
    clinicServiceIds,
    clinicTemplate,
} from "./templates/clinic";
export {
    SALON_GALLERY_SAMPLE,
    SALON_TEMPLATE_ID,
    salonServiceIds,
    salonTemplate,
} from "./templates/salon";

// Every gallery template's sample words, by id (KTD-6): gallery renders only.
export { GALLERY_SAMPLES } from "./gallery-samples";

// The pre-publish check's matcher for a template's placeholder words.
export {
    TEMPLATE_PLACEHOLDER_PATTERNS,
    templatePlaceholderIn,
    templatePlaceholderInAny,
} from "./placeholders";

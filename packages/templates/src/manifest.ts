import type {
    ContractVersion,
    FontPairKey,
    SectionType,
    SitePaletteInput,
    SiteTypeScale,
} from "@saroh/block-contract";

/**
 * Site templates (Stage 2 — S2-002).
 *
 * A {@link TemplateManifest} is a VERSIONED, declarative description of a whole
 * site: the pages to create and, for each page, the ordered CMS sections to
 * lay down. Manifests are pure data — they never touch Prisma. Turning a
 * manifest into concrete Pages+Sections is the job of `instantiateTemplate`
 * (see `./instantiate.ts`), which resolves it against a {@link TemplateContext}
 * and validates every produced section through the `@saroh/block-contract` section
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
    /**
     * One line on what the business does. Until it has a field of its own
     * the API composes it from what the business already told Saroh (its
     * services or what it sells, and its town: `composeBusinessLine`), and
     * leaves it out when nothing true can be said.
     */
    description?: string;
    /** Public contact email, used to build "Contact us" CTAs. */
    contactEmail?: string;
    /** Canonical website URL, if the merchant has one. */
    websiteUrl?: string;
    /**
     * The business's switched-on module keys (`WEBSITE`, `APPOINTMENTS`, …),
     * so a template lays down a bound block only where its module is on
     * (DEC-057). Absent means not known: lay down nothing that needs one.
     */
    modules?: string[];
    /**
     * The business's services a new site may list, in order. A template
     * cannot invent an id, so a services list is laid down only from these.
     */
    serviceIds?: string[];
    /**
     * The business sells online (the Shop page's own gate:
     * Commerce rolled out and on and the shop open for it, and a location
     * that delivers or ships, DEC-069 L13). Absent means
     * not known: lay down nothing that sells.
     */
    sells?: boolean;
    /** At least one of its services is a class (more than one place). */
    hasClasses?: boolean;
    /**
     * Where the business is, as it would say it in a sentence: its town
     * ("Bengaluru"). Never a street or a postcode. Absent when it has
     * said nothing.
     */
    area?: string;
    /** It has a place with an address, so a Visit us block has one to show. */
    hasPlace?: boolean;
    /** It has a week of opening hours saved. */
    hasHours?: boolean;
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
    /** The section type — must have a registered contract in `@saroh/block-contract`. */
    type: SectionType;
    /** The contract version this section's content targets (starts at 1). */
    contractVersion: ContractVersion;
    /**
     * The section content: a literal object, or a builder that derives it from
     * the business profile. Validated through the section contract at
     * instantiation, so it can never reach the DB in an invalid shape.
     */
    content: TemplateContent;
    /**
     * Whether the section is laid down for this context. Absent means always.
     * A template that offers one of two blocks (the real Services, or
     * placeholder offers) names both, each with its condition; `order` counts
     * only the sections that are laid down.
     */
    when?: (ctx: TemplateContext) => boolean;
}

/** One page within a template. `order` of its sections is array position. */
export interface TemplatePage {
    /** URL path for the page, e.g. `/` or `/about`. */
    path: string;
    /** Human page title. */
    title: string;
    /** Marks the site's home page. At most one page should set this. */
    isHome?: boolean;
    /**
     * Put in the site's menu, in page order (UX-070). A new site starts
     * with a real menu, so Settings, the pre-publish check and the live
     * header all name the same one.
     */
    inMenu?: boolean;
    /** Ordered sections; array index becomes the persisted `order`. */
    sections: TemplateSection[];
    /**
     * Whether the page is laid down for this context. Absent means always.
     * For a page whose every section is bound to one module (a gym's
     * Timetable), so a business without it gets no page that would render
     * empty. Never on the home page: a site always has one.
     */
    when?: (ctx: TemplateContext) => boolean;
}

/**
 * The kinds of business a template is for: the waitlist's taxonomy
 * (`waitlist-keys.ts` in the API, `content/waitlist.ts` on saroh.in), so the
 * gallery's kind filter and the waitlist speak one vocabulary. An API spec
 * holds the two lists equal.
 */
export const TEMPLATE_KINDS = [
    "salon",
    "gym",
    "clinic",
    "coach",
    "food",
    "shop",
    "creator",
    "other",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** What a template's site is built around (the gallery's "shape" fact). */
export const TEMPLATE_SHAPES = [
    "store",
    "services",
    "journal",
    "portfolio",
    "docs",
] as const;
export type TemplateShape = (typeof TEMPLATE_SHAPES)[number];

/**
 * A look a template's site starts in (plan KTD-1): the `Site.style`
 * vocabulary — swatch keys per row and slider values — plus a font pair.
 * Choices, not CSS: the API validates it exactly as it validates a style the
 * merchant saves (`parseSiteStyle`), so a template cannot reach the page with
 * anything Website › Style could not have chosen. Absent fields keep the
 * default.
 */
export interface TemplateStyle {
    /** Swatch key per style row (`pageGround`, `text`, `accent`, …). */
    colours?: Readonly<Record<string, string>>;
    /** Slider values (`pageMargin`, `cornerRadius`, …). */
    scalars?: Readonly<Record<string, number>>;
    /** A key from `FONT_PAIRS` (`@saroh/block-contract`). */
    fontPair?: FontPairKey;
    /**
     * The design's own exact colours (DEC-090), `#RRGGBB` per `--site-*`
     * role; when present they replace the swatch rows' colours. Checked by
     * `parsePalette` (`@saroh/block-contract`): every text pairing 4.5:1.
     * A merchant reaches it only by choosing this colourway.
     */
    palette?: Readonly<SitePaletteInput>;
    /**
     * The design's type scale (DEC-090): display and body size, reading
     * width, section-title style. Bounded by `parseTypeScale`; not a
     * Website › Style control.
     */
    type?: Readonly<SiteTypeScale>;
}

/** One named colourway of a template, e.g. "Original" or "Night". */
export interface TemplateStylePreset {
    /** Stable within the template; recorded on the site (`Site.styleId`). */
    id: string;
    /** What the picker and Website › Style call it. */
    name: string;
    style: TemplateStyle;
}

/**
 * A versioned, declarative site template. `id@version` is the registry key —
 * a template evolves by publishing a NEW version alongside the old one, so
 * sites already built from an earlier version keep working.
 *
 * Everything after `pages` is optional metadata for the picker and the public
 * gallery (industry templates plan, U1). A template with none of it is still
 * a complete template: it creates a site in the default look, as every
 * template did before.
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
    /** The gallery's URL segment (`/templates/<slug>`); defaults to `id`. */
    slug?: string;
    /** The kinds of business it is offered to first. */
    kinds?: readonly TemplateKind[];
    /** What the site is built around. */
    shape?: TemplateShape;
    /** The sample business its renders show, e.g. a bakery and its address. */
    sample?: { name: string; host: string };
    /**
     * The module keys (`COMMERCE`, `APPOINTMENTS`, …) its sections need to
     * show their real data. Words for the gallery ("uses Products"); turning
     * a module on is still the merchant's choice.
     */
    uses?: readonly string[];
    /**
     * Its colourways, the default FIRST. A site made from the template starts
     * in the first, or the one asked for by id. Absent: the default look.
     */
    styles?: readonly TemplateStylePreset[];
    /**
     * The site's footer as it starts (industry templates, polish pass): a
     * short line the design sets beside the name — "14 Hill Road, Bandra
     * West · Closed Mondays" — and how the footer is laid out. Written to
     * `Site.footer` at creation as plain text, where the owner rewrites it in
     * Site settings like any footer; it is sample text, like a template's
     * headings, so a pre-publish check can tell it is still the template's
     * by comparing it with this. Absent: no footer is written, and the site
     * ends in its name (and "Made with Saroh" on Free, DEC-102).
     */
    footer?: TemplateFooter;
    /**
     * The module pages a site made from the template starts with, each only
     * where its condition holds (starter v4, DEC-141): Shop, Book, Prices,
     * Contact. They are not laid down from `pages`: the API makes each one
     * through the path that adds a module page by hand or when a module is
     * switched on (`addModulePageIfMissing`), so a site made today and a
     * site whose business turns the module on next month hold the same
     * page. Absent: none, as every template before v4.
     */
    modulePages?: readonly TemplateModulePage[];
}

/** The module page kinds a template may start a site with, in menu order. */
export const TEMPLATE_MODULE_PAGE_KINDS = [
    "SHOP",
    "BOOK",
    "PRICES",
    "CONTACT",
] as const;
export type TemplateModulePageKind =
    (typeof TEMPLATE_MODULE_PAGE_KINDS)[number];

/** One module page a template asks for. See `TemplateManifest.modulePages`. */
export interface TemplateModulePage {
    kind: TemplateModulePageKind;
    /** Whether this business gets it. Absent means always. */
    when?: (ctx: TemplateContext) => boolean;
}

/** The module page kinds a template asks for, for this business. */
export function templateModulePageKinds(
    template: Pick<TemplateManifest, "modulePages">,
    ctx: TemplateContext,
): TemplateModulePageKind[] {
    return (template.modulePages ?? [])
        .filter((page) => !page.when || page.when(ctx))
        .map((page) => page.kind);
}

/** A template's starting footer. See {@link TemplateManifest.footer}. */
export interface TemplateFooter {
    /** One line, plain text; no line breaks. */
    line?: string;
    /** `left` for the designs' row; absent or `centre` for today's line. */
    layout?: "centre" | "left";
    /**
     * Lines this version started sites with before `line` was reworded (a
     * copy fix, not a new design). Never written to a new site; kept so the
     * pre-publish check still knows a footer nobody changed from one of
     * them is the template's words, not the owner's.
     */
    formerLines?: readonly string[];
    /**
     * A line worked out from the business itself (starter v4): what it does
     * and where, in its own names. Used when `line` is absent. It is the
     * business's own facts, not the template's words, so the pre-publish
     * check does not name it; nothing is written when it returns none.
     */
    lineFrom?: (ctx: TemplateContext) => string | undefined;
}

/** The footer line a site made from the template starts with, if any. */
export function templateFooterLineFor(
    template: Pick<TemplateManifest, "footer">,
    ctx: TemplateContext,
): string | undefined {
    const footer = template.footer;
    if (!footer) return undefined;
    const line = (footer.line ?? footer.lineFrom?.(ctx) ?? "").trim();
    return line === "" ? undefined : line;
}

/**
 * The colourway a new site starts in: the one asked for, else the first.
 * `undefined` when the template has none (the site keeps the default look),
 * and `null` when an id was asked for that the template does not have — the
 * caller refuses that, rather than silently giving a different look.
 */
export function templateStylePreset(
    template: Pick<TemplateManifest, "styles">,
    styleId?: string,
): TemplateStylePreset | null | undefined {
    const styles = template.styles ?? [];
    if (styleId === undefined) return styles[0];
    return styles.find((s) => s.id === styleId) ?? null;
}

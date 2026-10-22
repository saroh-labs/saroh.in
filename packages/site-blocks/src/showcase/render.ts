import type { LookId } from "@saroh/block-contract";
import { inPageNavigation, siteStyleVariables } from "@saroh/block-contract";
import type {
    InstantiatedTemplate,
    TemplateContext,
    TemplateManifest,
    TemplateModulePageKind,
} from "@saroh/templates";
import {
    getTemplate,
    instantiateTemplate,
    listTemplates,
    LOOK_SHOWCASE_PALETTE,
    LOOK_SHOWCASE_TEMPLATE,
    presetSiteStyle,
    STARTER_TEMPLATE_ID,
    templateFooterLineFor,
    templateModulePageKinds,
    templateStylePreset,
    withGallerySample,
    withLookShowcase,
} from "@saroh/templates";
import type { JournalFeed } from "../blocks/journal";
import type { PacksFeed } from "../blocks/packs";
import type { PlansFeed } from "../blocks/plans";
import type { ProductGridFeed } from "../blocks/product-grid";
import type { ShopListingCard } from "../product/shop-listing";
import type { Section } from "../section-renderer";
import type { SiteFooterContent } from "../site-chrome";
import type { SiteFixtures } from "../site-fixtures";
import type { SiteHeaderAction, SiteNavItem } from "../site-header-menu";

import type { BriefColours } from "./brief-image";
import { briefImage, hslOf } from "./brief-image";
import type { TemplateFixture } from "./fixtures";
import {
    FIXTURE_NOW,
    FIXTURE_TIME_ZONE,
    STARTER_SAMPLES,
    TEMPLATE_FIXTURES,
} from "./fixtures";

/**
 * One page of a gallery template, ready to draw (industry templates U14):
 * the template instantiated for its sample business exactly as a new site
 * is (`instantiateTemplate`, every module it uses on), its colourway
 * resolved to `--site-*` variables by the same function publishing uses
 * (`siteStyleVariables`, `@saroh/block-contract`), the header's menu and
 * button and the footer as a published site's would be, and every bound
 * block's data from the sample business (`fixtures.ts`) instead of the API.
 *
 * Pure and synchronous: the page draws it, and `render.test.ts` holds every
 * gallery template's every page and colourway to building cleanly.
 *
 * Shared (`@saroh/site-blocks/showcase`, DEC-182) by the gallery's
 * `/template-renders` (`apps/saroh.app`) and a look's Preview in the
 * editor (`apps/app.saroh.in`, `look-preview.tsx`), which draws each
 * look's showcase template (`LOOK_SHOWCASE_TEMPLATE`) from it. No API, no
 * clock, nothing written.
 */

/** A template the gallery shows (KTD-6): the gallery's own rule. */
export function isGalleryTemplate(t: TemplateManifest): boolean {
    return (t.kinds?.length ?? 0) > 0 && t.sample !== undefined;
}

export function galleryTemplates(): TemplateManifest[] {
    return listTemplates().filter(isGalleryTemplate);
}

/** A page's name in a capture's file name: `/` is `home`, `/a/b` is `a-b`. */
export function pageFileName(path: string): string {
    const name = path.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
    return name === "" ? "home" : name;
}

/**
 * A sample business's email: its host's first label at example.com
 * ("kesarsalon.saroh.app" → "kesarsalon@example.com"), as every seeded
 * business and customer is addressed.
 */
export function sampleEmail(host: string): string {
    return `${host.split(".")[0]}@example.com`;
}

/** The sample business's profile, as `instantiateTemplate` reads it. */
export function sampleContext(
    template: TemplateManifest,
    fixture: TemplateFixture | undefined = TEMPLATE_FIXTURES[template.id],
): TemplateContext {
    const sample = template.sample ?? { name: template.name, host: "" };
    return {
        organizationName: sample.name,
        // Every module it uses on, as the gallery lays it out.
        modules: ["WEBSITE", ...(template.uses ?? [])],
        // Named for the sample, on example.com (reserved, never delivered):
        // never an address that could be somebody's real inbox.
        ...(sample.host ? { contactEmail: sampleEmail(sample.host) } : {}),
        ...fixture?.context,
    };
}

/** What `/template-renders` lists, for the capture script. */
export interface TemplateRenderEntry {
    id: string;
    slug: string;
    name: string;
    styles: { id: string; name: string }[];
    pages: { path: string; title: string; file: string }[];
}

export function templateRenderIndex(): TemplateRenderEntry[] {
    return galleryTemplates().map((t) => ({
        id: t.id,
        slug: t.slug ?? t.id,
        name: t.name,
        styles: (t.styles ?? []).map((s) => ({ id: s.id, name: s.name })),
        pages: instantiateTemplate(t, sampleContext(t)).pages.map((p) => ({
            path: p.path,
            title: p.title,
            file: pageFileName(p.path),
        })),
    }));
}

export interface TemplateRender {
    templateId: string;
    styleId: string | null;
    /** The sample business's name: the header's and the footer's. */
    name: string;
    styleVariables: Record<string, string>;
    /**
     * The look it is drawn in (DEC-172, U16), for the editor's Look row
     * pictures; null for Classic.
     */
    look: LookId | null;
    navigation: SiteNavItem[];
    action: SiteHeaderAction | null;
    shopServes: boolean;
    footer: SiteFooterContent | null;
    sections: Section[];
    journal?: JournalFeed;
    plans?: PlansFeed;
    packs?: PacksFeed;
    productGrids: (ProductGridFeed | undefined)[];
    fixtures: SiteFixtures;
}

/** What a render is drawn from: a template, and the business it is for. */
interface RenderSample {
    template: TemplateManifest;
    /** The sample business's name: the header's and the footer's. */
    name: string;
    context: TemplateContext;
    fixture: TemplateFixture | undefined;
    /** The page entries of the site's menu, after its section entries. */
    menu: (built: InstantiatedTemplate) => SiteNavItem[];
    /**
     * Whether each empty photo slot is drawn as its brief. The gallery
     * does, to show what the design is for. The starter does not: its
     * renders are a site on its first day, when it has no photograph, so a
     * slot draws nothing and a product has no picture, as on the live site.
     */
    briefsAsPhotos: boolean;
}

/** The titles the module pages start with (`page-kinds.ts` in the API). */
const MODULE_PAGE_ENTRIES: Record<
    TemplateModulePageKind,
    { label: string; href: string }
> = {
    SHOP: { label: "Shop", href: "/shop" },
    BOOK: { label: "Book", href: "/book" },
    PRICES: { label: "Prices", href: "/prices" },
    CONTACT: { label: "Contact", href: "/contact" },
};

/**
 * The menu a starter site is made with (`site-create.ts`): Home, what the
 * business offers (Shop, Book, Prices), its other pages, Contact last.
 */
function starterMenu(
    template: TemplateManifest,
    context: TemplateContext,
    built: InstantiatedTemplate,
): SiteNavItem[] {
    const kinds = templateModulePageKinds(template, context);
    const entry = (kind: TemplateModulePageKind): SiteNavItem => ({
        ...MODULE_PAGE_ENTRIES[kind],
        kind,
    });
    const pages = built.pages.filter((p) => p.inMenu ?? !p.isHome);
    const item = (p: (typeof pages)[number]): SiteNavItem => ({
        label: p.title,
        href: p.path,
    });
    return [
        ...pages.filter((p) => p.isHome).map(item),
        ...kinds.filter((k) => k !== "CONTACT").map(entry),
        ...pages.filter((p) => !p.isHome).map(item),
        ...kinds.filter((k) => k === "CONTACT").map(entry),
    ];
}

/**
 * The sample a render id names: a gallery template (its one sample
 * business), or one of the starter's (`STARTER_SAMPLES`: `starter` for a
 * business with nothing switched on, `starter-shop`, `starter-salon`), which
 * are drawn from the starter new sites start from. Null for anything else.
 */
function renderSample(templateId: string): RenderSample | null {
    const starter = STARTER_SAMPLES[templateId];
    if (starter) {
        const template = getTemplate(STARTER_TEMPLATE_ID);
        if (!template) return null;
        const context: TemplateContext = {
            organizationName: starter.name,
            ...starter.context,
        };
        return {
            template,
            name: starter.name,
            context,
            fixture: starter.fixture,
            menu: (built) => starterMenu(template, context, built),
            briefsAsPhotos: false,
        };
    }
    const template = galleryTemplates().find((t) => t.id === templateId);
    if (!template) return null;
    return {
        template,
        name: template.sample?.name ?? template.name,
        context: sampleContext(template),
        fixture: TEMPLATE_FIXTURES[template.id],
        menu: () => [],
        briefsAsPhotos: true,
    };
}

/**
 * Build one page. `null` when the id names neither a gallery template nor a
 * starter sample, the template has no such colourway, or it lays down no
 * page at `path` for its sample business. `styleId` absent: the first
 * colourway (or none, for a template without). `look` absent: Classic;
 * otherwise the colourway in that look, its colours made safe as
 * publishing makes them (DEC-172, U16).
 */
export function templateRender(
    templateId: string,
    styleId: string | undefined,
    path: string,
    look?: LookId,
): TemplateRender | null {
    const sample = renderSample(templateId);
    if (!sample) return null;
    const { template, fixture, context } = sample;
    const preset = templateStylePreset(template, styleId);
    if (preset === null) return null;

    // A look's Preview draws its board's pages and colours (DEC-182, the
    // DEC-172 amendment of 22 Oct), its showcase template's only.
    const showcase =
        look !== undefined && LOOK_SHOWCASE_TEMPLATE[look] === template.id;
    const made = instantiateTemplate(template, context);
    const built = showcase ? withLookShowcase(look, made) : made;
    const page = built.pages.find((p) => p.path === path);
    if (!page) return null;
    const home = built.pages.find((p) => p.isHome) ?? page;

    const preStyle = presetSiteStyle(
        showcase
            ? { ...preset?.style, palette: LOOK_SHOWCASE_PALETTE[look], look }
            : (preset?.style ?? {}),
    );
    const styleVariables = siteStyleVariables(
        look ? { ...preStyle, look } : preStyle,
    );
    const colours: BriefColours = {
        ground: hslOf(styleVariables["--site-border"], "#e7e5e4"),
        ink: hslOf(styleVariables["--site-muted"], "#57534e"),
    };

    const sections: Section[] = page.sections.map((s, i) => {
        // The design's sample words over its placeholders (KTD-6).
        const content = withGallerySample(
            template.id,
            page.path,
            page.sections,
            i,
            { ...(s.content as Record<string, unknown>) },
        );
        // A real site's message form gets its Form when the site is made
        // (`site-create.ts`). A sample has none, and the block draws nothing
        // without one, so the sample names a form that is never sent.
        if (s.type === "enquiry" && !content.formId) {
            content.formId = "sample-form";
        }
        return {
            type: s.type,
            content: sample.briefsAsPhotos
                ? drawBriefs(content, colours, s.type)
                : content,
        };
    });

    // What the sample business has on: the template's own list, or, for the
    // starter, the modules of the business it is drawn for.
    const uses = template.uses ?? context.modules ?? [];
    const services = fixture?.services ?? [];
    const books = uses.includes("APPOINTMENTS") && services.length > 0;
    const sells =
        uses.includes("COMMERCE") && (fixture?.products ?? []).length > 0;
    const action: SiteHeaderAction | null =
        books || (uses.includes("APPOINTMENTS") && fixture?.timetable)
            ? { label: "Book", href: "/book" }
            : sells
              ? { label: "Order", href: "/shop" }
              : null;

    return {
        templateId: template.id,
        styleId: preset?.id ?? null,
        name: sample.name,
        styleVariables,
        look: look ?? null,
        // A gallery template's site has no menu of its own yet: what it
        // publishes with is its home page's labelled sections
        // (`withInPageNavigation`). The starter starts with a real menu of
        // its pages (`sample.menu`), which those sections lead.
        navigation: [...inPageNavigation(home.sections), ...sample.menu(built)],
        action,
        shopServes: sells,
        footer: footerOf(template, fixture, context),
        sections,
        journal: fixture?.posts
            ? {
                  posts: fixture.posts.map(({ brief, ...post }) => ({
                      ...post,
                      ...(brief ? { image: briefImage(brief, colours) } : {}),
                  })),
                  basePath: "/blog",
              }
            : undefined,
        plans: fixture?.plans
            ? { plans: fixture.plans, joinHref: "/contact#enquiry" }
            : undefined,
        packs: fixture?.packs
            ? {
                  packs: fixture.packs,
                  payOnline: false,
                  askHref: "/contact#enquiry",
              }
            : undefined,
        productGrids: sections.map((s) =>
            s.type === "productGrid" && fixture?.products
                ? {
                      products: fixture.products.map((p) =>
                          productCard(
                              p,
                              colours,
                              // Plates set the name over the photo's foot.
                              (s.content as { variant?: unknown }).variant ===
                                  "plates"
                                  ? "upper"
                                  : "centre",
                              sample.briefsAsPhotos,
                          ),
                      ),
                      basePath: "/shop",
                  }
                : undefined,
        ),
        fixtures: {
            services: fixture?.services,
            visit: fixture?.visit
                ? {
                      source: "business",
                      storeId: null,
                      name: sample.name,
                      timezone: FIXTURE_TIME_ZONE,
                      ...fixture.visit,
                  }
                : undefined,
            timetable: fixture?.timetable,
            today: fixture?.today,
            // A fixed weekday morning, not the clock (`fixtures.ts`).
            now: FIXTURE_NOW,
        },
    };
}

/**
 * The footer a site made from the template starts with (`site-create.ts`),
 * its line the sample business's (`fixture.footer`) where the template
 * leaves one for the owner to write.
 */
function footerOf(
    template: TemplateManifest,
    fixture: TemplateFixture | undefined,
    context: TemplateContext,
): SiteFooterContent | null {
    const footer = template.footer;
    if (!footer) return null;
    // The template's own line, or the one it works out from the business
    // (the starter's, `footer.lineFrom`).
    const line = (
        fixture?.footer ??
        templateFooterLineFor(template, context) ??
        ""
    ).trim();
    const layout = footer.layout ?? "centre";
    if (line === "" && layout === "centre") return null;
    return { format: "markdown", value: line, layout };
}

function productCard(
    p: NonNullable<TemplateFixture["products"]>[number],
    colours: BriefColours,
    placement: "centre" | "upper",
    /** Draw its photograph as the brief; false, it has none yet. */
    photo = true,
): ShopListingCard {
    return {
        slug: p.slug,
        name: p.name,
        currency: "INR",
        price: p.price,
        mrp: null,
        priceFrom: false,
        image: photo
            ? {
                  url: briefImage(
                      p.brief,
                      colours,
                      { width: 1000, height: 1000 },
                      placement,
                  ),
                  alt: p.brief,
              }
            : null,
        variantTitles: [],
        blurb: p.blurb,
        soldOut: p.soldOut ?? false,
    };
}

/** How each kind of slot is shaped, roughly, so its words fit the crop. */
const SLOT_SIZES: Readonly<
    Partial<Record<string, { width: number; height: number }>>
> = {
    hero: { width: 1600, height: 1000 },
    person: { width: 800, height: 1000 },
};

/** A full-bleed hero's photo: the band's own shape on a computer. */
const FULL_BLEED_SIZE = { width: 1600, height: 840 } as const;

/**
 * Every image slot that has only a brief (KTD-5) given the brief as its
 * picture: the live site draws nothing there, the gallery shows what the
 * photograph will be. Recurses, so a project's or a gallery's briefs are
 * drawn too. Gallery only.
 */
export function drawBriefs(
    value: unknown,
    colours: BriefColours,
    type: string,
): unknown {
    if (Array.isArray(value)) {
        return value.map((v) => drawBriefs(v, colours, type));
    }
    if (typeof value !== "object" || value === null) return value;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
        out[key] = drawBriefs(v, colours, type);
    }
    const brief =
        typeof out.imageBrief === "string" ? out.imageBrief.trim() : "";
    if (!brief) return out;
    // Words are set over a full-bleed hero's photo, low down: keep the
    // brief at the top, clear of them. Shaped as the band is on a computer
    // (1440 by at most 760), so the picture is not cropped there and the
    // brief's top stays below the header drawn over it.
    const over = type === "hero" && out.variant === "fullBleed";
    const size = over
        ? FULL_BLEED_SIZE
        : (SLOT_SIZES[type] ?? { width: 1200, height: 900 });
    const image = {
        src: briefImage(brief, colours, size, over ? "top" : "centre"),
        alt: brief,
        ...size,
    };
    if (Array.isArray(out.images)) {
        if (out.images.length === 0) out.images = [image];
    } else if (!(out.image as { src?: unknown } | undefined)?.src) {
        out.image = image;
    }
    return out;
}

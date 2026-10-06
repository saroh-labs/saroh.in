import { inPageNavigation, siteStyleVariables } from "@saroh/block-contract";
import type {
    JournalFeed,
    PacksFeed,
    PlansFeed,
    ProductGridFeed,
    Section,
    ShopListingCard,
    SiteFixtures,
    SiteFooterContent,
    SiteHeaderAction,
    SiteNavItem,
} from "@saroh/site-blocks";
import type { TemplateContext, TemplateManifest } from "@saroh/templates";
import {
    instantiateTemplate,
    listTemplates,
    presetSiteStyle,
    templateStylePreset,
} from "@saroh/templates";

import type { BriefColours } from "./brief-image";
import { briefImage, hslOf } from "./brief-image";
import type { TemplateFixture } from "./fixtures";
import { FIXTURE_TIME_ZONE, TEMPLATE_FIXTURES } from "./fixtures";

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
        // An address only on the sample's own saroh.app host: never one
        // that could be somebody's real inbox.
        ...(sample.host.endsWith(".saroh.app")
            ? { contactEmail: `hello@${sample.host}` }
            : {}),
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

/**
 * Build one page. `null` when the template is not in the gallery, has no
 * such colourway, or lays down no page at `path` for its sample business.
 * `styleId` absent: the first colourway (or none, for a template without).
 */
export function templateRender(
    templateId: string,
    styleId: string | undefined,
    path: string,
): TemplateRender | null {
    const template = galleryTemplates().find((t) => t.id === templateId);
    if (!template) return null;
    const preset = templateStylePreset(template, styleId);
    if (preset === null) return null;

    const fixture = TEMPLATE_FIXTURES[template.id];
    const built = instantiateTemplate(template, sampleContext(template));
    const page = built.pages.find((p) => p.path === path);
    if (!page) return null;
    const home = built.pages.find((p) => p.isHome) ?? page;

    const styleVariables = siteStyleVariables(
        presetSiteStyle(preset?.style ?? {}),
    );
    const colours: BriefColours = {
        ground: hslOf(styleVariables["--site-border"], "#e7e5e4"),
        ink: hslOf(styleVariables["--site-muted"], "#57534e"),
    };

    const sections: Section[] = page.sections.map((s, i) => ({
        type: s.type,
        content: drawBriefs(
            patched(fixture, page.path, s.type, nthOfType(page.sections, i), {
                ...(s.content as Record<string, unknown>),
            }),
            colours,
            s.type,
        ),
    }));

    const uses = template.uses ?? [];
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
        name: template.sample?.name ?? template.name,
        styleVariables,
        // A new site has no menu of its own yet: what it publishes with is
        // its home page's labelled sections (`withInPageNavigation`).
        navigation: inPageNavigation(home.sections),
        action,
        shopServes: sells,
        footer: footerOf(template),
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
                          productCard(p, colours),
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
                      name: template.sample?.name ?? template.name,
                      timezone: FIXTURE_TIME_ZONE,
                      ...fixture.visit,
                  }
                : undefined,
            timetable: fixture?.timetable,
        },
    };
}

/** The footer a site made from the template starts with (`site-create.ts`). */
function footerOf(template: TemplateManifest): SiteFooterContent | null {
    const footer = template.footer;
    if (!footer) return null;
    const line = (footer.line ?? "").trim();
    const layout = footer.layout ?? "centre";
    if (line === "" && layout === "centre") return null;
    return { format: "markdown", value: line, layout };
}

function nthOfType(sections: readonly { type: string }[], index: number) {
    const type = sections[index]?.type;
    return sections.slice(0, index).filter((s) => s.type === type).length;
}

function patched(
    fixture: TemplateFixture | undefined,
    path: string,
    type: string,
    nth: number,
    content: Record<string, unknown>,
): Record<string, unknown> {
    let out = content;
    for (const p of fixture?.patches ?? []) {
        if (p.page === path && p.type === type && (p.nth ?? 0) === nth) {
            out = p.patch(out);
        }
    }
    return out;
}

function productCard(
    p: NonNullable<TemplateFixture["products"]>[number],
    colours: BriefColours,
): ShopListingCard {
    return {
        slug: p.slug,
        name: p.name,
        currency: "INR",
        price: p.price,
        mrp: null,
        priceFrom: false,
        image: {
            url: briefImage(p.brief, colours, { width: 1000, height: 1000 }),
            alt: p.brief,
        },
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
    const size = SLOT_SIZES[type] ?? { width: 1200, height: 900 };
    // Words are set over a full-bleed hero's photo, low down: keep the
    // brief at the top, clear of them.
    const over = type === "hero" && out.variant === "fullBleed";
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

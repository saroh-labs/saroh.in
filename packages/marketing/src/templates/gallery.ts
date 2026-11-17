import type { SiteFontPair, TemplateManifest } from "@saroh/templates";
import {
    findFontPair,
    instantiateTemplate,
    listTemplates,
} from "@saroh/templates";

/**
 * The website templates gallery's data, shared by saroh.in (`/templates`)
 * and saroh.tech (`/website-templates`) (owner, 16 Nov 2026): built from
 * `@saroh/templates`, the same manifests a new site is created from, so a
 * gallery can only show a template a merchant can actually pick (KTD-6, R2).
 * Each site passes its address and, where it has them, each page's 2×
 * renders; a page without one is drawn from the template's data. The words
 * around it are each site's own. No price, plan or limit is ever written
 * here (the repo is public).
 */

/** The kinds of business a template is for (the waitlist's kinds but "other"). */
export type GalleryKind =
    "salon" | "gym" | "clinic" | "coach" | "food" | "shop" | "creator";

export interface TemplateShot {
    /** Under the site's `public/`, e.g. `/templates/gym/home-desktop.webp`. */
    src: string;
    width: number;
    height: number;
}

export interface TemplatePageShots {
    desktop?: TemplateShot;
    phone?: TemplateShot;
}

/** Where a site's gallery lives, and the renders it has: slug, then page path. */
export interface GallerySite {
    base: string;
    shots?: Readonly<
        Partial<
            Record<string, Readonly<Partial<Record<string, TemplatePageShots>>>>
        >
    >;
}

/** The gallery's kind chips, in the design's order: the waitlist's kinds by the gallery's names. */
export const GALLERY_KINDS: readonly {
    id: GalleryKind;
    label: string;
}[] = [
    { id: "salon", label: "Salons" },
    { id: "gym", label: "Gyms & studios" },
    { id: "clinic", label: "Clinics" },
    { id: "coach", label: "Dieticians & coaches" },
    { id: "food", label: "Bakeries & food" },
    { id: "shop", label: "Shops" },
    { id: "creator", label: "Creators" },
];

/** Where the gallery renames a template (the design's "Templates" page). */
const GALLERY_NAMES: Readonly<Partial<Record<string, string>>> = {
    studio: "Portfolio",
};

/** The design's order; a gallery template not named here follows, in registry order. */
const GALLERY_ORDER = [
    "bakery",
    "salon",
    "gym",
    "clinic",
    "store",
    "dietician",
    "blogs",
    "studio",
    "developer",
];

/** The detail page's h1 after the name: "Gym: the week's classes, first." */
const IDEAS: Readonly<Partial<Record<string, string>>> = {
    bakery: "what's out of the oven today",
    gym: "the week's classes, first",
    store: "a small collection, given room",
    dietician: "a calm page that leads to a first appointment",
    blogs: "your writing, newest first",
    studio: "the work first, the biggest project at the top",
    developer: "your work, your rates and when you're free",
    salon: "who's free today, and what it costs",
    clinic: "the next appointment, and what a treatment involves",
};

/**
 * The colours a card and the detail page draw the template in until its
 * 2× renders exist: the design's own swatches for its first colourway
 * (`saroh-designs/templates`). A manifest colourway with an exact palette
 * (DEC-090) is used instead, so the drawing follows the template once it
 * carries one.
 */
export interface PreviewColours {
    paper: string;
    surface: string;
    ink: string;
    muted: string;
    accent: string;
}

const DESIGN_COLOURS: Readonly<Partial<Record<string, PreviewColours>>> = {
    bakery: {
        paper: "#FBF7EF",
        surface: "#F6EEDF",
        ink: "#2A1F14",
        muted: "#7A6449",
        accent: "#8A3324",
    },
    gym: {
        paper: "#0B0B0A",
        surface: "#171715",
        ink: "#F2F2EE",
        muted: "#ACAAA2",
        accent: "#D7FF3E",
    },
    store: {
        paper: "#F4F1E8",
        surface: "#EAE6DB",
        ink: "#1A1815",
        muted: "#6E685E",
        accent: "#1F3D2B",
    },
    dietician: {
        paper: "#FBFAF6",
        surface: "#EDF2EC",
        ink: "#1C2620",
        muted: "#47564D",
        accent: "#2F6B4F",
    },
    blogs: {
        paper: "#FCFBF8",
        surface: "#EDE7DB",
        ink: "#1A1714",
        muted: "#635C54",
        accent: "#9C2A18",
    },
    studio: {
        paper: "#F7F7F6",
        surface: "#E8E8E6",
        ink: "#131313",
        muted: "#575756",
        accent: "#131313",
    },
    developer: {
        paper: "#FAFAF9",
        surface: "#EFEFEC",
        ink: "#17181A",
        muted: "#6B6D73",
        accent: "#1E6B3F",
    },
};

/** A neutral drawing for a gallery template the table above doesn't know yet. */
const NEUTRAL_COLOURS: PreviewColours = {
    paper: "#FAFAF9",
    surface: "#EFEFEC",
    ink: "#17181A",
    muted: "#6B6D73",
    accent: "#17181A",
};

/**
 * What a template runs on, in the words the product uses (Settings ›
 * Modules), from the manifest's `uses`. `WEBSITE` is every site's, so it is
 * named only where it means the business's posts (a journal). A module
 * missing here fails the content test rather than showing its key.
 * `CLASS_PACKS` is left out everywhere here: no plan offers it for now
 * (DEC-099), so no gallery page says it or draws what needs it.
 */
export const USES_WORDS: Readonly<Partial<Record<string, string>>> = {
    COMMERCE: "Products",
    APPOINTMENTS: "Bookings",
    PAYMENTS: "Payments",
    SUBSCRIPTIONS: "Memberships",
    CRM: "Enquiries",
};

/** One page of a template, drawn as its sections. */
export interface PreviewSection {
    type: string;
    /** The section's own heading, as the template lays it down. */
    heading?: string;
    /** A line under it (a subheading, or the first words of its text). */
    line?: string;
    /** How many items it lays down; bound blocks draw a fixed few. */
    items: number;
}

export interface PreviewPage {
    path: string;
    title: string;
    sections: PreviewSection[];
}

/** A gallery template, as the pages draw it. Plain data: it crosses to client components. */
export interface GalleryTemplate {
    id: string;
    slug: string;
    /** The site's gallery address and the slug: `/templates/<slug>`. */
    href: string;
    name: string;
    idea: string;
    description: string;
    kinds: GalleryKind[];
    /** The card's kind line: its first kind's chip name. */
    kindLabel: string;
    shape: string;
    sample: { name: string; host: string };
    uses: string[];
    /** The type pair's name ("Fraunces and Inter Tight"). */
    type: string;
    fonts: { heading: string; body: string };
    colourways: string[];
    /** Each colourway's accent, where it carries a palette: the preview's swatches. */
    swatches: string[];
    colours: PreviewColours;
    pages: PreviewPage[];
    /** Each page's 2× render where the site has one, by path: else it is drawn. */
    shots: Readonly<Partial<Record<string, TemplatePageShots>>>;
}

/**
 * Whether a manifest carries what the gallery shows (KTD-6): the kinds of
 * business it is for and a sample business. The API saves a waitlist
 * template by the same rule (`WAITLIST_TEMPLATES` in `waitlist-keys.ts`).
 */
export function isGalleryTemplate(t: TemplateManifest): boolean {
    return (t.kinds?.length ?? 0) > 0 && t.sample !== undefined;
}

const KIND_LABEL = new Map(GALLERY_KINDS.map((k) => [k.id, k.label]));

function galleryKinds(t: TemplateManifest): GalleryTemplate["kinds"] {
    return (t.kinds ?? []).filter((k): k is GalleryTemplate["kinds"][number] =>
        KIND_LABEL.has(k as never),
    );
}

function previewColours(t: TemplateManifest, slug: string): PreviewColours {
    const palette = t.styles?.[0]?.style.palette;
    if (palette) {
        return {
            paper: palette.bg,
            surface: palette.surface ?? palette.bg,
            ink: palette.fg,
            muted: palette.muted ?? palette.body ?? palette.fg,
            accent: palette.accent,
        };
    }
    return DESIGN_COLOURS[slug] ?? NEUTRAL_COLOURS;
}

function offeredUses(t: TemplateManifest): string[] {
    return (t.uses ?? []).filter((key) => key !== "CLASS_PACKS");
}

function usesWords(t: TemplateManifest, pages: PreviewPage[]): string[] {
    const words = offeredUses(t).flatMap((key) => {
        if (key === "WEBSITE") {
            const journal = pages.some((p) =>
                p.sections.some((s) => s.type === "journal"),
            );
            return journal ? ["Posts"] : [];
        }
        return [USES_WORDS[key] ?? key];
    });
    return Array.from(new Set(words));
}

/** How many tiles a block bound to the business's own data is drawn with. */
const BOUND_ITEMS: Readonly<Partial<Record<string, number>>> = {
    productGrid: 4,
    journal: 3,
    timetable: 5,
    plans: 3,
    packs: 2,
    servicesList: 3,
    hours: 3,
};

const TEXT_KEYS = ["subheading", "description", "body", "bio", "role", "value"];

function plain(html: string): string {
    return (
        html
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&#39;|&rsquo;/g, "'")
            // Last, so an escaped entity ("&amp;#39;") isn't decoded twice.
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim()
    );
}

function clip(text: string, max: number): string {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,.;:]$/, "")}…`;
}

function previewSection(type: string, content: unknown): PreviewSection {
    const c = (content ?? {}) as Record<string, unknown>;
    if (typeof c.value === "string") {
        // Rich text: its first heading, then the words after it.
        const match = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(c.value);
        const rest = match ? c.value.replace(match[0], " ") : c.value;
        return {
            type,
            heading: match ? clip(plain(match[1]), 90) : undefined,
            line: plain(rest) ? clip(plain(rest), 140) : undefined,
            items: 0,
        };
    }
    const heading = ["heading", "title", "name", "label"]
        .map((k) => c[k])
        .find((v): v is string => typeof v === "string" && v.trim() !== "");
    const text = TEXT_KEYS.map((k) => c[k]).find(
        (v): v is string => typeof v === "string" && plain(v) !== "",
    );
    const list = Object.values(c).find(Array.isArray) as unknown[] | undefined;
    return {
        type,
        heading: heading ? clip(plain(heading), 90) : undefined,
        line: text ? clip(plain(text), 140) : undefined,
        items: Math.min(list?.length ?? BOUND_ITEMS[type] ?? 0, 6),
    };
}

/**
 * The template's pages as its sample business gets them: laid down by
 * `instantiateTemplate` with every module it uses switched on, so no page
 * that needs one is left out.
 */
function previewPages(t: TemplateManifest): PreviewPage[] {
    const sample = t.sample ?? { name: t.name, host: "" };
    const built = instantiateTemplate(t, {
        organizationName: sample.name,
        modules: ["WEBSITE", ...offeredUses(t)],
    });
    return built.pages.map((p) => ({
        path: p.path,
        title: p.title,
        sections: p.sections.map((s) => previewSection(s.type, s.content)),
    }));
}

function toGallery(t: TemplateManifest, site: GallerySite): GalleryTemplate {
    const slug = t.slug ?? t.id;
    const kinds = galleryKinds(t);
    const firstKind = kinds.at(0);
    const pair = findFontPair(t.styles?.[0]?.style.fontPair);
    const pages = previewPages(t);
    return {
        id: t.id,
        slug,
        href: `${site.base}/${slug}`,
        name: GALLERY_NAMES[t.id] ?? t.name,
        idea: IDEAS[slug] ?? (t.description ?? "").split(":")[0],
        description: t.description ?? "",
        kinds,
        kindLabel: firstKind ? (KIND_LABEL.get(firstKind) ?? "") : "",
        shape: t.shape ?? "",
        sample: t.sample ?? { name: t.name, host: "" },
        uses: usesWords(t, pages),
        type: pair?.name ?? "Your visitor's system font",
        fonts: {
            heading: pair ? fontStack(pair.heading) : "inherit",
            body: pair ? fontStack(pair.body) : "inherit",
        },
        colourways: (t.styles ?? []).map((s) => s.name),
        swatches: (t.styles ?? []).flatMap((s) =>
            s.style.palette?.accent ? [s.style.palette.accent] : [],
        ),
        colours: previewColours(t, slug),
        pages,
        shots: site.shots?.[slug] ?? {},
    };
}

/** A face's CSS stack: the family by name, then its fallback (nothing is fetched). */
function fontStack(face: SiteFontPair["heading"]): string {
    return face.family ? `"${face.family}", ${face.fallback}` : face.fallback;
}

const caches = new Map<string, GalleryTemplate[]>();

/** The gallery's templates, in the design's order, at a site's address. */
export function galleryTemplates(site: GallerySite): GalleryTemplate[] {
    const hit = caches.get(site.base);
    if (hit) return hit;
    const shown = listTemplates()
        .filter(isGalleryTemplate)
        .map((t) => toGallery(t, site))
        .filter((t) => t.kinds.length > 0);
    const rank = (slug: string) => {
        const i = GALLERY_ORDER.indexOf(slug);
        return i < 0 ? GALLERY_ORDER.length : i;
    };
    const list = shown
        .map((t, i) => ({ t, i }))
        .sort((a, b) => rank(a.t.slug) - rank(b.t.slug) || a.i - b.i)
        .map(({ t }) => t);
    caches.set(site.base, list);
    return list;
}

export function galleryTemplate(
    site: GallerySite,
    slug: string,
): GalleryTemplate | undefined {
    return galleryTemplates(site).find((t) => t.slug === slug);
}

/** The kind chips with at least one template: "All" plus these. */
export function galleryChips(
    templates: readonly GalleryTemplate[],
): (typeof GALLERY_KINDS)[number][] {
    return GALLERY_KINDS.filter((k) =>
        templates.some((t) => t.kinds.includes(k.id)),
    );
}

/**
 * "Also built around one thing": the templates sharing a kind or a shape
 * with this one, those sharing a kind first, at most three.
 */
export function relatedTemplates(
    template: GalleryTemplate,
    templates: readonly GalleryTemplate[],
): GalleryTemplate[] {
    const others = templates.filter((t) => t.slug !== template.slug);
    const sharesKind = (t: GalleryTemplate) =>
        t.kinds.some((k) => template.kinds.includes(k));
    return [
        ...others.filter(sharesKind),
        ...others.filter((t) => !sharesKind(t) && t.shape === template.shape),
    ].slice(0, 3);
}

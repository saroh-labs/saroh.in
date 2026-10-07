import type { SiteFontPair, TemplateManifest } from "@saroh/templates";
import {
    findFontPair,
    instantiateTemplate,
    listTemplates,
} from "@saroh/templates";

import type { WaitlistKindId } from "@/content/waitlist";

/**
 * The Templates gallery (Resources plan U6, industry templates plan U13):
 * `/templates` and `/templates/[slug]`, built from `@saroh/templates` — the
 * same manifests a new site is created from — so the gallery can only show
 * a template a merchant can actually pick (KTD-6, R2).
 *
 * A template is in the gallery when its manifest carries the gallery's
 * metadata: the kinds of business it is for, a shape, a sample business
 * and at least one colourway (`isGalleryTemplate`). The general templates
 * (starter, personal, writing, the first portfolio) carry none and are not
 * shown. Salon and Clinic joined on their own when they were built (U11).
 *
 * What is written here, not read from the manifest: the gallery's name
 * where the design renames one (Studio is "Portfolio"; Ceramics is already
 * "Store"), each template's one-line idea, and the colours a card is drawn
 * in until U14's 2× renders replace the drawing (`template-shots.ts`).
 * No price, plan or limit is ever written here (the repo is public).
 */

export const TEMPLATES_PATH = "/templates";

export function templateHref(slug: string): string {
    return `${TEMPLATES_PATH}/${slug}`;
}

/** The gallery's kind chips, in the design's order: the waitlist's kinds by the gallery's names. */
export const GALLERY_KINDS: readonly {
    id: Exclude<WaitlistKindId, "other">;
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
 */
export const USES_WORDS: Readonly<Partial<Record<string, string>>> = {
    COMMERCE: "Products",
    APPOINTMENTS: "Bookings",
    PAYMENTS: "Payments",
    CLASS_PACKS: "Class packs",
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
    /** `/templates/<slug>`. */
    href: string;
    name: string;
    idea: string;
    description: string;
    kinds: Exclude<WaitlistKindId, "other">[];
    /** The card's kind line: its first kind's chip name. */
    kindLabel: string;
    shape: string;
    sample: { name: string; host: string };
    uses: string[];
    /** The type pair's name ("Fraunces and Inter Tight"). */
    type: string;
    fonts: { heading: string; body: string };
    colourways: string[];
    colours: PreviewColours;
    pages: PreviewPage[];
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

function usesWords(t: TemplateManifest, pages: PreviewPage[]): string[] {
    const words = (t.uses ?? []).flatMap((key) => {
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
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;|&rsquo;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
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
        modules: ["WEBSITE", ...(t.uses ?? [])],
    });
    return built.pages.map((p) => ({
        path: p.path,
        title: p.title,
        sections: p.sections.map((s) => previewSection(s.type, s.content)),
    }));
}

function toGallery(t: TemplateManifest): GalleryTemplate {
    const slug = t.slug ?? t.id;
    const kinds = galleryKinds(t);
    const firstKind = kinds.at(0);
    const pair = findFontPair(t.styles?.[0]?.style.fontPair);
    const pages = previewPages(t);
    return {
        id: t.id,
        slug,
        href: templateHref(slug),
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
        colours: previewColours(t, slug),
        pages,
    };
}

/** A face's CSS stack: the family by name, then its fallback (nothing is fetched). */
function fontStack(face: SiteFontPair["heading"]): string {
    return face.family ? `"${face.family}", ${face.fallback}` : face.fallback;
}

let cache: GalleryTemplate[] | null = null;

/** The gallery's templates, in the design's order. */
export function galleryTemplates(): GalleryTemplate[] {
    if (cache) return cache;
    const shown = listTemplates()
        .filter(isGalleryTemplate)
        .map(toGallery)
        .filter((t) => t.kinds.length > 0);
    const rank = (slug: string) => {
        const i = GALLERY_ORDER.indexOf(slug);
        return i < 0 ? GALLERY_ORDER.length : i;
    };
    cache = shown
        .map((t, i) => ({ t, i }))
        .sort((a, b) => rank(a.t.slug) - rank(b.t.slug) || a.i - b.i)
        .map(({ t }) => t);
    return cache;
}

export function galleryTemplate(slug: string): GalleryTemplate | undefined {
    return galleryTemplates().find((t) => t.slug === slug);
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
    templates: readonly GalleryTemplate[] = galleryTemplates(),
): GalleryTemplate[] {
    const others = templates.filter((t) => t.slug !== template.slug);
    const sharesKind = (t: GalleryTemplate) =>
        t.kinds.some((k) => template.kinds.includes(k));
    return [
        ...others.filter(sharesKind),
        ...others.filter((t) => !sharesKind(t) && t.shape === template.shape),
    ].slice(0, 3);
}

const NUMBER_WORDS = [
    "No",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
];

/** "Seven", for a count at the start of a sentence; digits past twelve. */
export function countWord(n: number): string {
    return NUMBER_WORDS[n] ?? String(n);
}

/** "A, B and C". */
export function listWords(words: readonly string[]): string {
    if (words.length <= 1) return words[0] ?? "";
    return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The day early access opens, in India (the waitlist's invites go out). */
export const EARLY_ACCESS_DAY = "2026-10-17";
/** As the copy writes it. */
const EARLY_ACCESS_SHORT = "17 Oct";
const LAST_WAITLIST_DAY = "16th";

/**
 * The gallery's words. Each count and list is derived from the templates
 * shown, and the pre-launch lines change on early access's day: the pages
 * publish on that day (`content/resources.ts`), so a preview shows the
 * pre-launch wording and the live site the day's.
 */
export const templatesPage = {
    title: "Pick a site that looks like your business.",
    seo: {
        title: "Website templates for small businesses — Saroh",
        socialTitle: "Pick a site that looks like your business.",
        description:
            "Website templates made for a bakery, a gym, a shop, a dietician, a writer, a studio and a developer, each with its own type and colours, built on your products, bookings and posts in Saroh.",
    },
    intro(templates: readonly GalleryTemplate[]): string {
        const n = templates.length;
        const each =
            n === 1
                ? "One template, with its own type and colours."
                : `${countWord(n)} templates, each made for a kind of business, each with its own type and colours.`;
        const has = (type: string) =>
            templates.some((t) =>
                t.pages.some((p) => p.sections.some((s) => s.type === type)),
            );
        const wired = [
            has("booking") || templates.some((t) => t.uses.includes("Bookings"))
                ? "bookings"
                : null,
            has("productGrid") ? "products" : null,
            has("plans") ? "memberships" : null,
        ].filter((w): w is string => w !== null);
        if (wired.length === 0) return each;
        const list = listWords(wired);
        return `${each} ${list.charAt(0).toUpperCase()}${list.slice(1)} are already wired in.`;
    },
    allChip: "All",
    preview: "Preview",
    sampleNote:
        "Every business shown is a sample, made up to show the template.",
    band: {
        before: `Pick one now. It's ready for you on ${EARLY_ACCESS_SHORT}.`,
        after: "Pick one, and start from it.",
        body: "Join the waitlist, and we'll email you once, with your invite, when early access opens.",
    },
} as const;

export const templateDetail = {
    crumb: "Templates",
    save: (name: string) => `Save ${name} for early access`,
    saveNote: {
        before: (name: string) =>
            `Early access opens ${EARLY_ACCESS_SHORT}. Join the waitlist by the ${LAST_WAITLIST_DAY} and we'll keep ${name} for you.`,
        after: (name: string) =>
            `Join the waitlist and we'll keep ${name} for you with your invite.`,
    },
    switcher: "Pages",
    desktop: "Desktop",
    phone: "Phone",
    notes: {
        pages(t: GalleryTemplate): { title: string; body: string } {
            const titles = t.pages.map((p) => p.title);
            return {
                title:
                    titles.length === 1
                        ? "One page"
                        : `${countWord(titles.length)} pages`,
                body:
                    titles.length === 1
                        ? "Everything on one page, in the order a visitor asks for it."
                        : `${listWords(titles)}.`,
            };
        },
        uses(t: GalleryTemplate): { title: string; body: string } {
            return {
                title: "Runs on what you add",
                body: t.uses.length
                    ? `${listWords(t.uses)} come from what you add in Saroh, so the site changes when they do. Until you add one, its section stays off the page.`
                    : "Everything on it is yours to write, and nothing on it waits for data.",
            };
        },
        look(t: GalleryTemplate): { title: string; body: string } {
            return {
                title: "Its own look",
                body: `Set in ${t.type}, in ${t.colourways.length === 1 ? "one colourway" : `${countWord(t.colourways.length).toLowerCase()} colourways`}: ${listWords(t.colourways)}. Nothing in it is Saroh's.`,
            };
        },
    },
    facts: {
        pages: "Pages",
        uses: "Uses",
        type: "Type",
        colours: "Colours",
    },
    related: "Also built around one thing",
    band: {
        before: (name: string) =>
            `Start with ${name}. It's ready for you on ${EARLY_ACCESS_SHORT}.`,
        after: (name: string) => `Start with ${name}.`,
    },
} as const;

/** Whether early access has opened at `now` (midnight in India). */
export function earlyAccessOpen(now: Date): boolean {
    return (
        now.getTime() >=
        new Date(`${EARLY_ACCESS_DAY}T00:00:00+05:30`).getTime()
    );
}

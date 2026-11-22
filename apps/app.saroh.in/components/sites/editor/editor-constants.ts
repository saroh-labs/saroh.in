import type { Section, SectionType } from "@/lib/sites/service";
import type { BlockFamily } from "@saroh/block-contract";
import {
    blockFamilies,
    blockHeading,
    blockSearchText,
    SECTION_TYPES,
} from "@saroh/block-contract";

/**
 * The editor's fixed vocabulary — what each block is called, the order the
 * picker offers them in, and the preview's device and zoom steps.
 *
 * Split out of `site-editor.tsx` (#260). `SECTION_LABELS` is the contract's
 * `blockHeading` for every section type, so it stays in step with
 * `BLOCK_META` ("Highlights", "Visit us · Hours"; KD5) and a new type gets a
 * label the moment the contract has one.
 */
export const SECTION_LABELS = Object.fromEntries(
    SECTION_TYPES.map((t) => [t, blockHeading(t)]),
) as Record<SectionType, string>;

/**
 * One line per block for the Add-section picker (#267), in a merchant's words.
 *
 * Not `BLOCK_META.description`: that is written for the people building Saroh
 * ("Backed by a Form record the submit endpoint validates against") and the
 * catalog is where it belongs. Typed like the labels, so a new block without a
 * line here does not compile.
 */
export const SECTION_HINTS: Record<SectionType, string> = {
    hero: "The first thing a visitor sees: a headline, a line under it and a button.",
    richText: "Paragraphs of your own words, with headings and links.",
    cta: "A single button asking for the next step.",
    gallery: "Your photos, in a grid, a carousel or a masonry wall.",
    enquiry: "A form visitors fill in. Each one arrives in Leads.",
    booking: "Visitors pick a time for one of your services and book it.",
    features: "A few short points: what you do, or why buy from you.",
    faq: "Questions and answers, each answer one tap away.",
    testimonials: "Quotes from customers, with their names.",
    contact: "Your address, opening hours, phone, email and WhatsApp.",
    servicesList: "Your services with duration and price, always up to date.",
    visitUs:
        "A location's address, hours and Open now, with directions, always up to date.",
    journal: "Your latest posts, newest first. A new post shows up on its own.",
    plans: "Your plans on sale, with price and how often. A new plan shows up on its own.",
    packs: "Your class packs on sale, with the price per class. A new pack shows up on its own.",
    productGrid: "Reads the catalogue. Stays current on its own.",
    projects: "Your own work, each with a photo, a line about it and a link.",
    timetable:
        "This week's classes by day, with who takes each and the places left, always up to date.",
    hours: "Your opening hours as a table, with Open now, always up to date.",
    person: "One person: a photo, their name, what they do, their qualifications and a few lines.",
};

/** Preview widths. The phone value is a real handset, not a breakpoint. */
export const DEVICES = [
    { key: "desktop", label: "Desktop" },
    { key: "tablet", label: "Tablet" },
    { key: "phone", label: "Phone" },
] as const;
export type Device = (typeof DEVICES)[number]["key"];
/** Zoom steps. "fit" is computed; the rest are literal percentages (spec §2). */
export type Zoom = 50 | 75 | 100 | "fit";
export const ZOOMS: Zoom[] = [50, 75, 100, "fit"];

/**
 * The same widths in pixels, for the Fit calculation. Desktop is null because
 * it has no fixed width — it already takes whatever the canvas gives it, so
 * there is nothing to scale down to make it fit.
 */
export const DEVICE_PX: Record<Device, number | null> = {
    desktop: null,
    tablet: 768,
    phone: 375,
};

export const DEVICE_WIDTH: Record<Device, string> = {
    desktop: "100%",
    tablet: "48rem",
    phone: "23.4375rem",
};

/**
 * A section's own words in the rail, falling back to its type.
 *
 * "Hero" five times is a list of types, not a page. The merchant recognises
 * their own heading, which is what makes the rail navigable.
 */
export function sectionTitle(section: Section): string {
    const c = section.content as Record<string, unknown>;
    const candidate =
        (typeof c.heading === "string" && c.heading) ||
        (typeof c.title === "string" && c.title) ||
        (typeof c.label === "string" && c.label) ||
        "";
    return candidate.trim() || SECTION_LABELS[section.type];
}

/*
 * Field labels, as the design draws them: small, uppercase, letter-spaced and
 * muted, so a column of them reads as a quiet index rather than competing with
 * the values a merchant is actually editing.
 */

export const SECTION_ORDER: SectionType[] = [
    "hero",
    "richText",
    "cta",
    "gallery",
    "projects",
    "person",
    "enquiry",
    "booking",
    "features",
    "faq",
    "testimonials",
    "servicesList",
    "visitUs",
    "hours",
    "contact",
    "timetable",
    "journal",
    "plans",
    "packs",
    "productGrid",
];

/**
 * Blocks that sell, offered only while the shop is open for the business
 * (G11–G13, the `SITE_SHOP` flag): until then a Product grid would show
 * nothing on the site, so it isn't offered at all (DEC-057). One already on
 * a page stays, and its canvas says why it is empty.
 */
const SHOP_BLOCKS: readonly SectionType[] = ["productGrid"];

/**
 * The Class packs block, offered only while Class packs is rolled out for
 * the business and on (the API's `packsBlockOffered`). Off, it is not in
 * Add block at all (DEC-057); one already on a page stays.
 */
const PACKS_BLOCKS: readonly SectionType[] = ["packs"];

/**
 * The blocks the Add tab and the picker offer, in order. Each gate fails
 * closed: an API that doesn't say leaves its blocks out.
 */
export function addableSections(
    shopOpen: boolean,
    packsOpen = false,
): SectionType[] {
    return SECTION_ORDER.filter(
        (t) =>
            (shopOpen || !SHOP_BLOCKS.includes(t)) &&
            (packsOpen || !PACKS_BLOCKS.includes(t)),
    );
}

/**
 * The Add block entries: one per family with its layouts (KD5), filtered by
 * a search over each layout's name, old names and line. A layout matched on
 * its own ("contact") comes back as its family with just that layout.
 */
export function addableFamilies(
    shopOpen: boolean,
    packsOpen = false,
    query = "",
): BlockFamily[] {
    const q = query.trim().toLowerCase();
    return blockFamilies(
        addableSections(shopOpen, packsOpen).filter(
            (t) =>
                q === "" ||
                `${blockSearchText(t)} ${SECTION_HINTS[t].toLowerCase()}`.includes(
                    q,
                ),
        ),
    );
}

/** A sensible empty section for the chosen type (contract v1). */

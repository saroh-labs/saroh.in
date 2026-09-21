import type { Section, SectionType } from "@/lib/sites/service";

/**
 * The editor's fixed vocabulary — what each block is called, the order the
 * picker offers them in, and the preview's device and zoom steps.
 *
 * Split out of `site-editor.tsx` (#260). `SECTION_LABELS` keeps its
 * `Record<SectionType, string>` annotation on purpose: it is what makes a block
 * type added without a label a compile error, and the reason a forgotten
 * section type has never silently shipped.
 */

export const SECTION_LABELS: Record<SectionType, string> = {
    hero: "Hero",
    richText: "Rich text",
    cta: "Call to action",
    gallery: "Gallery",
    enquiry: "Enquiry form",
    booking: "Booking",
    features: "Features",
    faq: "FAQ",
    testimonials: "Testimonials",
    contact: "Contact",
    servicesList: "Services",
};

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
    enquiry: "A form visitors fill in; each one arrives in Leads.",
    booking: "Visitors pick a time for one of your services and book it.",
    features: "A few short points: what you do, or why buy from you.",
    faq: "Questions and answers, each answer one tap away.",
    testimonials: "Quotes from customers, with their names.",
    contact: "Your address, opening hours, phone, email and WhatsApp.",
    servicesList: "Your services with duration and price, always up to date.",
};

/**
 * Preview widths: the two the design offers (#335). Phone is a real handset,
 * not a breakpoint. Tablet and zoom went with the redesign — the widths a
 * merchant's customers mostly arrive at are these two.
 */
export const DEVICES = [
    { key: "desktop", label: "Desktop" },
    { key: "phone", label: "Phone" },
] as const;
export type Device = (typeof DEVICES)[number]["key"];

export const DEVICE_WIDTH: Record<Device, string> = {
    desktop: "100%",
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
    "enquiry",
    "booking",
    "features",
    "faq",
    "testimonials",
    "contact",
    "servicesList",
];

/** A sensible empty section for the chosen type (contract v1). */

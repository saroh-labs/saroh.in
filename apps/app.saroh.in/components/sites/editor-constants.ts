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
    "enquiry",
    "booking",
];

/** A sensible empty section for the chosen type (contract v1). */

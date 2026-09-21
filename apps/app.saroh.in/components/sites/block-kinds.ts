import type { SectionType } from "@/lib/sites/service";

/**
 * Which blocks read live data from the business, and where that data is
 * changed (#338).
 *
 * A bound block's inspector says where the real value lives and links to it,
 * rather than offering a field that would quietly fork it — two answers to
 * one question. Typed over every block, so a new block type has to say
 * whether it is bound: `null` is a choice, not an omission.
 */
export interface BoundSource {
    /** What the block reads, in a merchant's words. */
    reads: string;
    /** Where that is changed, and what follows from changing it there. */
    notice: string;
    href: string;
    linkLabel: string;
}

export const BOUND_BLOCKS: Record<SectionType, BoundSource | null> = {
    hero: null,
    richText: null,
    cta: null,
    gallery: null,
    enquiry: null,
    features: null,
    faq: null,
    testimonials: null,
    // Typed by the merchant here, not read from a storefront.
    contact: null,
    servicesList: {
        reads: "Reads your services live, so names, durations and prices are never out of date here.",
        notice: "What each service is called and what it costs follow Services — change them there, and this block follows.",
        href: "/services",
        linkLabel: "Open Services",
    },
    booking: {
        reads: "Reads your services and their availability live, so a visitor can only book what you actually offer.",
        notice: "Which services can be booked, and when, follow Services and your opening hours — change them there, and this block follows.",
        href: "/services",
        linkLabel: "Open Services",
    },
};

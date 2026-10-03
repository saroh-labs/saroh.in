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
    /** Where; a site's own screen takes the site being edited. */
    href: string | ((siteId: string) => string);
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
    // Typed by the merchant here, not read from a location.
    contact: null,
    // The merchant's own work, typed here: there is nothing to read (K11).
    projects: null,
    servicesList: {
        reads: "Reads your services live, so names, durations and prices are never out of date here.",
        notice: "What each service is called and what it costs follow Services — change them there, and this block follows.",
        href: "/services",
        linkLabel: "Open Services",
    },
    visitUs: {
        reads: "Reads your location address and opening hours live, so they're never out of date here.",
        notice: "The location address is set in Sell › Locations, and the hours in Settings › Hours — change them there, and this block follows.",
        href: "/commerce/locations",
        linkLabel: "Open Locations",
    },
    journal: {
        reads: "Reads your latest published posts live, so a new post shows here without publishing the site again.",
        notice: "Posts come from Website › Posts. Publish a post and it shows here; take one down and it goes.",
        href: (siteId) => `/sites/${siteId}/posts`,
        linkLabel: "Open Posts",
    },
    plans: {
        reads: "Reads your plans on sale live, so a price or a newly published plan shows here without publishing the site again.",
        notice: "Plans live in Payments › Subscriptions › Plans. Only published plans show; a draft or an unpublished change never does, and nothing shows while Payments is off.",
        href: "/billing/subscriptions?tab=plans",
        linkLabel: "Open Plans",
    },
    packs: {
        reads: "Reads your class packs on sale live, so a price or a newly published pack shows here without publishing the site again.",
        notice: "Packs live in Class packs. Only published packs show; a draft or an unpublished change never does.",
        href: "/class-packs",
        linkLabel: "Open Class packs",
    },
    productGrid: {
        reads: "Reads the catalogue. Stays current on its own.",
        notice: "Products live in Sell › Products. Which products appear follows the catalogue — add or hide them there, and this block follows. Only published products at the location your online shop sells from show.",
        href: "/commerce/products",
        linkLabel: "Open Products",
    },
    booking: {
        reads: "Reads your services and their availability live, so a visitor can only book what you actually offer.",
        notice: "Which services can be booked, and when, follow Services and your opening hours — change them there, and this block follows.",
        href: "/services",
        linkLabel: "Open Services",
    },
};

/** A bound block's link, for the site being edited; null when it needs one. */
export function boundHref(
    bound: BoundSource,
    siteId: string | undefined,
): string | null {
    if (typeof bound.href === "string") return bound.href;
    return siteId ? bound.href(siteId) : null;
}

/**
 * The Add block tab's groups (#337), in the order the design lists them.
 * Derived from `BOUND_BLOCKS`, so a block is "from your business" exactly when
 * its inspector says it reads live data — the two cannot disagree.
 */
export function addBlockGroups(order: readonly SectionType[]): {
    structure: SectionType[];
    business: SectionType[];
} {
    return {
        structure: order.filter((t) => BOUND_BLOCKS[t] === null),
        business: order.filter((t) => BOUND_BLOCKS[t] !== null),
    };
}

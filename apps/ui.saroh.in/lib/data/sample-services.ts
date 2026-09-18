import type { PublicService } from "@saroh/site-blocks";

/**
 * Services for the catalog's `servicesList` preview (#255). The block reads a
 * merchant's real Services at view time; the catalog has none, so it draws
 * these instead. One has no price, because that case must look right too.
 */
export const SAMPLE_SERVICES: PublicService[] = [
    {
        id: "fixture-cut",
        name: "Cut and finish",
        description: "Wash, cut and blow-dry.",
        durationMinutes: 45,
        priceCents: 3800,
        currency: "GBP",
    },
    {
        id: "fixture-colour",
        name: "Full colour",
        description:
            "Root to tip, with a toner. Patch test needed 48 hours before.",
        durationMinutes: 120,
        priceCents: 9500,
        currency: "GBP",
    },
    {
        id: "fixture-consult",
        name: "Consultation",
        description: null,
        durationMinutes: 15,
        priceCents: null,
        currency: null,
    },
];

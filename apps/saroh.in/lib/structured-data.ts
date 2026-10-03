import type { Catalog } from "@saroh/pricing-catalog";
import { offeredPlans } from "@saroh/pricing-catalog";

import { SITE_NAME, SITE_URL } from "@/lib/seo";

/**
 * Schema.org JSON-LD for search engines (plan U26): who makes Saroh, and
 * Saroh as a web app with its plans as offers.
 *
 * Offers come from the published pricing catalogue only (KTD-10): no price
 * lives in this repo, so with no catalogue the app is described without
 * offers rather than with made-up ones.
 */
export type JsonLdObject = Record<string, unknown>;

export function organizationLd(): JsonLdObject {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon1.png`,
    };
}

export function softwareApplicationLd(
    catalog: Catalog | null,
    description: string,
): JsonLdObject {
    const app: JsonLdObject = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        url: SITE_URL,
        description,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
    };
    if (catalog) {
        app.offers = offeredPlans(catalog).map((plan) => ({
            "@type": "Offer",
            name: plan.name,
            // Monthly, before GST, as the catalogue holds it (integer paise).
            price: (plan.pricePaise / 100).toFixed(2),
            priceCurrency: "INR",
            url: `${SITE_URL}/pricing`,
        }));
    }
    return app;
}

/**
 * The JSON for a `<script type="application/ld+json">`. `<` is escaped so no
 * string in it can close the script tag.
 */
export function jsonLdText(data: JsonLdObject | JsonLdObject[]): string {
    return JSON.stringify(data).replace(/</g, "\\u003c");
}

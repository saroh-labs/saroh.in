import type { Catalog } from "@saroh/pricing-catalog";
import { offeredPlans } from "@saroh/pricing-catalog";

import { SAROH_SOCIAL } from "@/content/social";
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
        sameAs: SAROH_SOCIAL.map((link) => link.href),
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
 * A free tool on the site (resources plan U2/U7): the link preview checker,
 * as a web application anyone can use for free. No offer: nothing is sold.
 */
export function toolLd(tool: {
    name: string;
    description: string;
    url: string;
}): JsonLdObject {
    return {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: tool.name,
        url: tool.url,
        description: tool.description,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web",
        isAccessibleForFree: true,
        publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    };
}

/** A page's questions and answers, as search engines read an FAQ. */
export function faqPageLd(items: { q: string; a: string }[]): JsonLdObject {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
    };
}

/**
 * The JSON for a `<script type="application/ld+json">`. `<` is escaped so no
 * string in it can close the script tag.
 */
export function jsonLdText(data: JsonLdObject | JsonLdObject[]): string {
    return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * A changelog entry as an `Article` (plan U7): its headline, its day (from
 * midnight in India, KTD-2) and Saroh as author and publisher.
 */
export function articleLd(input: {
    headline: string;
    description: string;
    path: string;
    publishOn: string;
}): JsonLdObject {
    const saroh = {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/icon1.png` },
    };
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: input.headline,
        description: input.description,
        url: `${SITE_URL}${input.path}`,
        mainEntityOfPage: `${SITE_URL}${input.path}`,
        datePublished: `${input.publishOn}T00:00:00+05:30`,
        author: saroh,
        publisher: saroh,
    };
}

/**
 * A Help article as a `HowTo` (plan U7): its steps in order, each with the
 * screen it shows, and how long it takes to read.
 */
export function howToLd(input: {
    name: string;
    description: string;
    url: string;
    totalMinutes: number;
    steps: { name: string; text: string; url: string; image: string }[];
}): JsonLdObject {
    return {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: input.name,
        description: input.description,
        url: input.url,
        totalTime: `PT${input.totalMinutes}M`,
        step: input.steps.map((s, i) => ({
            "@type": "HowToStep",
            position: i + 1,
            name: s.name,
            text: s.text,
            url: s.url,
            image: s.image,
        })),
    };
}

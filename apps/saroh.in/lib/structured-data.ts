import { SAROH_SOCIAL } from "@/content/social";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

/**
 * Schema.org JSON-LD for search engines (plan U26): who makes Saroh, and
 * Saroh as a web app. No offers: no price is published yet, and none lives
 * in this repo.
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

export function softwareApplicationLd(description: string): JsonLdObject {
    return {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        url: SITE_URL,
        description,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
    };
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

import type { Catalog } from "@saroh/pricing-catalog";
import { offeredPlans, planPricePaise } from "@saroh/pricing-catalog";

import type { CompanyFacts } from "@/content/company";
import { COMPANY } from "@/content/company";
import { SAROH_CONTACT_EMAIL } from "@/content/contact";
import { SAROH_SOCIAL } from "@/content/social";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

/**
 * Schema.org JSON-LD for search engines (plan U26): who makes Saroh, and
 * Saroh as a web app with its plans as offers.
 *
 * Offers come from the published pricing catalogue only (KTD-10): no price
 * lives in this repo, so with no catalogue the app is described without
 * offers rather than with made-up ones. Nothing here is ever a rating, a
 * review or a number of customers: there are none to cite.
 */
export type JsonLdObject = Record<string, unknown>;

/**
 * Who makes Saroh: the brand, the LLP behind it, where to write, and its
 * registered office, on Home, About and Contact. Only facts that are set
 * (`content/company.ts`, DEC-137): a phone number or an address that isn't
 * there is left out, key and all, never given empty.
 */
export function organizationLd(company: CompanyFacts = COMPANY): JsonLdObject {
    const org: JsonLdObject = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        legalName: company.legalName,
        url: SITE_URL,
        logo: `${SITE_URL}/icon1.png`,
        email: SAROH_CONTACT_EMAIL,
        contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: SAROH_CONTACT_EMAIL,
            ...(company.phone && { telephone: company.phone.dial }),
            url: `${SITE_URL}/contact`,
        },
        sameAs: SAROH_SOCIAL.map((link) => link.href),
    };
    if (company.phone) org.telephone = company.phone.dial;
    if (company.postal) {
        org.address = {
            "@type": "PostalAddress",
            streetAddress: company.postal.street,
            addressLocality: company.postal.locality,
            addressRegion: company.postal.region,
            postalCode: company.postal.postalCode,
            addressCountry: company.postal.country,
        };
    }
    return org;
}

/** The site itself, on Home: its name, its one address and who publishes it. */
export function webSiteLd(): JsonLdObject {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        inLanguage: "en-IN",
        publisher: { "@id": `${SITE_URL}/#organization` },
    };
}

/**
 * The trail a page draws above its title, for search engines: each crumb in
 * order, with its address on this site. A crumb with no page of its own (a
 * label) takes no `item`.
 */
export function breadcrumbLd(
    crumbs: readonly { name: string; path?: string }[],
): JsonLdObject {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((crumb, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: crumb.name,
            ...(crumb.path && { item: `${SITE_URL}${crumb.path}` }),
        })),
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
        const offer = (name: string, paise: number, unitCode: string) => ({
            "@type": "Offer",
            name,
            price: (paise / 100).toFixed(2),
            priceCurrency: "INR",
            priceSpecification: {
                "@type": "UnitPriceSpecification",
                price: (paise / 100).toFixed(2),
                priceCurrency: "INR",
                unitCode,
                valueAddedTaxIncluded: false,
            },
            url: `${SITE_URL}/pricing`,
        });
        app.offers = offeredPlans(catalog).flatMap((plan) => [
            // Monthly, before GST, as the catalogue holds it (integer paise).
            offer(plan.name, plan.pricePaise, "MON"),
            // Yearly only while the catalogue offers it, and only for a plan
            // that costs something: priced as checkout prices it.
            ...(catalog.yearly.on && plan.pricePaise > 0
                ? [
                      offer(
                          `${plan.name}, yearly`,
                          planPricePaise(catalog, plan, "year"),
                          "ANN",
                      ),
                  ]
                : []),
        ]);
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
 * A Help article as a `TechArticle`, beside its `HowTo`: its title, the day
 * it went up and the day its words or screens last changed (`updated`, the
 * date the page shows), with Saroh as author and publisher. An article
 * written before the day it went up was last changed, to a reader, on that
 * day: the later of the two.
 */
export function techArticleLd(input: {
    headline: string;
    description: string;
    path: string;
    publishOn: string;
    updated: string;
}): JsonLdObject {
    const saroh = {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/icon1.png` },
    };
    return {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: input.headline,
        description: input.description,
        url: `${SITE_URL}${input.path}`,
        mainEntityOfPage: `${SITE_URL}${input.path}`,
        inLanguage: "en-IN",
        datePublished: `${input.publishOn}T00:00:00+05:30`,
        dateModified: `${input.updated > input.publishOn ? input.updated : input.publishOn}T00:00:00+05:30`,
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

import { site } from "@/site.config";

import { canonicalOf } from "./seo";
import type { SitePage } from "./site-map";

type Ld = Record<string, unknown>;

const context = "https://schema.org";

const organization: Ld = {
    "@context": context,
    "@type": "Organization",
    name: site.name,
    url: site.url,
    logo: `${site.url}/apple-icon.png`,
    parentOrganization: { "@type": "Organization", name: site.company },
};

const website: Ld = {
    "@context": context,
    "@type": "WebSite",
    name: site.name,
    url: site.url,
};

const application = (page: SitePage): Ld => ({
    "@context": context,
    "@type": "SoftwareApplication",
    // Home's H1 is a line of copy. The product's name is Saroh.
    name: page.type === "home" ? site.name : page.h1,
    url: canonicalOf(page.path),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    ...(page.type === "tool" && {
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    }),
});

const breadcrumbs = (page: SitePage): Ld[] =>
    page.crumb
        ? [
              {
                  "@context": context,
                  "@type": "BreadcrumbList",
                  itemListElement: page.crumb.map((c, i) => ({
                      "@type": "ListItem",
                      position: i + 1,
                      name: c.name,
                      item: canonicalOf(c.path ?? page.path),
                  })),
              },
          ]
        : [];

const collection = (page: SitePage): Ld => ({
    "@context": context,
    "@type": "CollectionPage",
    name: page.h1,
    url: canonicalOf(page.path),
});

/**
 * The structured data the specs ask of a page type. HowTo, FAQPage, ItemList,
 * Article and a pricing page's Offers need the page's real content, so they
 * come with the pages themselves.
 */
export function pageSchema(page: SitePage): Ld[] {
    switch (page.type) {
        case "home":
            return [organization, website, application(page)];
        case "about":
        case "contact":
            return [organization, ...breadcrumbs(page)];
        case "pricing":
        case "tool":
            return [application(page), ...breadcrumbs(page)];
        case "tools-hub":
        case "templates":
        case "guides":
            return [collection(page), ...breadcrumbs(page)];
        default:
            return breadcrumbs(page);
    }
}

export const itemListSchema = (
    name: string,
    items: readonly { name: string; path: string }[],
): Ld => ({
    "@context": context,
    "@type": "ItemList",
    name,
    itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        url: canonicalOf(item.path),
    })),
});

/** The author is who signs the page (a guide), else the organisation; dates are the real edit day. */
export const articleSchema = (
    page: SitePage,
    author?: { name: string; role: string },
): Ld => ({
    "@context": context,
    "@type": "Article",
    headline: page.h1,
    description: page.description,
    url: canonicalOf(page.path),
    author: author
        ? { "@type": "Person", name: author.name, jobTitle: author.role }
        : { "@type": "Organization", name: site.name, url: site.url },
    publisher: { "@type": "Organization", name: site.name, url: site.url },
    ...(page.updated && {
        datePublished: page.updated,
        dateModified: page.updated,
    }),
});

export const faqSchema = (
    items: readonly { question: string; answer: string }[],
): Ld => ({
    "@context": context,
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
});

export const howToSchema = (
    name: string,
    steps: readonly { title: string; text: string }[],
): Ld => ({
    "@context": context,
    "@type": "HowTo",
    name,
    step: steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.title,
        text: s.text,
    })),
});

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
    name: page.h1,
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

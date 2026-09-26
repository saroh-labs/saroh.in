import type { SeedSite } from "../data";
import type { Db } from "../helpers";
import { writeSite } from "../helpers";
import { ryeId } from "./bakery-catalogue";

/**
 * Rye & Co.'s one website (#526): the home of its Online storefront, a
 * single published page. Written the way every seeded site is
 * (`writeSite`), on seeded ids.
 */
const SITE: SeedSite = {
    slug: "rye-and-co",
    name: "Rye & Co.",
    subdomain: "rye-and-co",
    published: true,
    createdDaysAgo: 120,
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    type: "hero",
                    content: {
                        heading: "Bread worth the early walk",
                        subheading:
                            "Sourdough, pastry and coffee, baked on Hill Road every morning. Collect from 7am, or have it delivered.",
                        cta: {
                            label: "Shop online",
                            href: "/shop",
                            style: "primary",
                        },
                    },
                },
                {
                    type: "features",
                    content: {
                        heading: "How we bake",
                        items: [
                            {
                                title: "Forty-eight hours of ferment",
                                body: "Every loaf is shaped the day before and baked cold from the fridge.",
                            },
                            {
                                title: "Milled on Hill Road",
                                body: "Stoneground wheat and rye, milled a few steps from the oven.",
                            },
                            {
                                title: "Beans from Chikmagalur",
                                body: "Our house blend is roasted by Kaapi Roasters on Tuesdays.",
                            },
                        ],
                    },
                },
            ],
        },
    ],
};

export async function writeRyeSite(
    prisma: Db,
    a: { orgId: string; userId: string; now: Date },
): Promise<string> {
    return writeSite(prisma, {
        fixture: SITE,
        orgId: a.orgId,
        userId: a.userId,
        now: a.now,
        ids: {
            site: ryeId("site"),
            page: (p) => ryeId("page", p),
            pageVersion: (p) => ryeId("pageversion", p),
            section: (p, n) => ryeId("section", p, n),
            sectionKey: (p, n) => ryeId("sectionkey", p, n),
            form: (p, n) => ryeId("form", p, n),
            publication: ryeId("publication"),
        },
        pipelineId: null,
        serviceId: () => {
            throw new Error("Rye & Co.'s site lists no services");
        },
        footer: {
            format: "text",
            value: "Rye & Co. · 3 Hill Road, Indiranagar, Bengaluru",
        },
    });
}

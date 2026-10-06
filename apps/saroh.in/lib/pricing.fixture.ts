import type { Catalog, CatalogInput } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";

/**
 * A made-up catalogue for saroh.in's tests. Names, prices and limits are fake
 * on purpose (Plan A/B/C, 111, 222): no test carries a real plan's terms. The
 * ids are the site's own (free, grow, pro) so the solution pages' teasers
 * find their plans.
 */
export function fakeCatalogInput(): CatalogInput {
    return {
        plans: [
            { id: "free", name: "Plan A", pricePaise: 0, tagline: "For A" },
            {
                id: "grow",
                name: "Plan B",
                pricePaise: 11_100,
                tagline: "For B",
                featured: true,
            },
            { id: "pro", name: "Plan C", pricePaise: 22_200, tagline: "For C" },
        ],
        groups: [
            { id: "one", name: "Group one" },
            { id: "two", name: "Group two" },
        ],
        modules: [
            {
                id: "website",
                name: "Website",
                group: "one",
                cells: {
                    free: { inc: true, text: "One", card: "Thing one" },
                    grow: {
                        inc: true,
                        text: "One plus",
                        card: "Thing one plus",
                    },
                    pro: {
                        inc: true,
                        text: "One plus",
                        card: "Thing one plus",
                    },
                },
            },
            {
                id: "products",
                name: "Products",
                group: "one",
                cells: {
                    free: { inc: true, text: "Few", card: "Few items" },
                    grow: { inc: true, text: "More", card: "More items" },
                    pro: { inc: true, text: "Most", card: "Most items" },
                },
            },
            {
                id: "bookings",
                name: "Bookings",
                group: "two",
                cells: {
                    free: { inc: true, text: "Some", card: "Some visits" },
                    grow: { inc: true, text: "Included", card: "Visits" },
                    pro: { inc: true, text: "Included", card: "Visits" },
                },
            },
            {
                id: "extra",
                name: "Extra",
                group: "two",
                pricing: "soon",
                cells: {
                    grow: { inc: true, text: "Included", card: "Extra" },
                    pro: { inc: true, text: "Included", card: "Extra" },
                },
            },
            {
                id: "secret",
                name: "Secret",
                group: "two",
                pricing: "hidden",
                cells: { pro: { inc: true, text: "Included", card: "Secret" } },
            },
        ],
        yearly: { on: true, paid: 10 },
        gst: { show: "excl" },
        addons: [
            {
                id: "more-items",
                kind: "products",
                name: "More items",
                pricePaise: 11_100,
                mode: "pack",
                qty: 3,
            },
            {
                id: "extra-anywhere",
                kind: "module",
                module: "extra",
                name: "Extra anywhere",
                pricePaise: 22_200,
                mode: "unit",
                qty: 1,
            },
        ],
    };
}

export function fakeCatalog(edit?: (c: CatalogInput) => void): Catalog {
    const input = fakeCatalogInput();
    edit?.(input);
    return parseCatalog(input);
}

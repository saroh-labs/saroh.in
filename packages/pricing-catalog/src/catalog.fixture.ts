import type { Catalog, CatalogInput } from "./schema";
import { parseCatalog } from "./schema";

/**
 * A made-up catalogue for tests. Its names, prices and limits are fake on
 * purpose (Plan A/B/C, 111, 222): no test carries a real plan's numbers.
 */
export function fixtureInput(): CatalogInput {
    return {
        plans: [
            {
                id: "a",
                name: "Plan A",
                pricePaise: 0,
                tagline: "A",
                cta: "Try A",
            },
            {
                id: "b",
                name: "Plan B",
                pricePaise: 11_100,
                tagline: "B",
                cta: "Try B",
                featured: true,
            },
            {
                id: "c",
                name: "Plan C",
                pricePaise: 22_200,
                tagline: "C",
                cta: "Try C",
            },
        ],
        groups: [
            { id: "g1", name: "Group one" },
            { id: "g2", name: "Group two" },
        ],
        modules: [
            {
                id: "site",
                name: "Site",
                group: "g1",
                what: "A site.",
                cells: {
                    a: { inc: true, text: "One", card: "A site" },
                    b: {
                        inc: true,
                        text: "One, own address",
                        card: "A site at your address",
                    },
                    c: {
                        inc: true,
                        text: "One, own address",
                        card: "A site at your address",
                    },
                },
            },
            {
                id: "products",
                name: "Things",
                group: "g1",
                menu: "sell",
                child: "Things",
                what: "Things you sell.",
                cells: {
                    a: { inc: true, text: "11", card: "11 things", limit: 11 },
                    b: {
                        inc: true,
                        text: "111",
                        card: "111 things",
                        limit: 111,
                    },
                    c: {
                        inc: true,
                        text: "222",
                        card: "222 things",
                        limit: 222,
                    },
                },
            },
            {
                id: "orders",
                name: "Orders",
                group: "g1",
                what: "Orders.",
                cells: {
                    a: {
                        inc: true,
                        text: "Up to 11 a month",
                        card: "11 orders a month",
                        limit: 11,
                        per: "month",
                    },
                    b: { inc: true, text: "Included", card: "Orders" },
                    c: { inc: true, text: "Included", card: "Orders" },
                },
            },
            {
                id: "invoicing",
                name: "Invoices",
                group: "g2",
                menu: "money",
                what: "Invoices.",
                cells: {
                    a: { inc: false, off: "locked" },
                    b: { inc: true, text: "Included", card: "Invoices" },
                    c: { inc: true, text: "Included", card: "Invoices" },
                },
            },
            {
                id: "roles",
                name: "Roles",
                group: "g2",
                pricing: "soon",
                what: "Roles.",
                cells: {
                    a: { inc: false, off: "hidden" },
                    b: { inc: false, off: "hidden" },
                    c: { inc: true, text: "Included", card: "Roles" },
                },
            },
            {
                id: "members",
                name: "People",
                group: "g2",
                what: "People.",
                cells: {
                    a: { inc: true, text: "1", card: "1 person", limit: 1 },
                    b: { inc: true, text: "3", card: "3 people", limit: 3 },
                    c: { inc: true, text: "33", card: "33 people", limit: 33 },
                },
            },
        ],
        yearly: { on: true, paid: 9 },
        gst: { show: "excl" },
        addons: [
            {
                id: "more-things",
                kind: "products",
                name: "More things",
                pricePaise: 3_300,
                mode: "pack",
                qty: 11,
            },
            {
                id: "one-person",
                kind: "members",
                name: "One more person",
                pricePaise: 1_100,
                mode: "unit",
                qty: 1,
            },
            {
                id: "invoices-alone",
                kind: "module",
                module: "invoicing",
                name: "Invoices",
                pricePaise: 4_400,
                mode: "pack",
                qty: 1,
            },
        ],
    };
}

export function fixture(): Catalog {
    return parseCatalog(fixtureInput());
}

/** A deep copy to edit. */
export function edit(c: Catalog, fn: (c: Catalog) => void): Catalog {
    const out = JSON.parse(JSON.stringify(c)) as Catalog;
    fn(out);
    return out;
}

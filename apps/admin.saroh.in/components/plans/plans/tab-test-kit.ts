import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";

import type { PlansData } from "@/components/plans/plans-context";
import type { AdminPricing } from "@/lib/pricing-types";
import { ASHA, fakePricing, fakeVersion } from "@/test/pricing-fixture";

/**
 * A made-up catalogue for the Plans and Modules tab tests (U7, U8): three
 * plans, two groups, four modules, with names, prices and limits that are
 * fake on purpose. Plan B is highlighted, and its Things cap is soft;
 * Widgets is off on Plan A.
 */
export function tabCatalog(): Catalog {
    return parseCatalog({
        plans: [
            { id: "a", name: "Plan A", pricePaise: 0, cta: "Try A" },
            {
                id: "b",
                name: "Plan B",
                pricePaise: 11_100,
                cta: "Try B",
                featured: true,
            },
            { id: "c", name: "Plan C", pricePaise: 22_200, cta: "Try C" },
        ],
        groups: [
            { id: "g1", name: "Group one" },
            { id: "g2", name: "Group two" },
        ],
        modules: [
            {
                id: "things",
                name: "Things",
                group: "g1",
                menu: "sell",
                child: "Things",
                cells: {
                    a: { inc: true, text: "11", card: "11 things", limit: 11 },
                    b: { inc: true, text: "111", limit: 111, soft: true },
                    c: { inc: true, text: "Included" },
                },
            },
            {
                id: "widgets",
                name: "Widgets",
                group: "g1",
                cells: {
                    a: { inc: false, off: "hidden" },
                    b: { inc: true, text: "Included" },
                    c: { inc: true, text: "Included" },
                },
            },
            {
                id: "gadgets",
                name: "Gadgets",
                group: "g1",
                cells: {
                    b: { inc: true, text: "Included" },
                    c: { inc: true, text: "Included" },
                },
            },
            {
                id: "doodads",
                name: "Doodads",
                group: "g2",
                cells: { c: { inc: true, text: "Included" } },
            },
        ],
        yearly: { on: true, paid: 10 },
        gst: { show: "excl" },
    });
}

export function tabPricing(over: Partial<AdminPricing> = {}): AdminPricing {
    return fakePricing({
        versions: [fakeVersion({ catalog: tabCatalog() })],
        plans: [
            {
                planId: "a",
                name: "Plan A",
                retired: false,
                businesses: 2,
                olderVersion: 0,
            },
            {
                planId: "b",
                name: "Plan B",
                retired: false,
                businesses: 1,
                olderVersion: 1,
            },
        ],
        usage: {
            a: [
                {
                    moduleId: "things",
                    businesses: 2,
                    measured: true,
                    using: 2,
                    highest: 10,
                    over: 0,
                    near: 1,
                    values: [10, 3],
                    line: "2 of 2 use it · highest 10 · 1 at 80%+",
                },
            ],
        },
        ...over,
    });
}

export function tabData(over: Partial<PlansData> = {}): PlansData {
    return {
        pricing: tabPricing(),
        coupons: [],
        siteUrl: "https://site.example.test",
        me: ASHA,
        access: { canEdit: true, canPublish: true, canManageCoupons: true },
        ...over,
    };
}

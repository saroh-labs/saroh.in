import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";

/**
 * A made-up pricing catalogue for the pricing specs (plans catalogue U3).
 * Nothing here is a real price, limit or plan: Plan A/B/C, 111, 222, 333.
 *
 * - `free` (Plan A, nothing), `b` (Plan B, featured), `c` (Plan C).
 * - `products` caps at 11 / 222 / none; `members` at 1 / 3 / 9 (counted).
 * - `invoicing` is off on Plan A, on above it (a switch, not counted).
 * - `secret` is hidden from the pricing page; `themes` is "coming soon".
 * - Add-ons: a products pack, and Invoicing on its own.
 */
export function fakeCatalog(edit?: (c: Catalog) => void): Catalog {
    const c = parseCatalog({
        plans: [
            { id: "free", name: "Plan A", pricePaise: 0, tagline: "Start" },
            {
                id: "b",
                name: "Plan B",
                pricePaise: 22_200,
                featured: true,
            },
            { id: "c", name: "Plan C", pricePaise: 33_300 },
        ],
        groups: [
            { id: "sell", name: "Sell" },
            { id: "team", name: "Team" },
            { id: "site", name: "Site" },
        ],
        modules: [
            {
                id: "products",
                name: "Things",
                group: "sell",
                menu: "sell",
                cells: {
                    free: {
                        inc: true,
                        text: "11",
                        card: "11 things",
                        limit: 11,
                    },
                    b: {
                        inc: true,
                        text: "222",
                        card: "222 things",
                        limit: 222,
                    },
                    c: { inc: true, text: "No cap", card: "No cap on things" },
                },
            },
            {
                id: "invoicing",
                name: "Bills",
                group: "sell",
                cells: {
                    free: { inc: false, off: "locked" },
                    b: { inc: true, text: "Included", card: "Bills" },
                    c: { inc: true, text: "Included" },
                },
            },
            {
                id: "members",
                name: "People",
                group: "team",
                cells: {
                    free: { inc: true, text: "1", limit: 1 },
                    b: { inc: true, text: "3", limit: 3 },
                    c: { inc: true, text: "9", limit: 9 },
                },
            },
            {
                id: "secret",
                name: "Back office",
                group: "site",
                pricing: "hidden",
                cells: {
                    free: { inc: false, off: "hidden" },
                    b: { inc: true, text: "Included" },
                    c: { inc: true, text: "Included" },
                },
            },
            {
                id: "themes",
                name: "Looks",
                group: "site",
                pricing: "soon",
                cells: {
                    free: { inc: true, text: "Included", card: "Looks" },
                    b: { inc: true, text: "Included", card: "Looks" },
                    c: { inc: true, text: "Included", card: "Looks" },
                },
            },
        ],
        yearly: { on: true, paid: 10 },
        gst: { show: "excl" },
        addons: [
            {
                id: "things-pack",
                kind: "products",
                name: "More things",
                pricePaise: 111,
                mode: "pack",
                qty: 11,
            },
            {
                id: "bills",
                kind: "module",
                module: "invoicing",
                name: "Bills on their own",
                pricePaise: 111,
                mode: "unit",
                qty: 1,
            },
            {
                id: "office",
                kind: "module",
                module: "secret",
                name: "Back office on its own",
                pricePaise: 111,
                mode: "unit",
                qty: 1,
            },
        ],
    });
    if (edit) {
        edit(c);
        return parseCatalog(c);
    }
    return c;
}

/**
 * A made-up catalogue whose plan ids are the ones legacy billing keys map to
 * (`free`, `grow`, `pro`: `LEGACY_PLAN_KEYS`), for the entitlement specs
 * (plans catalogue U12). Ids only: the names, prices and caps are fake
 * (Plan A/B/C, 11, 222, 333).
 *
 * - `products`: 11 / 222 / no cap; `members`: 1 / 3 / 9.
 * - `invoicing`: locked on `free`, on above it.
 * - `bookings` (Appointments' only row): locked on `free`, on above it.
 * - `website`: on everywhere, no cap.
 * - Add-ons on every version: a products pack of 11.
 */
export function fakeLegacyMappedCatalog(edit?: (c: Catalog) => void): Catalog {
    const c = parseCatalog({
        plans: [
            { id: "free", name: "Plan A", pricePaise: 0 },
            { id: "grow", name: "Plan B", pricePaise: 22_200, featured: true },
            { id: "pro", name: "Plan C", pricePaise: 33_300 },
        ],
        groups: [{ id: "g", name: "Group" }],
        modules: [
            {
                id: "website",
                name: "Site",
                group: "g",
                cells: {
                    free: { inc: true, text: "One" },
                    grow: { inc: true, text: "One" },
                    pro: { inc: true, text: "One" },
                },
            },
            {
                id: "products",
                name: "Things",
                group: "g",
                menu: "sell",
                child: "Things",
                cells: {
                    free: { inc: true, text: "11", limit: 11 },
                    grow: { inc: true, text: "222", limit: 222 },
                    pro: { inc: true, text: "No cap" },
                },
            },
            {
                id: "bookings",
                name: "Visits",
                group: "g",
                cells: {
                    free: { inc: false, off: "locked" },
                    grow: { inc: true, text: "Included" },
                    pro: { inc: true, text: "Included" },
                },
            },
            {
                id: "invoicing",
                name: "Bills",
                group: "g",
                menu: "money",
                cells: {
                    free: { inc: false, off: "locked" },
                    grow: { inc: true, text: "Included" },
                    pro: { inc: true, text: "Included" },
                },
            },
            {
                id: "members",
                name: "People",
                group: "g",
                cells: {
                    free: { inc: true, text: "1", limit: 1 },
                    grow: { inc: true, text: "3", limit: 3 },
                    pro: { inc: true, text: "9", limit: 9 },
                },
            },
        ],
        yearly: { on: false, paid: 10 },
        gst: { show: "excl" },
        addons: [
            {
                id: "things-pack",
                kind: "products",
                name: "More things",
                pricePaise: 111,
                mode: "pack",
                qty: 11,
            },
        ],
    });
    if (edit) {
        edit(c);
        return parseCatalog(c);
    }
    return c;
}

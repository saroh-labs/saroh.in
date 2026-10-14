import type { CatalogInput } from "@saroh/pricing-catalog";
import { formatInr, GST_PERCENT, withGstPaise } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { usageView } from "./pricing-usage";
import { fakeCatalog } from "./pricing.fixture";

/** Fake caps (Plan A free, B and C paid): no real plan's terms. */
function capped(c: CatalogInput) {
    const products = c.modules.find((m) => m.id === "products");
    if (!products) throw new Error("fixture changed");
    products.cells = {
        free: { inc: true, text: "3", limit: 3 },
        grow: { inc: true, text: "30", limit: 30 },
        pro: { inc: true, text: "Any", limit: null },
    };
    const bookings = c.modules.find((m) => m.id === "bookings");
    if (!bookings) throw new Error("fixture changed");
    bookings.what = "Booked online.";
    bookings.cells = {
        free: { inc: true, text: "5", limit: 5, per: "month" },
        grow: { inc: true, text: "50", limit: 50, per: "month", soft: true },
        pro: { inc: true, text: "500", limit: 500, per: "month", soft: true },
    };
    c.modules.push({
        id: "members",
        name: "Team members",
        group: "two",
        what: "Everyone in the business.",
        cells: {
            grow: { inc: true, text: "4", limit: 4 },
            pro: { inc: true, text: "9", limit: 9 },
        },
    });
    c.addons = [
        {
            id: "items",
            kind: "products",
            name: "More items",
            pricePaise: 11_100,
            mode: "pack",
            qty: 3,
        },
        {
            id: "visits",
            kind: "bookings",
            name: "More bookings",
            pricePaise: 22_200,
            mode: "pack",
            qty: 1_000,
            max: 2,
        },
        {
            id: "member-grow",
            kind: "members",
            name: "Extra team member",
            pricePaise: 3_300,
            mode: "unit",
            qty: 1,
            plans: ["grow"],
            max: 3,
        },
        {
            id: "member-pro",
            kind: "members",
            name: "Extra team member",
            pricePaise: 4_400,
            mode: "unit",
            qty: 1,
            plans: ["pro"],
        },
    ];
}

function lines(withGst = false, edit?: (c: CatalogInput) => void) {
    const usage = usageView(
        fakeCatalog((c) => {
            capped(c);
            edit?.(c);
        }),
        withGst,
    );
    if (!usage) throw new Error("no usage");
    return usage;
}

function row(label: string, withGst = false, edit?: (c: CatalogInput) => void) {
    const r = lines(withGst, edit).rows.find(
        (x) => x.kind === "line" && x.label === label,
    );
    if (r?.kind !== "line") throw new Error(`no row ${label}`);
    return r;
}

describe("usageView rows", () => {
    it("one row per capped catalogue row with an add-on, by group, in order", () => {
        const { rows } = lines();
        expect(rows.map((r) => [r.kind, r.label])).toEqual([
            ["group", "Group one"],
            ["line", "Products"],
            ["group", "Group two"],
            ["line", "Bookings"],
            ["line", "Team members"],
        ]);
        expect(row("Bookings").what).toBe("Booked online.");
    });

    it("a pack: the allowance, then the price per pack; free states its allowance; no cap is No limit", () => {
        expect(row("Products").cells).toEqual([
            "3 included",
            `30 included, then ${formatInr(11_100)} per 3`,
            "No limit",
        ]);
    });

    it("a monthly row says a month, and a maximum adds the total reachable", () => {
        expect(row("Bookings").cells).toEqual([
            "5 a month included",
            `50 a month included, then ${formatInr(22_200)} per 1,000, up to 2,050 online bookings a month`,
            `500 a month included, then ${formatInr(22_200)} per 1,000, up to 2,500 online bookings a month`,
        ]);
    });

    it("a unit: per person a month, each plan its own price and maximum (DEC-157)", () => {
        expect(row("Team members").cells).toEqual([
            "Not included",
            `4 included, then ${formatInr(3_300)} per person a month, up to 7 people`,
            `9 included, then ${formatInr(4_400)} per person a month`,
        ]);
    });

    it("prices follow the GST switch", () => {
        expect(row("Products", true).cells[1]).toBe(
            `30 included, then ${formatInr(withGstPaise(11_100))} per 3`,
        );
    });

    it("an add-on only on a plan nobody can choose shows nothing for it", () => {
        const usage = usageView(
            fakeCatalog((c) => {
                capped(c);
                c.plans[2].retired = true;
                c.addons = c.addons?.filter((a) => a.id === "member-pro");
            }),
            false,
        );
        expect(usage).toBeNull();
    });

    it("leaves out a row whose plans have no cap to raise", () => {
        const { rows } = lines(false, (c) => {
            const p = c.modules.find((m) => m.id === "products");
            if (p) p.cells.grow = { inc: true, text: "Any", limit: null };
        });
        expect(rows.some((r) => r.label === "Products")).toBe(false);
    });

    it("a module add-on: included, or added for its price where a plan leaves it out", () => {
        const usage = usageView(
            fakeCatalog((c) => {
                const extra = c.modules.find((m) => m.id === "extra");
                if (extra) delete extra.cells.grow;
            }),
            false,
        );
        const extra = usage?.rows.find((r) => r.label === "Extra");
        expect(extra).toMatchObject({
            cells: [
                "Not included",
                `Add it for ${formatInr(22_200)} a month`,
                "Included",
            ],
        });
    });

    it("no section when nothing can be added", () => {
        expect(
            usageView(
                fakeCatalog((c) => {
                    c.addons = [];
                }),
                false,
            ),
        ).toBeNull();
    });
});

describe("usageView notes", () => {
    it("billing, where to change it, soft caps, the free plan and GST", () => {
        expect(lines().notes).toEqual([
            "What you add is billed with your plan after the month it covers, or after the year on a yearly plan. Added part-way through, it costs only the days left.",
            "Add or remove it any time in Settings › Plan and billing, and your allowance changes at once.",
            "On Plan B and Plan C, online bookings past the allowance still come in, so no customer is turned away. We let you know when you pass it.",
            "On Plan A, the allowance is what you get: adding more is for paid plans.",
            `Prices are before GST. ${GST_PERCENT}% GST is added to your bill.`,
        ]);
        expect(lines(true).notes.at(-1)).toBe(
            `Prices include ${GST_PERCENT}% GST.`,
        );
    });

    it("says nothing about soft caps when a paid plan's cap refuses", () => {
        const { notes } = lines(false, (c) => {
            const b = c.modules.find((m) => m.id === "bookings");
            if (b)
                b.cells.grow = {
                    inc: true,
                    text: "50",
                    limit: 50,
                    per: "month",
                };
        });
        expect(notes.join(" ")).not.toContain("turned away");
    });
});

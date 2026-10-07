import { describe, expect, it } from "vitest";

import { edit, fixture } from "./catalog.fixture";
import { diff } from "./diff";

// The rupee sign, built from its code point so no file but the seed spells it.
const R = String.fromCodePoint(0x20b9);

describe("diff", () => {
    it("says nothing changed for the same catalogue", () => {
        expect(diff(fixture(), fixture())).toEqual([]);
    });

    it("words a price change as the design does", () => {
        const b = edit(fixture(), (c) => {
            c.plans[1].pricePaise = 12_300;
        });
        expect(diff(fixture(), b)).toEqual([
            `Plan B: ${R}111 → ${R}123 a month`,
        ]);
    });

    it("words plan, module and cell changes", () => {
        const b = edit(fixture(), (c) => {
            c.plans[2].retired = true;
            c.plans[0].name = "Plan Zero";
            c.modules[1].cells.b = {
                inc: true,
                text: "122",
                card: "122 things",
                limit: 122,
                per: "",
                soft: false,
            };
            c.modules[3].cells.a = {
                inc: true,
                text: "Included",
                card: "Invoices",
                limit: null,
                per: "",
                soft: false,
            };
            c.modules[4].cells.a = { inc: false, off: "locked" };
            c.modules.push({
                id: "extra",
                name: "Extra",
                group: "g2",
                pricing: "soon",
                what: "",
                cells: {},
            });
        });
        expect(diff(fixture(), b)).toEqual([
            "Plan A renamed to Plan Zero",
            "Plan C retired: no new businesses can choose it",
            "Things on Plan B: 111 → 122",
            "Invoices added to Plan Zero",
            "Roles on Plan Zero: shown locked in the dashboard",
            "New module: Extra (coming soon)",
        ]);
    });

    it("words a cap turning soft", () => {
        const b = edit(fixture(), (c) => {
            const cell = c.modules[1].cells.b;
            if (cell.inc) cell.soft = true;
        });
        expect(diff(fixture(), b)).toEqual([
            "Things on Plan B: a soft cap, never refused",
        ]);
    });

    it("words offers: yearly, GST display, trials and add-ons", () => {
        const b = edit(fixture(), (c) => {
            c.yearly.paid = 10;
            c.gst.show = "incl";
            c.plans[1].trial = { on: true, days: 7 };
            c.addons = c.addons.filter((a) => a.id !== "one-person");
            c.addons[0].qty = 22;
        });
        expect(diff(fixture(), b)).toEqual([
            "Yearly billing: pay for 9 → 10 months",
            "Pricing page shows prices with GST first",
            "Plan B: 7-day free trial on",
            "Add-on changed: More things",
            "Add-on removed: One more person",
        ]);
    });

    it("words a first month that starts or stops costing something", () => {
        const a = edit(fixture(), (c) => {
            c.plans[1].trial = { on: true, days: 30 };
        });
        const b = edit(a, (c) => {
            c.plans[1].trial = { on: true, days: 30, firstPaise: 700 };
        });
        expect(diff(a, b)).toEqual(["Plan B: first 30 days cost ₹7 + GST"]);
        expect(diff(b, a)).toEqual(["Plan B: first 30 days free"]);
    });

    it("notices removed modules and reordered rows", () => {
        const b = edit(fixture(), (c) => {
            c.modules = c.modules.filter((m) => m.id !== "roles");
            const [first] = c.modules.splice(0, 1);
            c.modules.push(first);
        });
        expect(diff(fixture(), b)).toEqual([
            "Module removed: Roles",
            "Rows reordered on the pricing page",
        ]);
    });
});

import { formatInr } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { CatalogueBusiness } from "./impact";
import { catalogueImpact, limitWords, moduleUsage } from "./impact";

const MEASURED = new Set(["products", "members"]);

function biz(
    id: string,
    planId: string,
    usage: Record<string, number> = {},
    extra: Partial<CatalogueBusiness> = {},
): CatalogueBusiness {
    return {
        id,
        name: `Business ${id}`,
        planId,
        version: 1,
        paying: planId !== "free",
        cycle: "month",
        currentPaise: planId === "b" ? 22_200 : planId === "c" ? 33_300 : 0,
        ownPrice: false,
        usage,
        ...extra,
    };
}

const titles = (r: ReturnType<typeof catalogueImpact>) =>
    r.items.map((i) => `${i.label}: ${i.title}`);

describe("catalogueImpact", () => {
    const live = fakeCatalog();

    it("lists the Plan B businesses over a lowered products cap under Takes away", () => {
        const next = fakeCatalog((c) => {
            const cell = c.modules[0]!.cells.b!;
            if (cell.inc) cell.limit = 111;
        });
        const businesses = [
            biz("over", "b", { products: 150 }),
            biz("near", "b", { products: 100 }),
            biz("fine", "b", { products: 5 }),
            biz("other-plan", "c", { products: 999 }),
        ];
        const r = catalogueImpact({
            live,
            next,
            businesses,
            measured: MEASURED,
        });
        const item = r.items.find((i) =>
            i.title.startsWith("Things on Plan B"),
        )!;
        expect(item).toMatchObject({
            tone: "danger",
            label: "Takes away",
            title: "Things on Plan B: 222 → 111",
            detail: "1 over the new limit. What's over stays, read-only. 1 at 80% or more will see a warning.",
        });
        expect(item.businesses.map((b) => b.id)).toEqual(["over", "near"]);
        expect(r.touched).toBe(2);
        expect(r.total).toBe(4);
    });

    it("says nobody is over when nobody is", () => {
        const next = fakeCatalog((c) => {
            const cell = c.modules[0]!.cells.b!;
            if (cell.inc) cell.limit = 111;
        });
        const r = catalogueImpact({
            live,
            next,
            businesses: [biz("small", "b", { products: 3 })],
            measured: MEASURED,
        });
        expect(r.items[0]).toMatchObject({
            tone: "warn",
            label: "Check",
            detail: "Nobody is over it.",
        });
    });

    it("prices a plan change, skipping businesses with their own price and those not paying", () => {
        const next = fakeCatalog((c) => {
            c.plans[1]!.pricePaise = 33_300;
        });
        const businesses = [
            biz("pays", "b"),
            biz("own", "b", {}, { ownPrice: true, currentPaise: 111 }),
            biz("trial", "b", {}, { paying: false, currentPaise: 0 }),
        ];
        const r = catalogueImpact({
            live,
            next,
            businesses,
            measured: MEASURED,
        });
        expect(r.items[0]).toMatchObject({
            tone: "warn",
            title: `Plan B: ${formatInr(22_200)} → ${formatInr(33_300)} a month`,
            detail: "1 business pays more. 1 have their own price and don't change.",
        });
        expect(r.items[0]!.businesses.map((b) => b.id)).toEqual(["pays"]);
        expect(r.revenue).toEqual({
            nowPaise: 22_200 + 111,
            nextPaise: 33_300 + 111,
        });
    });

    it("prices a yearly business by the month", () => {
        const next = fakeCatalog((c) => {
            c.plans[1]!.pricePaise = 33_300;
        });
        const r = catalogueImpact({
            live,
            next,
            businesses: [
                biz("yearly", "b", {}, { cycle: "year", currentPaise: 18_500 }),
            ],
            measured: MEASURED,
        });
        // 333.00 × 10 paid months / 12, half-up to the paisa.
        expect(r.revenue.nextPaise).toBe(27_750);
    });

    it("names who uses a module taken off a plan, when usage is counted", () => {
        const next = fakeCatalog((c) => {
            c.modules[2]!.cells.b = { inc: false, off: "hidden" };
        });
        const r = catalogueImpact({
            live,
            next,
            businesses: [
                biz("x", "b", { members: 2 }),
                biz("y", "b", { members: 0 }),
            ],
            measured: MEASURED,
        });
        expect(r.items[0]).toMatchObject({
            tone: "danger",
            title: "People taken off Plan B",
            detail: "1 of 2 on Plan B use it today. They'd see it disappear from the menu.",
        });
        expect(r.items[0]!.businesses.map((b) => b.id)).toEqual(["x"]);
    });

    it("doesn't claim nobody uses a module whose usage isn't counted", () => {
        const next = fakeCatalog((c) => {
            c.modules[1]!.cells.b = { inc: false, off: "locked" };
        });
        const r = catalogueImpact({
            live,
            next,
            businesses: [biz("x", "b"), biz("y", "b")],
            measured: MEASURED,
        });
        expect(r.items[0]).toMatchObject({
            tone: "danger",
            title: "Bills taken off Plan B",
            detail: "2 on Plan B lose it. They'd see it locked, with an upgrade panel.",
        });
        expect(r.items[0]!.businesses).toHaveLength(2);
    });

    it("lists what gives more, new plans and pricing-page changes", () => {
        const next = fakeCatalog((c) => {
            c.modules[1]!.cells.free = {
                inc: true,
                text: "Included",
                card: "",
                limit: null,
                per: "",
            };
            c.plans.push({
                id: "d",
                name: "Plan D",
                pricePaise: 44_400,
                tagline: "",
                cta: "",
                featured: false,
                retired: false,
            });
            c.plans[2]!.retired = true;
            c.gst.show = "incl";
        });
        const r = catalogueImpact({
            live,
            next,
            businesses: [biz("a", "free"), biz("c1", "c")],
            measured: MEASURED,
        });
        expect(titles(r)).toEqual([
            "Pricing page: Plan C retired",
            `Pricing page: New plan: Plan D at ${formatInr(44_400)}`,
            "Gives more: Bills added to Plan A",
            "Pricing page: Prices shown with GST first",
        ]);
        expect(r.items[0]!.detail).toBe(
            "Leaves the pricing page. The 1 business on it stay on it.",
        );
    });

    it("finds who could buy a new add-on", () => {
        const next = fakeCatalog((c) => {
            c.addons.push({
                id: "people-pack",
                kind: "members",
                name: "More people",
                pricePaise: 111,
                mode: "pack",
                qty: 1,
            });
        });
        const r = catalogueImpact({
            live,
            next,
            businesses: [
                biz("full", "b", { members: 3 }),
                biz("room", "b", { members: 1 }),
            ],
            measured: MEASURED,
        });
        expect(r.items[0]).toMatchObject({
            title: "New add-on: More people",
            detail: "1 business is at 80% or more of their limit and could buy it.",
        });
    });

    it("reports nothing for an unchanged catalogue", () => {
        const r = catalogueImpact({
            live,
            next: fakeCatalog(),
            businesses: [biz("a", "b", { products: 5 })],
            measured: MEASURED,
        });
        expect(r.items).toEqual([]);
        expect(r.revenue.nowPaise).toBe(r.revenue.nextPaise);
    });
});

describe("moduleUsage", () => {
    const c = fakeCatalog();
    const businesses = [
        biz("a", "b", { products: 250 }),
        biz("b2", "b", { products: 190 }),
        biz("c2", "b", { products: 0 }),
        biz("d", "free", { products: 3 }),
    ];

    it("gives the plan editor's line and the raw counts", () => {
        expect(moduleUsage(c, "b", "products", businesses, MEASURED)).toEqual({
            moduleId: "products",
            businesses: 3,
            measured: true,
            using: 2,
            highest: 250,
            over: 1,
            near: 1,
            values: [250, 190, 0],
            line: "2 of 3 use it · highest 250 · 1 over the limit",
        });
    });

    it("says nobody is on an empty plan, and nothing for an uncounted module", () => {
        expect(moduleUsage(c, "c", "products", businesses, MEASURED).line).toBe(
            "Nobody on Plan C yet",
        );
        expect(
            moduleUsage(c, "b", "invoicing", businesses, MEASURED),
        ).toMatchObject({
            measured: false,
            businesses: 3,
            using: null,
            line: null,
        });
    });
});

describe("limitWords", () => {
    it("words a cell as the design does", () => {
        const [products, invoicing] = fakeCatalog().modules;
        expect(limitWords(products!.cells.b!)).toBe("222");
        expect(limitWords(products!.cells.c!)).toBe("No cap");
        expect(limitWords(invoicing!.cells.free!)).toBe("Not included");
    });
});

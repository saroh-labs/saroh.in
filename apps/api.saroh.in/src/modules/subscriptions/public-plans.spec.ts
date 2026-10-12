/**
 * The Plans block's read (round-2 G9): the order a site lists plans in and
 * which one is "Most chosen". The database half is `public-plans.db.spec.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { orderPlans } from "./public-plans.service";

const row = (
    id: string,
    price: string,
    members = 0,
    over: { name?: string; description?: string | null } = {},
) => ({
    id,
    name: over.name ?? id,
    description: over.description ?? null,
    price,
    currency: "INR",
    interval: "MONTH",
    members,
});

describe("orderPlans (G9)", () => {
    it("lists the plan most members are on first, and marks it", () => {
        const plans = orderPlans([
            row("weekly", "300", 4),
            row("monthly", "1200", 9),
        ]);
        expect(plans.map((p) => p.id)).toEqual(["monthly", "weekly"]);
        expect(plans.map((p) => p.mostChosen)).toEqual([true, false]);
    });

    it("with nobody on any plan, lists by price and claims no favourite", () => {
        const plans = orderPlans([
            row("unlimited", "2500"),
            row("monthly", "1200"),
            row("drop-in", "1200.5"),
        ]);
        expect(plans.map((p) => p.id)).toEqual([
            "monthly",
            "drop-in",
            "unlimited",
        ]);
        expect(plans.some((p) => p.mostChosen)).toBe(false);
    });

    it("a tie at the top is no favourite either", () => {
        const plans = orderPlans([row("a", "100", 3), row("b", "200", 3)]);
        expect(plans.map((p) => p.id)).toEqual(["a", "b"]);
        expect(plans.some((p) => p.mostChosen)).toBe(false);
    });

    it("one plan with members is the favourite; alone with none, it isn't", () => {
        expect(orderPlans([row("only", "100", 1)])[0]?.mostChosen).toBe(true);
        expect(orderPlans([row("only", "100", 0)])[0]?.mostChosen).toBe(false);
    });

    it("serves money as a two-place string and never the member count", () => {
        const [plan] = orderPlans([
            row("monthly", "1200", 5, { description: "  " }),
        ]);
        expect(plan).toEqual({
            id: "monthly",
            name: "monthly",
            description: null,
            price: "1200.00",
            currency: "INR",
            interval: "MONTH",
            mostChosen: true,
            // No rate on the plan: nothing is said about GST.
            gst: null,
        });
        expect(plan).not.toHaveProperty("members");
    });

    describe("the GST a customer is told before joining (12 Oct 2026)", () => {
        const registered = (mode: "INCLUDED" | "ADDED") => ({
            registered: true,
            mode,
        });
        const gym = (extra: Record<string, unknown>) => [
            { ...row("gym", "2000", 3), ...extra },
        ];

        it("says nothing for a business that isn't registered, whatever the plan's rate", () => {
            expect(orderPlans(gym({ gstRate: "18" }))[0]?.gst).toBeNull();
            expect(
                orderPlans(gym({ gstRate: "18" }), {
                    registered: false,
                    mode: "ADDED",
                })[0]?.gst,
            ).toBeNull();
        });

        it("says nothing with no rate chosen, or an exempt plan", () => {
            expect(orderPlans(gym({}), registered("ADDED"))[0]?.gst).toBeNull();
            expect(
                orderPlans(gym({ gstRate: "0" }), registered("ADDED"))[0]?.gst,
            ).toBeNull();
        });

        it("includes GST: ₹2,000 to pay, ₹305.08 of it GST", () => {
            const [plan] = orderPlans(
                gym({ gstRate: "18" }),
                registered("INCLUDED"),
            );
            expect(plan?.price).toBe("2000.00");
            expect(plan?.gst).toEqual({
                mode: "INCLUDED",
                rate: "18",
                listCents: 200_000,
                gstCents: 30_508,
                payCents: 200_000,
            });
        });

        it("GST is added: ₹2,000 + ₹360 is ₹2,360 to pay, and the typed price stays the price", () => {
            const [plan] = orderPlans(
                gym({ gstRate: "18" }),
                registered("ADDED"),
            );
            expect(plan?.price).toBe("2000.00");
            expect(plan?.gst).toEqual({
                mode: "ADDED",
                rate: "18",
                listCents: 200_000,
                gstCents: 36_000,
                payCents: 236_000,
            });
        });

        it("a plan priced the other way from the business follows its own choice", () => {
            const [plan] = orderPlans(
                gym({ gstRate: "18", gstPriceMode: "ADDED" }),
                registered("INCLUDED"),
            );
            expect(plan?.gst?.payCents).toBe(236_000);
        });
    });

    it("is empty for no plans", () => {
        expect(orderPlans([])).toEqual([]);
    });
});

describe("the public plans route (G9)", () => {
    const source = readFileSync(
        join(__dirname, "public-plans.controller.ts"),
        "utf8",
    );

    it("carries no guard: visitors have no session or organization", () => {
        // Only the one every public site read carries: a deleted business's
        // site is offline (#921). It asks for no session.
        expect(source.match(/@UseGuards\([^)]*\)/g)).toEqual([
            "@UseGuards(PublicSiteOnlineGuard)",
        ]);
        expect(source).not.toContain("@RequireModule(");
    });

    it("is never cached, so a published price shows on the next view", () => {
        expect(source).toContain('@Header("Cache-Control", "no-store")');
    });

    it("never names a payment method (DEC-059)", () => {
        const service = readFileSync(
            join(__dirname, "public-plans.service.ts"),
            "utf8",
        );
        const code = service.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        // It may pass on the autopay methods the provider itself reports
        // (D12; DEC-059 allows that), but never names one of its own.
        expect(code).not.toMatch(/upi|card|razorpay|cashfree|emandate/i);
    });
});

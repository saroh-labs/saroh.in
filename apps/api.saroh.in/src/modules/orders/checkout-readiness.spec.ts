/**
 * Whether a storefront can take an online order (G13), with the plan's
 * say (`billing/online-payments-plan.ts`): on a plan without online
 * payments the site takes no new checkout, and the editor says why. The
 * database is a stub; `planMeter` is spied on. Rows are made up.
 */
import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import { planMeter } from "../billing/metering.service";
import { checkoutReadiness, readinessMessage } from "./checkout-readiness";

function db(paused = false) {
    return {
        storeSettings: {
            findUnique: jest
                .fn()
                .mockResolvedValue({ pausedAt: paused ? new Date() : null }),
        },
        merchantPaymentProvider: {
            findFirst: jest.fn().mockResolvedValue({
                id: "mpp_1",
                provider: "RAZORPAY",
                status: "CONNECTED",
                publicKey: "rzp_key",
            }),
            findMany: jest.fn().mockResolvedValue([
                {
                    id: "mpp_1",
                    provider: "RAZORPAY",
                    status: "CONNECTED",
                    publicKey: "rzp_key",
                },
            ]),
        },
    };
}

function onPlan(plan: "free" | "grow" | null) {
    return jest
        .spyOn(planMeter, "enforcedRow")
        .mockResolvedValue(plan ? fakePaymentsRow(plan, "payments") : null);
}

afterEach(() => jest.restoreAllMocks());

describe("checkout readiness and the plan", () => {
    it("takes no new checkout on a plan without online payments", async () => {
        onPlan("free");
        const stub = db();

        await expect(
            checkoutReadiness(stub as never, "org_1", "store_1"),
        ).resolves.toEqual({ ok: false, reason: "plan" });
        // Refused before any provider is looked for.
        expect(stub.merchantPaymentProvider.findFirst).not.toHaveBeenCalled();
        expect(stub.merchantPaymentProvider.findMany).not.toHaveBeenCalled();
    });

    it("says a paused storefront first", async () => {
        const spy = onPlan("free");

        await expect(
            checkoutReadiness(db(true) as never, "org_1", "store_1"),
        ).resolves.toEqual({ ok: false, reason: "paused" });
        expect(spy).not.toHaveBeenCalled();
    });

    it("asks the provider on a plan with it, and behind the kill switch", async () => {
        for (const plan of ["grow", null] as const) {
            onPlan(plan);
            const result = await checkoutReadiness(
                db() as never,
                "org_1",
                "store_1",
            );
            expect(result).not.toEqual({ ok: false, reason: "plan" });
            jest.restoreAllMocks();
        }
    });

    it("tells the merchant why, naming no price", () => {
        expect(readinessMessage("plan")).toBe(
            "Your plan doesn't include taking payment online, so your site can't take orders. Customers see “Ask about ordering” instead.",
        );
    });
});

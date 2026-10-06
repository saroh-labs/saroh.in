/**
 * Whether a storefront can take an order at the site's checkout (G13), and
 * how it may be paid, with the plan's say (`billing/online-payments-plan.ts`)
 * and the owner's rule of 2026-10-06: online needs a paid plan, Free takes
 * money offline. On a plan without online payments the checkout takes
 * payment at the handover ("Pay when you collect", "Pay on delivery"); on a
 * plan with them it pays online, and at the handover too only where the
 * storefront turns it on. The database is a stub; `planMeter` is spied on.
 * Rows are made up.
 */
import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import { planMeter } from "../billing/metering.service";
import {
    checkoutReadiness,
    onHandoverLabel,
    payableWays,
    payOptionsFor,
    readinessMessage,
} from "./checkout-readiness";

function db(
    opts: { paused?: boolean; onHandover?: boolean; provider?: boolean } = {},
) {
    const { paused = false, onHandover = false, provider = true } = opts;
    const connection = {
        id: "mpp_1",
        provider: "RAZORPAY",
        status: "CONNECTED",
        publicKey: "rzp_key",
    };
    return {
        storeSettings: {
            findUnique: jest.fn().mockResolvedValue({
                pausedAt: paused ? new Date() : null,
                offerPayOnHandover: onHandover,
            }),
        },
        merchantPaymentProvider: {
            findFirst: jest
                .fn()
                .mockResolvedValue(provider ? connection : null),
            findMany: jest.fn().mockResolvedValue(provider ? [connection] : []),
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
    it("takes orders paid at the handover, and only those, on a plan without online payments", async () => {
        onPlan("free");
        // Even with a provider connected and the switch off.
        const stub = db({ provider: true, onHandover: false });

        await expect(
            checkoutReadiness(stub as never, "org_1", "store_1"),
        ).resolves.toEqual({ ok: true, online: false, onHandover: true });
        // No provider is asked: online isn't the plan's.
        expect(stub.merchantPaymentProvider.findFirst).not.toHaveBeenCalled();
        expect(stub.merchantPaymentProvider.findMany).not.toHaveBeenCalled();
    });

    it("takes orders on a plan without online payments even with no provider", async () => {
        onPlan("free");

        await expect(
            checkoutReadiness(
                db({ provider: false }) as never,
                "org_1",
                "store_1",
            ),
        ).resolves.toEqual({ ok: true, online: false, onHandover: true });
    });

    it("says a paused storefront first", async () => {
        const spy = onPlan("free");

        await expect(
            checkoutReadiness(
                db({ paused: true }) as never,
                "org_1",
                "store_1",
            ),
        ).resolves.toEqual({ ok: false, reason: "paused" });
        expect(spy).not.toHaveBeenCalled();
    });

    it("pays online only on a paid plan with the switch off (the default)", async () => {
        onPlan("grow");

        await expect(
            checkoutReadiness(db() as never, "org_1", "store_1"),
        ).resolves.toEqual({ ok: true, online: true, onHandover: false });
    });

    it("offers both on a paid plan with the switch on", async () => {
        onPlan("grow");

        await expect(
            checkoutReadiness(
                db({ onHandover: true }) as never,
                "org_1",
                "store_1",
            ),
        ).resolves.toEqual({ ok: true, online: true, onHandover: true });
    });

    it("takes orders paid at the handover on a paid plan with no provider, when switched on", async () => {
        onPlan("grow");

        await expect(
            checkoutReadiness(
                db({ provider: false, onHandover: true }) as never,
                "org_1",
                "store_1",
            ),
        ).resolves.toEqual({ ok: true, online: false, onHandover: true });
    });

    it("can't order on a paid plan with no provider and the switch off", async () => {
        onPlan("grow");

        await expect(
            checkoutReadiness(
                db({ provider: false }) as never,
                "org_1",
                "store_1",
            ),
        ).resolves.toEqual({ ok: false, reason: "no-provider" });
    });

    it("asks the provider behind the kill switch, as on a paid plan", async () => {
        onPlan(null);

        await expect(
            checkoutReadiness(db() as never, "org_1", "store_1"),
        ).resolves.toEqual({ ok: true, online: true, onHandover: false });
    });

    it("tells the merchant why, naming no plan or price", () => {
        expect(readinessMessage("no-provider")).toBe(
            "Connect payments, or let customers pay when they collect, to take orders on your site. Until then, customers see “Ask about ordering” instead.",
        );
        expect(readinessMessage("paused")).toMatch(/paused/);
    });
});

describe("how an order leaving each way can be paid", () => {
    const free = { online: false, onHandover: true };
    const paidOff = { online: true, onHandover: false };
    const paidOn = { online: true, onHandover: true };

    it("names paying at the handover by the way it leaves", () => {
        expect(onHandoverLabel("PICKUP")).toBe("Pay when you collect");
        expect(onHandoverLabel("LOCAL_DELIVERY")).toBe("Pay on delivery");
        // A courier takes no money for the business.
        expect(onHandoverLabel("SHIPPING")).toBeNull();
    });

    it("offers only paying at the handover on a plan without online payments", () => {
        expect(payOptionsFor(free, "PICKUP")).toEqual([
            { type: "ON_HANDOVER", label: "Pay when you collect" },
        ]);
        expect(payOptionsFor(free, "LOCAL_DELIVERY")).toEqual([
            { type: "ON_HANDOVER", label: "Pay on delivery" },
        ]);
        expect(payOptionsFor(free, "SHIPPING")).toEqual([]);
        // So a shipment isn't offered at all.
        expect(
            payableWays(free, ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"]),
        ).toEqual(["PICKUP", "LOCAL_DELIVERY"]);
    });

    it("offers online only on a paid plan with the switch off", () => {
        expect(payOptionsFor(paidOff, "PICKUP")).toEqual([
            { type: "ONLINE", label: "Pay online" },
        ]);
        expect(
            payableWays(paidOff, ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"]),
        ).toEqual(["PICKUP", "LOCAL_DELIVERY", "SHIPPING"]);
    });

    it("offers both, online first, on a paid plan with the switch on", () => {
        expect(payOptionsFor(paidOn, "PICKUP")).toEqual([
            { type: "ONLINE", label: "Pay online" },
            { type: "ON_HANDOVER", label: "Pay when you collect" },
        ]);
        expect(payOptionsFor(paidOn, "SHIPPING")).toEqual([
            { type: "ONLINE", label: "Pay online" },
        ]);
    });
});

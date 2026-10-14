/**
 * A price change ahead (DEC-161): which moves are one, and that a business
 * that hasn't approved the new amount keeps paying the price it has — the
 * move waits, it is never moved to Free and its charges never stop. A fake
 * database; made-up prices (Plan B at 222, then 333).
 */
import type { MoveSubscription } from "./plan-moves";
import { moveReadiness } from "./plan-moves";
import { priceChangeOf, priceWords } from "./price-change";

const from = new Date("2026-11-25T00:00:00.000Z");
const payload = {
    subscriptionId: "s1",
    pendingPlanId: "plan-v2-b",
    pendingFrom: from.toISOString(),
};

function db(
    over: Record<string, unknown> = {},
    scheduled: { id: string } | null = null,
) {
    return {
        subscription: {
            findUnique: jest.fn(async () => ({
                organizationId: "org1",
                status: "ACTIVE",
                provider: "RAZORPAY",
                providerSubscriptionId: "sub_test",
                pendingPlanId: "plan-v2-b",
                pendingFrom: from,
                plan: { priceCents: 22_200, interval: "month" },
                pendingPlan: {
                    name: "Plan B",
                    priceCents: 33_300,
                    interval: "month",
                },
                ...over,
            })),
        },
        billingCheckout: { findFirst: jest.fn(async () => scheduled) },
    } as never;
}

describe("priceChangeOf", () => {
    it("reads a move to another amount on autopay as a price change", async () => {
        expect(await priceChangeOf(db(), payload)).toEqual({
            organizationId: "org1",
            planName: "Plan B",
            fromPaise: 22_200,
            toPaise: 33_300,
            interval: "month",
            pendingFrom: from,
        });
    });

    it("says nothing once the new amount is approved, or the move changed", async () => {
        expect(await priceChangeOf(db({}, { id: "c1" }), payload)).toBeNull();
        expect(
            await priceChangeOf(db({ pendingPlanId: "plan-v3-b" }), payload),
        ).toBeNull();
        expect(
            await priceChangeOf(db({ pendingFrom: new Date() }), payload),
        ).toBeNull();
        expect(
            await priceChangeOf(
                db({ pendingPlan: null, pendingFrom: null }),
                payload,
            ),
        ).toBeNull();
    });

    it("is not one at the same price, on Free, or with nothing billed at the provider", async () => {
        expect(
            await priceChangeOf(
                db({
                    pendingPlan: {
                        name: "Plan B",
                        priceCents: 22_200,
                        interval: "month",
                    },
                }),
                payload,
            ),
        ).toBeNull();
        expect(
            await priceChangeOf(
                db({ plan: { priceCents: 0, interval: "month" } }),
                payload,
            ),
        ).toBeNull();
        expect(
            await priceChangeOf(db({ providerSubscriptionId: null }), payload),
        ).toBeNull();
    });

    it("words a price with its cycle and GST", () => {
        expect(priceWords(33_300, "month")).toBe("₹333 a month plus GST");
        expect(priceWords(333_000, "year")).toBe("₹3,330 a year plus GST");
    });
});

describe("until the business approves a new price, it keeps the one it has", () => {
    const plan = (id: string, priceCents: number, version: number) => ({
        id,
        key: "catalog.b",
        version,
        interval: "month",
        priceCents,
    });
    const sub = (over: Partial<MoveSubscription> = {}): MoveSubscription => ({
        status: "ACTIVE",
        provider: "RAZORPAY",
        providerSubscriptionId: "sub_test",
        cancelAtPeriodEnd: false,
        pendingPlanId: "plan-v2-b",
        pendingFrom: from,
        plan: plan("plan-v1-b", 22_200, 1),
        pendingPlan: plan("plan-v2-b", 33_300, 2),
        ...over,
    });
    const after = new Date(from.getTime() + 40 * 24 * 60 * 60 * 1000);

    it("waits for approval on the date and after it: never applied, never Free", () => {
        for (const now of [from, after]) {
            expect(
                moveReadiness({
                    subscription: sub(),
                    scheduledPlanId: null,
                    held: new Set(),
                    now,
                }),
            ).toBe("needs-authorisation");
        }
    });

    it("moves once the new amount is approved (a SCHEDULED checkout to it)", () => {
        expect(
            moveReadiness({
                subscription: sub(),
                scheduledPlanId: "plan-v2-b",
                held: new Set(),
                now: after,
            }),
        ).toBe("ready");
    });

    it("a move at the same price needs no approval", () => {
        expect(
            moveReadiness({
                subscription: sub({
                    pendingPlan: plan("plan-v2-b", 22_200, 2),
                }),
                scheduledPlanId: null,
                held: new Set(),
                now: after,
            }),
        ).toBe("ready");
    });
});

import type { IntentForState } from "./online-payment";
import {
    latestIntentsFor,
    onlinePaymentForRead,
    onlinePaymentOf,
    WAITING_MS,
} from "./online-payment";
import type { RawOrderRow } from "./order-row";
import { serializeOrderRow } from "./order-row";

/**
 * Where an order's online payment stands (#122): failed, waiting for the
 * provider, or not finished — only while the order still owes money.
 */
const now = new Date("2026-10-09T10:00:00.000Z");

function intent(over: Partial<IntentForState> = {}): IntentForState {
    return {
        orderId: "o1",
        status: "REQUIRES_PAYMENT",
        provider: "RAZORPAY",
        createdAt: new Date(now.getTime() - 5 * 60_000),
        updatedAt: new Date(now.getTime() - 5 * 60_000),
        ...over,
    };
}

const owing = { status: "PENDING", owedCents: 48_000 };

describe("onlinePaymentOf", () => {
    it("says failed when the newest payment failed, since it failed", () => {
        const failedAt = new Date(now.getTime() - 60_000);
        expect(
            onlinePaymentOf(
                intent({ status: "FAILED", updatedAt: failedAt }),
                owing,
                now,
            ),
        ).toEqual({ state: "FAILED", provider: "RAZORPAY", since: failedAt });
    });

    it("waits for the provider while a payment started a short while ago", () => {
        for (const status of ["CREATED", "REQUIRES_PAYMENT", "PROCESSING"]) {
            expect(onlinePaymentOf(intent({ status }), owing, now)?.state).toBe(
                "WAITING",
            );
        }
    });

    it("reads not finished once it has stayed open past the wait", () => {
        const started = new Date(now.getTime() - WAITING_MS);
        expect(
            onlinePaymentOf(intent({ createdAt: started }), owing, now),
        ).toEqual({
            state: "NOT_FINISHED",
            provider: "RAZORPAY",
            since: started,
        });
    });

    it("says nothing once a payment succeeded, or with nothing to chase", () => {
        expect(
            onlinePaymentOf(intent({ status: "SUCCEEDED" }), owing, now),
        ).toBeNull();
        expect(
            onlinePaymentOf(intent({ status: "SUPERSEDED" }), owing, now),
        ).toBeNull();
        expect(onlinePaymentOf(null, owing, now)).toBeNull();
        expect(onlinePaymentOf(undefined, owing, now)).toBeNull();
    });

    it("says nothing on an order that owes nothing or was cancelled", () => {
        const failed = intent({ status: "FAILED" });
        expect(
            onlinePaymentOf(failed, { status: "PENDING", owedCents: 0 }, now),
        ).toBeNull();
        expect(
            onlinePaymentOf(
                failed,
                { status: "CANCELLED", owedCents: 100 },
                now,
            ),
        ).toBeNull();
    });
});

describe("latestIntentsFor", () => {
    it("keeps each order's newest intent, in one scoped read", async () => {
        const findMany = jest
            .fn()
            .mockResolvedValue([
                intent({ orderId: "o1", status: "FAILED" }),
                intent({ orderId: "o2", status: "SUCCEEDED" }),
                intent({ orderId: "o1", status: "SUCCEEDED" }),
            ]);
        const latest = await latestIntentsFor(
            { paymentIntent: { findMany } } as never,
            "org1",
            ["o1", "o2"],
        );
        expect(latest.get("o1")?.status).toBe("FAILED");
        expect(latest.get("o2")?.status).toBe("SUCCEEDED");
        const args = findMany.mock.calls[0][0];
        expect(args.where.organizationId).toBe("org1");
        expect(args.where.orderId).toEqual({ in: ["o1", "o2"] });
        expect(args.orderBy[0]).toEqual({ createdAt: "desc" });
    });

    it("asks nothing for no orders", async () => {
        const findMany = jest.fn();
        const latest = await latestIntentsFor(
            { paymentIntent: { findMany } } as never,
            "org1",
            [],
        );
        expect(latest.size).toBe(0);
        expect(findMany).not.toHaveBeenCalled();
    });
});

describe("onlinePaymentForRead", () => {
    it("leaves the field out when the read fails, and logs it", async () => {
        const warn = jest.fn();
        const findMany = jest.fn().mockRejectedValue(new Error("down"));
        await expect(
            onlinePaymentForRead(
                { paymentIntent: { findMany } } as never,
                "org1",
                { id: "o1", ...owing },
                now,
                { warn },
            ),
        ).resolves.toEqual({});
        expect(warn).toHaveBeenCalled();
    });

    it("answers null when there is nothing to chase", async () => {
        const findMany = jest.fn().mockResolvedValue([]);
        await expect(
            onlinePaymentForRead(
                { paymentIntent: { findMany } } as never,
                "org1",
                { id: "o1", ...owing },
                now,
                { warn: jest.fn() },
            ),
        ).resolves.toEqual({ onlinePayment: null });
    });
});

describe("serializeOrderRow — its online payment (#122)", () => {
    function raw(over: Partial<RawOrderRow> = {}): RawOrderRow {
        return {
            id: "o1",
            orderId: "1042",
            customerId: null,
            status: "PENDING",
            paymentStatus: "FAILED",
            stage: "NEW",
            fulfilment: "PICKUP",
            currency: "INR",
            total: { toString: () => "480" },
            createdAt: new Date(now.getTime() - 20 * 60_000),
            courierName: null,
            trackingNumber: null,
            store: { id: "s1", name: "Hill Road" },
            customer: null,
            items: [{ product: { name: "Sourdough" } }],
            paymentIntents: [],
            ...over,
        };
    }

    it("says failed on an unpaid order whose payment failed, for the kitchen too", () => {
        const row = serializeOrderRow(raw(), {
            money: false,
            contact: false,
            now,
            latestIntent: intent({ status: "FAILED" }),
        });
        expect(row.onlinePayment?.state).toBe("FAILED");
        expect(row.total).toBeUndefined();
    });

    it("says nothing on a paid order", () => {
        const row = serializeOrderRow(
            raw({
                paymentStatus: "PAID",
                paymentIntents: [{ amountCents: 48_000, refunds: [] }],
            }),
            {
                money: true,
                contact: false,
                now,
                latestIntent: intent({ status: "SUCCEEDED" }),
            },
        );
        expect(row.onlinePayment).toBeNull();
    });

    it("leaves the field out when the intents weren't read", () => {
        const row = serializeOrderRow(raw(), {
            money: true,
            contact: false,
            now,
        });
        expect("onlinePayment" in row).toBe(false);
    });
});

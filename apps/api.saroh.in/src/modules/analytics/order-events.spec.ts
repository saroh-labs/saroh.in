// DB-free unit tests for Insights' order events (#867). The transaction
// client is a plain object of jest mocks; order-events.db.spec.ts proves the
// same rules against Postgres, where the dedupe key's unique index is real.
import {
    orderPaidKey,
    orderRefundedKey,
    recordOrderPaidInTx,
    recordOrderRefundedInTx,
    type OrderEventTx,
} from "./order-events";

const NOW = new Date("2026-10-09T06:30:00.000Z");
const PAID_AT = new Date("2026-10-02T11:00:00.000Z");

function makeTx(order: Record<string, unknown> | null) {
    return {
        order: { findUnique: jest.fn().mockResolvedValue(order) },
        analyticsEvent: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn(),
        },
    };
}
const asTx = (tx: ReturnType<typeof makeTx>) => tx as unknown as OrderEventTx;

describe("recordOrderPaidInTx", () => {
    it("writes one order.paid for the order, keyed on it, skipping a duplicate", async () => {
        const tx = makeTx({
            total: "1249.50",
            organizationId: "org_1",
            store: { organizationId: "org_1" },
        });

        await expect(recordOrderPaidInTx(asTx(tx), "ord_1", NOW)).resolves.toBe(
            true,
        );

        expect(tx.analyticsEvent.createMany).toHaveBeenCalledTimes(1);
        const arg = tx.analyticsEvent.createMany.mock.calls[0][0];
        expect(arg.skipDuplicates).toBe(true);
        expect(arg.data).toEqual([
            {
                organizationId: "org_1",
                siteId: null,
                type: "order.paid",
                schemaVersion: 1,
                properties: { orderId: "ord_1", amountCents: 124_950 },
                consent: "anonymous",
                visitorHash: null,
                occurredAt: NOW,
                receivedAt: NOW,
                expiresAt: new Date(NOW.getTime() + 400 * 86_400_000),
                dedupeKey: "order.paid:ord_1",
            },
        ]);
        expect(orderPaidKey("ord_1")).toBe("order.paid:ord_1");
    });

    it("reports false when the order was counted already", async () => {
        const tx = makeTx({
            total: "10.00",
            organizationId: "org_1",
            store: { organizationId: "org_1" },
        });
        tx.analyticsEvent.createMany.mockResolvedValue({ count: 0 });
        await expect(recordOrderPaidInTx(asTx(tx), "ord_1", NOW)).resolves.toBe(
            false,
        );
    });

    it("names the business through the storefront on an order made before organizationId", async () => {
        const tx = makeTx({
            total: "10.00",
            organizationId: null,
            store: { organizationId: "org_store" },
        });
        await recordOrderPaidInTx(asTx(tx), "ord_1", NOW);
        expect(
            tx.analyticsEvent.createMany.mock.calls[0][0].data[0],
        ).toMatchObject({ organizationId: "org_store" });
    });

    it("writes nothing for an order that isn't there", async () => {
        const tx = makeTx(null);
        await expect(recordOrderPaidInTx(asTx(tx), "gone", NOW)).resolves.toBe(
            false,
        );
        expect(tx.analyticsEvent.createMany).not.toHaveBeenCalled();
    });

    it("carries no customer detail, only the order's id and amount", async () => {
        const tx = makeTx({
            total: "10.00",
            organizationId: "org_1",
            store: { organizationId: "org_1" },
            customer: { email: "jane@example.com" },
        });
        await recordOrderPaidInTx(asTx(tx), "ord_1", NOW);
        expect(
            JSON.stringify(tx.analyticsEvent.createMany.mock.calls[0][0]),
        ).not.toContain("jane");
    });
});

describe("recordOrderRefundedInTx", () => {
    const order = {
        organizationId: "org_1",
        store: { organizationId: "org_1" },
    };

    it("takes a counted order off, dated at the sale it reverses", async () => {
        const tx = makeTx(order);
        tx.analyticsEvent.findUnique.mockResolvedValue({
            occurredAt: PAID_AT,
            properties: { orderId: "ord_1", amountCents: 124_950 },
        });

        await expect(
            recordOrderRefundedInTx(asTx(tx), "ord_1", NOW),
        ).resolves.toBe(true);

        expect(tx.analyticsEvent.findUnique).toHaveBeenCalledWith({
            where: {
                organizationId_dedupeKey: {
                    organizationId: "org_1",
                    dedupeKey: "order.paid:ord_1",
                },
            },
            select: { occurredAt: true, properties: true },
        });
        const arg = tx.analyticsEvent.createMany.mock.calls[0][0];
        expect(arg.skipDuplicates).toBe(true);
        expect(arg.data[0]).toMatchObject({
            organizationId: "org_1",
            type: "order.refunded",
            properties: { orderId: "ord_1", amountCents: 124_950 },
            // The sale's day loses it; the rollup finds it by receivedAt.
            occurredAt: PAID_AT,
            receivedAt: NOW,
            dedupeKey: "order.refunded:ord_1",
        });
        expect(orderRefundedKey("ord_1")).toBe("order.refunded:ord_1");
    });

    it("takes nothing off for an order that was never counted (paid before #867)", async () => {
        const tx = makeTx(order);
        tx.analyticsEvent.findUnique.mockResolvedValue(null);

        await expect(
            recordOrderRefundedInTx(asTx(tx), "ord_old", NOW),
        ).resolves.toBe(false);
        expect(tx.analyticsEvent.createMany).not.toHaveBeenCalled();
    });

    it("writes nothing for an order that isn't there", async () => {
        const tx = makeTx(null);
        await expect(
            recordOrderRefundedInTx(asTx(tx), "gone", NOW),
        ).resolves.toBe(false);
        expect(tx.analyticsEvent.findUnique).not.toHaveBeenCalled();
    });
});

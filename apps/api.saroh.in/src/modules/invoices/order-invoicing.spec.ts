// creditNoteForRefund's early answers, without a database: which refunds
// make no credit note on their order's invoice.
import { creditNoteForRefund } from "./order-invoicing";

function txWith(refund: Record<string, unknown> | null) {
    return {
        paymentRefund: { findUnique: jest.fn().mockResolvedValue(refund) },
        invoice: {
            findFirst: jest.fn().mockResolvedValue({ id: "inv_1" }),
        },
        $queryRaw: jest.fn(),
    };
}

const REFUND = {
    id: "rf_1",
    amountCents: 12000,
    forEdit: false,
    reason: null,
    status: "SUCCEEDED",
    paymentIntent: { orderId: "order_1", status: "SUCCEEDED" },
    lines: [],
};

describe("creditNoteForRefund", () => {
    it("credits money handed back from a superseded edit charge like any other", async () => {
        // Paid on a charge a later edit replaced, and invoiced when it came
        // in (#508, U8): its refund looks for the order's invoice to credit,
        // as every refund does. The note itself is specced against a real
        // database (order-kitchen.db.spec.ts).
        const tx = txWith({
            ...REFUND,
            paymentIntent: {
                id: "pi_old",
                orderId: "order_1",
                status: "SUPERSEDED",
            },
        });
        tx.invoice.findFirst.mockResolvedValue(null);
        await expect(creditNoteForRefund(tx as never, "rf_1")).resolves.toBe(
            null,
        );
        expect(tx.invoice.findFirst).toHaveBeenCalledWith({
            where: { orderId: "order_1", kind: "INVOICE" },
            select: { id: true },
        });
    });

    it.each([
        ["an edit's refund", { forEdit: true }],
        ["a failed refund", { status: "FAILED" }],
    ])("credits nothing for %s", async (_what, over) => {
        const tx = txWith({ ...REFUND, ...over });
        await expect(creditNoteForRefund(tx as never, "rf_1")).resolves.toBe(
            null,
        );
        expect(tx.invoice.findFirst).not.toHaveBeenCalled();
    });

    it("looks for the order's invoice for any other refund", async () => {
        const tx = txWith(REFUND);
        tx.invoice.findFirst.mockResolvedValue(null);
        await expect(creditNoteForRefund(tx as never, "rf_1")).resolves.toBe(
            null,
        );
        expect(tx.invoice.findFirst).toHaveBeenCalledWith({
            where: { orderId: "order_1", kind: "INVOICE" },
            select: { id: true },
        });
    });
});

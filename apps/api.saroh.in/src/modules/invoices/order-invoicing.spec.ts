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
    it("credits nothing for money handed back from a superseded edit charge", async () => {
        // Paid on a charge a later edit replaced: never the order's, never
        // on its invoice (#508, U8).
        const tx = txWith({
            ...REFUND,
            paymentIntent: { orderId: "order_1", status: "SUPERSEDED" },
        });
        await expect(creditNoteForRefund(tx as never, "rf_1")).resolves.toBe(
            null,
        );
        expect(tx.invoice.findFirst).not.toHaveBeenCalled();
        expect(tx.$queryRaw).not.toHaveBeenCalled();
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

/**
 * Undo after "Remove this payment" (DEC-173, U9): it records the payment
 * again as it was. A cheque that went into the bank is marked so again, and
 * a bounced one is bounced again with its date and reason, so Undo never
 * brings back a live, waiting cheque the bank returned (#10).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { actions } = vi.hoisted(() => ({
    actions: {
        recordPayment: vi.fn(),
        removePayment: vi.fn(),
        chequeCleared: vi.fn(),
        chequeBounced: vi.fn(),
    },
}));
vi.mock("@/lib/invoices/actions", () => actions);

import { putBack } from "./remove-payment-dialog";

import type { InvoicePayment } from "@/lib/invoices/service";

const CHEQUE: InvoicePayment = {
    id: "pay_chq",
    amount: "8400.00",
    currency: "INR",
    method: "CHEQUE",
    reference: null,
    note: null,
    receivedAt: "2026-10-15T05:00:00.000Z",
    recordedAt: "2026-10-15T05:00:00.000Z",
    cheque: { number: "004512", bank: "HDFC Bank" },
    bankStatus: "WAITING",
    clearedAt: null,
    bouncedAt: null,
    bounceReason: null,
    removed: null,
    canRemove: true,
};

beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset();
    actions.recordPayment.mockResolvedValue({
        ok: true,
        data: { recorded: { paymentId: "pay_again", replayed: false } },
    });
    actions.chequeCleared.mockResolvedValue({ ok: true, data: {} });
    actions.chequeBounced.mockResolvedValue({ ok: true, data: {} });
});

describe("putBack", () => {
    it("records a waiting cheque again, waiting, and nothing more", async () => {
        await expect(putBack("inv_1", CHEQUE)).resolves.toEqual({ ok: true });
        expect(actions.recordPayment).toHaveBeenCalledWith(
            "inv_1",
            expect.objectContaining({
                method: "CHEQUE",
                amount: "8400.00",
                chequeNumber: "004512",
                chequeBank: "HDFC Bank",
            }),
        );
        expect(actions.chequeCleared).not.toHaveBeenCalled();
        expect(actions.chequeBounced).not.toHaveBeenCalled();
    });

    it("brings a bounced cheque back bounced, with its date and reason (#10)", async () => {
        await putBack("inv_1", {
            ...CHEQUE,
            bankStatus: "BOUNCED",
            bouncedAt: "2026-10-17T05:00:00.000Z",
            bounceReason: "Insufficient funds",
        });
        expect(actions.chequeCleared).not.toHaveBeenCalled();
        expect(actions.chequeBounced).toHaveBeenCalledWith(
            "inv_1",
            "pay_again",
            {
                bouncedAt: "2026-10-17T05:00:00.000Z",
                reason: "Insufficient funds",
            },
        );
    });

    it("brings one returned after it was banked back banked, then bounced (#7)", async () => {
        await putBack("inv_1", {
            ...CHEQUE,
            bankStatus: "BOUNCED",
            clearedAt: "2026-10-16T05:00:00.000Z",
            bouncedAt: "2026-10-18T05:00:00.000Z",
        });
        expect(actions.chequeCleared).toHaveBeenCalledWith(
            "inv_1",
            "pay_again",
            "2026-10-16T05:00:00.000Z",
        );
        expect(actions.chequeBounced).toHaveBeenCalledWith(
            "inv_1",
            "pay_again",
            { bouncedAt: "2026-10-18T05:00:00.000Z" },
        );
    });

    it("says why when the bounce can't be put back", async () => {
        actions.chequeBounced.mockResolvedValue({
            ok: false,
            error: "This cheque already bounced.",
        });
        await expect(
            putBack("inv_1", {
                ...CHEQUE,
                bankStatus: "BOUNCED",
                bouncedAt: "2026-10-17T05:00:00.000Z",
            }),
        ).resolves.toEqual({
            ok: false,
            error: "This cheque already bounced.",
        });
    });
});

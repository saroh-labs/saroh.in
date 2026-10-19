/**
 * The ledger's settle rules (DEC-173, U2 #1114), pure: what an invoice's
 * payments say about it. The writes, locks and refusals run against
 * Postgres in `invoice-payments.db.spec.ts`.
 */
import type { LedgerRow } from "./invoice-ledger";
import { isLive, notOwed, settle } from "./invoice-ledger";

const day = (d: number) =>
    new Date(`2026-10-${String(d).padStart(2, "0")}T06:30:00.000Z`);

function row(over: Partial<LedgerRow> = {}): LedgerRow {
    return {
        amountCents: 100000,
        method: "CASH",
        reference: null,
        note: null,
        receivedAt: day(10),
        createdAt: day(10),
        bankStatus: null,
        removedAt: null,
        ...over,
    };
}

describe("settle", () => {
    it("is unpaid with no payments", () => {
        expect(settle(250000, [])).toEqual({
            paidCents: 0,
            paid: false,
            last: null,
        });
    });

    it("is partly paid: ₹1,000 of ₹2,500", () => {
        const s = settle(250000, [row()]);
        expect(s.paidCents).toBe(100000);
        expect(s.paid).toBe(false);
    });

    it("is paid in full when the payments reach the total, the last one by date", () => {
        const second = row({
            amountCents: 150000,
            method: "UPI",
            receivedAt: day(12),
            createdAt: day(12),
        });
        const s = settle(250000, [row(), second]);
        expect(s).toEqual({ paidCents: 250000, paid: true, last: second });
    });

    it("picks the last payment by when it came in, not when it was written", () => {
        const backdated = row({ receivedAt: day(1), createdAt: day(15) });
        const latest = row({ receivedAt: day(9), createdAt: day(9) });
        expect(settle(200000, [latest, backdated]).last).toBe(latest);
    });

    it("breaks a tie on the date by when it was written", () => {
        const first = row({ createdAt: day(10) });
        const second = row({ createdAt: day(11) });
        expect(settle(200000, [second, first]).last).toBe(second);
    });

    it("counts a cheque waiting for the bank as received", () => {
        const s = settle(840000, [
            row({
                amountCents: 840000,
                method: "CHEQUE",
                bankStatus: "WAITING",
            }),
        ]);
        expect(s.paid).toBe(true);
    });

    it("counts a cleared cheque", () => {
        expect(
            settle(840000, [
                row({
                    amountCents: 840000,
                    method: "CHEQUE",
                    bankStatus: "CLEARED",
                }),
            ]).paid,
        ).toBe(true);
    });

    it("leaves a bounced cheque out: the money is owed again", () => {
        const s = settle(840000, [
            row({
                amountCents: 840000,
                method: "CHEQUE",
                bankStatus: "BOUNCED",
            }),
        ]);
        expect(s).toEqual({ paidCents: 0, paid: false, last: null });
    });

    it("leaves a removed payment out", () => {
        const kept = row({ amountCents: 50000 });
        const s = settle(250000, [kept, row({ removedAt: day(11) })]);
        expect(s).toEqual({ paidCents: 50000, paid: false, last: kept });
    });

    it("never settles a ₹0 invoice as paid", () => {
        expect(settle(0, []).paid).toBe(false);
    });
});

describe("isLive", () => {
    it.each([
        [null, null, true],
        ["WAITING", null, true],
        ["CLEARED", null, true],
        ["BOUNCED", null, false],
        [null, day(1), false],
        ["WAITING", day(1), false],
    ] as const)(
        "bank status %s, removed %s → %s",
        (bankStatus, removedAt, live) => {
            expect(isLive({ bankStatus, removedAt })).toBe(live);
        },
    );
});

describe("notOwed", () => {
    it.each([
        ["DRAFT", "Issue the invoice before it is paid."],
        ["PAID", "This invoice is already paid."],
        ["CREDITED", "This invoice was credited."],
        ["VOID", "A void invoice cannot be paid."],
    ])("%s → %s", (status, words) => {
        expect(notOwed(status)).toBe(words);
    });
});

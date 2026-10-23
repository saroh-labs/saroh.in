import {
    BANK_STATUSES,
    HAND_PAYMENT_METHODS,
    invoiceStanding,
    isPartlyPaid,
    LEDGER_PAYMENT_METHODS,
    leftToPayCents,
    PAYMENT_METHODS,
    viewWhere,
} from "./invoice-state";

const now = new Date("2026-09-22T10:00:00Z");
const tomorrow = new Date("2026-09-23T10:00:00Z");
const yesterday = new Date("2026-09-21T10:00:00Z");

describe("invoiceStanding", () => {
    it("reads issued and due tomorrow as Issued, not Overdue", () => {
        expect(
            invoiceStanding({ status: "ISSUED", dueAt: tomorrow }, now),
        ).toBe("ISSUED");
    });

    it("reads issued and past due as Overdue", () => {
        expect(
            invoiceStanding({ status: "ISSUED", dueAt: yesterday }, now),
        ).toBe("OVERDUE");
    });

    it("never calls a paid or void invoice overdue", () => {
        expect(invoiceStanding({ status: "PAID", dueAt: yesterday }, now)).toBe(
            "PAID",
        );
        expect(invoiceStanding({ status: "VOID", dueAt: yesterday }, now)).toBe(
            "VOID",
        );
    });
});

describe("viewWhere", () => {
    it("splits Issued from Overdue at now, with no overlap", () => {
        expect(viewWhere("issued", now)).toEqual({
            status: "ISSUED",
            kind: { not: "CREDIT_NOTE" },
            OR: [{ dueAt: null }, { dueAt: { gte: now } }],
        });
        expect(viewWhere("overdue", now)).toEqual({
            status: "ISSUED",
            dueAt: { lt: now },
        });
    });

    it("reads Owed as issued, overdue included, never an order's or a credit note (DEC-173)", () => {
        expect(viewWhere("owed", now)).toEqual({
            status: "ISSUED",
            orderId: null,
            kind: { not: "CREDIT_NOTE" },
        });
    });

    it("reads Cheques as an invoice with a cheque waiting, not removed, whose money still moves (DEC-173, #5)", () => {
        expect(viewWhere("cheques", now)).toEqual({
            status: { in: ["ISSUED", "PAID"] },
            payments: { some: { removedAt: null, bankStatus: "WAITING" } },
        });
    });
});

describe("the ledger's helpers (DEC-173)", () => {
    it("works out what is left to pay in paise, from the total and paidCents", () => {
        expect(leftToPayCents({ total: "2500.00", paidCents: 100000 })).toBe(
            150000,
        );
        expect(leftToPayCents({ total: "2500", paidCents: 0 })).toBe(250000);
        expect(leftToPayCents({ total: "8400.5", paidCents: 50 })).toBe(840000);
    });

    it("never reads less than nothing left", () => {
        expect(leftToPayCents({ total: "100.00", paidCents: 20000 })).toBe(0);
    });

    it("reads a Prisma Decimal by its digits", () => {
        const decimal = { toString: () => "1999.99" };
        expect(leftToPayCents({ total: decimal, paidCents: 99 })).toBe(199900);
    });

    it("calls an issued invoice partly paid only between nothing and all", () => {
        const issued = { status: "ISSUED", total: "2500.00" };
        expect(isPartlyPaid({ ...issued, paidCents: 0 })).toBe(false);
        expect(isPartlyPaid({ ...issued, paidCents: 100000 })).toBe(true);
        expect(isPartlyPaid({ ...issued, paidCents: 250000 })).toBe(false);
    });

    it("never calls a paid, draft or void invoice partly paid", () => {
        for (const status of ["PAID", "DRAFT", "VOID", "CREDITED"]) {
            expect(
                isPartlyPaid({ status, total: "2500.00", paidCents: 100000 }),
            ).toBe(false);
        }
    });

    it("adds Cheque to the ledger's methods, never to an order's", () => {
        expect(PAYMENT_METHODS).toContain("CHEQUE");
        expect(HAND_PAYMENT_METHODS).not.toContain("CHEQUE");
        expect(PAYMENT_METHODS).not.toContain("ONLINE");
        expect(LEDGER_PAYMENT_METHODS).toEqual([
            "CASH",
            "UPI",
            "BANK_TRANSFER",
            "CARD",
            "OTHER",
            "CHEQUE",
            "ONLINE",
        ]);
        expect(BANK_STATUSES).toEqual(["WAITING", "CLEARED", "BOUNCED"]);
    });
});

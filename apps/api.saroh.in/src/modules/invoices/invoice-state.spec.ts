import { invoiceStanding, viewWhere } from "./invoice-state";

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
            OR: [{ dueAt: null }, { dueAt: { gte: now } }],
        });
        expect(viewWhere("overdue", now)).toEqual({
            status: "ISSUED",
            dueAt: { lt: now },
        });
    });
});

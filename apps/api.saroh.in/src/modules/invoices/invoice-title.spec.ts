import { exemptInvoiceIds } from "./exempt-invoices";
import {
    invoiceTitle,
    isBillOfSupply,
    isExemptRate,
    isExemptSupply,
} from "./invoice-title";
import type { InvoiceRow } from "./serialize";
import { serializeInvoice } from "./serialize";

const GSTIN = "29ABCDE1234F1Z5";
const rate = (r: string) => ({ toString: () => r });

/** The title as the serializer works it out: from the paper's own lines. */
function titleOf(paper: {
    kind?: string;
    sellerGstin: string | null;
    standing: string;
    lines: { gstRate: { toString(): string } | null }[];
}) {
    return invoiceTitle(paper, isExemptSupply(paper));
}

/**
 * D15 (default 36): a registered business's paper whose every line has a
 * frozen `gstRate` of exactly 0 is a bill of supply.
 */
describe("invoiceTitle", () => {
    it("a registered clinic's SAC 9993 lines, every one 0% → Bill of supply", () => {
        const paper = {
            kind: "INVOICE",
            sellerGstin: GSTIN,
            standing: "PAID",
            lines: [{ gstRate: rate("0") }, { gstRate: rate("0.00") }],
        };
        expect(titleOf(paper)).toBe("Bill of supply");
        expect(isExemptSupply(paper)).toBe(true);
        expect(isBillOfSupply(paper)).toBe(true);
    });

    it("mixed 0% and 18% → Tax invoice", () => {
        expect(
            titleOf({
                kind: "INVOICE",
                sellerGstin: GSTIN,
                standing: "ISSUED",
                lines: [{ gstRate: rate("0") }, { gstRate: rate("18") }],
            }),
        ).toBe("Tax invoice");
    });

    it("a line whose rate was never set is not exempt → Tax invoice", () => {
        const paper = {
            kind: "INVOICE",
            sellerGstin: GSTIN,
            standing: "ISSUED",
            lines: [
                { gstRate: rate("0") },
                { gstRate: null },
                { gstRate: rate("0") },
            ],
        };
        expect(titleOf(paper)).toBe("Tax invoice");
        expect(isBillOfSupply(paper)).toBe(false);
    });

    it("a rate just above zero is taxed; only exactly 0 is exempt", () => {
        expect(isExemptRate(rate("0.25"))).toBe(false);
        expect(isExemptRate(rate("0.00"))).toBe(true);
        expect(isExemptRate(null)).toBe(false);
        expect(isExemptRate(undefined)).toBe(false);
        expect(
            titleOf({
                sellerGstin: GSTIN,
                standing: "ISSUED",
                lines: [{ gstRate: rate("0.25") }],
            }),
        ).toBe("Tax invoice");
    });

    it("an unregistered business's paid paper → Receipt; unpaid → Invoice", () => {
        const lines = [{ gstRate: rate("0") }];
        expect(titleOf({ sellerGstin: null, standing: "PAID", lines })).toBe(
            "Receipt",
        );
        expect(
            titleOf({ sellerGstin: null, standing: "CREDITED", lines }),
        ).toBe("Receipt");
        expect(titleOf({ sellerGstin: null, standing: "ISSUED", lines })).toBe(
            "Invoice",
        );
        expect(isBillOfSupply({ sellerGstin: null, lines })).toBe(false);
    });

    it("a credit note against a bill of supply reads Credit note", () => {
        const paper = {
            kind: "CREDIT_NOTE",
            sellerGstin: GSTIN,
            standing: "ISSUED",
            lines: [{ gstRate: rate("0") }],
        };
        expect(titleOf(paper)).toBe("Credit note");
        // Its paper still carries no tax columns…
        expect(isExemptSupply(paper)).toBe(true);
        // …but it is never called a bill of supply.
        expect(isBillOfSupply(paper)).toBe(false);
    });

    it("a supplementary invoice follows its own lines", () => {
        expect(
            titleOf({
                kind: "SUPPLEMENTARY",
                sellerGstin: GSTIN,
                standing: "ISSUED",
                lines: [{ gstRate: rate("0") }],
            }),
        ).toBe("Bill of supply");
    });

    it("a paper with no lines is not a bill of supply", () => {
        expect(
            titleOf({ sellerGstin: GSTIN, standing: "ISSUED", lines: [] }),
        ).toBe("Tax invoice");
    });

    it("a draft carries no GSTIN yet → Invoice", () => {
        expect(
            titleOf({
                sellerGstin: null,
                standing: "DRAFT",
                lines: [{ gstRate: rate("0") }],
            }),
        ).toBe("Invoice");
    });
});

describe("exemptInvoiceIds (the list's read)", () => {
    function fakeDb(taxedIds: string[]) {
        const findMany = jest
            .fn()
            .mockResolvedValue(taxedIds.map((invoiceId) => ({ invoiceId })));
        return { db: { invoiceLine: { findMany } } as never, findMany };
    }

    it("asks for the not-exempt lines of registered papers only, and keeps the rest", async () => {
        const { db, findMany } = fakeDb(["mixed"]);
        const ids = await exemptInvoiceIds(db, "org_1", [
            { id: "exempt", sellerGstin: GSTIN, _count: { lines: 2 } },
            { id: "mixed", sellerGstin: GSTIN, _count: { lines: 2 } },
            { id: "receipt", sellerGstin: null, _count: { lines: 1 } },
            { id: "empty", sellerGstin: GSTIN, _count: { lines: 0 } },
        ]);
        expect([...ids]).toEqual(["exempt"]);
        expect(findMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                invoiceId: { in: ["exempt", "mixed"] },
                OR: [{ gstRate: null }, { gstRate: { not: 0 } }],
            },
            distinct: ["invoiceId"],
            select: { invoiceId: true },
        });
    });

    it("reads nothing when no listed paper is a registered business's", async () => {
        const { db, findMany } = fakeDb([]);
        const ids = await exemptInvoiceIds(db, "org_1", [
            { id: "r1", sellerGstin: null, _count: { lines: 1 } },
        ]);
        expect(ids.size).toBe(0);
        expect(findMany).not.toHaveBeenCalled();
    });
});

describe("serializeInvoice: title and exempt", () => {
    const at = new Date("2026-09-10T10:00:00Z");
    const row = (over: Partial<InvoiceRow>): InvoiceRow => ({
        id: "inv_1",
        number: "KD/26-27/0001",
        status: "PAID",
        contactId: null,
        contact: null,
        billToName: "Vikram R",
        billToEmail: null,
        currency: "INR",
        subtotal: rate("900.00"),
        tax: rate("0.00"),
        total: rate("900.00"),
        issuedAt: at,
        dueAt: at,
        paidAt: at,
        voidedAt: null,
        voidReason: null,
        paymentMethod: null,
        paymentReference: null,
        paymentNote: null,
        source: "MANUAL",
        subscriptionId: null,
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissues: [],
        createdByUserId: "u1",
        createdAt: at,
        updatedAt: at,
        kind: "INVOICE",
        sellerGstin: GSTIN,
        sellerState: "29",
        placeOfSupply: "29",
        taxType: "INTRA",
        lines: [
            {
                id: "l1",
                description: "X-ray, full mouth (OPG)",
                quantity: 1,
                unitPrice: rate("900.00"),
                amount: rate("900.00"),
                hsnSac: "9993",
                gstRate: rate("0.00"),
                taxableValue: rate("900.00"),
            },
        ],
        _count: { lines: 1 },
        ...over,
    });

    it("a detail of exempt lines is a bill of supply", () => {
        const view = serializeInvoice(row({}), at, { detail: true });
        expect(view.title).toBe("Bill of supply");
        expect(view.exempt).toBe(true);
        expect(view.lines).toHaveLength(1);
    });

    it("a list row takes the caller's word, and sends no lines", () => {
        // The list reads its first line's words only, without the rate.
        const listed = row({
            lines: [{ description: "X-ray, full mouth (OPG)", quantity: 1 }],
            _count: { lines: 3 },
        });
        const yes = serializeInvoice(listed, at, { exempt: true });
        expect(yes.title).toBe("Bill of supply");
        expect(yes.lines).toBeUndefined();
        expect(yes.summary).toEqual({
            description: "X-ray, full mouth (OPG)",
            quantity: 1,
            lineCount: 3,
        });
        const no = serializeInvoice(listed, at, { exempt: false });
        expect(no.title).toBe("Tax invoice");
        expect(no.exempt).toBe(false);
    });

    it("a taxed line makes the detail a tax invoice", () => {
        const view = serializeInvoice(
            row({
                lines: [
                    ...(row({}).lines ?? []),
                    {
                        id: "l2",
                        description: "Whitening kit",
                        quantity: 1,
                        gstRate: rate("18.00"),
                    },
                ],
                _count: { lines: 2 },
            }),
            at,
            { detail: true },
        );
        expect(view.title).toBe("Tax invoice");
        expect(view.exempt).toBe(false);
    });

    it("an unregistered business's paid paper is a receipt", () => {
        const view = serializeInvoice(row({ sellerGstin: null }), at, {
            detail: true,
        });
        expect(view.title).toBe("Receipt");
        expect(view.exempt).toBe(false);
    });
});

import { financialYear, financialYearShort, seriesFor } from "./numbering";
import { buildManualInvoice } from "./order-invoice";
import { taxLineOf } from "./order-invoicing";

const at = new Date("2027-02-10T12:00:00Z");
const profile = {
    registered: false,
    gstin: null,
    state: null,
    address: null,
    seller: {
        sellerName: "Acme",
        sellerLegalName: null,
        sellerEmail: null,
        paperStyle: null,
        paperColour: null,
    },
};
const lines = [
    {
        description: "Design",
        quantity: 2,
        unitCents: 10_000,
        rateBps: null,
        code: null,
    },
];

describe("a Global business's tax line", () => {
    it("reads what was set, or nothing until both are", () => {
        expect(taxLineOf("VAT", "20")).toEqual({
            label: "VAT 20%",
            rateBps: 2000,
        });
        expect(taxLineOf("VAT", "7.50")?.label).toBe("VAT 7.5%");
        expect(taxLineOf("VAT", null)).toBeNull();
        expect(taxLineOf("", "20")).toBeNull();
        expect(taxLineOf("VAT", "0")).toBeNull();
    });

    it("is added on top of the lines, and frozen on the paper", () => {
        const doc = buildManualInvoice(
            lines,
            { ...profile, gstin: "GB123456789" },
            null,
            999,
            { label: "VAT 20%", rateBps: 2000 },
        );
        expect(doc.subtotalCents).toBe(20_000);
        expect(doc.taxCents).toBe(4000);
        expect(doc.totalCents).toBe(24_000);
        expect(doc.taxLabel).toBe("VAT 20%");
        expect(doc.sellerGstin).toBeNull();
        expect(doc.sellerTaxId).toBe("GB123456789");
    });

    it("isn't added unless the caller names it", () => {
        const doc = buildManualInvoice(
            lines,
            {
                ...profile,
                gstin: "GB123456789",
                taxLine: { label: "VAT 20%", rateBps: 2000 },
            },
            null,
            0,
        );
        expect(doc.taxCents).toBe(0);
        expect(doc.totalCents).toBe(20_000);
        expect(doc.taxLabel).toBeNull();
        expect(doc.sellerTaxId).toBeNull();
    });

    it("leaves a typed tax alone without one, as India's receipts have it", () => {
        const doc = buildManualInvoice(lines, profile, null, 999);
        expect(doc.taxCents).toBe(999);
        expect(doc.taxLabel).toBeNull();
    });
});

describe("the numbering year", () => {
    const zone = "Europe/London";

    it("runs January to December when chosen", () => {
        expect(financialYear(at, zone, 1)).toBe("2027");
        expect(financialYearShort(at, zone, 1)).toBe("27");
    });

    it("stays April to March otherwise", () => {
        expect(financialYear(at, zone)).toBe("26-27");
        expect(financialYear(at, zone, 4)).toBe("26-27");
        expect(financialYearShort(at, zone)).toBe("26");
    });

    it("restarts its counter by the year chosen", () => {
        const format = {
            parts: ["PREFIX", "FY"],
            separator: "/",
            digits: 4,
            restart: "FY",
        };
        const series = seriesFor({
            registered: false,
            prefix: "INV",
            kind: "INVOICE",
            at,
            timezone: zone,
            yearStartMonth: 1,
            format,
        });
        expect(series.key).toBe("INV/2027");
        expect(series.format(1)).toBe("INV/2027/0001");
    });
});

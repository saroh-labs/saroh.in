import {
    financialYear,
    formatInvoiceNumber,
    LEGACY_SERIES,
    nextInvoiceNumber,
    prefixProblem,
    seriesFor,
} from "./numbering";

/** A counter per (business, series), like the table: upsert-increment. */
function fakeSequencer() {
    const rows = new Map<string, number>();
    const upsert = jest.fn(
        ({
            where,
        }: {
            where: {
                organizationId_series: {
                    organizationId: string;
                    series: string;
                };
            };
        }) => {
            const { organizationId, series } = where.organizationId_series;
            const key = `${organizationId}|${series}`;
            const next = (rows.get(key) ?? 0) + 1;
            rows.set(key, next);
            return Promise.resolve({ lastNumber: next });
        },
    );
    return { tx: { invoiceSequence: { upsert } }, upsert, rows };
}

describe("invoice numbering", () => {
    it("keeps the legacy INV series: pads to four digits and then grows", () => {
        expect(formatInvoiceNumber(1)).toBe("INV-0001");
        expect(formatInvoiceNumber(42)).toBe("INV-0042");
        expect(formatInvoiceNumber(10000)).toBe("INV-10000");
        expect(LEGACY_SERIES.key).toBe("INV");
        expect(LEGACY_SERIES.format(7)).toBe("INV-0007");
    });

    it("takes the number with one upsert keyed on business and series", async () => {
        const upsert = jest.fn().mockResolvedValue({ lastNumber: 1 });
        const tx = { invoiceSequence: { upsert } };

        await expect(nextInvoiceNumber(tx as never, "org_1")).resolves.toBe(
            "INV-0001",
        );
        expect(upsert).toHaveBeenCalledWith({
            where: {
                organizationId_series: {
                    organizationId: "org_1",
                    series: "INV",
                },
            },
            create: { organizationId: "org_1", series: "INV", lastNumber: 1 },
            update: { lastNumber: { increment: 1 } },
            select: { lastNumber: true },
        });
    });
});

describe("financial year", () => {
    it("runs April to March, in the business's own time", () => {
        // 1 April 2027 00:10 in India is still 31 March in UTC.
        expect(financialYear(new Date("2027-03-31T18:40:00Z"))).toBe("27-28");
        expect(financialYear(new Date("2027-03-31T18:20:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2026-09-23T10:00:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2027-01-15T10:00:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2099-06-01T10:00:00Z"))).toBe("99-00");
    });
});

describe("series", () => {
    const at = new Date("2026-09-23T10:00:00Z");

    it("a registered business numbers by prefix and financial year", () => {
        const s = seriesFor({
            registered: true,
            prefix: "RC",
            kind: "INVOICE",
            at,
        });
        expect(s.key).toBe("RC/26-27");
        expect(s.format(1)).toBe("RC/26-27/0001");
    });

    it("an unregistered business numbers by a plain prefix", () => {
        const s = seriesFor({
            registered: false,
            prefix: "PF",
            kind: "INVOICE",
            at,
        });
        expect(s.key).toBe("PF");
        expect(s.format(1)).toBe("PF-0001");
    });

    it("no prefix keeps the legacy INV series", () => {
        expect(
            seriesFor({
                registered: false,
                prefix: null,
                kind: "INVOICE",
                at,
            }).format(3),
        ).toBe("INV-0003");
        expect(
            seriesFor({
                registered: true,
                prefix: null,
                kind: "INVOICE",
                at,
            }).format(3),
        ).toBe("INV/26-27/0003");
    });

    it("credit notes have their own series; supplementary invoices share the invoices'", () => {
        expect(
            seriesFor({
                registered: true,
                prefix: "RC",
                kind: "CREDIT_NOTE",
                at,
            }).format(1),
        ).toBe("RCCN/26-27/0001");
        expect(
            seriesFor({
                registered: false,
                prefix: "PF",
                kind: "CREDIT_NOTE",
                at,
            }).format(1),
        ).toBe("PFCN-0001");
        expect(
            seriesFor({
                registered: true,
                prefix: "RC",
                kind: "SUPPLEMENTARY",
                at,
            }).key,
        ).toBe("RC/26-27");
    });

    it("the longest number a valid prefix makes stays within 16 characters", () => {
        const s = seriesFor({
            registered: true,
            prefix: "ABC",
            kind: "CREDIT_NOTE",
            at,
        });
        expect(s.format(9999)).toBe("ABCCN/26-27/9999");
        expect(s.format(9999).length).toBe(16);
    });

    it("refuses a number past 16 characters rather than printing it", () => {
        const s = seriesFor({
            registered: true,
            prefix: "ABC",
            kind: "CREDIT_NOTE",
            at,
        });
        expect(() => s.format(10000)).toThrow(/16 characters/);
    });
});

describe("prefix", () => {
    it("is one to three letters or digits", () => {
        expect(prefixProblem("RC")).toBeNull();
        expect(prefixProblem("R2D")).toBeNull();
        expect(prefixProblem("")).toMatch(/one to three/);
        expect(prefixProblem("ABCD")).toMatch(/one to three/);
        expect(prefixProblem("R/C")).toMatch(/letters and digits/);
        expect(prefixProblem("rc")).toMatch(/capital/);
    });
});

describe("issuing across 1 April", () => {
    it("two invoices at once either side of midnight land in the right series, distinct", async () => {
        const { tx } = fakeSequencer();
        const before = new Date("2027-03-31T18:29:59Z"); // 23:59:59 IST, 31 March
        const after = new Date("2027-03-31T18:30:00Z"); // 00:00 IST, 1 April
        const take = (at: Date) =>
            nextInvoiceNumber(
                tx as never,
                "org_1",
                seriesFor({
                    registered: true,
                    prefix: "RC",
                    kind: "INVOICE",
                    at,
                }),
            );

        // A March invoice already out.
        await take(new Date("2027-03-10T10:00:00Z"));
        const [march, april, april2] = await Promise.all([
            take(before),
            take(after),
            take(after),
        ]);
        expect(march).toBe("RC/26-27/0002");
        expect(april).toBe("RC/27-28/0001");
        expect(april2).toBe("RC/27-28/0002");
        expect(new Set([march, april, april2]).size).toBe(3);
    });
});

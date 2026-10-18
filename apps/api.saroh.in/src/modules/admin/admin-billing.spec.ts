import type { InvoiceForCsv } from "./admin-billing";
import {
    csvCell,
    INVOICE_CSV_HEADER,
    invoicesCsv,
    istDay,
    istMonthRange,
    monthlyPaise,
    mrrPaise,
    subscriptionViewWhere,
} from "./admin-billing";

/** Made-up amounts: the repo is public and no real price lives in code. */
function invoice(over: Partial<InvoiceForCsv> = {}): InvoiceForCsv {
    return {
        number: "TST/26-27/0001",
        issuedAt: new Date("2026-10-16T20:00:00.000Z"),
        billToName: "Example Studio",
        billToGstin: null,
        placeOfSupply: "29",
        taxType: "INTRA",
        taxablePaise: 11_100,
        cgstPaise: 999,
        sgstPaise: 999,
        igstPaise: 0,
        totalPaise: 13_098,
        lines: [{ sac: "999999" }],
        ...over,
    };
}

describe("istMonthRange", () => {
    it("runs from midnight IST on the 1st to midnight IST on the next 1st", () => {
        expect(istMonthRange("2026-10")).toEqual({
            from: new Date("2026-09-30T18:30:00.000Z"),
            to: new Date("2026-10-31T18:30:00.000Z"),
        });
    });

    it("crosses the year in December", () => {
        expect(istMonthRange("2026-12")?.to).toEqual(
            new Date("2026-12-31T18:30:00.000Z"),
        );
    });

    it("is null for anything that is not a month", () => {
        for (const bad of [
            undefined,
            "",
            "2026-13",
            "2026-1",
            "Oct",
            "2026-10-01",
        ]) {
            expect(istMonthRange(bad)).toBeNull();
        }
    });
});

describe("istDay", () => {
    it("reads the day as it is in India", () => {
        // 20:00 UTC on the 16th is 01:30 on the 17th in India.
        expect(istDay(new Date("2026-10-16T20:00:00.000Z"))).toBe("2026-10-17");
        expect(istDay(new Date("2026-10-16T18:29:00.000Z"))).toBe("2026-10-16");
    });
});

describe("csvCell", () => {
    it("quotes commas, quotes and line breaks", () => {
        expect(csvCell('A "B", C')).toBe('"A ""B"", C"');
        expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
        expect(csvCell(null)).toBe("");
        expect(csvCell(12)).toBe("12");
    });

    it("never lets a typed name run as a spreadsheet formula, and leaves numbers alone", () => {
        expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
        expect(csvCell("+91 trick")).toBe("'+91 trick");
        expect(csvCell("@sum")).toBe("'@sum");
        expect(csvCell("-12.50")).toBe("-12.50");
    });
});

describe("invoicesCsv", () => {
    it("has the header, then one row per invoice with rupees, the state and B2B/B2C", () => {
        const csv = invoicesCsv([
            invoice(),
            invoice({
                number: "TST/26-27/0002",
                billToName: "Other, Ltd",
                billToGstin: "27AAAAA0000A1Z5",
                placeOfSupply: "27",
                taxType: "INTER",
                cgstPaise: 0,
                sgstPaise: 0,
                igstPaise: 1_998,
                lines: [{ sac: "999999" }, { sac: "999999" }, { sac: null }],
                providerPaymentId: "pay_T2",
                providerSubscriptionId: "sub_T2",
                providerCustomerId: "cust_T2",
            }),
        ]);
        const rows = csv.trimEnd().split("\r\n");
        expect(rows).toHaveLength(3);
        expect(rows[0]).toBe(INVOICE_CSV_HEADER.join(","));
        expect(rows[1]).toBe(
            "Invoice,TST/26-27/0001,2026-10-17,Example Studio,,Karnataka,29,B2C,999999,111.00,9.99,9.99,0.00,130.98,,,",
        );
        expect(rows[2]).toBe(
            'Invoice,TST/26-27/0002,2026-10-17,"Other, Ltd",27AAAAA0000A1Z5,Maharashtra,27,B2B,999999,111.00,0.00,0.00,19.98,130.98,pay_T2,sub_T2,cust_T2',
        );
    });

    it("is just the header for a month with no invoices", () => {
        expect(invoicesCsv([])).toBe(`${INVOICE_CSV_HEADER.join(",")}\r\n`);
    });
});

describe("subscriptionViewWhere", () => {
    const now = new Date("2026-10-17T00:00:00.000Z");

    it("ending soon: a move or a chosen end inside 30 days, never a cancelled one", () => {
        expect(subscriptionViewWhere("ending-soon", now)).toEqual({
            status: { not: "CANCELLED" },
            OR: [
                {
                    pendingFrom: {
                        not: null,
                        lte: new Date("2026-11-16T00:00:00.000Z"),
                    },
                },
                {
                    cancelAtPeriodEnd: true,
                    currentPeriodEnd: {
                        not: null,
                        lte: new Date("2026-11-16T00:00:00.000Z"),
                    },
                },
            ],
        });
    });

    it("first month is TRIALING, past due is PAST_DUE, none is everything", () => {
        expect(subscriptionViewWhere("first-month", now)).toEqual({
            status: "TRIALING",
        });
        expect(subscriptionViewWhere("past-due", now)).toEqual({
            status: "PAST_DUE",
        });
        expect(subscriptionViewWhere(undefined, now)).toEqual({});
    });
});

describe("monthly figure", () => {
    const monthly = { priceCents: 22_200, interval: "month" };
    const yearly = { priceCents: 33_300, interval: "year" };
    const free = { priceCents: 0, interval: "month" };

    it("takes a month's price as it is and spreads a year's over twelve", () => {
        expect(monthlyPaise(monthly)).toBe(22_200);
        expect(monthlyPaise(yearly)).toBe(2_775);
        expect(monthlyPaise(free)).toBe(0);
    });

    it("counts ACTIVE and PAST_DUE only, from the plan rows given", () => {
        expect(
            mrrPaise([
                { status: "ACTIVE", count: 3, plan: monthly },
                { status: "PAST_DUE", count: 1, plan: monthly },
                { status: "ACTIVE", count: 2, plan: yearly },
                { status: "TRIALING", count: 5, plan: monthly },
                { status: "CANCELLED", count: 9, plan: monthly },
                { status: "ACTIVE", count: 40, plan: free },
            ]),
        ).toBe(4 * 22_200 + 2 * 2_775);
    });
});

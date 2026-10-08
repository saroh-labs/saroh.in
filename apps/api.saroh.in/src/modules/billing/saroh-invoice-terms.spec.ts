/**
 * The pure rules of Saroh's own invoices (pricing catalogue U17): GST per
 * line, the CGST + SGST / IGST split, the place of supply, numbering, when a
 * renewal is a new period, the seller from configuration and the paper.
 * Every amount is made up (111, 222, 999); no plan's real price is here.
 */
import { gstPaise } from "@saroh/pricing-catalog";

import { invoiceEmail, paymentFailedEmail } from "./billing-emails";
import { sarohInvoicePaper } from "./saroh-invoice-paper";
import {
    paiseToRupees,
    samePeriodWindow,
    sarohInvoiceNumber,
    sarohSeries,
    sarohSupply,
    taxSarohLine,
    taxSarohLines,
} from "./saroh-invoice-terms";
import { sarohSeller, sellerGaps } from "./saroh-seller";

const DAY = 24 * 60 * 60 * 1000;

describe("taxSarohLine", () => {
    it("adds GST on the line's amount, split CGST + SGST within the state", () => {
        const line = taxSarohLine(
            { description: "Plan B", sac: "999999", unitPaise: 22200 },
            "INTRA",
        );
        expect(line.taxablePaise).toBe(22200);
        expect(line.taxPaise).toBe(gstPaise(22200));
        expect(line.cgstPaise + line.sgstPaise).toBe(line.taxPaise);
        expect(line.igstPaise).toBe(0);
        expect(line.amountPaise).toBe(22200 + line.taxPaise);
    });

    it("gives the odd paisa of intra-state tax to CGST", () => {
        // 18% of 111 paise = 19.98 → 20; even. 18% of 105 = 18.9 → 19: odd.
        const line = taxSarohLine(
            { description: "x", sac: null, unitPaise: 105 },
            "INTRA",
        );
        expect(line.taxPaise).toBe(19);
        expect(line.cgstPaise).toBe(10);
        expect(line.sgstPaise).toBe(9);
    });

    it("is all IGST across states", () => {
        const line = taxSarohLine(
            { description: "x", sac: null, unitPaise: 22200 },
            "INTER",
        );
        expect(line.cgstPaise).toBe(0);
        expect(line.sgstPaise).toBe(0);
        expect(line.igstPaise).toBe(line.taxPaise);
    });

    it("taxes what is left after a discount, and never below zero", () => {
        const line = taxSarohLine(
            {
                description: "x",
                sac: null,
                unitPaise: 22200,
                discountPaise: 11100,
            },
            "INTRA",
        );
        expect(line.taxablePaise).toBe(11100);
        expect(line.taxPaise).toBe(gstPaise(11100));
        const over = taxSarohLine(
            { description: "x", sac: null, unitPaise: 100, discountPaise: 999 },
            "INTRA",
        );
        expect(over.discountPaise).toBe(100);
        expect(over.amountPaise).toBe(0);
    });

    it("sums lines without rounding again", () => {
        const { lines, totals } = taxSarohLines(
            [
                { description: "a", sac: null, unitPaise: 105 },
                { description: "b", sac: null, unitPaise: 105 },
            ],
            "INTRA",
        );
        expect(totals.taxPaise).toBe(lines[0]!.taxPaise * 2);
        expect(totals.totalPaise).toBe(totals.taxablePaise + totals.taxPaise);
        expect(totals.cgstPaise + totals.sgstPaise).toBe(totals.taxPaise);
    });
});

describe("sarohSupply", () => {
    const seller = "29";

    it("is CGST + SGST for a business in Saroh's state", () => {
        expect(
            sarohSupply({
                billToState: "29",
                billToGstin: null,
                profileState: null,
                sellerState: seller,
            }),
        ).toEqual({ placeOfSupply: "29", taxType: "INTRA" });
    });

    it("is IGST for another state, from checkout, GSTIN or profile in turn", () => {
        expect(
            sarohSupply({
                billToState: "27",
                billToGstin: null,
                profileState: "29",
                sellerState: seller,
            }).taxType,
        ).toBe("INTER");
        expect(
            sarohSupply({
                billToState: null,
                billToGstin: "07AAAAA0000A1Z5",
                profileState: "29",
                sellerState: seller,
            }),
        ).toEqual({ placeOfSupply: "07", taxType: "INTER" });
        expect(
            sarohSupply({
                billToState: null,
                billToGstin: null,
                profileState: "33",
                sellerState: seller,
            }).placeOfSupply,
        ).toBe("33");
    });

    it("takes a business that said nothing as local", () => {
        expect(
            sarohSupply({
                billToState: null,
                billToGstin: null,
                profileState: null,
                sellerState: seller,
            }),
        ).toEqual({ placeOfSupply: "29", taxType: "INTRA" });
    });
});

describe("numbering", () => {
    it("counts per prefix and Indian financial year, in India's zone", () => {
        expect(sarohSeries("SRH", new Date("2026-09-30T12:00:00Z"))).toBe(
            "SRH/26-27",
        );
        // 31 March 2027, 20:00 UTC is 1 April in India: the next year.
        expect(sarohSeries("SRH", new Date("2027-03-31T20:00:00Z"))).toBe(
            "SRH/27-28",
        );
        expect(sarohInvoiceNumber("SRH/26-27", 1)).toBe("SRH/26-27/00001");
        expect(sarohInvoiceNumber("SRH/26-27", 1).length).toBeLessThanOrEqual(
            16,
        );
    });

    it("writes paise as rupees without floats", () => {
        expect(paiseToRupees(12345)).toBe("123.45");
        expect(paiseToRupees(5)).toBe("0.05");
        expect(paiseToRupees(0)).toBe("0.00");
    });
});

describe("samePeriodWindow", () => {
    const end = new Date("2026-10-01T00:00:00Z");
    const inside = (d: Date, cycle: string) => {
        const w = samePeriodWindow(end, cycle);
        return d >= w.gte && d <= w.lte;
    };

    it("holds a second event for the same payment, even a few seconds off", () => {
        expect(inside(end, "month")).toBe(true);
        expect(inside(new Date(end.getTime() + 5000), "month")).toBe(true);
        expect(inside(new Date(end.getTime() + 30 * DAY), "year")).toBe(true);
    });

    it("leaves out the next period, a cycle on", () => {
        expect(inside(new Date(end.getTime() + 28 * DAY), "month")).toBe(false);
        expect(inside(new Date(end.getTime() - 30 * DAY), "month")).toBe(false);
    });
});

describe("sarohSeller", () => {
    it("reads every detail from configuration, never from code", () => {
        const s = sarohSeller({
            SAROH_LEGAL_NAME: "Example Labs Pvt Ltd",
            SAROH_GSTIN: "29aaaaa0000a1z5",
            SAROH_REGISTERED_ADDRESS: "1 Test Road, Testville",
            SAROH_BILLING_EMAIL: "billing@example.test",
            SAROH_INVOICE_SAC: "999999",
            SAROH_INVOICE_PREFIX: "TST",
        });
        expect(s).toEqual({
            name: "Saroh",
            legalName: "Example Labs Pvt Ltd",
            gstin: "29AAAAA0000A1Z5",
            state: "29",
            address: "1 Test Road, Testville",
            email: "billing@example.test",
            sac: "999999",
            prefix: "TST",
        });
        expect(sellerGaps(s)).toEqual([]);
    });

    it("falls back to the default prefix and names what is missing", () => {
        const s = sarohSeller({ SAROH_INVOICE_PREFIX: "toolong" });
        expect(s.prefix).toBe("SRH");
        expect(s.gstin).toBeNull();
        expect(sellerGaps(s)).toEqual([
            "SAROH_LEGAL_NAME",
            "SAROH_GSTIN",
            "SAROH_GST_STATE",
            "SAROH_REGISTERED_ADDRESS",
            "SAROH_INVOICE_SAC",
        ]);
    });
});

describe("sarohInvoicePaper", () => {
    const base = {
        id: "inv_1",
        organizationId: "org_1",
        number: "SRH/26-27/00007",
        series: "SRH/26-27",
        chargeKey: "k",
        source: "RENEWAL",
        provider: "RAZORPAY",
        providerSubscriptionId: "sub_1",
        providerEventId: "evt_1",
        providerPaymentId: null,
        checkoutId: null,
        planId: "plan_1",
        planName: "Plan B",
        cycle: "month",
        periodStart: new Date("2026-09-01T00:00:00Z"),
        periodEnd: new Date("2026-10-01T00:00:00Z"),
        issuedAt: new Date("2026-09-01T06:00:00Z"),
        currency: "INR",
        sellerName: "Saroh",
        sellerLegalName: "Example Labs Pvt Ltd",
        sellerGstin: "29AAAAA0000A1Z5",
        sellerState: "29",
        sellerAddress: "1 Test Road",
        sellerEmail: null,
        billToName: "Test Bakery",
        billToEmail: null,
        billToAddress: "2 Shop Lane",
        billToState: "29",
        billToGstin: null,
        placeOfSupply: "29",
        taxType: "INTRA",
        subtotalPaise: 22200,
        discountPaise: 11100,
        taxablePaise: 11100,
        cgstPaise: 999,
        sgstPaise: 999,
        igstPaise: 0,
        taxPaise: 1998,
        totalPaise: 13098,
        emailedAt: null,
        createdAt: new Date(),
        lines: [
            {
                id: "l1",
                invoiceId: "inv_1",
                organizationId: "org_1",
                position: 0,
                description: "Plan B plan, monthly",
                sac: "999999",
                quantity: 1,
                unitPaise: 22200,
                discountPaise: 11100,
                taxablePaise: 11100,
                gstRateBps: 1800,
                cgstPaise: 999,
                sgstPaise: 999,
                igstPaise: 0,
                taxPaise: 1998,
                amountPaise: 13098,
            },
        ],
    };

    it("is a tax invoice with CGST + SGST, and shows a discount", () => {
        const view = sarohInvoicePaper(base);
        expect(view.title).toBe("Tax invoice");
        expect(view.placeOfSupply).toBe("Karnataka (29) — CGST + SGST");
        expect(view.sums.map(([k]) => k)).toEqual([
            "Before discount",
            "Discount",
            "Taxable value",
            "CGST",
            "SGST",
        ]);
        expect(view.lines[0]!.sub).toContain("less ₹111 discount");
        expect(view.total).toBe("₹130.98");
        expect(view.footer).toContain("section 31");
    });

    it("is IGST across states, and only an invoice without Saroh's GSTIN", () => {
        const view = sarohInvoicePaper({
            ...base,
            sellerGstin: null,
            taxType: "INTER",
            placeOfSupply: "27",
            cgstPaise: 0,
            sgstPaise: 0,
            igstPaise: 1998,
            discountPaise: 0,
            subtotalPaise: 11100,
        });
        expect(view.title).toBe("Invoice");
        expect(view.placeOfSupply).toBe("Maharashtra (27) — IGST");
        expect(view.sums.map(([k]) => k)).toEqual(["Taxable value", "IGST"]);
    });
});

describe("billing emails", () => {
    it("escapes what a business typed", () => {
        const e = invoiceEmail({
            businessName: "<b>Shop</b>",
            number: "SRH/26-27/00001",
            planName: "Plan B",
            total: "₹1",
            period: null,
        });
        expect(e.html).not.toContain("<b>Shop</b>");
        expect(e.html).toContain("&lt;b&gt;Shop&lt;/b&gt;");
    });

    it("says what happens next when a payment fails", () => {
        expect(
            paymentFailedEmail({
                businessName: "Shop",
                planName: "Plan B",
                final: false,
            }).html,
        ).toContain("try again");
        expect(
            paymentFailedEmail({
                businessName: "Shop",
                planName: "Plan B",
                final: true,
            }).subject,
        ).toBe("Shop is now on the Free plan");
    });
});

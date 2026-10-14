/**
 * The pure rules of Saroh's own invoices (pricing catalogue U17): GST per
 * line, the CGST + SGST / IGST split, the place of supply, numbering, when a
 * renewal is a new period, the seller from configuration and the paper.
 * Every amount is made up (111, 222, 999), or the owner's worked GST
 * examples (₹1.00 across states, ₹1,500.00 within Haryana); no plan's price.
 */
import { gstPaise } from "@saroh/pricing-catalog";

import { periodWords } from "./billing-email.job";
import { invoiceEmail, paymentFailedEmail } from "./billing-emails";
import { checkoutAddress } from "./checkout.service";
import { addonInvoiceName } from "./offers";
import {
    sarohInvoicePaper,
    sarohPaymentStatus,
    sarohTaxRows,
} from "./saroh-invoice-paper";
import {
    MAX_INVOICE_NUMBER_LENGTH,
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
    it("counts per prefix and financial year, in India's zone, never starting again inside it", () => {
        expect(sarohSeries("SA", new Date("2026-10-14T12:00:00Z"))).toBe(
            "SA/26-27",
        );
        // November and next March are the same series as October.
        expect(sarohSeries("SA", new Date("2026-11-01T12:00:00Z"))).toBe(
            "SA/26-27",
        );
        expect(sarohSeries("SA", new Date("2027-03-31T12:00:00Z"))).toBe(
            "SA/26-27",
        );
        // 31 March 2027, 19:00 UTC is 1 April in India: the next year.
        expect(sarohSeries("SA", new Date("2027-03-31T19:00:00Z"))).toBe(
            "SA/27-28",
        );
        expect(sarohInvoiceNumber("SA/26-27", 1)).toBe("SA/26-27/0001");
        expect(sarohInvoiceNumber("SA/26-27", 12345)).toBe("SA/26-27/12345");
    });

    it("never writes a number GST would refuse for its length", () => {
        const longest = sarohSeries("SRH", new Date("2026-12-14T12:00:00Z"));
        expect(longest).toBe("SRH/26-27");
        expect(sarohInvoiceNumber(longest, 999_999)).toHaveLength(
            MAX_INVOICE_NUMBER_LENGTH,
        );
        expect(() => sarohInvoiceNumber(longest, 1_000_000)).toThrow(
            /longer than 16/,
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
        expect(s.prefix).toBe("SA");
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
        number: "SA/26-27/0007",
        series: "SA/26-27",
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

    /** A paper built the way the service builds one: lines taxed, then summed. */
    function paper(
        inputs: {
            unitPaise: number;
            discountPaise?: number;
            quantity?: number;
        }[],
        taxType: "INTRA" | "INTER",
        over: Partial<typeof base> = {},
    ) {
        const { lines, totals } = taxSarohLines(
            inputs.map((l, i) => ({
                description: `Line ${i + 1}`,
                sac: "998315",
                ...l,
            })),
            taxType,
        );
        return sarohInvoicePaper({
            ...base,
            taxType,
            placeOfSupply: taxType === "INTRA" ? "06" : "27",
            sellerState: "06",
            ...totals,
            ...over,
            lines: lines.map((l, position) => ({
                ...l,
                id: `l${position}`,
                invoiceId: "inv_1",
                organizationId: "org_1",
                position,
            })),
        });
    }

    it("lays the header out as the owner set it: seller, product, then what it is", () => {
        const view = sarohInvoicePaper(base);
        expect(view.title).toBe("Tax invoice");
        expect(view.number).toBe("SA/26-27/0007");
        expect(view.dates).toBe("Issue date: 1 Sep 2026");
        expect(view.related).toBe(
            "Subscription period:\n1 Sep 2026 – 1 Oct 2026",
        );
        expect(view.status).toBe("Payment status: Paid");
        expect(view.seller).toEqual({
            name: "Example Labs Pvt Ltd",
            lines: ["1 Test Road"],
            tax: "GSTIN 29AAAAA0000A1Z5 · Karnataka (29)",
            product: "Saroh is a product of Example Labs Pvt Ltd",
        });
    });

    it("bills the buyer with their address, state and code, and the place of supply on its own", () => {
        const view = sarohInvoicePaper({
            ...base,
            billToGstin: "27AABCA1234A1ZJ",
            billToState: "27",
            placeOfSupply: "27",
            taxType: "INTER",
        });
        expect(view.billedTo).toEqual({
            name: "Test Bakery",
            detail: "2 Shop Lane\nState: Maharashtra (27)",
            gstin: "27AABCA1234A1ZJ",
        });
        expect(view.placeOfSupply).toBe("Maharashtra (27)");
        // A profile in another state can't print a second state: the
        // place of supply's is the one shown.
        const elsewhere = sarohInvoicePaper({ ...base, billToState: "27" });
        expect(elsewhere.billedTo.detail).toBe(
            "2 Shop Lane\nState: Karnataka (29)",
        );
    });

    it("an unregistered buyer is billed without a GSTIN", () => {
        expect(sarohInvoicePaper(base).billedTo.gstin).toBeNull();
    });

    it("names the SAC column and prints the code whole, with the rate and the taxable value", () => {
        const view = sarohInvoicePaper(base);
        expect(view.table).toEqual({
            code: "SAC",
            rate: true,
            amount: "TAXABLE VALUE",
        });
        expect(view.lines[0]).toMatchObject({
            description: "Plan B plan, monthly",
            hsn: "999999",
            quantity: "1",
            rate: "₹222.00",
            amount: "₹111.00",
        });
        expect(view.lines[0]!.sub).toBe("GST @ 18% · less ₹111.00 discount");
    });

    it("interstate: ₹1.00 → IGST @ 18% ₹0.18 → total ₹1.18 (the owner's example)", () => {
        const view = paper([{ unitPaise: 100 }], "INTER");
        expect(view.sums).toEqual([
            ["Taxable value", "₹1.00"],
            ["IGST @ 18%", "₹0.18"],
        ]);
        expect(view.total).toBe("₹1.18");
    });

    it("within Haryana: ₹1,500.00 → CGST @ 9% ₹135.00 + SGST @ 9% ₹135.00 → ₹1,770.00 (the owner's example)", () => {
        const view = paper([{ unitPaise: 150_000 }], "INTRA");
        expect(view.sums).toEqual([
            ["Taxable value", "₹1,500.00"],
            ["CGST @ 9%", "₹135.00"],
            ["SGST @ 9%", "₹135.00"],
        ]);
        expect(view.total).toBe("₹1,770.00");
    });

    it("rounds GST once per line, half up, the odd paisa to CGST; the invoice adds the lines", () => {
        // 25 paise at 18% is 4.5 paise: 5, split 3 + 2.
        const half = paper([{ unitPaise: 25 }], "INTRA");
        expect(half.sums).toEqual([
            ["Taxable value", "₹0.25"],
            ["CGST @ 9%", "₹0.03"],
            ["SGST @ 9%", "₹0.02"],
        ]);
        expect(half.total).toBe("₹0.30");
        // Two such lines: 5 + 5 paise, not 18% of 50 (9) worked out again.
        const two = paper([{ unitPaise: 25 }, { unitPaise: 25 }], "INTER");
        expect(two.sums).toEqual([
            ["Taxable value", "₹0.50"],
            ["IGST @ 18%", "₹0.10"],
        ]);
        expect(two.total).toBe("₹0.60");
    });

    it("takes a coupon off before GST, and keeps base, discount, taxable, tax and total apart", () => {
        const view = paper(
            [{ unitPaise: 22_200, discountPaise: 11_100 }],
            "INTRA",
        );
        expect(view.sums).toEqual([
            ["Before discount", "₹222.00"],
            ["Discount", "−₹111.00"],
            ["Taxable value", "₹111.00"],
            ["CGST @ 9%", "₹9.99"],
            ["SGST @ 9%", "₹9.99"],
        ]);
        expect(view.total).toBe("₹130.98");
    });

    it("shows a tax row per rate, each from its lines' own rate", () => {
        const line = base.lines[0]!;
        expect(
            sarohTaxRows(
                [
                    { ...line, gstRateBps: 1800, cgstPaise: 90, sgstPaise: 90 },
                    { ...line, gstRateBps: 500, cgstPaise: 25, sgstPaise: 25 },
                    { ...line, gstRateBps: 1800, cgstPaise: 9, sgstPaise: 9 },
                ],
                true,
            ),
        ).toEqual([
            ["CGST @ 9%", 99],
            ["SGST @ 9%", 99],
            ["CGST @ 2.5%", 25],
            ["SGST @ 2.5%", 25],
        ]);
    });

    it("ends with who issues it, the law, reverse charge and the payment status", () => {
        const view = sarohInvoicePaper(base);
        expect(view.signature).toEqual({
            for: "For Example Labs Pvt Ltd",
            role: "Electronically generated tax invoice",
            note: "This invoice is electronically generated and does not require a physical signature.",
        });
        expect(view.footer).toBe(
            "Tax invoice issued under Section 31 of the CGST Act.\nReverse charge: No\nPayment status: Paid",
        );
        expect(view.footer).not.toContain("Paid in full");
    });

    it("reads Due for a source that isn't paid when written", () => {
        expect(sarohPaymentStatus({ source: "RENEWAL" })).toBe("Paid");
        expect(sarohPaymentStatus({ source: "NEW" })).toBe("Paid");
        expect(sarohPaymentStatus({ source: "SOMETHING_UNPAID" })).toBe("Due");
    });

    it("is only an invoice, unsigned and without the law's line, without Saroh's GSTIN", () => {
        const view = sarohInvoicePaper({
            ...base,
            sellerGstin: null,
            sellerLegalName: null,
        });
        expect(view.title).toBe("Invoice");
        expect(view.seller.name).toBe("Saroh");
        expect(view.seller.product).toBeNull();
        expect(view.signature).toBeNull();
        expect(view.footer).toBe("Reverse charge: No\nPayment status: Paid");
    });
});

describe("invoice lines' names", () => {
    it("names add-ons by their kind, a module by its own name", () => {
        const named = (kind: string, cycle: "month" | "year" = "month") =>
            addonInvoiceName(
                { kind, name: "Catalogue name" } as Parameters<
                    typeof addonInvoiceName
                >[0],
                cycle,
            );
        expect(named("members")).toBe("Additional Team Member — Monthly Seat");
        expect(named("members", "year")).toBe(
            "Additional Team Member — Annual Seat",
        );
        expect(named("products")).toBe("Additional Product Capacity");
        expect(named("orders")).toBe("Additional Order Capacity");
        expect(named("bookings")).toBe("Additional Booking Capacity");
        expect(named("module")).toBe("Catalogue name");
    });
});

describe("billing emails", () => {
    it("escapes what a business typed", () => {
        const e = invoiceEmail({
            businessName: "<b>Shop</b>",
            number: "SA/26-27/0001",
            planName: "Plan B",
            total: "₹1",
            period: null,
        });
        expect(e.html).not.toContain("<b>Shop</b>");
        expect(e.html).toContain("&lt;b&gt;Shop&lt;/b&gt;");
    });

    it("says a first month's charge is the first month's, and where to find it", () => {
        const first = invoiceEmail({
            businessName: "Shop",
            number: "SA/26-27/0001",
            planName: "Plan B",
            total: "₹1.18",
            period: "14 Oct to 13 Nov 2026",
            firstMonth: true,
        });
        expect(first.html).toContain(
            "We&#39;ve charged ₹1.18 for the first month of Shop&#39;s Plan B plan, 14 Oct to 13 Nov 2026.",
        );
        expect(first.html).toContain("Settings › Plan and billing.");
        const renewal = invoiceEmail({
            businessName: "Shop",
            number: "SA/26-27/0002",
            planName: "Plan B",
            total: "₹1,768.82",
            period: "13 Nov to 13 Dec 2026",
        });
        expect(renewal.html).toContain(
            "We&#39;ve charged ₹1,768.82 for Shop&#39;s Plan B plan, 13 Nov to 13 Dec 2026.",
        );
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

describe("the invoice email's period", () => {
    it("names the year once when both ends share it", () => {
        expect(
            periodWords(
                new Date("2026-10-14T08:00:00Z"),
                new Date("2026-11-13T08:00:00Z"),
            ),
        ).toBe("14 Oct to 13 Nov 2026");
        expect(
            periodWords(
                new Date("2026-12-20T08:00:00Z"),
                new Date("2027-01-19T08:00:00Z"),
            ),
        ).toBe("20 Dec 2026 to 19 Jan 2027");
    });
});

describe("checkoutAddress (Rule 46(e))", () => {
    const field = (fn: () => unknown) => {
        try {
            fn();
        } catch (e) {
            return (
                (
                    e as {
                        getResponse?: () => { details?: { field?: string } };
                    }
                ).getResponse?.()?.details?.field ?? "none"
            );
        }
        return null;
    };

    it("needs the address when a GSTIN is given, and not otherwise", () => {
        expect(field(() => checkoutAddress(undefined, true))).toBe(
            "addressLine1",
        );
        expect(checkoutAddress(undefined, false)).toBeNull();
        expect(checkoutAddress({ line1: " ", city: "" }, false)).toBeNull();
    });

    it("takes a whole address, with a six-digit PIN written bare", () => {
        expect(
            checkoutAddress(
                { line1: "2 Shop Lane", city: "Pune", postalCode: "411 001" },
                true,
            ),
        ).toEqual({
            addressLine1: "2 Shop Lane",
            addressLine2: null,
            city: "Pune",
            postalCode: "411001",
        });
    });

    it("names the part that is missing or wrong", () => {
        expect(field(() => checkoutAddress({ city: "Pune" }, false))).toBe(
            "addressLine1",
        );
        expect(
            field(() =>
                checkoutAddress(
                    { line1: "2 Shop Lane", postalCode: "411001" },
                    false,
                ),
            ),
        ).toBe("city");
        expect(
            field(() =>
                checkoutAddress(
                    { line1: "2 Shop Lane", city: "Pune", postalCode: "41100" },
                    false,
                ),
            ),
        ).toBe("postalCode");
    });
});

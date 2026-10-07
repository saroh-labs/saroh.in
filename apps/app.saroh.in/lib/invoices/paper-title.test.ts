import { describe, expect, it } from "vitest";

import {
    exemptNote,
    isExemptPaper,
    lineGstNote,
    paperFooter,
    paperTitle,
    showsGstTotals,
} from "./paper-title";
import type { Invoice, InvoiceGst } from "./service";

const GST: InvoiceGst = {
    sellerGstin: "29AAGCK1234M1Z5",
    sellerState: "29",
    placeOfSupply: { code: "29", name: "Karnataka" },
    taxType: "INTRA",
    cgst: "0.00",
    sgst: "0.00",
    igst: "0.00",
};

type Paper = Pick<
    Invoice,
    | "gst"
    | "exempt"
    | "kind"
    | "related"
    | "standing"
    | "tax"
    | "title"
    | "status"
>;

const paper = (over: Partial<Paper>): Paper => ({
    gst: GST,
    exempt: true,
    kind: "INVOICE",
    related: null,
    standing: "PAID",
    tax: "0.00",
    title: "Bill of supply",
    status: "PAID",
    ...over,
});

describe("paperTitle (D15)", () => {
    it("takes the API's title: a registered clinic's exempt paper is a bill of supply", () => {
        expect(paperTitle(paper({}))).toBe("Bill of supply");
    });

    it("falls back, with an older API, to the paper's GST", () => {
        expect(paperTitle(paper({ title: undefined }))).toBe("Tax invoice");
        expect(
            paperTitle(
                paper({ title: undefined, gst: null, standing: "PAID" }),
            ),
        ).toBe("Receipt");
        expect(
            paperTitle(
                paper({ title: undefined, gst: null, standing: "ISSUED" }),
            ),
        ).toBe("Invoice");
        expect(
            paperTitle(paper({ title: undefined, kind: "CREDIT_NOTE" })),
        ).toBe("Credit note");
    });
});

describe("isExemptPaper", () => {
    it("only a registered business's paper with every line at 0%", () => {
        expect(isExemptPaper(paper({}))).toBe(true);
        expect(isExemptPaper(paper({ exempt: false }))).toBe(false);
        // An older API sends no flag: it prints as it always has.
        expect(isExemptPaper(paper({ exempt: undefined }))).toBe(false);
        // An unregistered business's receipt has no GST to leave off.
        expect(isExemptPaper(paper({ gst: null }))).toBe(false);
    });
});

describe("paperFooter", () => {
    it("a paid bill of supply names its section and that the supply is exempt", () => {
        expect(paperFooter(paper({}), "Kavi Dental")).toBe(
            "Bill of supply under section 31(3)(c), CGST Act. Supply exempt from GST. Paid in full.",
        );
    });

    it("a tax invoice keeps its own words", () => {
        expect(
            paperFooter(
                paper({
                    exempt: false,
                    title: "Tax invoice",
                    standing: "ISSUED",
                }),
                "Rye & Co.",
            ),
        ).toBe(
            "Tax invoice under section 31, CGST Act. Reverse charge does not apply.",
        );
    });

    it("a credit note against a bill of supply is a credit note, of an exempt supply", () => {
        expect(
            paperFooter(
                paper({
                    kind: "CREDIT_NOTE",
                    title: "Credit note",
                    standing: "ISSUED",
                    related: { id: "inv_1", number: "KD/26-27/0004" },
                }),
                "Kavi Dental",
            ),
        ).toBe(
            "Credit note under section 34, CGST Act, against KD/26-27/0004. Supply exempt from GST.",
        );
    });

    it("an unregistered business's receipt is unchanged", () => {
        expect(
            paperFooter(
                paper({ gst: null, exempt: false, title: "Receipt" }),
                "Pulse Fitness",
            ),
        ).toBe(
            "Receipt — paid in full. Pulse Fitness is not registered for GST, so no tax is charged.",
        );
    });
});

describe("exemptNote", () => {
    it("says so when every issued paper is a bill of supply", () => {
        expect(
            exemptNote([
                paper({}),
                paper({ status: "ISSUED" }),
                // A draft and a credit note say nothing either way.
                paper({ status: "DRAFT", title: "Invoice" }),
                paper({ kind: "CREDIT_NOTE", title: "Credit note" }),
            ]),
        ).toBe(
            "Exempt from GST, so these are bills of supply, not tax invoices.",
        );
    });

    it("stays silent with one tax invoice among them, or none issued", () => {
        expect(
            exemptNote([paper({}), paper({ title: "Tax invoice" })]),
        ).toBeNull();
        expect(exemptNote([paper({ status: "DRAFT" })])).toBeNull();
        expect(exemptNote([])).toBeNull();
    });
});

describe("lineGstNote (DEC-072)", () => {
    const money = (a: string) => `₹${Number(a).toLocaleString("en-IN")}`;
    const at = (rate: string | null) => ({ rate, taxableValue: "2400.00" });

    it("a registered paper: a rate above 0 names it and the taxable value", () => {
        expect(lineGstNote(true, at("18.00"), money)).toBe(
            "GST 18% · taxable ₹2,400",
        );
    });

    it("a registered paper: only a rate recorded as 0 is nil-rated", () => {
        expect(lineGstNote(true, at("0"), money)).toBe("Nil-rated");
        expect(lineGstNote(true, at("0.00"), money)).toBe("Nil-rated");
    });

    it("a registered paper: a rate never set says nothing, not nil-rated or 0%", () => {
        expect(lineGstNote(true, at(null), money)).toBeNull();
        expect(lineGstNote(true, at(""), money)).toBeNull();
        expect(lineGstNote(true, null, money)).toBeNull();
    });

    it("no tax on the paper (unregistered, bill of supply): nothing, whatever the rate", () => {
        for (const rate of [null, "0", "18.00"]) {
            expect(lineGstNote(false, at(rate), money)).toBeNull();
        }
    });
});

describe("showsGstTotals (DEC-072)", () => {
    const lineAt = (rate: string | null) =>
        ({
            gst: { rate },
        }) as NonNullable<Invoice["lines"]>[number];

    it("hides the rows when no line has a rate set", () => {
        expect(showsGstTotals({ lines: [lineAt(null), lineAt(" ")] })).toBe(
            false,
        );
        expect(showsGstTotals({ lines: [] })).toBe(false);
    });

    it("keeps them when any line is rated, 0% included", () => {
        expect(showsGstTotals({ lines: [lineAt(null), lineAt("0.00")] })).toBe(
            true,
        );
        expect(showsGstTotals({ lines: [lineAt("18.00")] })).toBe(true);
    });

    it("keeps them while the lines aren't read (a list row)", () => {
        expect(showsGstTotals({})).toBe(true);
    });
});

describe("paperFooter says how a paid paper was paid (UX-082)", () => {
    const payment = (method: "UPI" | "CASH") => ({
        payment: { method, reference: null, note: null },
    });

    it("on a registered paper", () => {
        expect(
            paperFooter({ ...paper({}), ...payment("UPI") }, "Kavi Dental"),
        ).toBe(
            "Bill of supply under section 31(3)(c), CGST Act. Supply exempt from GST. Paid in full by UPI.",
        );
    });

    it("on a receipt", () => {
        expect(
            paperFooter(
                { ...paper({ gst: null }), ...payment("CASH") },
                "Rye & Co.",
            ),
        ).toBe(
            "Receipt — paid in full in cash. Rye & Co. is not registered for GST, so no tax is charged.",
        );
    });
});

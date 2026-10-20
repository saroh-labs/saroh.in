import type { PaperStyle } from "@saroh/block-contract";
import { PAPER_STYLES, paperColours } from "@saroh/block-contract";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { InvoiceFormValues } from "@/lib/invoices/new-invoice";
import { placeOf } from "@/lib/invoices/new-invoice";
import { previewSums } from "@/lib/invoices/new-invoice-lines";

import { PaperPreview } from "./paper-preview";

/**
 * "How it will look" (U14 #1126): the paper as typed, in each of the three
 * styles (U6 #1118), in the business's colour, with the GST lines a tax
 * invoice prints.
 */
const LINES: InvoiceFormValues["lines"] = [
    {
        description: "Sourdough loaf (trade)",
        quantity: 12,
        unitPrice: "400",
        gstRate: "0",
        hsnSac: "19059010",
    },
    {
        description: "Butter croissant (trade)",
        quantity: 20,
        unitPrice: "150",
        gstRate: "18",
        hsnSac: "19059020",
    },
];

const SELLER = {
    name: "Rye & Co.",
    address: "3 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
    gstin: "29AAGCR4375J1ZU",
    state: "Karnataka (29)",
    logo: null,
};

function draw({
    style = "CLASSIC",
    colour = null,
    registered = true,
    billToState = "",
    // The end of 2 Nov 2026 in India.
    dueAt = "2026-11-02T18:29:59.000Z",
    lines = LINES,
}: {
    style?: PaperStyle;
    colour?: string | null;
    registered?: boolean;
    billToState?: string;
    dueAt?: string | null;
    lines?: InvoiceFormValues["lines"];
} = {}) {
    const buyer = { billToGstin: "29ABCFB2207K1ZL", billToState };
    return (
        renderToStaticMarkup(
            <PaperPreview
                seller={SELLER}
                registered={registered}
                currency="INR"
                zone="Asia/Kolkata"
                buyer={{
                    name: "Vivek Nair",
                    address: "7 27th Main, HSR Layout",
                    gstin: buyer.billToGstin,
                }}
                place={placeOf(buyer, "29")}
                sums={previewSums(
                    { lines, ...buyer },
                    { registered, businessState: "29" },
                )}
                dueAt={dueAt}
                style={style}
                colour={colour}
            />,
        )
            // &amp; last, so "&amp;#x27;" stays "&#x27;" and isn't decoded twice.
            .replace(/&#x27;/g, "'")
            .replace(/&amp;/g, "&")
    );
}

describe("the paper preview", () => {
    it.each(PAPER_STYLES)(
        "%s prints the seller, the number to come, the buyer, the place of supply and every line",
        (style) => {
            const out = draw({ style });
            expect(out).toContain(`data-style="${style}"`);
            for (const text of [
                "Rye & Co.",
                "3 Hill Road, Indiranagar",
                "GSTIN 29AAGCR4375J1ZU · Karnataka (29)",
                "Tax invoice",
                "Number when issued",
                "Vivek Nair",
                "GSTIN 29ABCFB2207K1ZL",
                "Place of supply",
                "Karnataka (29) · CGST + SGST",
                "Sourdough loaf (trade)",
                "Nil-rated · HSN 19059010 · 12 × ₹400",
                "GST 18% · HSN 19059020 · 20 × ₹150",
                "Taxable value",
                "₹7,342.37",
                "CGST 9%",
                "₹228.82",
                "SGST 9%",
                "₹228.81",
                "₹7,800",
                "Reverse charge does not apply.",
            ]) {
                expect(out, `${style}: ${text}`).toContain(text);
            }
        },
    );

    it("Band fills the top with the business's colour, its text the tone that reads on it", () => {
        const out = draw({ style: "BAND", colour: "#1B3A5C" });
        const band = paperColours("BAND", "#1B3A5C").band;
        expect(band?.tone).toBe("WHITE");
        expect(out).toContain('data-band="white"');
        expect(out).toMatch(/background-color:#1B3A5C;color:#FFFFFF/i);
        // A pale colour takes ink.
        expect(draw({ style: "BAND", colour: "#F6E7A1" })).toContain(
            'data-band="ink"',
        );
    });

    it("Classic and Compact carry the colour on the title and the heavy rule; with none, ink", () => {
        const coloured = draw({ style: "CLASSIC", colour: "#6B3F1D" });
        expect(coloured).toMatch(/border-color:#6B3F1D/i);
        expect(coloured).toMatch(/color:#6B3F1D[^>]*>Tax invoice/i);
        expect(draw({ style: "CLASSIC" })).not.toContain("border-color");
        expect(draw({ style: "COMPACT", colour: "#6B3F1D" })).toMatch(
            /border-color:#6B3F1D/i,
        );
    });

    it("Compact puts the seller and the buyer side by side in its head", () => {
        const out = draw({ style: "COMPACT" });
        const head = out.slice(
            out.indexOf("<header"),
            out.indexOf("</header>"),
        );
        expect(head).toContain("Rye & Co.");
        expect(head).toContain("Vivek Nair");
        const classic = draw({ style: "CLASSIC" });
        expect(
            classic.slice(
                classic.indexOf("<header"),
                classic.indexOf("</header>"),
            ),
        ).not.toContain("Vivek Nair");
    });

    it("says the day it falls due, in the business's zone, and On receipt says so", () => {
        expect(
            draw()
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " "),
        ).toContain("Due 2 Nov");
        expect(draw({ dueAt: null })).toContain("Due on receipt");
    });

    it("another state prints IGST at the full rate", () => {
        const out = draw({ billToState: "27" });
        expect(out).toContain("Maharashtra (27) · IGST");
        expect(out).toContain("IGST 18%");
        expect(out).not.toContain("CGST 9%");
    });

    it("a business that isn't registered prints an invoice with no GST", () => {
        const out = draw({ registered: false });
        expect(out).toContain("Not registered for GST");
        expect(out).toContain(">Invoice<");
        expect(out).not.toContain("Taxable value");
        expect(out).not.toContain("Place of supply");
        expect(out).toContain(
            "Rye & Co. is not registered for GST, so no tax is charged.",
        );
    });

    it("every line at 0% is a bill of supply, with no tax rows", () => {
        const out = draw({
            lines: LINES.map((l) => ({ ...l, gstRate: "0" })),
        });
        expect(out).toContain("Bill of supply");
        expect(out).not.toContain("Taxable value");
    });

    it("names its parts for editing on the paper (U15)", () => {
        const out = draw();
        for (const part of [
            "seller",
            "number",
            "buyer",
            "supply",
            "lines",
            "sums",
            "footer",
        ]) {
            expect(out).toContain(`data-part="${part}"`);
        }
    });

    it("before any line, says where they will show", () => {
        expect(draw({ lines: [] })).toContain("The lines you write show here.");
    });
});

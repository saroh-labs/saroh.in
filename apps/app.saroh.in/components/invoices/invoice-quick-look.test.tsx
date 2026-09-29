import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Invoice } from "@/lib/invoices/service";

import { TaxRows } from "./invoice-quick-look";

vi.mock("@/lib/invoices/actions", () => ({
    createPayLink: vi.fn(),
    readInvoice: vi.fn(),
}));

/**
 * The invoice quick look's tax rows (DEC-072): a registered business's
 * paper with no line rated shows none — just the total below them.
 */

const gst = {
    sellerGstin: "29AAGCR1234M1Z5",
    sellerState: "29",
    placeOfSupply: { code: "29", name: "Karnataka" },
    taxType: "INTRA",
    cgst: "0.00",
    sgst: "0.00",
    igst: "0.00",
} as const;

const at = (rate: string | null) =>
    ({ gst: { rate } }) as NonNullable<Invoice["lines"]>[number];

const rows = (over: Partial<Invoice>) =>
    renderToStaticMarkup(
        <TaxRows
            invoice={
                {
                    gst,
                    exempt: false,
                    subtotal: "1200.00",
                    tax: "0.00",
                    ...over,
                } as Invoice
            }
            money={(a) => `₹${a}`}
            businessName="Rye & Co."
        />,
    );

describe("TaxRows (DEC-072)", () => {
    it("no line rated: no Taxable value, CGST or SGST", () => {
        expect(rows({ lines: [at(null)] })).toBe("");
    });

    it("a rated line, 0% included, keeps them", () => {
        const html = rows({ lines: [at(null), at("0.00")] });
        expect(html).toContain("Taxable value");
        expect(html).toContain("CGST");
    });

    it("while the lines load, keeps them as before", () => {
        expect(rows({})).toContain("Taxable value");
    });
});

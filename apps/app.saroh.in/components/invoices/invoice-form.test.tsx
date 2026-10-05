import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { InvoiceForm } from "./invoice-form";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/invoices/actions", () => ({
    createInvoice: vi.fn(),
    createPayLink: vi.fn(),
    issueInvoice: vi.fn(),
    updateInvoice: vi.fn(),
}));
vi.mock("@/components/organizations/use-business-details-step", () => ({
    useBusinessDetailsStep: () => ({ run: vi.fn(), step: null }),
}));

/**
 * A line on a phone (T7): what it's for on its own line beside a 44px
 * remove button, then Quantity and Price each, labelled, side by side.
 */
describe("InvoiceForm's line editor", () => {
    const out = renderToStaticMarkup(
        <InvoiceForm
            contacts={[
                { id: "c_1", name: "Asha Rao", email: "asha@example.com" },
            ]}
            defaultCurrency="INR"
            registered={false}
            businessName="Rye & Co."
            providerConnected={false}
        />,
    );

    it("labels Quantity and Price each with visible text tied to the box", () => {
        for (const [text, name] of [
            ["Quantity", "lines.0.quantity"],
            ["Price each", "lines.0.unitPrice"],
        ]) {
            const label = new RegExp(
                `<label[^>]*for="([^"]+)"[^>]*>${text}</label>`,
            ).exec(out);
            expect(label, text).not.toBeNull();
            expect(out).toMatch(
                new RegExp(
                    `<input[^>]*id="${label?.[1] ?? ""}"[^>]*name="${name}"`,
                ),
            );
        }
    });

    it("keeps the inputs' names and spoken labels", () => {
        expect(out).toContain('aria-label="Line 1: what it&#x27;s for"');
        expect(out).toContain('aria-label="Line 1: quantity"');
        expect(out).toContain('aria-label="Line 1: price each, INR"');
    });

    it("draws remove beside the description on a phone, at 44px", () => {
        const removes = out.match(
            /<button[^>]*aria-label="Remove line 1"[^>]*>/g,
        );
        expect(removes).toHaveLength(2);
        expect(removes?.[0]).toContain("size-11 sm:hidden");
        expect(removes?.[1]).toContain("hidden sm:grid");
        // Description, then the phone's remove, then the boxes: tab order
        // follows the phone's lines; the desk's remove comes last.
        const at = (s: string) => out.indexOf(s);
        expect(at("Line 1: what it&#x27;s for")).toBeLessThan(
            at("size-11 sm:hidden"),
        );
        expect(at("size-11 sm:hidden")).toBeLessThan(at("Line 1: quantity"));
        expect(at("Line 1: price each")).toBeLessThan(at("hidden sm:grid"));
    });
});

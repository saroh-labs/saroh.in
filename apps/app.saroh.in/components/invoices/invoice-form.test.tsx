import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InvoiceFormBusiness } from "@/lib/invoices/new-invoice";

import { InvoiceForm } from "./invoice-form";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
// On the paper (U15), the business\'s settings save in place.
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: vi.fn(),
    saveBusinessLogo: vi.fn(),
}));
vi.mock("@/components/shared/logo-upload", () => ({ LogoUpload: () => null }));
vi.mock("@/lib/invoices/actions", () => ({
    createInvoice: vi.fn(),
    createPayLink: vi.fn(),
    issueInvoice: vi.fn(),
    updateInvoice: vi.fn(),
}));
vi.mock("@/lib/invoices/link-actions", () => ({ newPayLink: vi.fn() }));
vi.mock("@/lib/invoices/product-actions", () => ({
    findInvoiceProducts: vi.fn(),
}));
vi.mock("@/lib/contacts/create", () => ({ createContact: vi.fn() }));
vi.mock(
    "@/components/organizations/business-details/use-business-details-step",
    () => ({
        useBusinessDetailsStep: () => ({
            run: vi.fn(),
            ensure: vi.fn(),
            step: null,
        }),
    }),
);

const CONTACTS = [{ id: "c_1", name: "Asha Rao", email: "asha@example.com" }];

const BUSINESS: InvoiceFormBusiness = {
    seller: {
        name: "Rye & Co.",
        address: "3 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
        gstin: "29AAGCR4375J1ZU",
        state: "Karnataka (29)",
        logo: null,
    },
    state: "29",
    priceMode: "INCLUDED",
    zone: "Asia/Kolkata",
    paper: { style: "BAND", colour: "#1B3A5C" },
    nextNumber: "RC/26-27/0145",
};

const draw = (props: Partial<Parameters<typeof InvoiceForm>[0]> = {}) =>
    renderToStaticMarkup(
        <InvoiceForm
            contacts={CONTACTS}
            defaultCurrency="INR"
            registered={false}
            businessName="Rye & Co."
            providerConnected={false}
            header={{
                breadcrumb: ["Payments", "New invoice"],
                title: "New invoice",
            }}
            {...props}
        />,
    )
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");

/**
 * A line on a phone (T7): what it's for on its own line beside a 44px
 * remove button, then Quantity and Price each, labelled, side by side.
 */
describe("InvoiceForm's line editor", () => {
    const out = draw();

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
        expect(out).toContain('aria-label="Line 1: what it\'s for"');
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
        expect(at("Line 1: what it's for")).toBeLessThan(
            at("size-11 sm:hidden"),
        );
        expect(at("size-11 sm:hidden")).toBeLessThan(at("Line 1: quantity"));
        expect(at("Line 1: price each")).toBeLessThan(at("hidden sm:grid"));
    });

    it("a registered business's line has its GST rate as buttons and its HSN, labelled on a phone", () => {
        const gst = draw({ registered: true, business: BUSINESS });
        // The rate is buttons under the line (DEC-176), named for the line.
        expect(gst).toMatch(/role="radiogroup" aria-label="Line 1: GST rate"/);
        expect(gst).toContain('aria-label="Line 1: HSN or SAC"');
        expect(gst).toMatch(/<span aria-hidden="true"[^>]*>GST rate<\/span>/);
        expect(gst).toMatch(/<label[^>]*>HSN \/ SAC<\/label>/);
        // The desk's one row has an HSN column; the rate sits under it.
        expect(gst).toContain("<span>HSN</span>");
        expect(gst).not.toContain("<span>GST</span>");
        expect(out).not.toContain("Line 1: GST rate");
    });
});

/** Who on a new invoice (UX-047): a contact is added in place. */
describe("InvoiceForm's New contact", () => {
    it("with no contacts yet, offers New contact rather than only a way out", () => {
        const out = draw({ contacts: [] });
        expect(out).toContain("New contact");
        expect(out).toContain("Add who it's for here");
        expect(out).toContain("New invoice");
    });

    it("with contacts, offers New contact under the picker", () => {
        expect(draw()).toContain("New contact");
    });
});

/** INVNewA: the two columns, and every field of today's form. */
describe("New invoice (A)", () => {
    const out = draw({
        registered: true,
        business: BUSINESS,
        providerConnected: true,
    });

    it("is the customer, the lines and Due on the left, the paper on the right", () => {
        const at = (s: string) => out.indexOf(s);
        expect(at("Billed to")).toBeLessThan(at("What it's for"));
        expect(at("What it's for")).toBeLessThan(at('aria-label="Due"'));
        expect(at('aria-label="Due"')).toBeLessThan(at("How it will look"));
        expect(out).toContain("lg:grid-cols-[minmax(0,1fr)_440px]");
    });

    it("offers On receipt, 7, 14 and 30 days, with 14 chosen", () => {
        for (const due of ["On receipt", "7 days", "14 days", "30 days"]) {
            expect(out).toContain(due);
        }
        expect(out).toMatch(/aria-checked="true"[^>]*>14 days · /);
    });

    it("keeps the buyer's GSTIN, state and address a press away", () => {
        expect(out).toContain("+ Their GSTIN, state and address");
        expect(out).toContain("Karnataka: CGST + SGST");
    });

    it("draws the paper in the business's style, with the next number under it", () => {
        expect(out).toContain('data-style="BAND"');
        expect(out).toContain(
            "Saved as you type. Issuing gives it the next number, RC/26-27/0145, and locks the lines.",
        );
    });

    it("says Save draft and Issue and share; Issue it where no link can be made", () => {
        expect(out).toContain(">Save draft<");
        expect(out).toContain(">Issue and share<");
        expect(draw()).toContain(">Issue it<");
    });

    it("offers products to pick only where there are some", () => {
        expect(out).not.toContain("+ Pick from your products");
        expect(
            draw({
                registered: true,
                business: BUSINESS,
                canPickProducts: true,
            }),
        ).toContain("+ Pick from your products");
        expect(out).toContain("+ Add a line");
    });
});

/** INVNewAPhone: one column, the paper behind See it, the buttons at the foot. */
describe("New invoice on a phone", () => {
    const out = draw({ registered: true, business: BUSINESS });

    it("hides the paper behind See how it will look", () => {
        expect(out).toMatch(
            /<button[^>]*aria-expanded="false"[^>]*>.*See how it will look<\/button>/,
        );
        expect(out).toMatch(/<aside[^>]*class="min-w-0 max-sm:hidden/);
    });

    it("puts the total and both buttons in the foot, above the tab bar", () => {
        const foot = out.slice(out.indexOf('data-testid="phone-foot"'));
        expect(foot).toContain("sm:hidden");
        expect(foot).toContain("bottom-[var(--tab-bar-inset)]");
        expect(foot).toContain("Total");
        expect(foot).toContain(">Save draft<");
        expect(foot).toContain(">Issue it<");
        // The header's buttons are the desk's only.
        expect(out).toMatch(/class="flex gap-2 max-sm:hidden"/);
    });

    it("gives the line's buttons a thumb's height", () => {
        expect(out).toMatch(/max-sm:min-h-11[^>]*>\+ Add a line/);
        expect(out).toContain("size-11 sm:hidden");
    });
});

// The GST invoice generator's states (GstInvoiceStates.dc.html): empty, a
// GSTIN that looks wrong, the customer in another state, not registered,
// and the email gate on the PDF.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import GstInvoiceGenerator from ".";
import { unknownClasses } from "../../test-classes";
import {
    addLine,
    line,
    paper,
    type,
    unlockAndPrint,
} from "../_documents/test-kit";

afterEach(() => {
    cleanup();
    localStorage.clear();
});

const doc = () => paper("Your invoice");

/** The boards' sample: Gulmohar Unisex Salon, two services at 5%. */
function fillGulmohar() {
    type("Business name", "Gulmohar Unisex Salon");
    type("Address", "Koramangala, Bengaluru");
    type("GSTIN", "29AAAAA0000A1ZY");
    type("Name", "Priya Nair");
    type("Invoice number", "INV-0001");
    type("Date", "26 Oct 2026");
    line(0, {
        Item: "Haircut & blow-dry (women)",
        "HSN or SAC": "999721",
        "Rate in rupees": "800",
        "GST rate": "5",
    });
    addLine();
    line(1, {
        Item: "D-Tan facial",
        "HSN or SAC": "999722",
        "Rate in rupees": "1,500",
    });
}

describe("GstInvoiceGenerator", () => {
    it("says where the invoice appears before anything is typed", () => {
        render(<GstInvoiceGenerator />);
        expect(doc()).toBe("Your invoice shows here as you type.");
        expect(screen.queryByText("Email me the PDF")).toBeNull();
    });

    it("draws the boards' invoice to the paisa", () => {
        const { container } = render(<GstInvoiceGenerator />);
        fillGulmohar();
        const d = doc();
        expect(d).toContain("Tax invoice");
        expect(d).toContain(
            "Gulmohar Unisex Salon, Koramangala, Bengaluru · GSTIN 29AAAAA0000A1ZY",
        );
        expect(d).toContain("INV-0001");
        expect(d).toContain("Billed to Priya Nair · Karnataka · 26 Oct 2026");
        expect(d).toContain("Haircut & blow-dry (women) · SAC 999721₹800.00");
        expect(d).toContain("D-Tan facial · SAC 999722₹1,500.00");
        expect(d).toContain("Taxable value₹2,300.00");
        expect(d).toContain("CGST 2.5%₹57.50");
        expect(d).toContain("SGST 2.5%₹57.50");
        expect(d).toContain("Total₹2,415.00");
        expect(unknownClasses(container)).toEqual([]);
    });

    it("marks a GSTIN that looks wrong when they leave it; the preview keeps going", () => {
        render(<GstInvoiceGenerator />);
        fillGulmohar();
        type("GSTIN", "29ABCDE1234F1Z");
        fireEvent.blur(screen.getByLabelText("GSTIN"));
        expect(screen.getByRole("alert").textContent).toBe(
            "A GSTIN has 15 characters. This one has 14.",
        );
        expect(doc()).toContain("Total₹2,415.00");
    });

    it("charges IGST and names the place of supply for another state", () => {
        render(<GstInvoiceGenerator />);
        fillGulmohar();
        type("State", "27", 1);
        const d = doc();
        expect(d).toContain("Priya Nair · Maharashtra (place of supply)");
        expect(d).toContain("IGST 5%₹115.00");
        expect(d).not.toContain("CGST");
        expect(d).toContain("Total₹2,415.00");
        expect(
            screen.getByText("Another state: IGST at the full rate."),
        ).toBeTruthy();
    });

    it("makes a plain bill with no GST without a GSTIN", () => {
        render(<GstInvoiceGenerator />);
        fillGulmohar();
        type("GSTIN", "");
        const d = doc();
        expect(d).toMatch(/^Bill/);
        expect(d).toContain("Total₹2,300.00");
        expect(d).not.toContain("GST 2.5%");
    });

    it("prints after the email gate, and keeps the invoice for the way back", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        const first = render(<GstInvoiceGenerator />);
        fillGulmohar();
        expect(
            screen.queryByRole("button", { name: "Print or save as PDF" }),
        ).toBeNull();
        await unlockAndPrint("gulmohar@example.com");
        expect(print).toHaveBeenCalled();
        print.mockRestore();
        first.unmount();
        render(<GstInvoiceGenerator />);
        expect(doc()).toContain("Total₹2,415.00");
    });
});

// The quotation maker's states (QuotationStates.dc.html): empty, ready for
// the PDF, valid-until too early, another state, not registered.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import QuotationMaker from ".";
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

const doc = () => paper("Your quote");

/** The boards' sample: Rye Studio quoting Northwind Bakes a shoot at 18%. */
function fillRye() {
    type("Business name", "Rye Studio");
    type("Address", "HSR Layout, Bengaluru");
    type("GSTIN", "29AAAAA0000A1ZY");
    type("Name", "Northwind Bakes");
    type("Date", "26 Oct 2026");
    line(0, {
        Item: "Product photo shoot, half day",
        "HSN or SAC": "998382",
        "Rate in rupees": "12,000",
    });
    addLine();
    line(1, {
        Item: "Edited photos, set of 10",
        "HSN or SAC": "998382",
        Quantity: "3",
        "Rate in rupees": "1,500",
    });
    type(
        "Payment and delivery (optional)",
        "50% to book the date, the rest on delivery. Photos in 5 working days.",
    );
}

describe("QuotationMaker", () => {
    it("says where the quote appears before anything is typed", () => {
        render(<QuotationMaker />);
        expect(doc()).toBe("Your quote shows here as you type.");
    });

    it("draws the boards' quote, valid for two weeks", () => {
        const { container } = render(<QuotationMaker />);
        fillRye();
        const d = doc();
        expect(d).toMatch(/^Quotation/);
        expect(d).toContain("QT-0001 · 26 Oct 2026");
        expect(d).toContain(
            "For Northwind Bakes · Karnataka · Valid until 9 Nov 2026",
        );
        expect(d).toContain(
            "Product photo shoot, half day · SAC 998382₹12,000.00",
        );
        expect(d).toContain(
            "Edited photos, set of 10 × 3 · SAC 998382₹4,500.00",
        );
        expect(d).toContain("Taxable value₹16,500.00");
        expect(d).toContain("CGST 9%₹1,485.00");
        expect(d).toContain("SGST 9%₹1,485.00");
        expect(d).toContain("Total₹19,470.00");
        expect(d).toContain("50% to book the date");
        expect(unknownClasses(container)).toEqual([]);
    });

    it("marks a valid-until before the date, keeping the last good one", () => {
        render(<QuotationMaker />);
        fillRye();
        type("Valid until", "20 Oct 2026");
        fireEvent.blur(screen.getByLabelText("Valid until"));
        expect(screen.getByRole("alert").textContent).toBe(
            "That's not after the quote date. Pick a day after 26 Oct 2026.",
        );
        expect(doc()).toContain("Valid until 9 Nov 2026");
        expect(
            screen.getByText("Still showing valid until 9 Nov 2026."),
        ).toBeTruthy();
    });

    it("charges IGST for a customer in another state", () => {
        render(<QuotationMaker />);
        fillRye();
        type("State", "27", 1);
        expect(doc()).toContain("Maharashtra (place of supply)");
        expect(doc()).toContain("IGST 18%₹2,970.00");
    });

    it("shows no GST when the business isn't registered", () => {
        render(<QuotationMaker />);
        fillRye();
        type("GSTIN", "");
        expect(doc()).toContain("Total₹16,500.00");
        expect(doc()).not.toContain("GST");
    });

    it("prints and sends on WhatsApp after the email gate", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<QuotationMaker />);
        fillRye();
        await unlockAndPrint("ryestudio@example.com");
        expect(print).toHaveBeenCalled();
        print.mockRestore();
        expect(
            screen
                .getByRole("link", { name: "Send on WhatsApp" })
                .getAttribute("href"),
        ).toContain(
            "https://wa.me/?text=Quotation%20QT-0001%20from%20Rye%20Studio",
        );
    });
});

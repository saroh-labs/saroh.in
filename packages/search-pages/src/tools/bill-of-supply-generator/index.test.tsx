// The bill of supply generator's states (BillOfSupplyStates.dc.html): empty,
// exempt goods, ready for the PDF, not registered, a number too long.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BillOfSupplyGenerator from ".";
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

const doc = () => paper("Your bill");

/** The boards' sample: Northwind Bakes, composition, two bakery items. */
function fillNorthwind() {
    type("Business name", "Northwind Bakes");
    type("Address", "Indiranagar, Bengaluru");
    type("GSTIN", "29AAAAA0000A1ZY");
    type("Name", "Meera Iyer");
    type("Date", "26 Oct 2026");
    line(0, {
        Item: "Chocolate truffle cake, 1 kg",
        "HSN or SAC": "1905",
        "Rate in rupees": "950",
    });
    addLine();
    line(1, {
        Item: "Butter cookies, 250 g box",
        "HSN or SAC": "1905",
        Quantity: "2",
        "Rate in rupees": "240",
    });
}

describe("BillOfSupplyGenerator", () => {
    it("says where the bill appears before anything is typed", () => {
        render(<BillOfSupplyGenerator />);
        expect(doc()).toBe("Your bill shows here as you type.");
    });

    it("draws the boards' bill with the composition line and the words", () => {
        const { container } = render(<BillOfSupplyGenerator />);
        fillNorthwind();
        const d = doc();
        expect(d).toMatch(/^Bill of supply/);
        expect(d).toContain("BOS-0001");
        expect(d).toContain("Billed to Meera Iyer · Karnataka · 26 Oct 2026");
        expect(d).toContain("Chocolate truffle cake, 1 kg · HSN 1905₹950.00");
        expect(d).toContain("Butter cookies, 250 g box × 2 · HSN 1905₹480.00");
        expect(d).toContain("Total₹1,430.00");
        expect(d).toContain("Rupees one thousand four hundred and thirty only");
        expect(d).toContain(
            "Composition taxable person, not eligible to collect tax on supplies.",
        );
        expect(d).not.toContain("GST ");
        expect(unknownClasses(container)).toEqual([]);
    });

    it("says the supply is exempt when that's the reason", () => {
        render(<BillOfSupplyGenerator />);
        fillNorthwind();
        fireEvent.click(screen.getByLabelText("Exempt goods or services"));
        expect(doc()).toContain("Supply exempt from GST.");
        expect(doc()).not.toContain("Composition");
    });

    it("is a plain bill without a GSTIN, and says why", () => {
        render(<BillOfSupplyGenerator />);
        fillNorthwind();
        type("GSTIN", "");
        expect(doc()).toMatch(/^Bill/);
        expect(doc()).not.toMatch(/^Bill of supply/);
        expect(doc()).not.toContain("Composition");
        expect(
            screen.getByText(/A bill of supply is for GST-registered sellers/),
        ).toBeTruthy();
    });

    it("marks a number over 16 characters when they leave it", () => {
        render(<BillOfSupplyGenerator />);
        fillNorthwind();
        type("Bill number", "NWB/BOS/2026-27/0001");
        fireEvent.blur(screen.getByLabelText("Bill number"));
        expect(screen.getByRole("alert").textContent).toBe(
            "Up to 16 characters. This one has 20.",
        );
        expect(doc()).toContain("Total₹1,430.00");
    });

    it("marks a date it can't read when they leave it", () => {
        render(<BillOfSupplyGenerator />);
        fillNorthwind();
        type("Date", "32 Oct 2026");
        fireEvent.blur(screen.getByLabelText("Date"));
        expect(screen.getByRole("alert").textContent).toMatch(
            /^Type a date like \d{1,2} \w{3} \d{4}\.$/,
        );
    });

    it("prints after the email gate", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<BillOfSupplyGenerator />);
        fillNorthwind();
        await unlockAndPrint("northwindbakes@example.com");
        expect(print).toHaveBeenCalled();
        print.mockRestore();
    });
});

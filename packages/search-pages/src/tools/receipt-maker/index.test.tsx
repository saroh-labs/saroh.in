// The receipt maker's states (ReceiptMakerStates.dc.html): empty, paid in
// cash, part payment, more than the total, and the gate with the share.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ReceiptMaker from ".";
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

const doc = () => paper("Your receipt");

/** The boards' sample: Pulse Gym, a membership and a session, paid by UPI. */
function fillPulse() {
    type("Business name", "Pulse Gym");
    type("Address", "Indiranagar, Bengaluru");
    type("Name", "Arjun Rao");
    type("Mobile (optional)", "98765 43210");
    type("Date", "26 Oct 2026");
    type("UPI reference (optional)", "629914123456");
    line(0, {
        Item: "Monthly membership, November",
        "Rate in rupees": "2,500",
    });
    addLine();
    line(1, { Item: "Personal training session", "Rate in rupees": "500" });
}

describe("ReceiptMaker", () => {
    it("says where the receipt appears before anything is typed", () => {
        render(<ReceiptMaker />);
        expect(doc()).toBe("Your receipt shows here as you type.");
    });

    it("draws the boards' receipt, the whole total received by UPI", () => {
        const { container } = render(<ReceiptMaker />);
        fillPulse();
        const d = doc();
        expect(d).toMatch(/^Receipt/);
        expect(d).toContain("Pulse Gym, Indiranagar, Bengaluru");
        expect(d).toContain("RCT-0001");
        expect(d).toContain("Received from Arjun Rao · 26 Oct 2026");
        expect(d).toContain("Monthly membership, November₹2,500.00");
        expect(d).toContain("Paid byUPI · ref 629914123456");
        expect(d).toContain("Amount received₹3,000.00");
        expect(d).toContain("Rupees three thousand only");
        expect(d).toContain("Received with thanks.");
        expect(d).not.toContain("Still due");
        expect(unknownClasses(container)).toEqual([]);
    });

    it("drops the reference for cash", () => {
        render(<ReceiptMaker />);
        fillPulse();
        fireEvent.click(screen.getByLabelText("Cash"));
        expect(screen.queryByLabelText("UPI reference (optional)")).toBeNull();
        expect(doc()).toContain("Paid byCash");
        expect(doc()).not.toContain("ref");
    });

    it("shows what's still due on a part payment", () => {
        render(<ReceiptMaker />);
        fillPulse();
        type("Amount received", "2,000");
        const d = doc();
        expect(d).toContain("Total₹3,000.00");
        expect(d).toContain("Amount received₹2,000.00");
        expect(d).toContain("Rupees two thousand only");
        expect(d).toContain("Still due₹1,000.00");
    });

    it("marks more than the total when they leave it, keeping the last good receipt", () => {
        render(<ReceiptMaker />);
        fillPulse();
        type("Amount received", "3,500");
        fireEvent.blur(screen.getByLabelText("Amount received"));
        expect(screen.getByRole("alert").textContent).toBe(
            "That's more than the total of ₹3,000. Add a line for the rest, or fix the amount.",
        );
        expect(doc()).toContain("Amount received₹3,000.00");
        expect(
            screen.getByText(
                "Still showing ₹3,000 received. Fix the amount to update it.",
            ),
        ).toBeTruthy();
    });

    it("prints and shares on WhatsApp after the email gate", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<ReceiptMaker />);
        fillPulse();
        await unlockAndPrint("pulsegym@example.com");
        expect(print).toHaveBeenCalled();
        print.mockRestore();
        const share = screen.getByRole("link", { name: "Share on WhatsApp" });
        expect(share.getAttribute("href")).toBe(
            `https://wa.me/919876543210?text=${encodeURIComponent(
                "Receipt RCT-0001 from Pulse Gym: ₹3,000.00 received on 26 Oct 2026, by UPI. Thank you.",
            )}`,
        );
    });
});

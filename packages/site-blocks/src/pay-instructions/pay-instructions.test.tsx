import { act, fireEvent, render, screen } from "@testing-library/react";
import { encode } from "uqr";
import { describe, expect, it, vi } from "vitest";

import type { PayInstructions } from "./model";
import {
    hasPayInstructions,
    payInstructionsOf,
    payWaysText,
    qrPath,
    upiPayUri,
} from "./model";
import { PayInstructionsCard } from "./pay-instructions";

/**
 * "How to pay us" (R32) on a customer's own unpaid invoice, order or
 * booking: only what the business set is drawn, the QR carries the UPI
 * deep link, and each value copies. Made-up details only.
 */

const NONE: PayInstructions = {
    upiId: null,
    bankAccountName: null,
    bankAccountNumber: null,
    bankIfsc: null,
    bankName: null,
    note: null,
};
const UPI = "rye.studio@okexample";
const BANK = {
    bankAccountName: "Rye Studio",
    bankAccountNumber: "123456789012",
    bankIfsc: "ABCD0123456",
    bankName: "Example Bank",
};

describe("upiPayUri", () => {
    it("carries the payee, the amount in rupees and what it pays", () => {
        expect(
            upiPayUri({
                upiId: UPI,
                payee: "Rye & Co.",
                amount: "1400",
                note: "Invoice RC-0001",
            }),
        ).toBe(
            "upi://pay?pa=rye.studio%40okexample&pn=Rye%20%26%20Co.&am=1400.00&cu=INR&tn=Invoice%20RC-0001",
        );
    });

    it("leaves the amount out when there is none, or it isn't rupees", () => {
        expect(upiPayUri({ upiId: UPI, payee: "Rye" })).toBe(
            "upi://pay?pa=rye.studio%40okexample&pn=Rye&cu=INR",
        );
        expect(
            upiPayUri({ upiId: UPI, payee: "Rye", amount: "0.00" }),
        ).not.toContain("am=");
        expect(
            upiPayUri({
                upiId: UPI,
                payee: "Rye",
                amount: "20",
                currency: "USD",
            }),
        ).not.toContain("am=");
    });

    it("keeps the payee and the note short", () => {
        const uri = upiPayUri({
            upiId: UPI,
            payee: "x".repeat(80),
            note: "y".repeat(80),
        });
        expect(uri).toContain(`pn=${"x".repeat(50)}&`);
        expect(uri).toContain(`tn=${"y".repeat(50)}`);
    });
});

describe("qrPath", () => {
    it("draws every dark module of the code, with its quiet zone", () => {
        const text = upiPayUri({ upiId: UPI, payee: "Rye", amount: "1400" });
        const qr = encode(text, { ecc: "M", border: 2 });
        const { size, path } = qrPath(text);
        expect(size).toBe(qr.size);
        const dark = qr.data.flat().filter(Boolean).length;
        expect(path.match(/M/g)).toHaveLength(dark);
        // The quiet zone stays light: no module in the first row.
        expect(path).not.toMatch(/M\d+ 0h/);
    });
});

describe("payInstructionsOf", () => {
    it("is null for nothing, something strange, or only blanks", () => {
        expect(payInstructionsOf(null)).toBeNull();
        expect(payInstructionsOf("upi")).toBeNull();
        expect(payInstructionsOf({ ...NONE, upiId: 42 })).toBeNull();
        expect(payInstructionsOf({ ...NONE, note: "  " })).toBeNull();
    });

    it("drops bank details that aren't whole", () => {
        expect(
            payInstructionsOf({ ...NONE, upiId: UPI, bankIfsc: "ABCD0123456" }),
        ).toEqual({ ...NONE, upiId: UPI });
        expect(
            payInstructionsOf({ ...NONE, bankAccountNumber: "123456789012" }),
        ).toBeNull();
    });

    it("keeps what is set", () => {
        expect(payInstructionsOf({ ...NONE, ...BANK })).toEqual({
            ...NONE,
            ...BANK,
        });
        expect(hasPayInstructions({ ...NONE, note: "Cash at the desk" })).toBe(
            true,
        );
        expect(hasPayInstructions(NONE)).toBe(false);
    });

    it("says which ways are set", () => {
        expect(payWaysText({ ...NONE, upiId: UPI, ...BANK })).toBe(
            "UPI or bank transfer",
        );
        expect(payWaysText({ ...NONE, upiId: UPI })).toBe("UPI");
        expect(payWaysText({ ...NONE, ...BANK })).toBe("bank transfer");
        expect(payWaysText({ ...NONE, note: "Cash" })).toBeNull();
    });
});

describe("PayInstructionsCard", () => {
    it("draws nothing when the business set nothing", () => {
        const { container } = render(
            <PayInstructionsCard instructions={NONE} businessName="Rye" />,
        );
        expect(container).toBeEmptyDOMElement();
        const { container: absent } = render(
            <PayInstructionsCard instructions={null} businessName="Rye" />,
        );
        expect(absent).toBeEmptyDOMElement();
    });

    it("with a UPI ID: the QR, the ID to copy and the app link carry the payment", () => {
        render(
            <PayInstructionsCard
                instructions={{ ...NONE, upiId: UPI }}
                businessName="Rye"
                amount="1400.00"
                reference="Invoice RC-0001"
            />,
        );
        expect(
            screen.getByRole("heading", { name: "How to pay Rye" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("img", { name: "UPI QR code to pay Rye" }),
        ).toBeInTheDocument();
        expect(screen.getByText(UPI)).toBeInTheDocument();
        expect(screen.getByText(/the amount fills in/)).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Open in a UPI app" }),
        ).toHaveAttribute(
            "href",
            "upi://pay?pa=rye.studio%40okexample&pn=Rye&am=1400.00&cu=INR&tn=Invoice%20RC-0001",
        );
        expect(screen.queryByText("Pay by bank transfer")).toBeNull();
        expect(
            screen.getByRole("button", { name: "Copy UPI ID" }),
        ).toBeInTheDocument();
    });

    it("with bank details only: no QR, each detail to copy, the number in fours", () => {
        render(
            <PayInstructionsCard
                instructions={{ ...NONE, ...BANK }}
                businessName="Rye"
            />,
        );
        expect(screen.queryByRole("img")).toBeNull();
        expect(screen.queryByText("Pay by UPI")).toBeNull();
        expect(screen.getByText("Pay by bank transfer")).toBeInTheDocument();
        expect(screen.getByText("Rye Studio")).toBeInTheDocument();
        expect(screen.getByText("1234 5678 9012")).toBeInTheDocument();
        expect(screen.getByText("ABCD0123456")).toBeInTheDocument();
        expect(screen.getByText("Example Bank")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Copy account number" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Copy IFSC" }),
        ).toBeInTheDocument();
    });

    it("with a note only: the note, nothing else", () => {
        render(
            <PayInstructionsCard
                instructions={{ ...NONE, note: "Pay cash at the counter." }}
                businessName="Rye"
                title="Or pay ahead"
            />,
        );
        expect(
            screen.getByRole("heading", { name: "Or pay ahead" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Pay cash at the counter."),
        ).toBeInTheDocument();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("copies the account number as digits, and says so", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });
        render(
            <PayInstructionsCard
                instructions={{ ...NONE, ...BANK }}
                businessName="Rye"
            />,
        );
        // The copy settles a promise: let it, inside act.
        await act(async () => {
            await Promise.resolve();
            fireEvent.click(
                screen.getByRole("button", { name: "Copy account number" }),
            );
        });
        expect(writeText).toHaveBeenCalledWith("123456789012");
        expect(
            screen.getByRole("button", { name: "Copy account number" }),
        ).toHaveTextContent("Copied");
        expect(screen.getByText("Account number copied")).toBeInTheDocument();
    });

    it("says when the browser won't copy", async () => {
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
            configurable: true,
        });
        render(
            <PayInstructionsCard
                instructions={{ ...NONE, upiId: UPI }}
                businessName="Rye"
            />,
        );
        // The copy settles a promise: let it, inside act.
        await act(async () => {
            await Promise.resolve();
            fireEvent.click(
                screen.getByRole("button", { name: "Copy UPI ID" }),
            );
        });
        expect(
            screen.getByRole("button", { name: "Copy UPI ID" }),
        ).toHaveTextContent("Couldn't copy");
        expect(
            screen.getByText(/Select it and copy it instead/),
        ).toBeInTheDocument();
    });
});

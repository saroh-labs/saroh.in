// The GST calculator's states (GstCalculatorStates.dc.html): empty, with GST
// included, another state, other rate, not a price, 0% and copied.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import GstCalculator from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const price = (value: string) =>
    fireEvent.change(screen.getByLabelText("Price"), { target: { value } });
const pick = (label: string) => fireEvent.click(screen.getByLabelText(label));
const result = () => screen.getByRole("region", { name: "Result" });
const rows = () =>
    within(result())
        .queryAllByRole("term")
        .map((dt) => `${dt.textContent} ${dt.nextSibling?.textContent}`);

describe("GstCalculator", () => {
    it("says what it needs before there's a price, never ₹0", () => {
        render(<GstCalculator />);
        expect(result().textContent).toContain("Type a price to see the GST.");
        expect(result().textContent).not.toContain("₹");
    });

    it("adds 18% to ₹1,000 as they type, split CGST and SGST", () => {
        const { container } = render(<GstCalculator />);
        price("1,000");
        expect(within(result()).getByText("₹1,180")).toBeTruthy();
        expect(rows()).toEqual([
            "Price before GST ₹1,000.00",
            "CGST 9% ₹90.00",
            "SGST 9% ₹90.00",
            "GST in total ₹180.00",
        ]);
        expect(unknownClasses(container)).toEqual([]);
    });

    it("works back from a price with GST included", () => {
        render(<GstCalculator />);
        pick("With GST included");
        price("1,180");
        expect(result().textContent).toContain("Price before GST₹1,000");
        expect(rows()[0]).toBe("Price with GST ₹1,180.00");
    });

    it("charges IGST in one line for another state", () => {
        render(<GstCalculator />);
        price("1000");
        pick("In another state");
        expect(rows()).toEqual([
            "Price before GST ₹1,000.00",
            "IGST 18% ₹180.00",
            "GST in total ₹180.00",
        ]);
    });

    it("offers the other rates, 12% first", () => {
        render(<GstCalculator />);
        price("1000");
        pick("Other rate");
        expect(screen.getByLabelText("Other rate: 12%")).toBeTruthy();
        expect(within(result()).getByText("₹1,120")).toBeTruthy();
        pick("28%");
        expect(within(result()).getByText("₹1,280")).toBeTruthy();
    });

    it("marks a price that isn't one when they leave it, keeping the last result", () => {
        render(<GstCalculator />);
        price("1,000");
        price("1,000.505");
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.blur(screen.getByLabelText("Price"));
        expect(screen.getByRole("alert").textContent).toBe(
            "Type a price in rupees, like 1500 or 1500.50.",
        );
        expect(result().textContent).toContain(
            "Still showing ₹1,000. Fix the price to work it out again.",
        );
        expect(within(result()).getByText("₹1,180")).toBeTruthy();
    });

    it("says 0% is nil-rated or exempt, and copies the working after the email", async () => {
        const writeText = vi.fn(() => Promise.resolve());
        Object.assign(navigator, { clipboard: { writeText } });
        render(<GstCalculator />);
        price("1000");
        pick("0%");
        expect(result().textContent).toContain(
            "0% is for nil-rated or exempt supplies: no GST on this bill.",
        );
        expect(rows()).toEqual([
            "Price before GST ₹1,000.00",
            "GST at 0% ₹0.00",
        ]);
        // DEC-194: the result shows; copying it asks for the email first.
        expect(
            screen.queryByRole("button", { name: "Copy the working" }),
        ).toBeNull();
        fireEvent.change(screen.getByLabelText("Get the working to copy"), {
            target: { value: "ryestudio@example.com" },
        });
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email it" }),
                ),
            ),
        );
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Copy the working" }),
                ),
            ),
        );
        expect(writeText).toHaveBeenCalledWith(
            "Price with GST: ₹1,000\nPrice before GST: ₹1,000.00\nGST at 0%: ₹0.00",
        );
        expect(
            screen
                .getAllByRole("status")
                .some((el) => el.textContent.includes("on your clipboard")),
        ).toBe(true);
        expect(screen.getByRole("button", { name: "✓ Copied" })).toBeTruthy();
    });
});

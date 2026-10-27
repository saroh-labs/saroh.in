// The profit margin calculator's states (ProfitMarginStates.dc.html):
// empty, worked out with GST in, a loss, a margin of 100% or more, and the
// gate on the PDF.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProfitMarginCalculator from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const result = () => screen.getByRole("region", { name: "Result" });

describe("ProfitMarginCalculator", () => {
    it("says what it needs before there are numbers, never 0%", () => {
        render(<ProfitMarginCalculator />);
        expect(result().textContent).toContain(
            "Type a cost and a price to see your margin.",
        );
        expect(result().textContent).not.toContain("%");
    });

    it("works out the sample as they type, GST taken out", () => {
        const { container } = render(<ProfitMarginCalculator />);
        type("Cost to you", "600");
        type("Selling price", "1,180");
        type("Margin you want (optional)", "50");
        const r = within(result());
        expect(r.getByText("40%")).toBeTruthy();
        expect(r.getByText("₹1,000.00")).toBeTruthy();
        expect(r.getByText("66.7%")).toBeTruthy();
        expect(result().textContent).toContain(
            "For a 50% margin, sell at ₹1,200.00 before GST, ₹1,416.00 with GST.",
        );
        expect(unknownClasses(container)).toEqual([]);
    });

    it("says a loss plainly", () => {
        render(<ProfitMarginCalculator />);
        fireEvent.click(screen.getByLabelText("Before GST"));
        type("Cost to you", "600");
        type("Selling price", "590");
        expect(result().textContent).toContain("−1.7%");
        expect(result().textContent).toContain("You lose ₹10 on each one.");
    });

    it("opens the other rates, and a margin of 100% is marked when they leave it", () => {
        render(<ProfitMarginCalculator />);
        type("Cost to you", "600");
        type("Selling price", "1,180");
        fireEvent.click(screen.getByLabelText("Other rate"));
        type("Other GST rate", "28");
        expect(result().textContent).toContain("GST 28%");
        type("Margin you want (optional)", "120");
        fireEvent.blur(screen.getByLabelText("Margin you want (optional)"));
        expect(screen.getByRole("alert").textContent).toBe(
            "A margin has to be under 100%, because it's a share of the price. Try 60.",
        );
        expect(result().textContent).not.toContain("For a");
        expect(result().textContent).toContain("Markup on cost");
    });

    it("asks for an email before the PDF", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<ProfitMarginCalculator />);
        type("Cost to you", "600");
        type("Selling price", "1180");
        type("Get the working as a PDF", "northwindbakes@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email me the PDF" }),
                ),
            ),
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Print or save as PDF" }),
        );
        expect(print).toHaveBeenCalled();
        print.mockRestore();
    });
});

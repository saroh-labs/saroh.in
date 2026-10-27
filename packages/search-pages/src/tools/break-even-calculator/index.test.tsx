// The break-even calculator's states (BreakEvenStates.dc.html): empty,
// worked out, past and short of break-even, a sale that costs more than
// it brings, and the gate on the PDF.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BreakEvenCalculator from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const result = () => screen.getByRole("region", { name: "Result" });

function fillGym() {
    type("Rent", "40,000");
    type("Salaries", "35,000");
    type("Electricity, internet and the rest", "10,000");
    type("Average sale", "500");
    type("Cost per sale", "200");
}

describe("BreakEvenCalculator", () => {
    it("says what it needs before there are numbers", () => {
        render(<BreakEvenCalculator />);
        expect(result().textContent).toContain(
            "Add your costs and your average sale to see your break-even.",
        );
    });

    it("works out the sample as they type", () => {
        const { container } = render(<BreakEvenCalculator />);
        fillGym();
        expect(screen.getByText("₹85,000 a month")).toBeTruthy();
        const r = within(result());
        expect(r.getByText("284 a month")).toBeTruthy();
        expect(r.getByText("About 11")).toBeTruthy();
        expect(r.getByText("₹1,42,000 a month")).toBeTruthy();
        expect(unknownClasses(container)).toEqual([]);
    });

    it("counts a cost they add", () => {
        render(<BreakEvenCalculator />);
        fillGym();
        fireEvent.click(screen.getByRole("button", { name: "+ Add a cost" }));
        type("Another cost 1", "15,000");
        expect(screen.getByText("₹1,00,000 a month")).toBeTruthy();
        expect(within(result()).getByText("334 a month")).toBeTruthy();
    });

    it("says how far short today's sales are", () => {
        render(<BreakEvenCalculator />);
        fillGym();
        type("Sales you make now a month (optional)", "220");
        expect(result().textContent).toContain(
            "At 220 sales you're 64 short, about ₹19,000 a month below your costs.",
        );
    });

    it("has no break-even when a sale costs more than it brings", () => {
        render(<BreakEvenCalculator />);
        fillGym();
        type("Cost per sale", "520");
        expect(result().textContent).toContain(
            "No break-even at these numbers.",
        );
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.blur(screen.getByLabelText("Cost per sale"));
        expect(screen.getByRole("alert").textContent).toBe(
            "That's more than the average sale of ₹500, so more sales won't cover your costs. Raise the price or cut the cost per sale.",
        );
    });

    it("asks for an email before the PDF", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<BreakEvenCalculator />);
        fillGym();
        type("Get the working as a PDF", "pulsegym@example.com");
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

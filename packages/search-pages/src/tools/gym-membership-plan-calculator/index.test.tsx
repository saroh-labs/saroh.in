// The gym membership plan calculator's states (GymPlanStates.dc.html):
// empty, worked out, rounded to ₹100, a longer plan that costs more, not
// a discount (the last plans held), and the gate on the price list.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import GymPlanCalculator from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const result = () => screen.getByRole("region", { name: "Your plans" });

function fillPulse() {
    type("Monthly price", "1,500");
    type("Discount for 3 months", "10");
    type("Discount for 12 months", "25");
}

describe("GymPlanCalculator", () => {
    it("says what it needs before there's a price, never ₹0", () => {
        render(<GymPlanCalculator />);
        expect(result().textContent).toContain(
            "Type your monthly price to see each plan.",
        );
        expect(result().textContent).not.toContain("₹");
    });

    it("prices each plan as they type", () => {
        const { container } = render(<GymPlanCalculator />);
        fillPulse();
        const r = within(result());
        expect(r.getByText("₹1,125 a month")).toBeTruthy();
        expect(r.getByRole("row", { name: /3 months/ }).textContent).toBe(
            "3 months₹4,050₹1,350₹450",
        );
        expect(result().textContent).toContain(
            "A member who pays for 12 months saves ₹4,500, three months free.",
        );
        expect(unknownClasses(container)).toEqual([]);
    });

    it("rounds to ₹100 and says so", () => {
        render(<GymPlanCalculator />);
        type("Monthly price", "1500");
        type("Discount for 3 months", "12");
        type("Discount for 12 months", "22");
        fireEvent.click(screen.getByLabelText("Nearest ₹100"));
        expect(
            within(result()).getByRole("row", { name: /12 months/ })
                .textContent,
        ).toBe("12 months₹14,000₹1,167₹4,000");
        expect(result().textContent).toContain("then rounded.");
    });

    it("marks a discount over 100% when they leave it, keeping the last plans", () => {
        render(<GymPlanCalculator />);
        fillPulse();
        type("Discount for 3 months", "110");
        fireEvent.blur(screen.getByLabelText("Discount for 3 months"));
        expect(screen.getByRole("alert").textContent).toBe(
            "A discount is between 0 and 100%. At 100% the plan is free.",
        );
        expect(result().textContent).toContain(
            "Still showing 10%. Fix the discount to work it out again.",
        );
        expect(within(result()).getByText("₹4,050")).toBeTruthy();
    });

    it("asks for an email before the price list", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<GymPlanCalculator />);
        fillPulse();
        type("Get the price list as a PDF", "pulsegym@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email it" }),
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

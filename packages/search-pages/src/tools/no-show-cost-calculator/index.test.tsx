// The no-show cost calculator's states (NoShowCostStates.dc.html): empty,
// worked out, no deposit picked, not a rate, and the gate on the PDF.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NoShowCostCalculator from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const result = () => screen.getByRole("region", { name: "Result" });

function fillRye() {
    type("Bookings a week", "60");
    type("How many don't turn up", "8");
    type("Average booking", "900");
}

describe("NoShowCostCalculator", () => {
    it("says what it needs before there are numbers, never ₹0", () => {
        render(<NoShowCostCalculator />);
        expect(result().textContent).toContain(
            "Fill in your bookings, no-shows and average booking",
        );
        expect(result().textContent).not.toContain("₹");
    });

    it("works out as they type, with the 25% deposit picked", () => {
        const { container } = render(<NoShowCostCalculator />);
        fillRye();
        const r = within(result());
        expect(r.getAllByText("₹18,720").length).toBeGreaterThan(0);
        expect(r.getByText("about 21")).toBeTruthy();
        expect(r.getByText("₹4,680 a month")).toBeTruthy();
        expect(r.getByText("₹14,040 a month")).toBeTruthy();
        expect(r.getByText("₹2,24,640")).toBeTruthy();
        expect(result().textContent).toContain(
            "A 25% deposit keeps ₹56,160 a year of it.",
        );
        expect(unknownClasses(container)).toEqual([]);
    });

    it("with no deposit, shows what each deposit would keep", () => {
        render(<NoShowCostCalculator />);
        fillRye();
        fireEvent.click(screen.getByLabelText("No deposit"));
        expect(result().textContent).toContain(
            "With a 25% deposit you'd keep ₹4,680 a month. With half, ₹9,360.",
        );
        expect(within(result()).queryByText("Still lost")).toBeNull();
    });

    it("marks a rate over 100 when they leave it, keeping the last result", () => {
        render(<NoShowCostCalculator />);
        fillRye();
        type("How many don't turn up", "120");
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.blur(screen.getByLabelText("How many don't turn up"));
        expect(screen.getByRole("alert").textContent).toBe(
            "A no-show rate is between 0 and 100%. This is out of every 100 bookings.",
        );
        expect(result().textContent).toContain(
            "Still showing 8%. Fix the rate to work it out again.",
        );
        expect(within(result()).getAllByText("₹18,720").length).toBeGreaterThan(
            0,
        );
    });

    it("asks for an email before the PDF, then lets them print it", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<NoShowCostCalculator />);
        fillRye();
        expect(
            screen.queryByRole("button", { name: "Print or save as PDF" }),
        ).toBeNull();
        type("Get this working as a PDF", "ryestudio@example.com");
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

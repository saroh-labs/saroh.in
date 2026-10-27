// The staff commission calculator's states (StaffCommissionStates.dc.html):
// empty, services and products apart, slabs, slabs that don't meet (the
// last payouts held), and the gate on the payout sheet.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StaffCommissionCalculator from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const result = () => screen.getByRole("region", { name: "Payouts" });
const add = () =>
    fireEvent.click(screen.getByRole("button", { name: "Add a person" }));

function fillRye() {
    type("On services", "10");
    type("On products", "5");
    type("Person 1 name", "Asha");
    type("Asha, services", "84,000");
    type("Asha, products", "6,000");
    add();
    type("Person 2 name", "Imran");
    type("Imran, services", "62,500");
    type("Imran, products", "2,400");
    add();
    type("Person 3 name", "Meera");
    type("Meera, services", "41,000");
    type("Meera, products", "9,800");
}

describe("StaffCommissionCalculator", () => {
    it("starts with one empty row and says what it needs", () => {
        render(<StaffCommissionCalculator />);
        expect(screen.getAllByRole("row")).toHaveLength(2);
        expect(result().textContent).toContain(
            "Add a person and their sales to see what they earn.",
        );
    });

    it("works out services and products apart as they type", () => {
        const { container } = render(<StaffCommissionCalculator />);
        fillRye();
        const r = within(result());
        expect(r.getAllByText("₹19,660").length).toBeGreaterThan(0);
        expect(r.getByText("₹8,700")).toBeTruthy();
        expect(r.getByText("₹2,05,700")).toBeTruthy();
        expect(result().textContent).toContain(
            "Asha: 10% of ₹84,000 in services is ₹8,400, and 5% of ₹6,000 in products is ₹300.",
        );
        expect(unknownClasses(container)).toEqual([]);
    });

    it("works out slabs, and holds the last payouts while one is wrong", () => {
        render(<StaffCommissionCalculator />);
        fillRye();
        fireEvent.click(screen.getByLabelText("Slabs"));
        type("Slab 1 up to", "50,000");
        type("Slab 1 rate", "8");
        type("Above ₹50,000", "12");
        expect(within(result()).getAllByText("₹17,770").length).toBeGreaterThan(
            0,
        );
        fireEvent.click(screen.getByRole("button", { name: "Add a slab" }));
        type("Slab 2 up to", "40,000");
        type("Slab 2 rate", "10");
        fireEvent.blur(screen.getByLabelText("Slab 2 up to"));
        expect(screen.getByRole("alert").textContent).toBe(
            "Each slab has to end above the one before it, so every rupee has a rate.",
        );
        expect(result().textContent).toContain(
            "Still showing the slabs from before.",
        );
        expect(within(result()).getAllByText("₹17,770").length).toBeGreaterThan(
            0,
        );
    });

    it("removes a person", () => {
        render(<StaffCommissionCalculator />);
        fillRye();
        fireEvent.click(screen.getByRole("button", { name: "Remove Meera" }));
        expect(within(result()).queryByText("Meera")).toBeNull();
        expect(within(result()).getAllByText("₹15,070").length).toBeGreaterThan(
            0,
        );
    });

    it("asks for an email before the payout sheet", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<StaffCommissionCalculator />);
        fillRye();
        expect(
            screen.queryByRole("button", {
                name: "Download the spreadsheet (CSV)",
            }),
        ).toBeNull();
        type(
            "Get the payout sheet (PDF and spreadsheet)",
            "ryestudio@example.com",
        );
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
        expect(
            screen.getByRole("button", {
                name: "Download the spreadsheet (CSV)",
            }),
        ).toBeTruthy();
        print.mockRestore();
    });
});

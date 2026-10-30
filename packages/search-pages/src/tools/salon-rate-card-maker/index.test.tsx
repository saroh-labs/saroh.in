// The salon rate card maker's states (SalonRateCardStates.dc.html): empty,
// filled, the email before print, ticked with no price, too long for A5.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SalonRateCardMaker from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: RegExp | string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const card = () => screen.getByRole("img", { name: /Rate card for/ });

describe("SalonRateCardMaker", () => {
    it("starts with common services ticked and prices to fill, never ₹0", () => {
        render(<SalonRateCardMaker />);
        expect(card().textContent).toContain("[price]");
        expect(card().textContent).not.toContain("₹0");
        expect(screen.getByText("Add your prices to fill it in.")).toBeTruthy();
    });

    it("redraws the card with each price", () => {
        const { container } = render(<SalonRateCardMaker />);
        type("Business name", "Rye Studio");
        type(/Line under the name/, "Hair, skin and nails");
        type("Phone for bookings", "+91 98765 43210");
        type("Haircut and blow-dry price in rupees", "850");
        expect(card().textContent).toContain("Rye Studio");
        expect(card().textContent).toContain(
            "Rate card · Hair, skin and nails",
        );
        expect(card().textContent).toContain("₹850");
        expect(card().textContent).toContain("Book: +91 98765 43210");
        expect(unknownClasses(container)).toEqual([]);
    });

    it("asks for a price for a ticked service once they leave it", () => {
        render(<SalonRateCardMaker />);
        fireEvent.blur(screen.getByLabelText("Hair spa price in rupees"));
        expect(screen.getByRole("alert").textContent).toBe(
            "Add a price for Hair spa, or untick it.",
        );
        fireEvent.click(screen.getByLabelText("Hair spa"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card().textContent).not.toContain("Hair spa");
    });

    it("says when the card won't fit on A5", () => {
        render(<SalonRateCardMaker />);
        for (let i = 0; i < 10; i++) {
            fireEvent.click(
                screen.getByRole("button", { name: "Add a service" }),
            );
            const name = screen.getAllByLabelText("Service name").at(-1);
            if (!name) throw new Error("no new service row");
            fireEvent.change(name, {
                target: { value: `Service ${i}` },
            });
        }
        expect(
            screen.getByText(
                "17 services won't fit on A5. Switch to A4, or the card goes over two pages.",
            ),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Switch to A4" }));
        expect(screen.queryByText(/won't fit on A5/)).toBeNull();
    });

    it("prints only after the email", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<SalonRateCardMaker />);
        expect(
            screen.queryByRole("button", { name: "Print or save as PDF" }),
        ).toBeNull();
        type("Get your rate card", "hello@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Get my PDF" }),
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

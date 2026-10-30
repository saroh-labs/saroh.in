// The loyalty card maker's states (LoyaltyCardStates.dc.html): empty,
// filled with 8 stamps, the email before print, too many stamps, no reward.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import LoyaltyCardMaker from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: RegExp | string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const card = () => screen.getByRole("img", { name: /Loyalty card for/ });

describe("LoyaltyCardMaker", () => {
    it("shows where the name and reward go", () => {
        render(<LoyaltyCardMaker />);
        expect(card().textContent).toContain("[Business name]");
        expect(card().textContent).toContain(
            "Buy 9, the 10th is free: [reward]",
        );
        expect(screen.getByText("Type a name to make yours.")).toBeTruthy();
    });

    it("draws the boards' Northwind Bakes card", () => {
        const { container } = render(<LoyaltyCardMaker />);
        type("Business name", "Northwind Bakes");
        type(/Area or tagline/, "Indiranagar");
        type("The reward", "Free coffee");
        expect(card().textContent).toContain("Northwind Bakes");
        expect(card().textContent).toContain(
            "Buy 9, the 10th is free: Free coffee",
        );
        expect(card().querySelectorAll(".lc-stamp")).toHaveLength(10);
        fireEvent.click(screen.getByLabelText("8"));
        expect(card().querySelectorAll(".lc-stamp")).toHaveLength(8);
        expect(unknownClasses(container)).toEqual([]);
    });

    it("takes up to 12 stamps under Other", () => {
        render(<LoyaltyCardMaker />);
        fireEvent.click(screen.getByLabelText("Other"));
        type("How many stamps", "15");
        fireEvent.blur(screen.getByLabelText("How many stamps"));
        expect(screen.getByRole("alert").textContent).toBe(
            "A card fits up to 12 stamps. Try 12, or make the reward come sooner.",
        );
        expect(card().querySelectorAll(".lc-stamp")).toHaveLength(10);
    });

    it("asks for the reward when they leave it empty", () => {
        render(<LoyaltyCardMaker />);
        fireEvent.blur(screen.getByLabelText("The reward"));
        expect(screen.getByRole("alert").textContent).toBe(
            "Say what they get on the last stamp, like “Free coffee”.",
        );
    });

    it("prints the sheet only after the email", async () => {
        render(<LoyaltyCardMaker />);
        type("Business name", "Northwind Bakes");
        type("The reward", "Free coffee");
        type("Get your stamp cards", "hello@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Get my cards" }),
                ),
            ),
        );
        expect(
            screen.getByRole("button", { name: "Print or save as PDF" }),
        ).toBeTruthy();
    });
});

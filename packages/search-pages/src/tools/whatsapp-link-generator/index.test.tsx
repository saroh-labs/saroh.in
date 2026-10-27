// The WhatsApp link generator's states (WhatsappLinkStates.dc.html): empty,
// number looks wrong (last link kept), no message, a start picked, copied.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WhatsappLinkGenerator from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: RegExp | string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const link = () => screen.getByRole("region", { name: "Your link" });
const LINK =
    "https://wa.me/919999999999?text=Hi%2C%20I'd%20like%20to%20book%20a%20haircut%20this%20week.";

// DEC-194: copying and testing the link sit behind the email.
async function unlock() {
    fireEvent.change(screen.getByLabelText("Get your link to copy"), {
        target: { value: "ryestudio@example.com" },
    });
    await act(() =>
        Promise.resolve(
            fireEvent.click(screen.getByRole("button", { name: "Email it" })),
        ),
    );
}

describe("WhatsappLinkGenerator", () => {
    it("says what it needs before there's a number", () => {
        render(<WhatsappLinkGenerator />);
        expect(link().textContent).toContain(
            "Type your WhatsApp number to make the link.",
        );
    });

    it("draws the boards' link and what the customer sees", async () => {
        const { container } = render(<WhatsappLinkGenerator />);
        type("Your WhatsApp number", "99999 99999");
        type(
            /Message your customer starts with/,
            "Hi, I'd like to book a haircut this week.",
        );
        expect(link().textContent).toContain(LINK);
        await unlock();
        expect(
            screen.getByRole("link", { name: "Test it" }).getAttribute("href"),
        ).toBe(LINK);
        expect(screen.getByText("What your customer sees")).toBeTruthy();
        expect(unknownClasses(container)).toEqual([]);
    });

    it("keeps the last good link while the number is wrong", () => {
        render(<WhatsappLinkGenerator />);
        type("Your WhatsApp number", "99999 99999");
        type("Your WhatsApp number", "99999 9999");
        fireEvent.blur(screen.getByLabelText("Your WhatsApp number"));
        expect(screen.getByRole("alert").textContent).toBe(
            "A mobile number here has 10 digits and starts with 6, 7, 8 or 9. This one has 9.",
        );
        expect(link().textContent).toContain(
            "Still showing the link for +91 99999 99999.",
        );
    });

    it("works with no message, and a start fills one", () => {
        render(<WhatsappLinkGenerator />);
        type("Your WhatsApp number", "99999 99999");
        expect(link().textContent).toContain(
            "No message: the chat opens empty, ready for them to type.",
        );
        fireEvent.click(screen.getByLabelText("Ask about an order"));
        expect(link().textContent).toContain(
            "?text=Hi%2C%20I'd%20like%20to%20know%20where%20my%20order%20is.",
        );
    });

    it("says it copied, on the button", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });
        render(<WhatsappLinkGenerator />);
        type("Your WhatsApp number", "99999 99999");
        await unlock();
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Copy link" }),
                ),
            ),
        );
        expect(writeText).toHaveBeenCalledWith("https://wa.me/919999999999");
        expect(screen.getByRole("button", { name: "✓ Copied" })).toBeTruthy();
    });
});

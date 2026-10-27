// The WhatsApp templates' states (WhatsappTemplatesStates.dc.html): empty,
// payment reminder, a gap left, number looks wrong, copied, the full set
// behind the email.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WhatsappMessageTemplates from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);
const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
});

const type = (label: RegExp | string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const msg = () => screen.getByRole("region", { name: "Your message" });
const click = (name: string) =>
    act(() =>
        Promise.resolve(fireEvent.click(screen.getByRole("button", { name }))),
    );

function fillRye() {
    type("Your business", "Rye Studio");
    type("Customer's first name", "Priya");
    type("What they booked", "Haircut and blow-dry");
    type("Date and time", "Sat 1 Nov, 11:30 am");
}

describe("WhatsappMessageTemplates", () => {
    it("shows its gaps in brackets before anything is typed", () => {
        render(<WhatsappMessageTemplates />);
        expect(msg().textContent).toContain(
            "Hi [first name], your [what they booked] at [your business]",
        );
        expect(msg().textContent).toContain(
            "Fill in your details and the brackets fill themselves.",
        );
    });

    it("fills the booking confirmation, and copies one message free", async () => {
        const { container } = render(<WhatsappMessageTemplates />);
        fillRye();
        expect(msg().textContent).toContain(
            "Hi Priya, your Haircut and blow-dry at Rye Studio is booked for Sat 1 Nov, 11:30 am.",
        );
        await click("Copy message");
        expect(writeText).toHaveBeenCalledWith(
            "Hi Priya, your Haircut and blow-dry at Rye Studio is booked for Sat 1 Nov, 11:30 am. Reply here if you need to change it. See you then.",
        );
        expect(msg().textContent).toContain("On your clipboard.");
        expect(unknownClasses(container)).toEqual([]);
    });

    it("switches to the payment reminder, keeping what's typed", () => {
        render(<WhatsappMessageTemplates />);
        fillRye();
        fireEvent.click(screen.getByLabelText("Payment reminder"));
        type("Amount due", "2,415");
        expect(msg().textContent).toContain(
            "Hi Priya, a gentle reminder that ₹2,415 for your visit on [visit date]",
        );
    });

    it("names a gap left, and opens the chat to a good number", () => {
        render(<WhatsappMessageTemplates />);
        fillRye();
        type("Date and time", "");
        expect(msg().textContent).toContain(
            "Date and time is still empty. Fill it in, or the message goes with a gap.",
        );
        type(/Customer's WhatsApp number/, "99999 9999");
        fireEvent.blur(screen.getByLabelText(/Customer's WhatsApp number/));
        expect(screen.getByRole("alert").textContent).toMatch(
            /This one has 9\.$/,
        );
        type(/Customer's WhatsApp number/, "99999 99999");
        expect(
            screen
                .getByRole("link", { name: "Open in WhatsApp" })
                .getAttribute("href"),
        ).toMatch(/^https:\/\/wa\.me\/919999999999\?text=Hi%20Priya/);
    });

    it("asks for an email before the full set", async () => {
        render(<WhatsappMessageTemplates />);
        fillRye();
        expect(
            screen.queryByRole("button", { name: "Copy all four" }),
        ).toBeNull();
        type(
            "Get all the templates as a PDF, with your details in",
            "ryestudio@example.com",
        );
        await click("Email it");
        expect(screen.getAllByText("Order ready")).toHaveLength(2);
        await click("Copy all four");
        expect(writeText.mock.calls.at(-1)?.[0]).toContain(
            "Thank-you\nHi Priya",
        );
        expect(
            screen.getByRole("button", { name: "Print or save as PDF" }),
        ).toBeTruthy();
    });
});

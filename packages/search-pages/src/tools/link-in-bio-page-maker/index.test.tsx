// The link-in-bio page's states (LinkInBioStates.dc.html): empty, filled,
// not a link, no photo, UPI on a computer, the gate on the file.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LinkInBioPageMaker from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const preview = () =>
    screen.getByRole("group", { name: "Preview of your page" });

describe("LinkInBioPageMaker", () => {
    it("starts faded, asking for a name", () => {
        render(<LinkInBioPageMaker />);
        expect(
            screen.getByText("Type your business name to start yours."),
        ).toBeTruthy();
        expect(preview().className).toContain("lb-faded");
    });

    it("draws a button for each link that works, in the colour picked", () => {
        const { container } = render(<LinkInBioPageMaker />);
        fireEvent.change(screen.getByLabelText("Business name"), {
            target: { value: "Rye Studio" },
        });
        fireEvent.change(screen.getByLabelText("WhatsApp number"), {
            target: { value: "+91 99999 99999" },
        });
        fireEvent.change(screen.getByLabelText("UPI ID"), {
            target: { value: "saroh-sample-upi-id@okaxis" },
        });
        fireEvent.click(screen.getByLabelText("Plum"));
        expect(preview().textContent).toContain("Chat on WhatsApp");
        expect(preview().textContent).toContain("Pay by UPI");
        expect(preview().textContent).not.toContain("Book a time");
        expect(preview().textContent).toContain("RS");
        expect(
            screen.getByText(
                /^On a phone this opens their UPI app to pay Rye Studio\./,
            ),
        ).toBeTruthy();
        expect(unknownClasses(container)).toEqual([]);
    });

    it("marks a link that isn't full when they leave it", () => {
        render(<LinkInBioPageMaker />);
        const booking = screen.getByLabelText("Booking link");
        fireEvent.change(booking, {
            target: { value: "ryestudio.example.com/book" },
        });
        fireEvent.blur(booking);
        expect(screen.getByRole("alert").textContent).toBe(
            "That isn't a full link yet. Start it with https://",
        );
    });

    it("removes and adds links", () => {
        render(<LinkInBioPageMaker />);
        fireEvent.click(screen.getByRole("button", { name: "Remove Find us" }));
        expect(screen.queryByLabelText("Google Maps link")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Add a link" }));
        expect(screen.getByLabelText("Link")).toBeTruthy();
    });

    it("asks for an email before the file, then downloads one HTML file", async () => {
        const created = vi.fn(() => "blob:page");
        URL.createObjectURL = created;
        URL.revokeObjectURL = vi.fn();
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        render(<LinkInBioPageMaker />);
        fireEvent.change(screen.getByLabelText("Business name"), {
            target: { value: "Rye Studio" },
        });
        fireEvent.change(screen.getByLabelText("Get your page as one file"), {
            target: { value: "ryestudio@example.com" },
        });
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email it" }),
                ),
            ),
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Download the page (HTML)" }),
        );
        expect(created).toHaveBeenCalled();
        expect(click).toHaveBeenCalled();
        click.mockRestore();
    });
});

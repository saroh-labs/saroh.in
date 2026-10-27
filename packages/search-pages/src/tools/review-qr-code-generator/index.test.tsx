// The review QR code's states (ReviewQrStates.dc.html): empty, filled,
// the gate, not a review link, a long name.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ReviewQrCodeGenerator from ".";
import { unknownClasses } from "../../test-classes";
import { drawnPath, pathFor } from "../../test-qr";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const LINK = "https://g.page/r/CSampleRyeStudio/review";
const LABEL = "QR code that opens the Google review box for Rye Studio";

describe("ReviewQrCodeGenerator", () => {
    it("shows a faded sample before there is a link", () => {
        render(<ReviewQrCodeGenerator />);
        expect(
            screen.getByText("A sample. Paste your review link to make yours."),
        ).toBeTruthy();
    });

    it("draws the review link on a card with the words", () => {
        const { container } = render(<ReviewQrCodeGenerator />);
        type("Business name", "Rye Studio");
        type("Your Google review link", LINK);
        expect(drawnPath(container, LABEL)).toBe(pathFor(LINK));
        expect(container.textContent).toContain(
            "Liked your visit? Tell others on Google. Point your phone camera at the code; it takes a minute.",
        );
        expect(unknownClasses(container)).toEqual([]);
    });

    it("says a Maps link opens the listing, when they leave it", () => {
        const { container } = render(<ReviewQrCodeGenerator />);
        type("Business name", "Rye Studio");
        type("Your Google review link", LINK);
        type("Your Google review link", "https://maps.app.goo.gl/AbC123");
        fireEvent.blur(screen.getByLabelText("Your Google review link"));
        expect(screen.getByRole("alert").textContent).toMatch(
            /^That link opens your Maps listing, not the review box\./,
        );
        expect(drawnPath(container, LABEL)).toBe(pathFor(LINK));
    });

    it("warns a long name prints on two lines", () => {
        render(<ReviewQrCodeGenerator />);
        type("Business name", "Rye Studio Hair, Skin and Nails, Bandra West");
        expect(
            screen.getByText("This prints on two lines. 44 of 60 characters."),
        ).toBeTruthy();
    });

    it("asks for an email before the files", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<ReviewQrCodeGenerator />);
        type("Your Google review link", LINK);
        fireEvent.click(screen.getByLabelText("Table tent"));
        type("Get your review card", "hello@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Get my card" }),
                ),
            ),
        );
        fireEvent.click(screen.getByRole("button", { name: "Print the card" }));
        expect(print).toHaveBeenCalled();
        print.mockRestore();
    });
});

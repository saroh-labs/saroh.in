// The UPI QR code's states (UpiQrStates.dc.html): empty, wrong UPI ID,
// ready, the gate, and the downloads it opens.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import UpiQrCodeGenerator from ".";
import { unknownClasses } from "../../test-classes";
import { drawnPath, pathFor } from "../../test-qr";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const LABEL = "QR code for paying Annapurna Sweets, Jaipur by UPI";

function fill() {
    type("Your UPI ID", "saroh-sample-upi-id@okaxis");
    type("Name customers will see", "Annapurna Sweets, Jaipur");
}

describe("UpiQrCodeGenerator", () => {
    it("shows a faded sample before there is a UPI ID", () => {
        render(<UpiQrCodeGenerator />);
        expect(screen.getByLabelText("A sample QR code")).toBeTruthy();
        expect(
            screen.getByText("A sample. Type your UPI ID to make yours."),
        ).toBeTruthy();
    });

    it("draws the UPI link as they type, with the safety line", () => {
        const { container } = render(<UpiQrCodeGenerator />);
        fill();
        type("Amount (optional)", "250");
        expect(drawnPath(container, LABEL)).toBe(
            pathFor(
                "upi://pay?pa=saroh-sample-upi-id@okaxis&pn=Annapurna%20Sweets%2C%20Jaipur&am=250.00&cu=INR",
            ),
        );
        expect(container.textContent).toContain(
            "Check the name your UPI app shows is Annapurna Sweets, Jaipur before you pay.",
        );
        expect(unknownClasses(container)).toEqual([]);
    });

    it("marks a wrong UPI ID when they leave it, keeping the last good code", () => {
        const { container } = render(<UpiQrCodeGenerator />);
        fill();
        type("Your UPI ID", "saroh-sample-upi-id okaxis");
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.blur(screen.getByLabelText("Your UPI ID"));
        expect(screen.getByRole("alert").textContent).toBe(
            "That isn't a UPI ID yet. It looks like name@bank, with one @.",
        );
        expect(drawnPath(container, LABEL)).toBe(
            pathFor(
                "upi://pay?pa=saroh-sample-upi-id@okaxis&pn=Annapurna%20Sweets%2C%20Jaipur&cu=INR",
            ),
        );
    });

    it("asks for an email before the files, then prints the card", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        const { container } = render(<UpiQrCodeGenerator />);
        fill();
        expect(
            screen.queryByRole("button", { name: "Download PNG" }),
        ).toBeNull();
        type("Get your QR code", "annapurnasweets@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Get my QR" }),
                ),
            ),
        );
        expect(
            screen.getByRole("button", { name: "Download PNG" }),
        ).toBeTruthy();
        fireEvent.click(
            screen.getByRole("button", { name: "Print counter card" }),
        );
        expect(print).toHaveBeenCalled();
        expect(unknownClasses(container)).toEqual([]);
        print.mockRestore();
    });
});

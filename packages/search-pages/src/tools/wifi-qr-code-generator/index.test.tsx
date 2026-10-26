// The Wi-Fi QR code's states (WifiQrStates.dc.html): empty, filled, the
// gate, a password too short, no password.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WifiQrCodeGenerator from ".";
import { unknownClasses } from "../../test-classes";
import { drawnPath, pathFor } from "../../test-qr";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const LABEL = "QR code that joins the Pulse Gym Guest Wi-Fi";

function fill() {
    type("Network name", "Pulse Gym Guest");
    type("Password", "pulsegym2026");
}

describe("WifiQrCodeGenerator", () => {
    it("shows a faded sample before there is a network", () => {
        render(<WifiQrCodeGenerator />);
        expect(
            screen.getByText("A sample. Type your network name to make yours."),
        ).toBeTruthy();
    });

    it("draws the join string, with the password on the card", () => {
        const { container } = render(<WifiQrCodeGenerator />);
        fill();
        expect(drawnPath(container, LABEL)).toBe(
            pathFor("WIFI:T:WPA;S:Pulse Gym Guest;P:pulsegym2026;H:false;;"),
        );
        expect(screen.getByText("Password: pulsegym2026")).toBeTruthy();
        fireEvent.click(
            screen.getByLabelText("Print the password on the card"),
        );
        expect(screen.queryByText("Password: pulsegym2026")).toBeNull();
        fireEvent.click(screen.getByLabelText("The network is hidden"));
        expect(drawnPath(container, LABEL)).toBe(
            pathFor("WIFI:T:WPA;S:Pulse Gym Guest;P:pulsegym2026;H:true;;"),
        );
        expect(unknownClasses(container)).toEqual([]);
    });

    it("hides and shows the password", () => {
        render(<WifiQrCodeGenerator />);
        const pw = screen.getByLabelText("Password");
        expect(pw.getAttribute("type")).toBe("text");
        fireEvent.click(screen.getByRole("button", { name: "Hide" }));
        expect(pw.getAttribute("type")).toBe("password");
    });

    it("marks a short password when they leave it, keeping the last good card", () => {
        const { container } = render(<WifiQrCodeGenerator />);
        fill();
        type("Password", "pulse6");
        fireEvent.blur(screen.getByLabelText("Password"));
        expect(screen.getByRole("alert").textContent).toBe(
            "WPA passwords are 8 to 63 characters. This one has 6, so phones would refuse it.",
        );
        expect(drawnPath(container, LABEL)).toBe(
            pathFor("WIFI:T:WPA;S:Pulse Gym Guest;P:pulsegym2026;H:false;;"),
        );
        expect(screen.getByText("Password: pulsegym2026")).toBeTruthy();
    });

    it("draws an open network with a plain warning", () => {
        const { container } = render(<WifiQrCodeGenerator />);
        type("Network name", "Pulse Gym Guest");
        fireEvent.click(screen.getByLabelText("No password"));
        expect(screen.queryByLabelText("Password")).toBeNull();
        expect(
            screen.getByText(/^Anyone nearby can join an open network\./),
        ).toBeTruthy();
        expect(drawnPath(container, LABEL)).toBe(
            pathFor("WIFI:T:nopass;S:Pulse Gym Guest;H:false;;"),
        );
        expect(screen.getByText("No password needed")).toBeTruthy();
    });

    it("asks for an email before the files", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<WifiQrCodeGenerator />);
        fill();
        type("Get your Wi-Fi card", "frontdesk@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Get my card" }),
                ),
            ),
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Print the Wi-Fi card" }),
        );
        expect(print).toHaveBeenCalled();
        print.mockRestore();
    });
});

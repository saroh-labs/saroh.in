// The business card QR code's states (BusinessCardQrStates.dc.html):
// empty, filled, the gate, a phone too short, a dense code.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BusinessCardQrGenerator from ".";
import { unknownClasses } from "../../test-classes";
import { drawnPath, pathFor } from "../../test-qr";
import { vcard } from "./logic";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const LABEL = "QR code that saves Meera Iyer as a phone contact";
const MEERA = {
    name: "Meera Iyer",
    role: "Owner",
    business: "Rye Studio",
    phone: "+91 98765 43210",
    email: "meera@example.com",
    website: "example.com/ryestudio",
    address: "",
};

function fill() {
    type("Your name", MEERA.name);
    type("Role (optional)", MEERA.role);
    type("Business name (optional)", MEERA.business);
    type("Phone", MEERA.phone);
    type("Email (optional)", MEERA.email);
    type("Website (optional)", MEERA.website);
}

describe("BusinessCardQrGenerator", () => {
    it("shows a faded sample before a name and phone", () => {
        render(<BusinessCardQrGenerator />);
        expect(
            screen.getByText("A sample. Add a name and phone to make yours."),
        ).toBeTruthy();
    });

    it("draws the vCard and the card to print", () => {
        const { container } = render(<BusinessCardQrGenerator />);
        fill();
        // The code on the card and on the business card; the print sheet is hidden.
        expect(screen.getAllByRole("img", { name: LABEL })).toHaveLength(2);
        expect(drawnPath(container, LABEL)).toBe(pathFor(vcard(MEERA)));
        expect(screen.getAllByText("Owner, Rye Studio")).toHaveLength(11);
        expect(unknownClasses(container)).toEqual([]);
    });

    it("says how many digits a short phone has, keeping the last good code", () => {
        const { container } = render(<BusinessCardQrGenerator />);
        fill();
        type("Phone", "+91 98765 4321");
        fireEvent.blur(screen.getByLabelText("Phone"));
        expect(screen.getByRole("alert").textContent).toBe(
            "Indian mobile numbers have 10 digits after +91. This one has 9.",
        );
        expect(drawnPath(container, LABEL)).toBe(pathFor(vcard(MEERA)));
    });

    it("warns when a long address makes the code dense", () => {
        render(<BusinessCardQrGenerator />);
        fill();
        type(
            "Address (optional)",
            "Shop 3, Ground Floor, Sea Breeze Apartments, 14 Hill Road, opposite the bus depot, Bandra West, Mumbai 400050",
        );
        expect(screen.getByText(/^The code is getting dense\./)).toBeTruthy();
    });

    it("asks for an email before the PNG, the .vcf and the card sheet", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<BusinessCardQrGenerator />);
        fill();
        type("Get your contact code", "meera@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Get my code" }),
                ),
            ),
        );
        expect(
            screen.getByRole("button", {
                name: "Download contact file (.vcf)",
            }),
        ).toBeTruthy();
        fireEvent.click(
            screen.getByRole("button", { name: "Print ten business cards" }),
        );
        expect(print).toHaveBeenCalled();
        print.mockRestore();
    });
});

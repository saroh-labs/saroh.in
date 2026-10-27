// The menu QR code's states (MenuQrStates.dc.html): empty, filled with
// favourites, the gate, not a link, a Drive link, eight favourites.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MenuQrCodeGenerator from ".";
import { unknownClasses } from "../../test-classes";
import { drawnPath, pathFor } from "../../test-qr";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const LINK = "https://example.com/northwind-bakes/menu";
const LABEL = "QR code that opens the Northwind Bakes menu";

describe("MenuQrCodeGenerator", () => {
    it("shows a faded sample before there is a link", () => {
        render(<MenuQrCodeGenerator />);
        expect(
            screen.getByText("A sample. Paste your menu link to make yours."),
        ).toBeTruthy();
    });

    it("draws the link on a table card with the table and favourites", () => {
        const { container } = render(<MenuQrCodeGenerator />);
        type("Business name", "Northwind Bakes");
        type("Menu link", LINK);
        type("Table number (optional)", "4");
        type("Item 1 name", "Masala chai");
        type("Item 1 price in rupees", "40");
        expect(drawnPath(container, LABEL)).toBe(pathFor(LINK));
        expect(
            screen.getByText("example.com/northwind-bakes/menu"),
        ).toBeTruthy();
        expect(screen.getByText("Table 4")).toBeTruthy();
        expect(screen.getByText("₹40")).toBeTruthy();
        expect(unknownClasses(container)).toEqual([]);
    });

    it("asks for a full link when they leave it, and flags a Drive file", () => {
        render(<MenuQrCodeGenerator />);
        type("Menu link", "northwind menu pdf");
        fireEvent.blur(screen.getByLabelText("Menu link"));
        expect(screen.getByRole("alert").textContent).toBe(
            "That isn't a link yet. Paste the full address, starting with https://",
        );
        type("Menu link", "https://drive.google.com/file/d/menu/view");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(
            screen.getByText(
                /^Drive files open for customers only when sharing/,
            ),
        ).toBeTruthy();
    });

    it("says how to give a PDF a link, and stops at 8 favourites", () => {
        render(<MenuQrCodeGenerator />);
        fireEvent.click(screen.getByLabelText("A PDF or photo"));
        expect(
            screen.getByText(/^A PDF or photo needs a home first/),
        ).toBeTruthy();
        for (let i = 0; i < 7; i++)
            fireEvent.click(
                screen.getByRole("button", { name: "Add an item" }),
            );
        expect(
            screen.queryByRole("button", { name: "Add an item" }),
        ).toBeNull();
        expect(
            screen.getByText(
                "The card fits 8 favourites. The rest stay on your menu link.",
            ),
        ).toBeTruthy();
    });

    it("asks for an email before the files", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<MenuQrCodeGenerator />);
        type("Menu link", LINK);
        type("Get your table card", "orders@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Get my card" }),
                ),
            ),
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Print the table card" }),
        );
        expect(print).toHaveBeenCalled();
        print.mockRestore();
    });
});

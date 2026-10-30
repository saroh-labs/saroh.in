// The GSTIN checker's states (GstinCheckerStates.dc.html): empty, too
// short, a check digit that doesn't match, a state code not on the list,
// a list ready for the file, and the gate.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import GstinChecker from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const result = () => screen.getByRole("region", { name: "Result" });

describe("GstinChecker", () => {
    it("says what to do before anything is typed", () => {
        render(<GstinChecker />);
        expect(result().textContent).toBe(
            "ResultPaste a GSTIN to check its format.",
        );
    });

    it("passes the sample and says it can't vouch for the business", () => {
        const { container } = render(<GstinChecker />);
        type("GSTIN", "29AAAAA0000A1ZY");
        const r = within(result());
        expect(r.getByText("The format is right")).toBeTruthy();
        expect(r.getByText("29 · Karnataka")).toBeTruthy();
        expect(r.getByText(/Y matches/)).toBeTruthy();
        expect(
            r.getByRole("link", { name: "search it on the GST portal" }),
        ).toBeTruthy();
        expect(unknownClasses(container)).toEqual([]);
    });

    it("counts a short one as they type and says so when they stop", () => {
        render(<GstinChecker />);
        type("GSTIN", "29AAAAA0000A1Z");
        expect(within(result()).getByText("Not a full GSTIN yet")).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.blur(screen.getByLabelText("GSTIN"));
        expect(screen.getByRole("alert").textContent).toBe(
            "A GSTIN has 15 characters. This one has 14.",
        );
    });

    it("names the mistyped character, and a state code that isn't one", () => {
        render(<GstinChecker />);
        type("GSTIN", "29AAAAA0000A1Z5");
        expect(result().textContent).toContain("5, should be Y");
        type("GSTIN", "39AAAAA0000A1ZY");
        expect(result().textContent).toContain("Not a GST state code");
        expect(result().textContent).toContain("39 isn't one");
    });

    it("checks a list, and the spreadsheet asks for an email", async () => {
        const { container } = render(<GstinChecker />);
        fireEvent.click(screen.getByLabelText("Check a list"));
        type(
            "GSTINs, one per line",
            "29AAAAA0000A1ZY\n27AAAAA0000A1Z5\n07AAAAA0000A1Z",
        );
        expect(result().textContent).toContain("3 checked: 1 right, 2 to fix");
        expect(result().textContent).toContain("Check digit should be 2");
        expect(unknownClasses(container)).toEqual([]);
        type(
            "Get the results as a spreadsheet (CSV)",
            "annapurnasweets@example.com",
        );
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email me the file" }),
                ),
            ),
        );
        expect(
            screen.getByRole("button", { name: "Download the results (CSV)" }),
        ).toBeTruthy();
    });

    it("prints one result after the email", async () => {
        const print = vi
            .spyOn(window, "print")
            .mockImplementation(() => undefined);
        render(<GstinChecker />);
        type("GSTIN", "29AAAAA0000A1ZY");
        type("Get the result as a PDF", "annapurnasweets@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email me the PDF" }),
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

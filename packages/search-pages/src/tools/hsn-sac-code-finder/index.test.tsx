// The HSN/SAC code finder's states (HsnSacFinderStates.dc.html): empty
// with popular searches, services only, a typed code, no match, and the
// gate on the list's spreadsheet.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import HsnSacFinder from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const search = (value: string) =>
    fireEvent.change(screen.getByLabelText("What do you sell?"), {
        target: { value },
    });
const mine = () => screen.getByRole("region", { name: "My list" });

describe("HsnSacFinder", () => {
    it("starts with popular searches to tap", () => {
        render(<HsnSacFinder />);
        fireEvent.click(screen.getByRole("button", { name: "Cake" }));
        expect(screen.getByText("1 code for “Cake”")).toBeTruthy();
        expect(screen.getByText("1905")).toBeTruthy();
    });

    it("finds a salon's codes, each rate marked to confirm", () => {
        const { container } = render(<HsnSacFinder />);
        search("hair");
        expect(screen.getByText("3 codes for “hair”")).toBeTruthy();
        expect(screen.getAllByText("[to confirm]").length).toBeGreaterThan(3);
        fireEvent.click(
            screen.getByRole("button", { name: "Add SAC 999721 to my list" }),
        );
        expect(
            screen.getByRole("button", { name: "✓ In your list" }),
        ).toBeTruthy();
        expect(within(mine()).getByText("1 code")).toBeTruthy();
        expect(mine().textContent).toContain("999721 · Haircuts and styling");
        expect(unknownClasses(container)).toEqual([]);
    });

    it("narrows to services, and says when rates inside a code differ", () => {
        render(<HsnSacFinder />);
        search("gym");
        fireEvent.click(screen.getByLabelText("Services (SAC)"));
        expect(screen.getByText("1 code for “gym”")).toBeTruthy();
        search("1905");
        fireEvent.click(screen.getByLabelText("All"));
        expect(
            screen.getByText(/Rates inside 1905 differ by item/),
        ).toBeTruthy();
    });

    it("says what to try when nothing matches", () => {
        render(<HsnSacFinder />);
        search("xylophone");
        expect(screen.getByRole("status").textContent).toContain(
            "Nothing for “xylophone”.",
        );
        expect(screen.getByRole("button", { name: "Saree" })).toBeTruthy();
    });

    it("asks for an email before the spreadsheet", async () => {
        render(<HsnSacFinder />);
        search("hair");
        fireEvent.click(
            screen.getByRole("button", { name: "Add SAC 999722 to my list" }),
        );
        fireEvent.change(
            screen.getByLabelText("Get your list as a spreadsheet (CSV)"),
            { target: { value: "gulmohar@example.com" } },
        );
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email me the file" }),
                ),
            ),
        );
        expect(
            screen.getByRole("button", { name: "Download your list (CSV)" }),
        ).toBeTruthy();
    });
});

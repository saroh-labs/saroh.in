import { PHONE_CASES } from "@saroh/block-contract";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { SitePhoneInput } from "./phone-input";

/** The merchant site's phone field (#1036), as a form holds it. */
function Harness({ initial = "" }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return (
        <>
            <label htmlFor="p">Phone</label>
            <SitePhoneInput
                id="p"
                box="border-site-border h-11 text-base"
                value={value}
                onValueChange={setValue}
            />
            <output data-testid="value">{value}</output>
        </>
    );
}

const box = () => screen.getByLabelText("Phone");
const code = () => screen.getByRole("combobox");
const value = () => screen.getByTestId("value").textContent;

describe("SitePhoneInput (#1036)", () => {
    it("starts on India, with the site's tokens only", () => {
        const { container } = render(<Harness />);
        expect(code()).toHaveAccessibleName("Country code: India +91");
        expect(code()).toHaveValue("IN");
        expect(box()).toHaveAttribute("inputmode", "tel");
        // Never Saroh's own brand tokens on a merchant's page.
        expect(container.innerHTML).not.toMatch(
            /\b(?:bg-field|border-input|ring-ring|text-muted-foreground)\b/,
        );
    });

    it("keeps the number as typed and sends E.164", () => {
        render(<Harness />);
        fireEvent.change(box(), { target: { value: "098765 43210" } });
        expect(box()).toHaveValue("098765 43210");
        expect(value()).toBe("+919876543210");
    });

    it.each(PHONE_CASES.filter((c) => c.stored))(
        "a pasted $typed sets the country and the number",
        ({ typed, stored, country }) => {
            render(<Harness />);
            fireEvent.paste(box(), {
                clipboardData: { getData: () => typed },
            });
            expect(value()).toBe(stored);
            expect(code()).toHaveValue(country);
        },
    );

    it("picks a country from the list and keeps the number", () => {
        render(<Harness />);
        fireEvent.change(box(), { target: { value: "50 123 4567" } });
        fireEvent.change(code(), { target: { value: "AE" } });
        expect(code()).toHaveAccessibleName(
            "Country code: United Arab Emirates +971",
        );
        expect(value()).toBe("+971501234567");
    });

    it("shows a saved number in the box without its code", () => {
        render(<Harness initial="+442079460958" />);
        expect(code()).toHaveValue("GB");
        expect(box()).toHaveValue("207 946 0958");
    });
    it("reads a value again after a reset, even one it last sent", () => {
        function Reset() {
            const [v, setV] = useState("");
            return (
                <>
                    <label htmlFor="r">Phone</label>
                    <SitePhoneInput
                        id="r"
                        box="border-site-border h-11 text-base"
                        value={v}
                        onValueChange={setV}
                    />
                    <button type="button" onClick={() => setV("")}>
                        Clear
                    </button>
                    <button type="button" onClick={() => setV("+919876543210")}>
                        Restore
                    </button>
                </>
            );
        }
        render(<Reset />);
        fireEvent.change(box(), { target: { value: "98765 43210" } });
        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(box()).toHaveValue("");
        fireEvent.click(screen.getByRole("button", { name: "Restore" }));
        expect(box()).toHaveValue("98765 43210");
    });
});

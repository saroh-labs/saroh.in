import {
    joinPhone,
    PHONE_CASES,
    phoneNumberProblem,
    splitPhone,
} from "@saroh/block-contract";
import { act, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Field } from "./field";
import { PhoneInput } from "./phone-input";

// cmdk measures its list and scrolls the active row into view; jsdom has
// neither, and nothing is laid out here.
beforeEach(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {
                return undefined;
            }
            unobserve() {
                return undefined;
            }
            disconnect() {
                return undefined;
            }
        },
    );
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

/** A phone field as a form holds it: the value, and its problem on Save. */
function Harness({
    initial = "",
    defaultCountry,
    onValue,
}: {
    initial?: string;
    defaultCountry?: string;
    onValue?: (value: string) => void;
}) {
    const [value, setValue] = React.useState(initial);
    const [problem, setProblem] = React.useState<string | null>(null);
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                setProblem(phoneNumberProblem(value));
            }}
        >
            <Field label="Phone" error={problem}>
                <PhoneInput
                    value={value}
                    defaultCountry={defaultCountry}
                    onValueChange={(v) => {
                        setValue(v);
                        onValue?.(v);
                    }}
                />
            </Field>
            <output data-testid="value">{value}</output>
            <button type="submit">Save</button>
        </form>
    );
}

const box = () => screen.getByLabelText("Phone");
const picker = () => screen.getByRole("button", { name: /^Country code/ });
const value = () => screen.getByTestId("value").textContent;

function paste(el: HTMLElement, text: string) {
    fireEvent.paste(el, {
        clipboardData: { getData: () => text },
    });
}

describe("PhoneInput (#1036)", () => {
    it("starts on India, labelled, with the tel keyboard", () => {
        render(<Harness />);
        expect(picker()).toHaveAccessibleName("Country code: India +91");
        expect(box()).toHaveAttribute("inputmode", "tel");
        expect(box()).toHaveAttribute("type", "tel");
        expect(box()).toHaveAttribute("autocomplete", "tel-national");
    });

    it("starts on the business's country", () => {
        render(<Harness defaultCountry="AE" />);
        expect(picker()).toHaveAccessibleName(
            "Country code: United Arab Emirates +971",
        );
    });

    it("keeps the number as typed and sends E.164", () => {
        const onValue = vi.fn();
        render(<Harness onValue={onValue} />);
        fireEvent.change(box(), { target: { value: "98765 43210" } });
        expect(box()).toHaveValue("98765 43210");
        expect(value()).toBe("+919876543210");
        fireEvent.change(box(), { target: { value: "" } });
        expect(value()).toBe("");
    });

    it("reads a 10-digit number with a trunk 0 as India's", () => {
        render(<Harness />);
        fireEvent.change(box(), { target: { value: "098765 43210" } });
        expect(value()).toBe("+919876543210");
    });

    it.each(PHONE_CASES.filter((c) => c.stored))(
        "a pasted $typed sets the country and the number",
        ({ typed, stored, country }) => {
            render(<Harness />);
            paste(box(), typed);
            expect(value()).toBe(stored);
            expect(joinPhone(splitPhone(typed))).toBe(stored);
            expect(picker().getAttribute("aria-label")).toContain(
                country === "IN" ? "India" : "",
            );
            if (country === "GB") {
                expect(picker()).toHaveAccessibleName(
                    "Country code: United Kingdom +44",
                );
                expect(box()).toHaveValue("207 946 0958");
            }
        },
    );

    it("moves a typed + code to the picker on leaving the box", () => {
        render(<Harness />);
        fireEvent.change(box(), { target: { value: "+971 50 123 4567" } });
        expect(value()).toBe("+971501234567");
        fireEvent.blur(box());
        expect(picker()).toHaveAccessibleName(
            "Country code: United Arab Emirates +971",
        );
        expect(box()).toHaveValue("50 123 4567");
        expect(value()).toBe("+971501234567");
    });

    it("shows a saved number grouped, and sends nothing until changed", () => {
        const onValue = vi.fn();
        render(<Harness initial="+919876543210" onValue={onValue} />);
        expect(box()).toHaveValue("98765 43210");
        expect(onValue).not.toHaveBeenCalled();
    });

    it("says what is wrong on the field", () => {
        render(<Harness />);
        fireEvent.change(box(), { target: { value: "98765" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByRole("alert")).toHaveTextContent(/country code/);
        expect(box()).toHaveAttribute("aria-invalid", "true");
    });

    it("picks a country from the keyboard and keeps the number", async () => {
        render(<Harness />);
        fireEvent.change(box(), { target: { value: "20 7946 0958" } });
        act(() => picker().focus());
        fireEvent.click(picker());
        const search = await screen.findByRole("combobox", {
            name: "Search country or code",
        });
        fireEvent.change(search, { target: { value: "united k" } });
        expect(
            screen.getByRole("option", { name: /United Kingdom/ }),
        ).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: /India/ })).toBeNull();
        fireEvent.keyDown(search, { key: "Enter" });
        expect(picker()).toHaveAccessibleName(
            "Country code: United Kingdom +44",
        );
        expect(value()).toBe("+442079460958");
        expect(screen.queryByRole("combobox")).toBeNull();
    });

    it("searches by calling code", async () => {
        render(<Harness />);
        fireEvent.click(picker());
        const search = await screen.findByRole("combobox", {
            name: "Search country or code",
        });
        fireEvent.change(search, { target: { value: "+971" } });
        expect(screen.getAllByRole("option")).toHaveLength(1);
    });

    it("closes the list on Escape", async () => {
        render(<Harness />);
        fireEvent.click(picker());
        const search = await screen.findByRole("combobox", {
            name: "Search country or code",
        });
        fireEvent.keyDown(search, { key: "Escape" });
        expect(screen.queryByRole("combobox")).toBeNull();
    });

    it("takes a reset from outside", () => {
        function Reset() {
            const [v, setV] = React.useState("+919876543210");
            return (
                <>
                    <Field label="Phone">
                        <PhoneInput value={v} onValueChange={setV} />
                    </Field>
                    <button type="button" onClick={() => setV("")}>
                        Clear
                    </button>
                </>
            );
        }
        render(<Reset />);
        expect(box()).toHaveValue("98765 43210");
        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(box()).toHaveValue("");
    });
});

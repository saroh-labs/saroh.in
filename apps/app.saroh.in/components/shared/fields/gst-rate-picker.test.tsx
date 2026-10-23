// @vitest-environment jsdom
/**
 * The GST rate as buttons (DEC-176): the main row, Other rate's second row,
 * a saved rate from either, Not set, the error, and the keyboard.
 */
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GST_RATE_NEEDED, OTHER_GST_RATE_CHOICES } from "@/lib/invoices/gst";

import { GstRatePicker } from "./gst-rate-picker";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const groups = () =>
    Array.from(host.querySelectorAll<HTMLElement>('[role="radiogroup"]'));
const chips = (group = groups().at(0)) =>
    Array.from(group?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
const names = (group?: HTMLElement) => chips(group).map((c) => c.textContent);
const chosen = (group?: HTMLElement) =>
    chips(group).find((c) => c.getAttribute("aria-checked") === "true")
        ?.textContent ?? null;
const otherToggle = () => {
    const button = host.querySelector<HTMLButtonElement>(
        "button[aria-expanded]",
    );
    if (!button) throw new Error("no Other rate button");
    return button;
};
const press = (name: string, group?: HTMLElement) => {
    if (name === "Other rate" && !group) {
        act(() => otherToggle().click());
        return;
    }
    const chip = chips(group).find((c) => c.textContent === name);
    if (!chip) throw new Error(`no chip ${name}: ${names(group).join(", ")}`);
    act(() => chip.click());
};
const otherRow = () => groups().at(1);
const arrow = (key: string, group = groups().at(0)) =>
    act(() => {
        group?.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true }),
        );
    });

function Picker({
    start = "",
    optional,
    invalid,
    onChange,
}: {
    start?: string;
    optional?: boolean;
    invalid?: boolean;
    onChange?: (rate: string) => void;
}) {
    const [value, setValue] = useState(start);
    return (
        <GstRatePicker
            label="GST rate"
            value={value}
            optional={optional}
            invalid={invalid}
            onChange={(rate) => {
                setValue(rate);
                onChange?.(rate);
            }}
        />
    );
}

describe("GstRatePicker", () => {
    it("shows the main rates and Other rate, and chooses and changes each", () => {
        const onChange = vi.fn();
        act(() => root.render(<Picker onChange={onChange} />));
        expect(names()).toEqual(["0%", "5%", "18%", "40%"]);
        // Other rate is a disclosure beside the rates, never one of them.
        expect(otherToggle().textContent).toBe("Other rate");
        expect(otherToggle().getAttribute("role")).toBeNull();
        expect(otherToggle().getAttribute("aria-expanded")).toBe("false");
        expect(chosen()).toBeNull();
        for (const [name, rate] of [
            ["5%", "5"],
            ["18%", "18"],
            ["40%", "40"],
            ["0%", "0"],
        ] as const) {
            press(name);
            expect(onChange).toHaveBeenLastCalledWith(rate);
            expect(chosen()).toBe(name);
        }
        expect(groups()).toHaveLength(1);
    });

    it("opens Other rate in place, chooses 12% and keeps the row open", () => {
        const onChange = vi.fn();
        act(() => root.render(<Picker start="5" onChange={onChange} />));
        press("Other rate");
        expect(onChange).not.toHaveBeenCalled();
        // The rate is still 5%, and 5% still says so.
        expect(chosen()).toBe("5%");
        expect(otherToggle().getAttribute("aria-expanded")).toBe("true");
        expect(otherToggle().getAttribute("aria-controls")).toBe(
            otherRow()?.parentElement?.id,
        );
        expect(names(otherRow())).toEqual(
            OTHER_GST_RATE_CHOICES.map((o) => `${o.value}%`),
        );
        expect(names(otherRow())).toEqual(
            expect.arrayContaining(["0.25%", "3%", "12%", "28%"]),
        );
        press("12%", otherRow());
        expect(onChange).toHaveBeenLastCalledWith("12");
        expect(groups()).toHaveLength(2);
        expect(chosen()).toBeNull();
        expect(chosen(otherRow())).toBe("12%");
    });

    it("closes Other rate again while the rate is a main one, never while it is in the row", () => {
        act(() => root.render(<Picker start="5" />));
        press("Other rate");
        expect(groups()).toHaveLength(2);
        press("Other rate");
        expect(groups()).toHaveLength(1);
        expect(otherToggle().getAttribute("aria-expanded")).toBe("false");
        expect(chosen()).toBe("5%");

        press("Other rate");
        press("1.5%", otherRow());
        press("Other rate");
        expect(groups()).toHaveLength(2);
        expect(otherToggle().getAttribute("aria-expanded")).toBe("true");
        expect(chosen(otherRow())).toBe("1.5%");
    });

    it("opens a saved 28.00 with Other shown and 28% chosen", () => {
        act(() => root.render(<Picker start="28.00" />));
        expect(chosen()).toBeNull();
        expect(otherToggle().getAttribute("aria-expanded")).toBe("true");
        expect(otherRow()).toBeDefined();
        expect(chosen(otherRow())).toBe("28%");
    });

    it("reads a saved main rate with decimals as its chip, row closed", () => {
        act(() =>
            root.render(
                <GstRatePicker
                    label="GST rate"
                    value="18.00"
                    onChange={vi.fn()}
                />,
            ),
        );
        expect(chosen()).toBe("18%");
        expect(groups()).toHaveLength(1);
    });

    it("offers Not set only when the field is optional", () => {
        act(() => root.render(<Picker />));
        expect(names()).not.toContain("Not set");
        expect(groups().at(0)?.getAttribute("aria-required")).toBe("true");

        act(() => root.unmount());
        root = createRoot(host);
        const onChange = vi.fn();
        act(() =>
            root.render(<Picker start="5" optional onChange={onChange} />),
        );
        expect(names()[0]).toBe("Not set");
        press("Not set");
        expect(onChange).toHaveBeenLastCalledWith("");
        expect(chosen()).toBe("Not set");
    });

    it("says the needed message only when required, empty and invalid, and links it", () => {
        act(() => root.render(<Picker />));
        expect(host.textContent).not.toContain(GST_RATE_NEEDED);

        act(() => root.render(<Picker invalid />));
        const group = groups().at(0);
        expect(group?.getAttribute("aria-invalid")).toBe("true");
        const id = group?.getAttribute("aria-describedby");
        expect(id).toBeTruthy();
        expect(document.getElementById(id ?? "")?.textContent).toBe(
            GST_RATE_NEEDED,
        );
    });

    it("shows a given error and links it, or points at the screen's own", () => {
        act(() =>
            root.render(
                <GstRatePicker
                    label="GST rate"
                    value="5"
                    optional
                    invalid
                    error="Choose a rate for this line."
                    onChange={vi.fn()}
                />,
            ),
        );
        const id = groups().at(0)?.getAttribute("aria-describedby");
        expect(document.getElementById(id ?? "")?.textContent).toBe(
            "Choose a rate for this line.",
        );

        act(() =>
            root.render(
                <GstRatePicker
                    label="GST rate"
                    value=""
                    invalid
                    errorId="rate-error"
                    describedBy="rate-hint"
                    onChange={vi.fn()}
                />,
            ),
        );
        expect(groups().at(0)?.getAttribute("aria-describedby")).toBe(
            "rate-hint rate-error",
        );
        expect(host.textContent).not.toContain(GST_RATE_NEEDED);
    });

    it("an optional field with no rate is not an error", () => {
        act(() => root.render(<Picker optional invalid />));
        expect(host.textContent).not.toContain(GST_RATE_NEEDED);
        expect(groups().at(0)?.getAttribute("aria-describedby")).toBeNull();
    });

    it("moves through the chips with the arrow keys", () => {
        const onChange = vi.fn();
        act(() => root.render(<Picker start="5" onChange={onChange} />));
        expect(chips().map((c) => c.tabIndex)).toEqual([-1, 0, -1, -1]);
        arrow("ArrowRight");
        expect(onChange).toHaveBeenLastCalledWith("18");
        expect(document.activeElement?.textContent).toBe("18%");
        arrow("ArrowLeft");
        arrow("ArrowLeft");
        expect(onChange).toHaveBeenLastCalledWith("0");
        // Left from the first wraps to the last rate, not to Other rate.
        arrow("ArrowLeft");
        expect(onChange).toHaveBeenLastCalledWith("40");
        expect(otherRow()).toBeUndefined();
        press("Other rate");
        // Nothing chosen there yet: the arrows start from its first chip.
        arrow("ArrowRight", otherRow());
        expect(chosen(otherRow())).toBe(names(otherRow())[1]);
    });

    it("loses nothing switching between the rows", () => {
        const onChange = vi.fn();
        act(() => root.render(<Picker start="18" onChange={onChange} />));
        // Opening Other keeps 18 until a rate in it is pressed.
        press("Other rate");
        expect(onChange).not.toHaveBeenCalled();
        press("3%", otherRow());
        expect(onChange).toHaveBeenLastCalledWith("3");
        // Back to a main rate closes the row and takes that rate.
        press("5%");
        expect(onChange).toHaveBeenLastCalledWith("5");
        expect(groups()).toHaveLength(1);
        expect(chosen()).toBe("5%");
        // And again: Other opens with nothing pressed for you.
        press("Other rate");
        expect(chosen(otherRow())).toBeNull();
        expect(onChange).toHaveBeenCalledTimes(2);
        press("28%", otherRow());
        expect(chosen(otherRow())).toBe("28%");
        expect(onChange).toHaveBeenLastCalledWith("28");
    });

    it("names 0% nil-rated or exempt for a screen reader", () => {
        act(() => root.render(<Picker />));
        const zero = chips().find((c) => c.textContent === "0%");
        expect(zero?.getAttribute("aria-label")).toBe(
            "0%, nil-rated or exempt",
        );
    });

    it("presses nothing while disabled", () => {
        act(() =>
            root.render(
                <GstRatePicker
                    label="GST rate"
                    value="12"
                    disabled
                    onChange={vi.fn()}
                />,
            ),
        );
        expect(
            [...chips(), ...chips(otherRow()), otherToggle()].every(
                (c) => (c as HTMLButtonElement).disabled,
            ),
        ).toBe(true);
    });
});

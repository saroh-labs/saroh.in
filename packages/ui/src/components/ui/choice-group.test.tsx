// @vitest-environment jsdom
/**
 * One of several, three ways (`ChoiceGroup`, `ChipGroup`, `RadioCards`),
 * and a tick or a switch with its words (`CheckRow`, `SwitchRow`): what a
 * screen reader hears, and what a keyboard can do.
 */
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckRow, SwitchRow } from "./check-row";
import { ChipGroup, ChoiceGroup, RadioCards } from "./choice-group";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const radios = () =>
    Array.from(host.querySelectorAll<HTMLElement>('[role="radio"]'));
const checked = () =>
    radios().find((r) => r.getAttribute("aria-checked") === "true")
        ?.textContent;
const key = (name: string) =>
    act(() => {
        host.querySelector('[role="radiogroup"]')?.dispatchEvent(
            new KeyboardEvent("keydown", { key: name, bubbles: true }),
        );
    });

const KINDS = [
    { value: "came", label: "Came in" },
    { value: "made", label: "Made", disabled: true },
    { value: "binned", label: "Binned" },
    { value: "sold", label: "Sold" },
];

function Chips({
    start = "came",
    onChange,
    disabled,
}: {
    start?: string | null;
    onChange?: (v: string) => void;
    disabled?: boolean;
}) {
    const [value, setValue] = useState<string | null>(start);
    return (
        <ChipGroup
            label="What happened"
            value={value}
            disabled={disabled}
            onChange={(v) => {
                setValue(v);
                onChange?.(v);
            }}
            choices={KINDS}
        />
    );
}

describe("ChipGroup", () => {
    it("is a named radio group with the chosen one checked and one tab stop", () => {
        act(() => root.render(<Chips />));
        const group = host.querySelector('[role="radiogroup"]');
        expect(group?.getAttribute("aria-label")).toBe("What happened");
        expect(radios()).toHaveLength(4);
        expect(checked()).toBe("Came in");
        expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1, -1]);
    });

    it("takes its name from the visible label when one is pointed at", () => {
        act(() =>
            root.render(
                <>
                    <span id="what">What happened</span>
                    <ChipGroup
                        labelledBy="what"
                        label="ignored"
                        value="came"
                        onChange={() => undefined}
                        choices={KINDS}
                    />
                </>,
            ),
        );
        const group = host.querySelector('[role="radiogroup"]');
        expect(group?.getAttribute("aria-labelledby")).toBe("what");
        expect(group?.hasAttribute("aria-label")).toBe(false);
    });

    it("the arrows move and choose, skip one that is off, and wrap", () => {
        act(() => root.render(<Chips />));
        key("ArrowRight");
        expect(checked()).toBe("Binned");
        expect(document.activeElement?.textContent).toBe("Binned");
        key("ArrowDown");
        expect(checked()).toBe("Sold");
        key("ArrowRight");
        expect(checked()).toBe("Came in");
        key("ArrowLeft");
        expect(checked()).toBe("Sold");
        // The tab stop follows the choice.
        expect(radios().map((r) => r.tabIndex)).toEqual([-1, -1, -1, 0]);
    });

    it("holds the tab stop on the first that can be chosen while nothing is", () => {
        act(() => root.render(<Chips start={null} />));
        expect(checked()).toBeUndefined();
        expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1, -1]);
    });

    it("a choice that is off says so and a press does nothing", () => {
        const onChange = vi.fn();
        act(() => root.render(<Chips onChange={onChange} />));
        const made = radios()[1];
        expect(made.getAttribute("aria-disabled")).toBe("true");
        act(() => made.click());
        expect(onChange).not.toHaveBeenCalled();
        act(() => radios()[2].click());
        expect(onChange).toHaveBeenCalledWith("binned");
    });

    it("a group that waits is off as a whole", () => {
        const onChange = vi.fn();
        act(() => root.render(<Chips disabled onChange={onChange} />));
        expect(radios().every((r) => (r as HTMLButtonElement).disabled)).toBe(
            true,
        );
        key("ArrowRight");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("is as wide as its words and wraps: it never widens a phone", () => {
        act(() => root.render(<Chips />));
        const cls = host
            .querySelector('[role="radiogroup"]')
            ?.getAttribute("class");
        expect(cls).toContain("flex-wrap");
        expect(cls).toContain("min-w-0");
    });
});

describe("ChoiceGroup", () => {
    it("draws each choice the caller's way, with a name for one that has no words", () => {
        act(() =>
            root.render(
                <ChoiceGroup
                    label="Page colour"
                    value="clay"
                    onChange={() => undefined}
                    choices={[
                        {
                            value: "clay",
                            label: null,
                            ariaLabel: "Clay",
                            style: { background: "rgb(180, 90, 60)" },
                            data: { "data-swatch": "clay" },
                        },
                        { value: "ink", label: null, ariaLabel: "Ink" },
                    ]}
                    itemClassName={(on) => (on ? "is-on" : "is-off")}
                />,
            ),
        );
        const [clay, ink] = radios();
        expect(clay.getAttribute("aria-label")).toBe("Clay");
        expect(clay.getAttribute("class")).toContain("is-on");
        expect(ink.getAttribute("class")).toContain("is-off");
        expect(clay.dataset.swatch).toBe("clay");
        expect(clay.style.background).toBe("rgb(180, 90, 60)");
    });

    it("lays choices out under the caller's headings, and the arrows still walk them in order", () => {
        function Times() {
            const [value, setValue] = useState<string | null>("9");
            return (
                <ChoiceGroup
                    label="Time"
                    value={value}
                    onChange={setValue}
                    choices={["9", "10", "11"].map((t) => ({
                        value: t,
                        label: t,
                    }))}
                    itemClassName={() => ""}
                    layout={(item) => (
                        <>
                            <div>
                                <h3>Monday</h3>
                                {item("9")}
                                {item("10")}
                            </div>
                            <div>
                                <h3>Tuesday</h3>
                                {item("11")}
                            </div>
                        </>
                    )}
                />
            );
        }
        act(() => root.render(<Times />));
        expect(host.querySelectorAll("h3")).toHaveLength(2);
        expect(radios()).toHaveLength(3);
        key("ArrowRight");
        key("ArrowRight");
        expect(checked()).toBe("11");
    });

    it("tells a second press on the chosen one only where a press takes it back", () => {
        const plain = vi.fn();
        const again = vi.fn();
        act(() =>
            root.render(
                <>
                    <ChoiceGroup
                        label="A"
                        value="x"
                        onChange={plain}
                        choices={[{ value: "x", label: "X" }]}
                        itemClassName={() => ""}
                    />
                    <ChoiceGroup
                        label="B"
                        value="x"
                        onChange={again}
                        reselect
                        choices={[{ value: "x", label: "X" }]}
                        itemClassName={() => ""}
                    />
                </>,
            ),
        );
        act(() => radios()[0].click());
        act(() => radios()[1].click());
        expect(plain).not.toHaveBeenCalled();
        expect(again).toHaveBeenCalledWith("x");
    });
});

describe("RadioCards", () => {
    function Cards({ onChange }: { onChange?: (v: string) => void }) {
        const [value, setValue] = useState<string | null>(null);
        return (
            <RadioCards
                label="How much went back?"
                value={value}
                onChange={(v) => {
                    setValue(v);
                    onChange?.(v);
                }}
                options={[
                    { value: "full", label: "Full amount", aside: "₹500" },
                    {
                        value: "another",
                        label: "Another amount",
                        note: "Up to what is left.",
                    },
                ]}
            />
        );
    }

    it("is a named radio group whose rows are labels: a press on the words chooses", () => {
        const onChange = vi.fn();
        act(() => root.render(<Cards onChange={onChange} />));
        const group = host.querySelector('[role="radiogroup"]');
        expect(group?.getAttribute("aria-label")).toBe("How much went back?");
        const rows = Array.from(host.querySelectorAll("label"));
        expect(rows.map((r) => r.textContent)).toEqual([
            "Full amount₹500",
            "Another amountUp to what is left.",
        ]);
        // Each row points at its own radio.
        const first = radios()[0];
        expect(rows[0].htmlFor).toBe(first.id);
        act(() => first.click());
        expect(onChange).toHaveBeenCalledWith("full");
        expect(first.getAttribute("aria-checked")).toBe("true");
    });

    it("has nothing chosen until something is", () => {
        act(() => root.render(<Cards />));
        expect(checked()).toBeUndefined();
    });
});

describe("CheckRow and SwitchRow", () => {
    it("a tick is named by its words, and a press on the words flips it", () => {
        const onChange = vi.fn();
        act(() =>
            root.render(
                <CheckRow checked={false} onChange={onChange}>
                    Tell Asha in their messages
                </CheckRow>,
            ),
        );
        const box = host.querySelector<HTMLElement>('[role="checkbox"]');
        const row = host.querySelector("label");
        expect(row?.htmlFor).toBe(box?.id);
        expect(row?.textContent).toBe("Tell Asha in their messages");
        expect(box?.getAttribute("aria-checked")).toBe("false");
        act(() => box?.click());
        expect(onChange).toHaveBeenCalledWith(true);
        // 44px under a thumb.
        expect(row?.getAttribute("class")).toContain("coarse:min-h-11");
    });

    it("a tick that is off can't be flipped", () => {
        const onChange = vi.fn();
        act(() =>
            root.render(
                <CheckRow checked disabled onChange={onChange}>
                    In every collection
                </CheckRow>,
            ),
        );
        const box = host.querySelector<HTMLButtonElement>('[role="checkbox"]');
        expect(box?.disabled).toBe(true);
        act(() => box?.click());
        expect(onChange).not.toHaveBeenCalled();
    });

    it("a switch is the shared one, named by its words or by a fuller name", () => {
        const onChange = vi.fn();
        act(() =>
            root.render(
                <>
                    <SwitchRow checked={false} onChange={onChange}>
                        Team notes
                    </SwitchRow>
                    <SwitchRow
                        checked
                        onChange={() => undefined}
                        name="Change locations, on"
                    >
                        Change locations
                    </SwitchRow>
                </>,
            ),
        );
        const [notes, locations] = Array.from(
            host.querySelectorAll<HTMLElement>('[role="switch"]'),
        );
        expect(host.querySelector("label")?.htmlFor).toBe(notes.id);
        expect(notes.getAttribute("aria-checked")).toBe("false");
        expect(locations.getAttribute("aria-label")).toBe(
            "Change locations, on",
        );
        act(() => notes.click());
        expect(onChange).toHaveBeenCalledWith(true);
    });
});

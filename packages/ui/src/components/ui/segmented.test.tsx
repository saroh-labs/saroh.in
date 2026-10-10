import { fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { Segmented } from "./segmented";

const noop = () => undefined;
const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

function View({
    onChange,
    disabled,
}: {
    onChange?: (v: string) => void;
    disabled?: boolean;
}) {
    const [value, setValue] = React.useState("day");
    return (
        <Segmented
            label="View"
            value={value}
            disabled={disabled}
            onValueChange={(v) => {
                setValue(v);
                onChange?.(v);
            }}
            options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month", disabled: true },
                { value: "agenda", label: "Agenda", count: 4 },
            ]}
        />
    );
}

describe("Segmented, button mode", () => {
    it("is a named radio group with one option checked and one tab stop", () => {
        render(<View />);
        const group = screen.getByRole("radiogroup", { name: "View" });
        const radios = within(group).getAllByRole("radio");
        expect(radios).toHaveLength(4);
        expect(radios[0]).toHaveAttribute("aria-checked", "true");
        expect(radios[1]).toHaveAttribute("aria-checked", "false");
        expect(
            radios.filter((r) => r.getAttribute("tabindex") === "0"),
        ).toEqual([radios[0]]);
    });

    it("chooses on click", () => {
        const onChange = vi.fn();
        render(<View onChange={onChange} />);
        fireEvent.click(screen.getByRole("radio", { name: "Week" }));
        expect(onChange).toHaveBeenCalledWith("week");
        expect(screen.getByRole("radio", { name: "Week" })).toHaveAttribute(
            "aria-checked",
            "true",
        );
    });

    it("arrows move and choose, skipping a disabled option and wrapping", () => {
        render(<View />);
        const group = screen.getByRole("radiogroup");
        const checked = () =>
            screen
                .getAllByRole("radio")
                .find((r) => r.getAttribute("aria-checked") === "true")
                ?.textContent;
        fireEvent.keyDown(group, { key: "ArrowRight" });
        expect(checked()).toBe("Week");
        expect(document.activeElement?.textContent).toBe("Week");
        fireEvent.keyDown(group, { key: "ArrowDown" });
        expect(checked()).toBe("Agenda4");
        fireEvent.keyDown(group, { key: "ArrowRight" });
        expect(checked()).toBe("Day");
        fireEvent.keyDown(group, { key: "ArrowUp" });
        expect(checked()).toBe("Agenda4");
        fireEvent.keyDown(group, { key: "Home" });
        expect(checked()).toBe("Day");
    });

    it("the chosen option is Ink, never Saffron, and every option is 44px on touch", () => {
        render(<View />);
        const on = screen.getByRole("radio", { name: "Day" });
        const off = screen.getByRole("radio", { name: "Week" });
        expect(classes(on)).toContain("bg-primary");
        expect(classes(on)).toContain("text-primary-foreground");
        expect(on.className).not.toMatch(/brand|highlight/);
        for (const el of [on, off]) {
            expect(classes(el)).toContain("coarse:h-11");
            expect(classes(el)).toContain("cursor-pointer");
            expect(classes(el)).toContain("focus-visible:ring-2");
            expect(classes(el).some((c) => c.startsWith("hover:"))).toBe(true);
            expect(classes(el).some((c) => c.startsWith("active:"))).toBe(true);
        }
    });

    it("holds the tab stop on the first option when nothing is chosen", () => {
        render(
            <Segmented
                label="Kind"
                value=""
                onValueChange={noop}
                options={[
                    { value: "a", label: "One" },
                    { value: "b", label: "Two" },
                ]}
            />,
        );
        expect(screen.getByRole("radio", { name: "One" })).toHaveAttribute(
            "tabindex",
            "0",
        );
    });

    it("disables every option when the control is off", () => {
        render(<View disabled />);
        for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
    });

    it("an icon-only option takes its name from `name`", () => {
        render(
            <Segmented
                label="Layout"
                value="t"
                onValueChange={noop}
                options={[
                    { value: "t", label: null, icon: <svg />, name: "Table" },
                    { value: "l", label: null, icon: <svg />, name: "List" },
                ]}
            />,
        );
        expect(screen.getByRole("radio", { name: "Table" })).toBeChecked();
    });
});

describe("Segmented, link mode", () => {
    it("is a named group of links, the chosen one current but not the page", () => {
        render(
            <Segmented
                label="Bookings view"
                value="list"
                options={[
                    { value: "calendar", label: "Calendar", href: "/bookings" },
                    {
                        value: "list",
                        label: "List",
                        href: "/bookings?view=list",
                    },
                ]}
            />,
        );
        const group = screen.getByRole("group", { name: "Bookings view" });
        const links = within(group).getAllByRole("link");
        expect(links[1]).toHaveAttribute("aria-current", "true");
        expect(links[0]).not.toHaveAttribute("aria-current");
        expect(links[0]).toHaveAttribute("href", "/bookings");
        expect(screen.queryByRole("radio")).toBeNull();
    });
});

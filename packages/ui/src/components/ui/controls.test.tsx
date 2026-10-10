import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { Calendar } from "./calendar";
import { Checkbox } from "./checkbox";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./dropdown-menu";
import { Input } from "./input";
import { Label } from "./label";
import { OptionSelect } from "./option-select";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Select, SelectTrigger, SelectValue } from "./select";
import { brandToastOptions } from "./sonner";
import { Switch } from "./switch";
import { Textarea } from "./textarea";
import { Toggle } from "./toggle";

/**
 * The states of the form controls and the button: default, hover,
 * focus-visible, disabled, busy, read-only and error, and what each does on
 * a touch pointer.
 *
 * jsdom computes no Tailwind, so a state is asserted by the class that draws
 * it and by what the element says to a screen reader. How it looks is the
 * browser suite's (`e2e/tests/a11y.spec.ts`).
 */

const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
const has = (el: Element, ...wanted: string[]) => {
    for (const c of wanted) expect(classes(el), c).toContain(c);
};
function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error("missing");
    return value;
}
const none = (el: Element, pattern: RegExp) =>
    expect(classes(el).filter((c) => pattern.test(c))).toEqual([]);

/** The one ring every control draws, and only for the keyboard. */
function expectRing(el: Element) {
    has(
        el,
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
        "focus-visible:ring-offset-2",
        "ring-offset-background",
    );
    none(el, /^focus:(ring|outline)/);
}

describe("Button", () => {
    it("default: the three sizes, each 44px under a finger", () => {
        render(
            <>
                <Button>Save</Button>
                <Button size="sm">Small</Button>
                <Button size="xs">Tiny</Button>
                <Button size="icon" aria-label="Edit" />
                <Button size="icon-sm" aria-label="Copy" />
                <Button size="icon-xs" aria-label="Remove" />
            </>,
        );
        has(screen.getByRole("button", { name: "Save" }), "h-[38px]");
        has(screen.getByRole("button", { name: "Small" }), "h-8");
        has(screen.getByRole("button", { name: "Tiny" }), "h-7");
        has(screen.getByRole("button", { name: "Edit" }), "h-[38px]");
        has(screen.getByRole("button", { name: "Copy" }), "h-8", "w-8");
        has(screen.getByRole("button", { name: "Remove" }), "h-7", "w-7");
        for (const b of screen.getAllByRole("button")) {
            has(b, "coarse:h-11");
            expectRing(b);
        }
    });

    it("hover and pressed are colour steps", () => {
        render(<Button>Save</Button>);
        has(
            screen.getByRole("button"),
            "hover:bg-primary-hover",
            "active:bg-primary-active",
        );
    });

    it("disabled: its own fill, label and edge, never an opacity", () => {
        render(<Button disabled>Save</Button>);
        const b = screen.getByRole("button");
        expect(b).toBeDisabled();
        has(
            b,
            "disabled:bg-disabled",
            "disabled:text-disabled-foreground",
            "disabled:shadow-[inset_0_0_0_1px_hsl(var(--disabled-border))]",
        );
        none(b, /opacity/);
    });

    it("busy: says so, keeps its colour, and is not disabled", () => {
        render(
            <Button busy busyLabel="Saving…">
                Save
            </Button>,
        );
        const b = screen.getByRole("button");
        expect(b).toHaveAttribute("aria-busy", "true");
        expect(b).toHaveAttribute("aria-disabled", "true");
        expect(b).not.toBeDisabled();
        expect(b).toHaveAccessibleName("Saving…");
        has(b, "bg-primary", "aria-busy:cursor-progress");
    });

    it("busy: takes no press, and a submit does not go", () => {
        const onClick = vi.fn();
        const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
        render(
            <form onSubmit={onSubmit}>
                <Button
                    type="submit"
                    busy
                    busyLabel="Saving…"
                    onClick={onClick}
                >
                    Save
                </Button>
            </form>,
        );
        fireEvent.click(screen.getByRole("button"));
        expect(onClick).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("at rest the button already holds the busy label's width", () => {
        render(<Button busyLabel="Saving…">Save</Button>);
        const b = screen.getByRole("button");
        // Named by what it does now, with the other label laid out unseen
        // in the same cell, so the button never changes width.
        expect(b).toHaveAccessibleName("Save");
        expect(b).not.toHaveAttribute("aria-busy");
        const waiting = screen.getByText("Saving…");
        expect(waiting).toHaveStyle({ visibility: "hidden" });
        expect(waiting).toHaveAttribute("aria-hidden", "true");
        expect(screen.getByText("Save")).not.toHaveStyle({
            visibility: "hidden",
        });
    });

    it("flipping to busy swaps which label is seen, not the markup", () => {
        const { rerender } = render(<Button busyLabel="Saving…">Save</Button>);
        rerender(
            <Button busy busyLabel="Saving…">
                Save
            </Button>,
        );
        expect(screen.getByText("Save")).toHaveStyle({ visibility: "hidden" });
        expect(screen.getByText("Saving…")).not.toHaveStyle({
            visibility: "hidden",
        });
    });

    it("busy with no second label keeps its words and still says busy", () => {
        const onClick = vi.fn();
        render(
            <Button busy onClick={onClick}>
                Refresh
            </Button>,
        );
        const b = screen.getByRole("button", { name: "Refresh" });
        expect(b).toHaveAttribute("aria-busy", "true");
        fireEvent.click(b);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("presses reach the handler when it is not busy", () => {
        const onClick = vi.fn();
        render(
            <Button busyLabel="Saving…" onClick={onClick}>
                Save
            </Button>,
        );
        fireEvent.click(screen.getByRole("button"));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("a link drawn as a button (asChild) can be busy too", () => {
        render(
            <Button asChild busy>
                <a href="/orders">Orders</a>
            </Button>,
        );
        expect(screen.getByRole("link")).toHaveAttribute("aria-busy", "true");
    });
});

describe("Input, Textarea and the select's box share their states", () => {
    function boxes() {
        render(
            <>
                <Input aria-label="Name" />
                <Textarea aria-label="Note" />
                <Select>
                    <SelectTrigger aria-label="Kind">
                        <SelectValue />
                    </SelectTrigger>
                </Select>
            </>,
        );
        return [
            screen.getByRole("textbox", { name: "Name" }),
            screen.getByRole("textbox", { name: "Note" }),
            screen.getByRole("combobox", { name: "Kind" }),
        ] as const;
    }

    it("default: the control edge on the field fill", () => {
        for (const el of boxes()) has(el, "border-input", "bg-field");
    });

    it("hover moves the edge one step", () => {
        for (const el of boxes()) has(el, "hover:border-muted-foreground");
    });

    it("focus: one ring, for the keyboard only", () => {
        for (const el of boxes()) {
            expectRing(el);
            has(el, "focus-visible:border-ring");
        }
    });

    it("disabled: the disabled tokens, never an opacity", () => {
        for (const el of boxes()) {
            has(
                el,
                "disabled:border-disabled-border",
                "disabled:bg-disabled",
                "disabled:text-disabled-foreground",
            );
            none(el, /opacity/);
        }
    });

    it("error: the destructive edge on its tint, from aria-invalid", () => {
        for (const el of boxes()) {
            has(
                el,
                "aria-[invalid=true]:border-destructive",
                "aria-[invalid=true]:bg-destructive-subtle",
            );
        }
    });

    it("read-only: a hairline, no fill, the value at full contrast", () => {
        for (const el of boxes()) {
            has(
                el,
                "[&[readonly]]:border-border",
                "[&[readonly]]:bg-transparent",
                "[&[readonly]]:text-foreground",
            );
        }
    });

    it("16px on a touch pointer, so an iPhone does not zoom the page", () => {
        for (const el of boxes()) has(el, "coarse:text-base");
    });

    it("44px on a touch pointer", () => {
        const [input, , trigger] = boxes();
        has(input, "coarse:h-11");
        has(trigger, "coarse:h-11");
    });

    it("a read-only select can't be opened and is drawn to be read", () => {
        render(
            <OptionSelect
                aria-label="Role"
                value="admin"
                onValueChange={() => undefined}
                options={[{ value: "admin", label: "Admin" }]}
                readOnly
            />,
        );
        const trigger = screen.getByRole("combobox", { name: "Role" });
        expect(trigger).toBeDisabled();
        expect(trigger).toHaveAttribute("data-readonly");
        has(
            trigger,
            "data-[readonly]:bg-transparent",
            "data-[readonly]:text-foreground",
        );
    });

    it("the command menu's search box is 16px on touch too", () => {
        const src = fs.readFileSync(
            path.join(__dirname, "command.tsx"),
            "utf8",
        );
        expect(src).toContain("coarse:text-base");
    });
});

describe("Checkbox and radio", () => {
    function pair() {
        render(
            <>
                <Checkbox aria-label="Agree" />
                <RadioGroup aria-label="Size">
                    <RadioGroupItem value="a" aria-label="Small" />
                </RadioGroup>
            </>,
        );
        return [
            screen.getByRole("checkbox", { name: "Agree" }),
            screen.getByRole("radio", { name: "Small" }),
        ];
    }

    it("share one resting edge: 1.5px in the control-boundary colour", () => {
        for (const el of pair()) {
            has(el, "border-[1.5px]", "border-input", "size-4");
            none(el, /^(dark:)?border-(border-strong|primary)$/);
        }
    });

    it("hover and pressed, on the unticked control", () => {
        for (const el of pair()) {
            has(
                el,
                "hover:data-[state=unchecked]:border-foreground",
                "active:data-[state=unchecked]:bg-accent-active",
            );
        }
    });

    it("focus: the shared ring, for the keyboard only", () => {
        for (const el of pair()) expectRing(el);
    });

    it("disabled: the disabled tokens, never an opacity", () => {
        for (const el of pair()) {
            has(
                el,
                "disabled:!border-disabled-border",
                "disabled:!bg-disabled",
                "disabled:!text-disabled-foreground",
            );
            none(el, /opacity/);
        }
    });

    it("a 44px area takes the tap, and the box stays 16px", () => {
        for (const el of pair()) {
            has(
                el,
                "relative",
                "coarse:after:absolute",
                "coarse:after:-inset-4",
            );
        }
    });
});

describe("Switch", () => {
    it("default and sm sizes", () => {
        render(
            <>
                <Switch aria-label="Stock" />
                <Switch aria-label="Dense" size="sm" />
            </>,
        );
        has(screen.getByRole("switch", { name: "Stock" }), "h-6", "w-11");
        has(screen.getByRole("switch", { name: "Dense" }), "h-5", "w-9");
    });

    it("moves on the motion tokens and carries no shadow", () => {
        render(<Switch aria-label="Stock" />);
        const root = screen.getByRole("switch");
        has(root, "duration-fast");
        const thumb = must(root.querySelector("span"));
        has(thumb, "duration-base", "ease-out");
        none(thumb, /^shadow/);
    });

    it("disabled: the disabled tokens, never an opacity", () => {
        render(<Switch aria-label="Stock" disabled />);
        const root = screen.getByRole("switch");
        has(root, "disabled:!bg-disabled");
        none(root, /opacity/);
        has(
            must(root.querySelector("span")),
            "group-disabled:bg-disabled-foreground",
        );
    });

    it("focus ring and a 44px tap area", () => {
        render(<Switch aria-label="Stock" />);
        const root = screen.getByRole("switch");
        expectRing(root);
        has(
            root,
            "relative",
            "coarse:after:absolute",
            "coarse:after:-inset-y-3",
        );
    });
});

describe("44px on a touch pointer, in every control that lacked it", () => {
    it("Toggle", () => {
        render(<Toggle aria-label="Bold">B</Toggle>);
        has(screen.getByRole("button"), "coarse:min-h-11", "coarse:min-w-11");
    });

    it("Menu item", () => {
        render(
            <DropdownMenu open>
                <DropdownMenuTrigger>Open</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem>Duplicate</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );
        has(screen.getByRole("menuitem"), "coarse:min-h-11");
    });

    it("Select and command items", () => {
        for (const file of ["select.tsx", "command.tsx"]) {
            const src = fs.readFileSync(path.join(__dirname, file), "utf8");
            expect(src, file).toContain("coarse:min-h-11");
        }
    });

    it("Calendar days and its month buttons", () => {
        render(<Calendar mode="single" month={new Date(2026, 9, 1)} />);
        const day = screen.getByRole("gridcell", { name: "15" });
        has(day, "coarse:h-11", "coarse:w-11");
        has(
            screen.getByRole("button", { name: /previous month/i }),
            "coarse:h-11",
            "coarse:w-11",
        );
    });

    it("a day that can't be picked is a colour, not a fade", () => {
        render(
            <Calendar
                mode="single"
                month={new Date(2026, 9, 1)}
                disabled={{ before: new Date(2026, 9, 10) }}
            />,
        );
        none(screen.getByRole("gridcell", { name: "5" }), /^opacity-/);
    });

    it("Dialog close", () => {
        render(
            <Dialog open>
                <DialogContent aria-describedby={undefined}>
                    <DialogTitle>Refund</DialogTitle>
                </DialogContent>
            </Dialog>,
        );
        has(
            screen.getByRole("button", { name: "Close" }),
            "coarse:after:absolute",
            "coarse:after:-inset-2.5",
        );
    });

    it("a toast's Undo, cancel and close, and a toast fits 320px", () => {
        const c = brandToastOptions?.classNames ?? {};
        for (const key of [
            "actionButton",
            "cancelButton",
            "closeButton",
        ] as const) {
            const cls = String(c[key]).split(/\s+/);
            expect(cls, key).toContain("coarse:min-h-11");
            expect(cls, key).toContain("coarse:min-w-11");
        }
        const toast = String(c.toast).split(/\s+/);
        expect(toast).toContain("min-w-0");
        expect(toast).toContain("sm:min-w-[300px]");
        expect(toast).not.toContain("min-w-[300px]");
    });

    it("the table's bulk bar buttons", () => {
        const src = fs.readFileSync(
            path.join(__dirname, "data-view/data-view.tsx"),
            "utf8",
        );
        const bar = src.slice(src.indexOf('aria-label="Selection"'));
        expect(bar.match(/coarse:h-11/g)?.length).toBeGreaterThanOrEqual(2);
    });
});

describe("Label", () => {
    it("is 12.5px by default, so no call site sets a size", () => {
        render(<Label>Name</Label>);
        has(screen.getByText("Name"), "text-[0.78125rem]", "font-medium");
    });
});

describe("no primitive fades a disabled control", () => {
    const dir = __dirname;
    const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));

    it.each(files)("%s", (file) => {
        const src = fs.readFileSync(path.join(dir, file), "utf8");
        expect(src.match(/disabled:opacity-\d+/g) ?? []).toEqual([]);
    });
});

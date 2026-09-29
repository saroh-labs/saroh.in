import fs from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Accordion, AccordionItem, AccordionTrigger } from "./accordion";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./dropdown-menu";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Sheet, SheetContent, SheetTitle } from "./sheet";
import { Switch } from "./switch";
import { Tabs, TabsList, TabsTrigger } from "./tabs";
import { Toggle } from "./toggle";

/**
 * The standing rule (pre-launch polish P3): every clickable shows the
 * pointer, and has a hover, a keyboard focus and a pressed state of its own.
 * The primitives carry it so every screen inherits it; these pin it on each
 * one, so a primitive that drops a state fails here rather than on a screen.
 *
 * jsdom computes no Tailwind, so what is asserted is the class that draws
 * each state. Whether it LOOKS right, and whether a screen's hand-rolled
 * control keeps the rule, is `e2e/tests/a11y.spec.ts` in a real browser.
 */

const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

/** Every state the rule asks for, by the utility that draws it. */
function expectInteractive(
    el: Element,
    { hover = true, focus = true }: { hover?: boolean; focus?: boolean } = {},
) {
    const c = classes(el);
    expect(c, "pointer").toContain("cursor-pointer");
    if (hover) {
        expect(
            c.some((x) => x.startsWith("hover:")),
            "a hover state",
        ).toBe(true);
    }
    expect(
        c.some((x) => x.startsWith("active:")),
        "a pressed state",
    ).toBe(true);
    if (focus) {
        expect(
            c.some((x) => /^focus(-visible)?:ring/.test(x)),
            "a focus ring",
        ).toBe(true);
    }
}

describe("interactive primitives carry pointer, hover, focus and pressed", () => {
    it.each([
        "default",
        "brand",
        "highlight",
        "success",
        "destructive",
        "outline",
        "secondary",
        "ghost",
    ] as const)("Button, %s", (variant) => {
        render(<Button variant={variant}>Save</Button>);
        expectInteractive(screen.getByRole("button", { name: "Save" }));
    });

    it("Button as a link keeps the pointer (asChild on an anchor)", () => {
        render(
            <Button asChild>
                <a href="/orders">Orders</a>
            </Button>,
        );
        expectInteractive(screen.getByRole("link", { name: "Orders" }));
    });

    it("Tabs trigger", () => {
        render(
            <Tabs defaultValue="a">
                <TabsList>
                    <TabsTrigger value="a">One</TabsTrigger>
                    <TabsTrigger value="b">Two</TabsTrigger>
                </TabsList>
            </Tabs>,
        );
        expectInteractive(screen.getByRole("tab", { name: "Two" }));
    });

    it("Menu item: a thing you click, not the default arrow", () => {
        render(
            <DropdownMenu open>
                <DropdownMenuTrigger>Open</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem>Duplicate</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );
        const item = screen.getByRole("menuitem", { name: "Duplicate" });
        // Focus IS the hover in a Radix menu: the pointer moves focus.
        expectInteractive(item, { hover: false, focus: false });
        expect(classes(item)).toContain("focus:bg-accent");
    });

    it("Checkbox", () => {
        render(<Checkbox aria-label="Select row" />);
        expectInteractive(screen.getByRole("checkbox", { name: "Select row" }));
    });

    it("Radio", () => {
        render(
            <RadioGroup defaultValue="a" aria-label="Size">
                <RadioGroupItem value="a" aria-label="Small" />
                <RadioGroupItem value="b" aria-label="Large" />
            </RadioGroup>,
        );
        expectInteractive(screen.getByRole("radio", { name: "Large" }));
    });

    it("Switch", () => {
        render(<Switch aria-label="Track stock" />);
        expectInteractive(screen.getByRole("switch", { name: "Track stock" }));
    });

    it("Toggle", () => {
        render(<Toggle aria-label="Bold">B</Toggle>);
        expectInteractive(screen.getByRole("button", { name: "Bold" }));
    });

    it("Accordion trigger draws its own ring", () => {
        render(
            <Accordion type="single" collapsible>
                <AccordionItem value="a">
                    <AccordionTrigger>Delivery</AccordionTrigger>
                </AccordionItem>
            </Accordion>,
        );
        const trigger = screen.getByRole("button", { name: "Delivery" });
        expect(classes(trigger)).toContain("cursor-pointer");
        expect(classes(trigger)).toContain("focus-visible:ring-2");
    });

    it("Dialog close: named, and a ring for the keyboard only", () => {
        render(
            <Dialog open>
                <DialogContent aria-describedby={undefined}>
                    <DialogTitle>Refund</DialogTitle>
                </DialogContent>
            </Dialog>,
        );
        const close = screen.getByRole("button", { name: "Close" });
        expectInteractive(close);
        // A mouse open must not paint a ring on the X.
        expect(classes(close).some((x) => x.startsWith("focus:ring"))).toBe(
            false,
        );
    });

    it("Sheet close: named, and a ring for the keyboard only", () => {
        render(
            <Sheet open>
                <SheetContent aria-describedby={undefined}>
                    <SheetTitle>Filters</SheetTitle>
                </SheetContent>
            </Sheet>,
        );
        const close = screen.getByRole("button", { name: "Close" });
        expectInteractive(close);
        expect(classes(close).some((x) => x.startsWith("focus:ring"))).toBe(
            false,
        );
    });
});

describe("no primitive sets the default arrow on something clickable", () => {
    // shadcn ships menu, select and command items with `cursor-default`. Every
    // one of them is clicked, so the arrow told people it was not.
    const dir = __dirname;
    const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));

    it.each(files)("%s", (file) => {
        const src = fs.readFileSync(path.join(dir, file), "utf8");
        const items = src.match(/"[^"]*\bcursor-default\b[^"]*"/g) ?? [];
        // A scroll arrow in a select is hovered, not clicked; nothing else.
        const clickable = items.filter(
            (s) => !s.includes("justify-center py-1"),
        );
        expect(clickable).toEqual([]);
    });
});

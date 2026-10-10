import { fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { Tabs, TabsList, TabsTrigger, TabStrip } from "./tabs";

const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

function Stateful({ onChange }: { onChange?: (v: string) => void }) {
    const [value, setValue] = React.useState("place");
    return (
        <TabStrip
            label="Location settings"
            idPrefix="loc"
            value={value}
            onValueChange={(v) => {
                setValue(v);
                onChange?.(v);
            }}
            tabs={[
                { value: "place", label: "The place", controls: "panel" },
                { value: "pay", label: "Payments", controls: "panel" },
                {
                    value: "off",
                    label: "Off",
                    controls: "panel",
                    disabled: true,
                },
                {
                    value: "pause",
                    label: "Pause or close",
                    controls: "panel",
                    separated: true,
                },
            ]}
        />
    );
}

describe("TabStrip, button mode", () => {
    it("is a named tablist whose open tab is selected and holds the tab stop", () => {
        render(<Stateful />);
        const list = screen.getByRole("tablist", { name: "Location settings" });
        const tabs = within(list).getAllByRole("tab");
        expect(tabs.map((t) => t.textContent)).toEqual([
            "The place",
            "Payments",
            "Off",
            "Pause or close",
        ]);
        expect(tabs[0]).toHaveAttribute("aria-selected", "true");
        expect(tabs[0]).toHaveAttribute("tabindex", "0");
        expect(tabs[1]).toHaveAttribute("aria-selected", "false");
        expect(tabs[1]).toHaveAttribute("tabindex", "-1");
        expect(tabs[0]).toHaveAttribute("id", "loc-place");
        expect(tabs[0]).toHaveAttribute("aria-controls", "panel");
    });

    it("opens a tab on click", () => {
        const onChange = vi.fn();
        render(<Stateful onChange={onChange} />);
        fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
        expect(onChange).toHaveBeenCalledWith("pay");
        expect(screen.getByRole("tab", { name: "Payments" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
    });

    it("arrows, Home and End move and open, skipping a disabled tab and wrapping", () => {
        render(<Stateful />);
        const list = screen.getByRole("tablist");
        const selected = () =>
            screen
                .getAllByRole("tab")
                .find((t) => t.getAttribute("aria-selected") === "true")
                ?.textContent;

        fireEvent.keyDown(list, { key: "ArrowRight" });
        expect(selected()).toBe("Payments");
        expect(document.activeElement?.textContent).toBe("Payments");
        fireEvent.keyDown(list, { key: "ArrowRight" });
        expect(selected()).toBe("Pause or close");
        fireEvent.keyDown(list, { key: "ArrowRight" });
        expect(selected()).toBe("The place");
        fireEvent.keyDown(list, { key: "ArrowLeft" });
        expect(selected()).toBe("Pause or close");
        fireEvent.keyDown(list, { key: "Home" });
        expect(selected()).toBe("The place");
        fireEvent.keyDown(list, { key: "End" });
        expect(selected()).toBe("Pause or close");
    });

    it("draws the open tab with an Ink underline, never Saffron", () => {
        render(<Stateful />);
        const on = screen.getByRole("tab", { name: "The place" });
        expect(classes(on)).toContain(
            "shadow-[inset_0_-2px_0_hsl(var(--foreground))]",
        );
        expect(on.className).not.toMatch(/brand|highlight/);
        expect(classes(on)).toContain("text-[14px]");
    });

    it("every tab has the pointer, a hover, a pressed state, a ring and 44px on touch", () => {
        render(<Stateful />);
        const off = classes(screen.getByRole("tab", { name: "Payments" }));
        expect(off).toContain("cursor-pointer");
        expect(off).toContain("hover:text-foreground");
        expect(off).toContain("active:bg-accent-active");
        expect(off).toContain("focus-visible:ring-2");
        expect(off).toContain("coarse:min-h-11");
        expect(off.some((c) => c.startsWith("duration-"))).toBe(true);
    });

    it("sets a tab apart with a rule that is not announced", () => {
        const { container } = render(<Stateful />);
        const rule = container.querySelector("span.bg-border");
        expect(rule).toHaveAttribute("aria-hidden");
    });
});

describe("TabStrip, link mode", () => {
    const tabs = [
        { value: "all", label: "All", href: "/orders", count: 12 },
        {
            value: "open",
            label: "Open",
            href: "/orders?tab=open",
            count: 3,
            countTone: "strong" as const,
        },
        {
            value: "refunded",
            label: "Refunded",
            href: "/orders?tab=refunded",
            count: null,
        },
    ];

    it("is a named nav of links, the open one marked as the current page", () => {
        render(<TabStrip label="Orders" value="open" tabs={tabs} />);
        const nav = screen.getByRole("navigation", { name: "Orders" });
        const links = within(nav).getAllByRole("link");
        expect(links).toHaveLength(3);
        expect(links[1]).toHaveAttribute("aria-current", "page");
        expect(links[0]).not.toHaveAttribute("aria-current");
        expect(links[1]).toHaveAttribute("href", "/orders?tab=open");
        expect(screen.queryByRole("tablist")).toBeNull();
        expect(screen.queryByRole("tab")).toBeNull();
    });

    it("shows each count, and a count that couldn't be read as a dash named unknown", () => {
        render(<TabStrip label="Orders" value="all" tabs={tabs} />);
        expect(screen.getByRole("link", { name: /All/ })).toHaveTextContent(
            "All12",
        );
        const unknown = screen.getByLabelText("count unknown");
        expect(unknown).toHaveTextContent("—");
    });

    it("scrolls sideways inside ScrollX without adding a second landmark or focus stop", () => {
        const { container } = render(
            <TabStrip label="Orders" value="all" tabs={tabs} />,
        );
        const scroller = container.querySelector("[data-scroll-x]");
        expect(scroller).not.toBeNull();
        expect(scroller).not.toHaveAttribute("role");
        expect(scroller).not.toHaveAttribute("tabindex");
        expect(screen.queryByRole("region")).toBeNull();
    });
});

describe("Radix tabs", () => {
    it("draw the same underline strip with variant=underline", () => {
        render(
            <Tabs defaultValue="a">
                <TabsList variant="underline">
                    <TabsTrigger value="a">One</TabsTrigger>
                    <TabsTrigger value="b">Two</TabsTrigger>
                </TabsList>
            </Tabs>,
        );
        const on = classes(screen.getByRole("tab", { name: "One" }));
        expect(on).toContain(
            "data-[state=active]:shadow-[inset_0_-2px_0_hsl(var(--foreground))]",
        );
        expect(on).toContain("text-[14px]");
    });

    it("never use transition-all", () => {
        render(
            <Tabs defaultValue="a">
                <TabsList>
                    <TabsTrigger value="a">One</TabsTrigger>
                </TabsList>
            </Tabs>,
        );
        expect(screen.getByRole("tab", { name: "One" }).className).not.toMatch(
            /transition-all/,
        );
    });
});

import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Chip } from "./chip";
import { FilterChips } from "./filter-chips";
import { ListSearch } from "./list-search";
import { ListTable, ListTableHead, listTable } from "./list-table";
import { ListFilter, ListToolbar } from "./list-toolbar";

/**
 * The one list toolbar, its chip row and the one table look. What is pinned
 * here is what the owner saw differ between four screens side by side: the
 * order of the controls, where the search sits and how wide it is, tabs
 * against chips, how a count is drawn, and the table's head band.
 */

const classes = (el: Element | null) =>
    (el?.getAttribute("class") ?? "").split(/\s+/);

function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error("not found");
    return value;
}

const slot = (container: HTMLElement, name: string) =>
    container.querySelector<HTMLElement>(`[data-slot="${name}"]`);

/** True when `a` comes before `b` in the document. */
const before = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

function everything() {
    return render(
        <ListToolbar
            tabs={<nav aria-label="Views">Levels Log Checks</nav>}
            search={
                <ListSearch placeholder="Search stock" onSearch={vi.fn()} />
            }
            filters={
                <ListFilter
                    label="Location"
                    value="all"
                    onValueChange={vi.fn()}
                    options={[
                        { value: "all", label: "All locations" },
                        { value: "hill", label: "Hill Road" },
                    ]}
                />
            }
            end={<button type="button">Sort</button>}
            count="Showing 1 to 50 of 532"
            chips={
                <FilterChips
                    label="Show"
                    value="all"
                    onValueChange={vi.fn()}
                    chips={[
                        { value: "all", label: "All" },
                        { value: "needs", label: "Needs you", count: 4 },
                    ]}
                />
            }
        />,
    );
}

describe("ListToolbar", () => {
    it("lays a list out in one order: tabs, then search, filters and the right side in one row, then chips", () => {
        const { container } = everything();
        const tabs = must(slot(container, "list-tabs"));
        const row = must(slot(container, "list-row"));
        const chips = must(slot(container, "list-chips"));
        expect(before(tabs, row)).toBe(true);
        expect(before(row, chips)).toBe(true);

        const search = must(slot(container, "list-search"));
        const filters = must(slot(container, "list-filters"));
        const end = must(slot(container, "list-end"));
        // One row holds all three, in this order.
        for (const part of [search, filters, end]) {
            expect(part.parentElement).toBe(row);
        }
        expect(before(search, filters)).toBe(true);
        expect(before(filters, end)).toBe(true);
    });

    it("puts the sort before the count, both pushed to the right", () => {
        const { container } = everything();
        const end = must(slot(container, "list-end"));
        expect(classes(end)).toContain("sm:ml-auto");
        const count = must(slot(container, "list-count"));
        expect(count).toHaveTextContent("Showing 1 to 50 of 532");
        expect(before(within(end).getByRole("button"), count)).toBe(true);
        // A count that changes is said, without stealing the keyboard.
        expect(count).toHaveAttribute("aria-live", "polite");
        expect(classes(count)).toContain("tabular-nums");
    });

    it("wraps on a phone, search first at full width, and nothing in it is unshrinkable", () => {
        const { container } = everything();
        const row = must(slot(container, "list-row"));
        expect(classes(row)).toEqual(
            expect.arrayContaining(["flex", "flex-wrap", "min-w-0"]),
        );
        const search = must(slot(container, "list-search"));
        // The phone's full width, then one width from `sm`.
        expect(classes(search)).toEqual(
            expect.arrayContaining(["w-full", "min-w-0", "sm:w-auto"]),
        );
        expect(classes(search)).toContain("sm:flex-[0_1_320px]");
        // A row of four buttons held to its own width ran 2px past a
        // 412px screen on CI's fonts: no part of the toolbar is `shrink-0`.
        const parts = [
            container.querySelector("[data-list-toolbar]"),
            row,
            search,
            slot(container, "list-filters"),
            slot(container, "list-end"),
            slot(container, "list-count"),
            slot(container, "list-chips"),
        ];
        for (const part of parts) {
            expect(classes(part)).not.toContain("shrink-0");
            expect(classes(part)).toContain("min-w-0");
        }
        for (const wraps of [
            slot(container, "list-filters"),
            slot(container, "list-end"),
        ]) {
            expect(classes(wraps)).toContain("flex-wrap");
            expect(classes(wraps)).toContain("max-w-full");
        }
    });

    it("gives no room to a slot left out, and draws nothing at all when empty", () => {
        const { container, rerender } = render(
            <ListToolbar chips={<span>chips</span>} />,
        );
        expect(slot(container, "list-row")).toBeNull();
        expect(slot(container, "list-tabs")).toBeNull();
        expect(slot(container, "list-chips")).not.toBeNull();
        rerender(<ListToolbar search={null} filters={null} chips={null} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe("ListSearch in the toolbar", () => {
    it("has one width, the same on every list", () => {
        const { container } = render(
            <ListSearch placeholder="Search orders" onSearch={vi.fn()} />,
        );
        const box = must(container.querySelector("[data-list-search]"));
        expect(classes(box)).toEqual(
            expect.arrayContaining(["w-full", "min-w-0", "sm:max-w-[320px]"]),
        );
        expect(screen.getByRole("searchbox")).toHaveAccessibleName(
            "Search orders",
        );
    });
});

describe("ListFilter", () => {
    it("is the one dropdown: named, as wide as its words, the search field's height", () => {
        const { container } = render(
            <ListFilter
                label="Sort"
                value="new"
                onValueChange={vi.fn()}
                options={[
                    { value: "new", label: "Last order, newest" },
                    { value: "old", label: "Last order, oldest" },
                ]}
            />,
        );
        const box = screen.getByRole("combobox", { name: "Sort" });
        expect(box).toHaveTextContent("Last order, newest");
        const cls = classes(box);
        // Its words set its width, and the chevron sits one gap after
        // them whatever they say: two filters side by side can't differ.
        expect(cls).toEqual(expect.arrayContaining(["w-auto", "gap-2"]));
        expect(cls).not.toContain("w-full");
        expect(cls.some((c) => c.startsWith("min-w-["))).toBe(false);
        // The field's own height: 38px, and 44px under a thumb.
        expect(cls).toEqual(
            expect.arrayContaining(["h-[38px]", "coarse:h-11"]),
        );
        expect(cls).not.toContain("h-8");
        expect(cls).not.toContain("shrink-0");
        expect(container.querySelector("[data-list-filter]")).not.toBeNull();
    });

    it("masks a filter whose choices are records' own names", () => {
        const { container } = render(
            <ListFilter
                holdsData
                label="Location"
                value="hill"
                onValueChange={vi.fn()}
                options={[{ value: "hill", label: "Hill Road" }]}
            />,
        );
        expect(
            must(container.querySelector("[data-list-filter]")),
        ).toHaveAttribute("data-ph-mask");
    });
});

describe("FilterChips", () => {
    const chips = [
        { value: "all", label: "All", count: 12 },
        { value: "live", label: "Live", count: 9 },
        { value: "ended", label: "Ended", count: 0 },
        { value: "later", label: "Scheduled" },
        { value: "unread", label: "Unknown", count: null },
    ];

    it("is a named radio group, never tabs", () => {
        const { container } = render(
            <FilterChips
                label="Show"
                value="live"
                onValueChange={vi.fn()}
                chips={chips}
            />,
        );
        const group = screen.getByRole("radiogroup", { name: "Show" });
        expect(within(group).getAllByRole("radio")).toHaveLength(5);
        expect(screen.getByRole("radio", { name: "Live 9" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "All 12" })).not.toBeChecked();
        expect(container.querySelector('[role="tab"]')).toBeNull();
        expect(container.querySelector('[role="tablist"]')).toBeNull();
        expect(container.querySelector("[data-tab-strip]")).toBeNull();
    });

    it("draws a count as a quiet tabular number after the label: zero when it is a fact, nothing when unknown", () => {
        const { container } = render(
            <FilterChips
                label="Show"
                value="all"
                onValueChange={vi.fn()}
                chips={chips}
            />,
        );
        const count = (name: string) =>
            screen
                .getByRole("radio", { name })
                .querySelector("[data-chip-count]");
        expect(count("Live 9")).toHaveTextContent("9");
        expect(classes(count("Live 9"))).toEqual(
            expect.arrayContaining(["tabular-nums", "opacity-70"]),
        );
        // Zero is said; a count nobody could read is not drawn at all.
        expect(count("Ended 0")).toHaveTextContent("0");
        expect(count("Scheduled")).toBeNull();
        expect(count("Unknown")).toBeNull();
        // Never a badge, never joined with a dot.
        expect(container.querySelector("[data-count-badge]")).toBeNull();
        expect(container.textContent).not.toContain("·");
    });

    it("groups thousands in a count", () => {
        render(
            <FilterChips
                label="Show"
                value="all"
                onValueChange={vi.fn()}
                chips={[{ value: "all", label: "All", count: 1204 }]}
            />,
        );
        expect(screen.getByRole("radio")).toHaveAccessibleName("All 1,204");
    });

    it("tells the list which chip was pressed, and moves with the arrow keys", async () => {
        const onValueChange = vi.fn();
        render(
            <FilterChips
                label="Show"
                value="all"
                onValueChange={onValueChange}
                chips={chips}
            />,
        );
        fireEvent.click(screen.getByRole("radio", { name: "Ended 0" }));
        expect(onValueChange).toHaveBeenCalledWith("ended");
        const all = screen.getByRole("radio", { name: "All 12" });
        all.focus();
        fireEvent.keyDown(all, { key: "ArrowRight" });
        await waitFor(() =>
            expect(screen.getByRole("radio", { name: "Live 9" })).toHaveFocus(),
        );
    });

    it("scrolls sideways on a phone inside the allowed scroller, and wraps from sm", () => {
        const { container } = render(
            <FilterChips
                label="Show"
                value="all"
                onValueChange={vi.fn()}
                chips={chips}
            />,
        );
        // `data-scroll-x` is what the e2e sideways check allows.
        const scroller = must(container.querySelector("[data-scroll-x]"));
        const row = must(scroller.firstElementChild);
        expect(classes(row)).toEqual(
            expect.arrayContaining(["max-sm:flex-nowrap", "sm:flex-wrap"]),
        );
        expect(scroller.contains(screen.getAllByRole("radio")[0])).toBe(true);
    });

    it("marks Saroh's own words readable in a recording, and a record's name masked", () => {
        render(
            <FilterChips
                label="Which products"
                value="all"
                onValueChange={vi.fn()}
                chips={[
                    { value: "all", label: "All" },
                    { value: "s1", label: "Hill Road", holdsData: true },
                ]}
            />,
        );
        expect(screen.getByRole("radio", { name: "All" })).toHaveAttribute(
            "data-ph-unmask",
        );
        const store = screen.getByRole("radio", { name: "Hill Road" });
        expect(store).toHaveAttribute("data-ph-mask");
        expect(store).not.toHaveAttribute("data-ph-unmask");
    });

    it("draws links where each choice is an address, the chosen one current", () => {
        const { container } = render(
            <FilterChips
                label="Which orders"
                value="open"
                chips={[
                    {
                        value: "open",
                        label: "Open",
                        count: 2,
                        href: "/p?tab=orders",
                    },
                    {
                        value: "recent",
                        label: "Recent",
                        href: "/p?orders=recent",
                    },
                ]}
            />,
        );
        const group = screen.getByRole("group", { name: "Which orders" });
        const open = within(group).getByRole("link", { name: "Open 2" });
        expect(open).toHaveAttribute("aria-current", "true");
        expect(open).toHaveAttribute("href", "/p?tab=orders");
        expect(
            within(group).getByRole("link", { name: "Recent" }),
        ).not.toHaveAttribute("aria-current");
        expect(container.querySelector('[role="radio"]')).toBeNull();
    });

    it("keeps on/off filters in the same row, after the choice and outside its group", () => {
        render(
            <FilterChips
                label="Order status"
                value="all"
                onValueChange={vi.fn()}
                chips={[{ value: "all", label: "All" }]}
            >
                <Chip as="toggle" on={false}>
                    Late
                </Chip>
            </FilterChips>,
        );
        const late = screen.getByRole("button", { name: "Late" });
        expect(late).toHaveAttribute("aria-pressed", "false");
        const group = screen.getByRole("radiogroup", { name: "Order status" });
        expect(group.contains(late)).toBe(false);
        expect(before(group, late)).toBe(true);
    });
});

describe("the one table look", () => {
    it("is a card with a tinted head band of small uppercase labels", () => {
        const { container } = render(
            <ListTable>
                <ListTableHead className="grid">
                    <span>Customer</span>
                    <span className={listTable.numeric}>Spent</span>
                </ListTableHead>
                <ul>
                    <li className={listTable.row}>Asha</li>
                </ul>
            </ListTable>,
        );
        const card = must(container.querySelector("[data-list-table]"));
        expect(classes(card)).toEqual(
            expect.arrayContaining([
                "overflow-hidden",
                "border",
                "border-border",
                "bg-card",
            ]),
        );
        const head = must(container.querySelector("[data-list-head]"));
        // `.label` is the 11px uppercase utility; the band is `bg-muted`.
        expect(classes(head)).toEqual(
            expect.arrayContaining([
                "label",
                "bg-muted",
                "border-b",
                "border-border",
                "px-[14px]",
                "min-h-10",
            ]),
        );
        // Column names are Saroh's own words; the rows say their own parts.
        expect(head).toHaveAttribute("data-ph-unmask");
        expect(head).toHaveAttribute("aria-hidden", "true");
    });

    it("rules rows edge to edge: the padding is the row's, never a wrapper's", () => {
        const row = listTable.row.split(" ");
        expect(row).toEqual(
            expect.arrayContaining([
                "border-b",
                "border-border",
                "last:border-b-0",
                "px-[14px]",
                "py-[11px]",
            ]),
        );
        // The card itself carries no side padding, or the rules would
        // stop short of its edges.
        for (const frame of [listTable.card, listTable.frame]) {
            expect(frame).not.toMatch(/(^| )p[xlr]?-/);
        }
        // Head and row share one gutter, so their words line up.
        expect(listTable.head.split(" ")).toContain("px-[14px]");
        expect(listTable.th.split(" ")).toContain("px-[14px]");
        expect(listTable.td.split(" ")).toEqual(
            expect.arrayContaining(["px-[14px]", "py-[11px]"]),
        );
    });

    it("has one hover wash and one pressed step, both on the Ink ramp", () => {
        expect(listTable.row).toContain("hover:bg-foreground/[0.035]");
        expect(listTable.tr).toContain("hover:bg-foreground/[0.035]");
        expect(listTable.rowInner).toContain("hover:bg-foreground/[0.035]");
        expect(listTable.pressable).toContain("active:bg-foreground/[0.07]");
        expect(listTable.pressable).toContain("focus-visible:ring-2");
        expect(listTable.pressable).toContain("cursor-pointer");
        // A row that isn't pressed has no wash of its own.
        expect(listTable.rowStill).not.toContain("hover:");
        for (const cls of Object.values(listTable)) {
            expect(cls).not.toMatch(/brand|highlight\)|focus:ring/);
        }
    });

    it("right-aligns figures in tabular numerals, and keeps a time on one line", () => {
        expect(listTable.numeric.split(" ")).toEqual(
            expect.arrayContaining(["text-right", "tabular-nums"]),
        );
        expect(listTable.time.split(" ")).toEqual(
            expect.arrayContaining(["whitespace-nowrap", "tabular-nums"]),
        );
        expect(listTable.timeCol.split(" ")).toEqual(
            expect.arrayContaining(["whitespace-nowrap", "w-[68px]"]),
        );
    });

    it("lets a real grid give the head a role instead of hiding it", () => {
        const { container } = render(
            <ListTableHead role="row">
                <span role="columnheader">Size</span>
            </ListTableHead>,
        );
        const head = must(container.querySelector("[data-list-head]"));
        expect(head).toHaveAttribute("role", "row");
        expect(head).not.toHaveAttribute("aria-hidden");
    });
});

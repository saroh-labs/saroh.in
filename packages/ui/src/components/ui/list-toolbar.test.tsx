import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ListSearch } from "./list-search";
import { ListTable, ListTableHead, listTable } from "./list-table";
import {
    AttentionToggle,
    ListFilter,
    ListPaging,
    ListToolbar,
    MoreFilters,
} from "./list-toolbar";

/**
 * The one list toolbar, its dropdown filter and the one table look. What is
 * pinned here is what the owner saw differ between list screens side by
 * side: the order of the controls, where the search sits and how wide it
 * is, how a list is narrowed (one row of dropdowns, never a row of chips
 * under it), how a count is drawn, and the table's head band.
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

const STATUSES = [
    { value: "all", label: "All orders", count: 532 },
    { value: "open", label: "Open", count: 3 },
    { value: "refunded", label: "Refunded", count: 0 },
    { value: "odd", label: "Unknown", count: null },
];

function everything() {
    return render(
        <ListToolbar
            tabs={<nav aria-label="Views">Levels Log Checks</nav>}
            search={
                <ListSearch placeholder="Search stock" onSearch={vi.fn()} />
            }
            filters={
                <>
                    <ListFilter
                        label="Order status"
                        value="all"
                        onValueChange={vi.fn()}
                        options={STATUSES}
                    />
                    <ListFilter
                        label="Location"
                        value="all"
                        onValueChange={vi.fn()}
                        options={[
                            { value: "all", label: "All locations" },
                            { value: "hill", label: "Hill Road" },
                        ]}
                    />
                </>
            }
            attention={
                <AttentionToggle
                    label="Needs you"
                    count={4}
                    on={false}
                    onToggle={vi.fn()}
                />
            }
            end={<button type="button">Sort</button>}
            count="Showing 1 to 50 of 532"
        />,
    );
}

describe("ListToolbar", () => {
    it("is the tabs, then ONE row: search, every filter, the attention toggle, then the right side", () => {
        const { container } = everything();
        const tabs = must(slot(container, "list-tabs"));
        const row = must(slot(container, "list-row"));
        expect(before(tabs, row)).toBe(true);
        // Nothing under the row but the count: no second row of chips.
        expect(row.nextElementSibling).toBe(slot(container, "list-count"));
        expect(slot(container, "list-chips")).toBeNull();
        expect(container.querySelector('[role="radio"]')).toBeNull();

        const order = [
            must(slot(container, "list-search")),
            screen.getByRole("combobox", { name: "Order status" }),
            screen.getByRole("combobox", { name: "Location" }),
            screen.getByRole("button", { name: "Needs you 4" }),
            must(slot(container, "list-end")),
            must(slot(container, "list-count")),
        ];
        for (let i = 0; i < order.length - 1; i++) {
            expect(before(order[i], order[i + 1])).toBe(true);
        }
        for (const part of order.slice(0, 5)) {
            expect(row.contains(part)).toBe(true);
        }
    });

    it("puts the sort on the right of the row, and the count after it", () => {
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

    it("wraps cleanly: the filters flow on after the search, and the right side stays on the first line", () => {
        const { container } = everything();
        const row = must(slot(container, "list-row"));
        // Two columns from `sm`, both starting at the top.
        expect(classes(row)).toEqual(
            expect.arrayContaining(["sm:flex-row", "sm:items-start"]),
        );
        const main = must(slot(container, "list-main"));
        // The left column wraps on itself and takes the room that is left.
        expect(classes(main)).toEqual(
            expect.arrayContaining(["flex-1", "flex-wrap", "min-w-0"]),
        );
        const end = must(slot(container, "list-end"));
        expect(end.parentElement).toBe(row);
        expect(main.contains(end)).toBe(false);
        // Each dropdown is an item of the row itself (the slot adds no
        // box), so they wrap one by one after the search, not as a block.
        expect(classes(slot(container, "list-filters"))).toContain("contents");
        // The search keeps its one width.
        expect(classes(slot(container, "list-search"))).toContain(
            "sm:flex-[0_1_320px]",
        );
    });

    it("stacks on a phone, search first at full width, and nothing in it is unshrinkable", () => {
        const { container } = everything();
        const row = must(slot(container, "list-row"));
        expect(classes(row)).toEqual(
            expect.arrayContaining(["flex", "flex-col", "min-w-0"]),
        );
        expect(classes(slot(container, "list-search"))).toEqual(
            expect.arrayContaining(["w-full", "min-w-0", "sm:w-auto"]),
        );
        // A row of four buttons held to its own width ran 2px past a
        // 412px screen on CI's fonts: no part of the toolbar is `shrink-0`.
        const parts = [
            container.querySelector("[data-list-toolbar]"),
            row,
            slot(container, "list-main"),
            slot(container, "list-search"),
            slot(container, "list-attention"),
            slot(container, "list-end"),
            slot(container, "list-count"),
            ...Array.from(container.querySelectorAll("[data-list-filter]")),
            container.querySelector("[data-attention-toggle]"),
        ];
        for (const part of parts) {
            expect(classes(part)).not.toContain("shrink-0");
            expect(classes(part)).toContain("min-w-0");
        }
    });

    it("gives no room to a slot left out, and draws nothing at all when empty", () => {
        const { container, rerender } = render(<ListToolbar count="3 codes" />);
        expect(slot(container, "list-main")).toBeNull();
        expect(slot(container, "list-tabs")).toBeNull();
        expect(slot(container, "list-count")).not.toBeNull();
        rerender(<ListToolbar search={null} filters={null} count={null} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe("ListToolbar: narrowed, cleared and counted", () => {
    it("ends the row with a quiet Clear filters only while something is narrowed", () => {
        const onClear = vi.fn();
        const { container, rerender } = render(
            <ListToolbar
                search={<ListSearch placeholder="Search" onSearch={vi.fn()} />}
                onClear={onClear}
                count="3 of 12"
            />,
        );
        const clear = screen.getByRole("button", { name: "Clear filters" });
        const main = must(slot(container, "list-main"));
        // Last in the row, after everything it clears.
        expect(main.lastElementChild).toBe(clear);
        expect(classes(clear)).toContain("underline");
        expect(classes(clear)).not.toContain("shrink-0");
        fireEvent.click(clear);
        expect(onClear).toHaveBeenCalledTimes(1);
        rerender(
            <ListToolbar
                search={<ListSearch placeholder="Search" onSearch={vi.fn()} />}
                count="12"
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Clear filters" }),
        ).toBeNull();
    });

    it("says the count once: beside the row's first line from lg, and under the toolbar on the left below it", () => {
        const { container } = render(
            <ListToolbar
                search={<ListSearch placeholder="Search" onSearch={vi.fn()} />}
                count="Showing 1 to 50 of 532"
            />,
        );
        // ONE element: two would be read twice and found twice.
        expect(screen.getAllByText("Showing 1 to 50 of 532")).toHaveLength(1);
        const count = must(slot(container, "list-count"));
        const root = must(container.querySelector("[data-list-toolbar]"));
        // Below `lg` it is the next line under the row, on the left:
        // nothing pushes it right.
        expect(count.parentElement).toBe(root);
        expect(must(slot(container, "list-row")).nextElementSibling).toBe(
            count,
        );
        expect(classes(root)).toContain("flex-col");
        expect(count.className).not.toMatch(/ml-auto|text-right|justify-end/);
        // From `lg` the toolbar is two columns, and the count is the
        // second: beside the row's first line, as tall as a control.
        expect(classes(root)).toEqual(
            expect.arrayContaining([
                "lg:grid",
                "lg:grid-cols-[minmax(0,1fr)_auto]",
                "lg:items-start",
            ]),
        );
        expect(classes(count)).toEqual(
            expect.arrayContaining(["lg:min-h-[38px]", "lg:items-center"]),
        );
    });

    it("gives the row the whole width when there is no count", () => {
        const { container } = render(
            <ListToolbar end={<button type="button">Sort</button>} />,
        );
        expect(classes(slot(container, "list-row"))).toContain("lg:col-span-2");
        expect(slot(container, "list-count")).toBeNull();
    });

    it("puts the Filters button after the dropdowns and before the attention toggle", () => {
        const { container } = render(
            <ListToolbar
                filters={<span data-testid="f">a filter</span>}
                more={
                    <MoreFilters title="Filter orders" count={0}>
                        <span>inside</span>
                    </MoreFilters>
                }
                attention={
                    <AttentionToggle
                        label="Needs you"
                        on={false}
                        onToggle={vi.fn()}
                    />
                }
            />,
        );
        const order = [
            screen.getByTestId("f"),
            must(slot(container, "list-more")),
            must(slot(container, "list-attention")),
        ];
        expect(before(order[0], order[1])).toBe(true);
        expect(before(order[1], order[2])).toBe(true);
    });
});

describe("MoreFilters", () => {
    it("is one button that says how many of its filters are narrowed, with the selected look", () => {
        const { rerender } = render(
            <MoreFilters title="Filter orders" count={0}>
                <span>Step</span>
            </MoreFilters>,
        );
        const plain = screen.getByRole("button", { name: "Filters" });
        expect(plain).toHaveTextContent(/^Filters$/);
        expect(classes(plain)).not.toContain("border-foreground");
        expect(classes(plain)).not.toContain("shrink-0");
        rerender(
            <MoreFilters title="Filter orders" count={2}>
                <span>Step</span>
            </MoreFilters>,
        );
        const on = screen.getByRole("button", { name: "Filters, 2 on" });
        expect(on).toHaveTextContent(/^Filters\s?2$/);
        expect(classes(on)).toContain("border-foreground");
    });

    it("opens its filters in a named popover, one to a line", () => {
        render(
            <MoreFilters title="Filter orders" count={0}>
                <span>Step</span>
                <span>Payment</span>
            </MoreFilters>,
        );
        expect(screen.queryByText("Step")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Filters" }));
        const panel = screen.getByRole("dialog", { name: "Filter orders" });
        expect(within(panel).getByText("Payment")).toBeInTheDocument();
        expect(classes(panel)).toContain("grid");
    });
});

describe("ListPaging", () => {
    it("ends a list with Previous and Next together, on the right", () => {
        render(
            <ListPaging
                label="Pages of orders"
                previous={{ href: "/orders" }}
                next={{ href: "/orders?cursor=b" }}
            />,
        );
        const nav = screen.getByRole("navigation", { name: "Pages of orders" });
        expect(classes(nav)).toContain("justify-end");
        const links = within(nav).getAllByRole("link");
        expect(links.map((l) => l.textContent)).toEqual(["Previous", "Next"]);
        expect(links[1]).toHaveAttribute("href", "/orders?cursor=b");
    });

    it("turns a way off when there is nowhere to go, and keeps both words", () => {
        const onNext = vi.fn();
        render(
            <ListPaging
                label="Pages of customers"
                previous={null}
                next={{ onClick: onNext }}
            />,
        );
        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(onNext).toHaveBeenCalledTimes(1);
    });

    it("draws nothing for a list of one page", () => {
        const { container } = render(
            <ListPaging label="Pages" previous={null} next={null} />,
        );
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

    it('keeps its words clear of the "/" hint, and says what it searches as its description', () => {
        render(
            <ListSearch
                placeholder="Search customers"
                describe="By name, phone or email"
                onSearch={vi.fn()}
            />,
        );
        const field = screen.getByRole("searchbox", {
            name: "Search customers",
        });
        expect(field).toHaveAttribute(
            "aria-description",
            "By name, phone or email",
        );
        // Room on the right for the hint: the placeholder ran under it.
        expect(classes(field)).toContain("pr-9");
        expect(classes(field)).not.toContain("pr-3");
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

    it("says what it filters when nothing is narrowed, and how many once something is", () => {
        const { rerender } = render(
            <ListFilter
                label="Order status"
                value="all"
                onValueChange={vi.fn()}
                options={STATUSES}
            />,
        );
        const box = () =>
            screen.getByRole("combobox", { name: "Order status" });
        // The unnarrowed choice names the thing, with no count of its own:
        // the page header already says how many there are.
        expect(box()).toHaveTextContent(/^All orders$/);
        const pick = (value: string) =>
            rerender(
                <ListFilter
                    label="Order status"
                    value={value}
                    onValueChange={vi.fn()}
                    options={STATUSES}
                />,
            );
        pick("open");
        expect(box()).toHaveTextContent(/^Open 3$/);
        const count = must(box().querySelector("[data-value-count]"));
        expect(classes(count)).toEqual(
            expect.arrayContaining(["tabular-nums", "text-muted-foreground"]),
        );
        // Zero is a fact, and is said. A count nobody could read is not.
        pick("refunded");
        expect(box()).toHaveTextContent(/^Refunded 0$/);
        pick("odd");
        expect(box()).toHaveTextContent(/^Unknown$/);
    });

    it("draws each option's count as a quiet number at its right, and tells the list what was chosen", () => {
        const onValueChange = vi.fn();
        render(
            <ListFilter
                label="Order status"
                value="all"
                onValueChange={onValueChange}
                options={[
                    ...STATUSES,
                    { value: "big", label: "Old", count: 1204 },
                ]}
            />,
        );
        fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
        const options = screen.getAllByRole("option");
        expect(options.map((o) => o.textContent.replace(/\s+/g, " "))).toEqual([
            "All orders 532",
            "Open 3",
            "Refunded 0",
            "Unknown",
            "Old 1,204",
        ]);
        const aside = must(options[1].querySelector("[data-option-count]"));
        expect(classes(aside)).toEqual(
            expect.arrayContaining([
                "ml-auto",
                "tabular-nums",
                "text-muted-foreground",
            ]),
        );
        expect(options[3].querySelector("[data-option-count]")).toBeNull();
        fireEvent.keyDown(options[1], { key: "Enter" });
        expect(onValueChange).toHaveBeenCalledWith("open");
    });

    it("takes the selected look once it narrows the list. A sort never does", () => {
        const draw = (value: string, narrowed?: boolean) =>
            render(
                <ListFilter
                    label="Order status"
                    value={value}
                    narrowed={narrowed}
                    onValueChange={vi.fn()}
                    options={STATUSES}
                />,
            );
        const first = draw("all");
        expect(classes(screen.getByRole("combobox"))).not.toContain(
            "border-foreground",
        );
        first.unmount();
        const picked = draw("open");
        expect(classes(screen.getByRole("combobox"))).toContain(
            "border-foreground",
        );
        expect(
            picked.container.querySelector("[data-list-filter]"),
        ).toHaveAttribute("data-narrowed");
        picked.unmount();
        // A sort on any option but its first narrows nothing.
        draw("open", false);
        expect(classes(screen.getByRole("combobox"))).not.toContain(
            "border-foreground",
        );
    });

    it("is never a tab, a radio or a chip", () => {
        const { container } = render(
            <ListFilter
                label="Order status"
                value="open"
                onValueChange={vi.fn()}
                options={STATUSES}
            />,
        );
        expect(
            container.querySelector(
                '[role="tab"],[role="radio"],[aria-pressed],[data-count-badge]',
            ),
        ).toBeNull();
        expect(container.textContent).not.toContain("·");
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

describe("AttentionToggle", () => {
    it("is an on/off button named with its count, in the attention tone while something waits", () => {
        const onToggle = vi.fn();
        const { container } = render(
            <AttentionToggle
                label="Needs you"
                count={4}
                on={false}
                onToggle={onToggle}
            />,
        );
        const toggle = screen.getByRole("button", { name: "Needs you 4" });
        expect(toggle).toHaveAttribute("aria-pressed", "false");
        const badge = must(container.querySelector("[data-count-badge]"));
        expect(badge).toHaveAttribute("data-tone", "strong");
        expect(container.textContent).not.toContain("·");
        fireEvent.click(toggle);
        expect(onToggle).toHaveBeenCalledTimes(1);
        // Saroh's own words: readable in a session recording.
        expect(toggle).toHaveAttribute("data-ph-unmask");
    });

    it("is a plain chip at zero, when unknown, and once it is on", () => {
        const { container, rerender } = render(
            <AttentionToggle
                label="Needs you"
                count={0}
                on={false}
                onToggle={vi.fn()}
            />,
        );
        expect(screen.getByRole("button")).toHaveAccessibleName("Needs you 0");
        expect(container.querySelector("[data-count-badge]")).toBeNull();
        rerender(
            <AttentionToggle label="Needs you" on={false} onToggle={vi.fn()} />,
        );
        expect(screen.getByRole("button")).toHaveAccessibleName("Needs you");
        rerender(
            <AttentionToggle
                label="Needs you"
                count={4}
                on
                onToggle={vi.fn()}
            />,
        );
        const on = screen.getByRole("button", { name: "Needs you 4" });
        expect(on).toHaveAttribute("aria-pressed", "true");
        expect(classes(on)).toContain("bg-primary");
        // On the Ink fill an Ink badge would vanish: a quiet number.
        expect(container.querySelector("[data-count-badge]")).toBeNull();
    });

    it("is the dropdowns' height, and may shrink with the row", () => {
        render(
            <AttentionToggle label="Needs you" on={false} onToggle={vi.fn()} />,
        );
        const cls = classes(screen.getByRole("button"));
        expect(cls).toEqual(
            expect.arrayContaining(["h-[38px]", "coarse:h-11", "min-w-0"]),
        );
        expect(cls).not.toContain("shrink-0");
        expect(cls).not.toContain("h-8");
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

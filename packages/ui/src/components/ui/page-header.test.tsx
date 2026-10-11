import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { countLabel, PageHeader } from "./page-header";

/**
 * The one page header: where the page sits, its title, how many it holds,
 * then what is not a button, then the buttons. Each slot is pinned here
 * because a screen that can't find its slot draws a header of its own.
 */
describe("PageHeader", () => {
    it("draws the title as the page's one heading", () => {
        render(<PageHeader title="Orders" />);
        const headings = screen.getAllByRole("heading");
        expect(headings).toHaveLength(1);
        expect(headings[0].tagName).toBe("H1");
        expect(headings[0]).toHaveTextContent("Orders");
    });

    it("wraps a long title, balanced, and never cuts it", () => {
        render(<PageHeader title="A very long business name indeed" />);
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1.className).toContain("text-balance");
        expect(h1.className).not.toContain("truncate");
        expect(h1.className).toContain("text-[30px]");
    });

    it("names the breadcrumb and marks the page itself as current", () => {
        render(
            <PageHeader
                title="Orders"
                breadcrumb={[
                    <a key="s" href="/sell">
                        Sell
                    </a>,
                    "Orders",
                ]}
            />,
        );
        const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(nav).getByRole("link", { name: "Sell" })).toHaveAttribute(
            "href",
            "/sell",
        );
        const current = nav.querySelector('[aria-current="page"]');
        expect(current).toHaveTextContent("Orders");
        // The breadcrumb comes before the title, for the eye and the keyboard.
        expect(
            nav.compareDocumentPosition(screen.getByRole("heading")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("draws no breadcrumb when there is none", () => {
        render(<PageHeader title="Orders" />);
        expect(screen.queryByRole("navigation")).toBeNull();
    });

    it("puts the count beside the title, outside the heading", () => {
        const { container } = render(
            <PageHeader title="Bookings" count="3 bookings" />,
        );
        const count = container.querySelector('[data-slot="page-count"]');
        expect(count).toHaveTextContent("3 bookings");
        expect(screen.getByRole("heading")).toHaveTextContent(/^Bookings$/);
    });

    it("draws no count when the caller passes none", () => {
        const { container } = render(
            <PageHeader title="Bookings" count={undefined} />,
        );
        expect(container.querySelector('[data-slot="page-count"]')).toBeNull();
    });

    it("puts a record's pills beside its name, outside the heading", () => {
        const { container } = render(
            <PageHeader title="INV-0020" badge={<span>Paid</span>} />,
        );
        expect(
            container.querySelector('[data-slot="page-badge"]'),
        ).toHaveTextContent("Paid");
        expect(screen.getByRole("heading")).toHaveTextContent(/^INV-0020$/);
    });

    it("puts meta before the actions, and the actions last", () => {
        const { container } = render(
            <PageHeader
                title="Invoices"
                meta={<span>Owed to you</span>}
                actions={
                    <>
                        <button type="button">Export</button>
                        <button type="button">New invoice</button>
                    </>
                }
            />,
        );
        const meta = container.querySelector('[data-slot="page-meta"]');
        const actions = container.querySelector('[data-slot="page-actions"]');
        if (!meta || !actions) throw new Error("meta and actions are drawn");
        expect(
            meta.compareDocumentPosition(actions) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        const buttons = within(actions as HTMLElement).getAllByRole("button");
        expect(buttons.at(-1)).toHaveTextContent("New invoice");
    });

    it("reaches the actions by keyboard in the order they are drawn", () => {
        render(
            <PageHeader
                title="Customers"
                breadcrumb={[
                    <a key="s" href="/sell">
                        Sell
                    </a>,
                    "Customers",
                ]}
                actions={
                    <>
                        <button type="button">Import</button>
                        <button type="button">New customer</button>
                    </>
                }
            />,
        );
        const stops = screen
            .getAllByRole("link")
            .concat(screen.getAllByRole("button"))
            .map((el) => el.textContent);
        expect(stops).toEqual(["Sell", "Import", "New customer"]);
    });

    it("draws a record's picture before its name, hidden from no one's title", () => {
        const { container } = render(
            <PageHeader title="Priya Raman" lead={<div aria-hidden>PR</div>} />,
        );
        expect(
            container.querySelector('[data-slot="page-lead"]'),
        ).toHaveTextContent("PR");
        expect(screen.getByRole("heading")).toHaveTextContent(/^Priya Raman$/);
    });

    it("holds the picture to its own size, so a large photo leaves the title its room", () => {
        // An inline link around a 1600px photo, in a block box, was as wide
        // as the photo and squeezed the title to nothing.
        const { container } = render(
            <PageHeader
                title="Rosehip Face Oil"
                lead={
                    <a href="/photos">
                        <img src="/cover.jpg" alt="" />
                    </a>
                }
            />,
        );
        const lead = container.querySelector('[data-slot="page-lead"]');
        expect(lead?.className.split(" ")).toEqual(
            expect.arrayContaining(["flex", "shrink-0"]),
        );
    });

    it("lets the actions wrap on a phone, and holds their width only from sm up", () => {
        const { container } = render(
            <PageHeader
                title="Priya Raman"
                actions={<button type="button">Edit details</button>}
            />,
        );
        const classes =
            container
                .querySelector('[data-slot="page-actions"]')
                ?.className.split(" ") ?? [];
        expect(classes).toEqual(
            expect.arrayContaining(["flex-wrap", "min-w-0", "sm:shrink-0"]),
        );
        expect(classes).not.toContain("shrink-0");
    });
});

/**
 * The actions are level with the title, whatever is under it. Side by side,
 * Stock and Locations (a description) sat lower than Customers and Discount
 * codes (none), and a record with a picture sat at the top: three heights
 * for the same button.
 */
describe("PageHeader: the actions are level with the title", () => {
    const actions = <button type="button">New thing</button>;
    const cases = [
        [
            "a bare title",
            <PageHeader key="a" title="Customers" actions={actions} />,
        ],
        [
            "a description under it",
            <PageHeader
                key="b"
                title="Stock"
                description="Hill Road and Online."
                actions={actions}
            />,
        ],
        [
            "a description of several lines",
            <PageHeader
                key="c"
                title="Services"
                description={
                    <>
                        <p>One line.</p>
                        <p>And another.</p>
                    </>
                }
                actions={actions}
            />,
        ],
        [
            "a picture before it",
            <PageHeader
                key="d"
                title="Priya Raman"
                lead={<div aria-hidden>PR</div>}
                description="Since 2024."
                actions={actions}
            />,
        ],
        [
            "a count, a badge and a meta figure",
            <PageHeader
                key="e"
                title="Invoices"
                count="12 invoices"
                badge={<span>Paid</span>}
                meta={<span>Owed to you</span>}
                actions={actions}
            />,
        ],
    ] as const;

    const parts = (container: HTMLElement) => {
        const side = container.querySelector<HTMLElement>(
            '[data-slot="page-side"]',
        );
        if (!side?.parentElement) throw new Error("no side column");
        return {
            row: side.parentElement.className.split(" "),
            side: side.className.split(" "),
        };
    };

    it.each(cases)("with %s", (_name, header) => {
        const { container } = render(header);
        const { row, side } = parts(container);
        // Title block and side column both start at the row's top...
        expect(row).toContain("sm:items-start");
        // ...never on the description's last line, never the row's middle.
        expect(row).not.toContain("sm:items-end");
        expect(row).not.toContain("sm:items-center");
        // ...and the buttons are centred on the title's first line.
        expect(side).toEqual(
            expect.arrayContaining(["sm:-mt-[2.5px]", "sm:min-h-[38px]"]),
        );
        expect(side).toContain("items-center");
    });

    it("draws every case the same way: one alignment, not one per slot", () => {
        const seen = new Set(
            cases.map(([, header]) => {
                const { container, unmount } = render(header);
                const { row, side } = parts(container);
                unmount();
                return `${row.join(" ")} | ${side.join(" ")}`;
            }),
        );
        expect(seen.size).toBe(1);
    });

    it("lifts the side column by half the gap between a button and the title's line", () => {
        const { container } = render(
            <PageHeader title="Orders" actions={actions} />,
        );
        const h1 = screen.getByRole("heading", { level: 1 }).className;
        const size = Number(/text-\[(\d+)px\]/.exec(h1)?.[1]);
        const leading = Number(/leading-\[([\d.]+)\]/.exec(h1)?.[1]);
        const { side } = parts(container);
        const button = Number(/sm:min-h-\[(\d+)px\]/.exec(side.join(" "))?.[1]);
        const lift = Number(/sm:-mt-\[([\d.]+)px\]/.exec(side.join(" "))?.[1]);
        // 30px at 1.1 is a 33px line; a default button is 38px.
        expect(size * leading).toBeCloseTo(33);
        expect(button).toBe(38);
        // Both start at the top, so the button's middle (19px) is brought
        // to the title line's (16.5px) by lifting it 2.5px.
        expect(lift).toBeCloseTo((button - size * leading) / 2);
        expect(button / 2 - lift).toBeCloseTo((size * leading) / 2);
    });

    it("stacks under the title on a phone, where nothing is lifted", () => {
        const { container } = render(
            <PageHeader title="Orders" actions={actions} />,
        );
        const { row, side } = parts(container);
        expect(row).toEqual(
            expect.arrayContaining(["flex-col", "sm:flex-row"]),
        );
        // Only `sm:` variants move it: no bare negative margin.
        expect(side.filter((c) => c.startsWith("-mt-"))).toEqual([]);
    });

    it("draws no side column when there is nothing for it", () => {
        const { container } = render(<PageHeader title="Orders" />);
        expect(container.querySelector('[data-slot="page-side"]')).toBeNull();
    });
});

describe("countLabel", () => {
    const noun = { one: "booking", other: "bookings" };

    it("says how many in the thing's own word", () => {
        expect(countLabel(1, noun)).toBe("1 booking");
        expect(countLabel(3, noun)).toBe("3 bookings");
    });

    it("says nothing at zero, or when the count isn't known", () => {
        expect(countLabel(0, noun)).toBeUndefined();
        expect(countLabel(null, noun)).toBeUndefined();
        expect(countLabel(undefined, noun)).toBeUndefined();
    });

    it("groups thousands the Indian way", () => {
        expect(countLabel(123456, noun)).toBe("1,23,456 bookings");
    });
});

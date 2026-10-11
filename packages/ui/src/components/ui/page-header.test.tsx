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

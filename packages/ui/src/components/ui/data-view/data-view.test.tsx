import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataView } from "./data-view";
import type { DataColumn } from "./types";
import { phoneModeFor, resolveViewMode } from "./use-view-mode";

/**
 * The density rules (Phone Tables audit T8). What jsdom cannot show is the
 * 760px media rule itself; these pin the decisions on either side of it, and
 * that the server's HTML carries both renderings behind that rule rather than
 * guessing one.
 */
describe("resolveViewMode", () => {
    const both = ["table", "list"] as const;

    it("draws the list on a phone, whatever was saved", () => {
        expect(
            resolveViewMode({
                available: [...both],
                defaultMode: "table",
                wide: false,
                saved: "table",
            }),
        ).toBe("list");
    });

    it("draws the saved choice on a desk", () => {
        expect(
            resolveViewMode({
                available: [...both],
                defaultMode: "table",
                wide: true,
                saved: "list",
            }),
        ).toBe("list");
    });

    it("draws the view's default on a desk with nothing saved", () => {
        expect(
            resolveViewMode({
                available: [...both],
                defaultMode: "table",
                wide: true,
            }),
        ).toBe("table");
    });

    it("ignores a saved mode the view does not offer", () => {
        expect(
            resolveViewMode({
                available: [...both],
                defaultMode: "table",
                wide: true,
                saved: "grid",
            }),
        ).toBe("table");
    });

    it("keeps the default on a phone when the view has no list", () => {
        expect(phoneModeFor(["table", "grid"], "grid")).toBe("grid");
        expect(
            resolveViewMode({
                available: ["table", "grid"],
                defaultMode: "grid",
                wide: false,
                saved: "table",
            }),
        ).toBe("grid");
    });
});

interface Row {
    id: string;
    name: string;
    note: string;
}

const rows: Row[] = [{ id: "a", name: "Asha Rao", note: "Paid in cash" }];
const columns: DataColumn<Row>[] = [
    {
        id: "name",
        header: "Name",
        priority: "primary",
        cell: (r) => r.name,
    },
    {
        id: "note",
        header: "Note",
        priority: "detail",
        cell: (r) => r.note,
    },
];

function view(viewId: string, more: { showTotal?: boolean } = {}) {
    return (
        <DataView
            viewId={viewId}
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            noun={{ one: "customer", other: "customers" }}
            searchableColumnIds={["name"]}
            {...more}
        />
    );
}

function setWidth(wide: boolean) {
    vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({
            matches: wide,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    );
}

describe("DataView — first paint", () => {
    it("serves both renderings, each behind the 760px rule", () => {
        const html = renderToString(view("first-paint"));
        const doc = new DOMParser().parseFromString(html, "text/html");
        const desk = doc.querySelector('[data-view-slot="desk"]');
        const phone = doc.querySelector('[data-view-slot="phone"]');

        expect(desk?.className).toBe("hidden min-[760px]:block");
        expect(desk?.querySelector("table")).not.toBeNull();
        expect(phone?.className).toBe("min-[760px]:hidden");
        expect(phone?.querySelector("ul")).not.toBeNull();
        expect(phone?.querySelector("table")).toBeNull();
        // The list still drops detail columns.
        expect(phone?.textContent).not.toContain("Paid in cash");
    });
});

describe("DataView — on the client", () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(() => vi.unstubAllGlobals());

    it("draws only the list on a phone, even with table saved", () => {
        setWidth(false);
        window.localStorage.setItem("saroh-view-mode:phone-saved", "table");
        render(view("phone-saved"));

        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.getByRole("list")).toBeInTheDocument();
        expect(screen.queryByText("Paid in cash")).toBeNull();
    });

    it("draws the saved list on a desk", () => {
        setWidth(true);
        window.localStorage.setItem("saroh-view-mode:desk-saved", "list");
        render(view("desk-saved"));

        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.getByRole("list")).toBeInTheDocument();
    });

    it("draws the table on a desk with nothing saved, in a labelled region", () => {
        setWidth(true);
        render(view("desk-default"));

        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(
            screen.getByRole("region", { name: "Customers" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Paid in cash")).toBeInTheDocument();
    });
});

/**
 * The count is said in the thing's own word, and once: a screen whose page
 * header carries it tells the list to keep quiet until it is narrowed.
 */
describe("DataView — how many", () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(() => vi.unstubAllGlobals());

    it("says the total in the thing's own word", () => {
        setWidth(true);
        render(view("count-own-word"));
        expect(screen.getByText("1 customer")).toBeInTheDocument();
        expect(screen.queryByText(/\brows?\b/)).toBeNull();
    });

    it("leaves the total to the page header when told to", () => {
        setWidth(true);
        render(view("count-in-header", { showTotal: false }));
        expect(screen.queryByText("1 customer")).toBeNull();
    });
});

/**
 * A list's own toolbar and table (the one list anatomy): search first, the
 * count on the right, the named subsets as chips under them, never tabs,
 * then the table with its tinted head band.
 */
describe("DataView — the one toolbar and the one table", () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(() => vi.unstubAllGlobals());

    const many: Row[] = [
        { id: "a", name: "Asha Rao", note: "Paid in cash" },
        { id: "b", name: "Bela Shah", note: "Owes" },
        { id: "c", name: "Chitra Nair", note: "Owes" },
    ];
    const filtered = (more: Record<string, unknown> = {}) => (
        <DataView
            viewId="anatomy"
            rows={many}
            columns={[
                ...columns,
                {
                    id: "spent",
                    header: "Spent",
                    priority: "secondary",
                    numeric: true,
                    cell: () => "1,200",
                },
            ]}
            rowKey={(r) => r.id}
            noun={{ one: "customer", other: "customers" }}
            searchableColumnIds={["name"]}
            filters={[
                { id: "all", label: "All" },
                {
                    id: "owes",
                    label: "Owes",
                    predicate: (r) => r.note === "Owes",
                },
                { id: "none", label: "Lapsed", predicate: () => false },
            ]}
            {...more}
        />
    );

    it("draws the named subsets as chips with their counts, never as tabs", () => {
        setWidth(true);
        const { container } = render(filtered());
        const group = screen.getByRole("radiogroup", { name: "Show" });
        expect(group).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: "All 3" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Owes 2" })).not.toBeChecked();
        // Zero is a fact, so it is said.
        expect(screen.getByRole("radio", { name: "Lapsed 0" })).toBeVisible();
        expect(screen.queryByRole("tab")).toBeNull();
        expect(screen.queryByRole("tablist")).toBeNull();
        expect(container.querySelector("[data-tab-strip]")).toBeNull();
        expect(container.querySelector("[data-count-badge]")).toBeNull();
    });

    it("narrows the rows when a chip is pressed, and says how many are showing", () => {
        setWidth(true);
        render(filtered());
        screen.getByRole("radio", { name: "Owes 2" }).click();
        return screen.findByText("2 of 3 customers").then(() => {
            expect(screen.queryByText("Asha Rao")).toBeNull();
            expect(screen.getByText("Bela Shah")).toBeInTheDocument();
        });
    });

    it("orders the toolbar: search, then the count on the right, then the chips, then the table", () => {
        setWidth(true);
        const { container } = render(filtered());
        const at = (selector: string) => {
            const el = container.querySelector(selector);
            if (!el) throw new Error(`no ${selector}`);
            return el;
        };
        const order = [
            at('[data-slot="list-search"]'),
            at('[data-slot="list-end"]'),
            at('[data-slot="list-chips"]'),
            at("table"),
        ];
        for (let i = 0; i < order.length - 1; i++) {
            expect(
                order[i].compareDocumentPosition(order[i + 1]) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        }
        expect(at('[data-slot="list-count"]')).toHaveTextContent("3 customers");
        expect(
            screen.getByRole("searchbox", { name: "Search customers" }),
        ).toBeInTheDocument();
    });

    it("takes a screen's own search, dropdown filters, sort and chips in the same slots", () => {
        setWidth(true);
        const { container } = render(
            <DataView
                viewId="own-slots"
                rows={many}
                columns={columns}
                rowKey={(r) => r.id}
                noun={{ one: "product", other: "products" }}
                toolbarSearch={<input aria-label="Search products" />}
                toolbarExtra={<button type="button">Category</button>}
                toolbarEnd={<button type="button">Sort</button>}
                toolbarChips={<div data-testid="own-chips">Live</div>}
            />,
        );
        const inSlot = (slot: string) =>
            container.querySelector(`[data-slot="${slot}"]`)?.textContent;
        expect(
            container
                .querySelector('[data-slot="list-search"]')
                ?.querySelector("input"),
        ).toHaveAccessibleName("Search products");
        expect(inSlot("list-filters")).toBe("Category");
        expect(inSlot("list-end")).toContain("Sort");
        expect(inSlot("list-chips")).toBe("Live");
    });

    it("draws the table's head as a tinted band of small uppercase labels, rows ruled edge to edge", () => {
        setWidth(true);
        const { container } = render(filtered());
        const headRow = container.querySelector("thead tr");
        expect(headRow?.className.split(" ")).toEqual(
            expect.arrayContaining(["bg-muted", "border-b", "h-10"]),
        );
        const heads = Array.from(container.querySelectorAll("thead th"));
        for (const th of heads) {
            expect(th.className.split(" ")).toEqual(
                expect.arrayContaining(["label", "px-[14px]"]),
            );
        }
        // Figures: right-aligned, head and cell alike, in tabular numerals.
        const spent = heads.find((th) => th.textContent === "Spent");
        expect(spent?.className.split(" ")).toContain("text-right");
        const cell = container.querySelector("tbody tr td:last-child");
        expect(cell?.className.split(" ")).toEqual(
            expect.arrayContaining([
                "text-right",
                "tabular-nums",
                "px-[14px]",
                "py-[11px]",
            ]),
        );
        const row = container.querySelector("tbody tr");
        expect(row?.className.split(" ")).toEqual(
            expect.arrayContaining([
                "border-b",
                "last:border-b-0",
                "hover:bg-foreground/[0.035]",
            ]),
        );
        // The frame carries no side padding, so the rules reach its edges.
        const frame = container.querySelector("table")?.closest(".border");
        expect(frame?.className).not.toMatch(/(^| )p[xlr]?-/);
    });

    it("draws the phone's list in the same card, with the same rules", () => {
        setWidth(false);
        const { container } = render(filtered());
        const list = screen.getByRole("list");
        expect(list.className.split(" ")).toEqual(
            expect.arrayContaining(["overflow-hidden", "border", "bg-card"]),
        );
        const item = container.querySelector("li");
        expect(item?.className.split(" ")).toEqual(
            expect.arrayContaining(["border-b", "last:border-b-0"]),
        );
    });
});

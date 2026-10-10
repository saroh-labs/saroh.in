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

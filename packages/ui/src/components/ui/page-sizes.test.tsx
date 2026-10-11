import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ROWS_COOKIE, readRowsCookie, writeRowsCookie } from "../../lib/paging";
import { PageSizes, rememberPageSize, useLocalPages } from "./page-sizes";

const cookie = () =>
    decodeURIComponent(
        document.cookie
            .split("; ")
            .find((c) => c.startsWith(`${ROWS_COOKIE}=`))
            ?.slice(ROWS_COOKIE.length + 1) ?? "",
    );

afterEach(() => {
    document.cookie = `${ROWS_COOKIE}=; path=/; max-age=0`;
});

describe("the rows cookie", () => {
    it("reads each list's size, and nothing it doesn't know", () => {
        expect(readRowsCookie("orders:25,customers:10")).toEqual({
            orders: 25,
            customers: 10,
        });
        expect(readRowsCookie("orders:37,<x>:10,,leads")).toEqual({});
        expect(readRowsCookie(undefined)).toEqual({});
    });

    it("leaves the default out", () => {
        expect(writeRowsCookie({ orders: 25, leads: 50 })).toBe("orders:25");
    });

    it("keeps one list's choice beside another's", () => {
        rememberPageSize("orders", 25);
        rememberPageSize("leads", 100);
        expect(readRowsCookie(cookie())).toEqual({ orders: 25, leads: 100 });
        // Back to the default is forgotten, not written.
        rememberPageSize("orders", 50);
        expect(readRowsCookie(cookie())).toEqual({ leads: 100 });
    });
});

const ROWS = Array.from({ length: 60 }, (_, i) => `row ${i + 1}`);

function List({ resetOn = "" }: { resetOn?: string }) {
    const { rows, paging } = useLocalPages("things", ROWS, {
        label: "Pages of things",
        resetOn,
    });
    return (
        <div>
            <ul>
                {rows.map((r) => (
                    <li key={r}>{r}</li>
                ))}
            </ul>
            {paging}
        </div>
    );
}

describe("useLocalPages", () => {
    it("opens at the size the browser last chose, a page at a time", () => {
        render(
            <PageSizes initial={{ things: 25 }}>
                <List />
            </PageSizes>,
        );
        expect(screen.getAllByText(/^row /)).toHaveLength(25);
        fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
        expect(screen.getAllByText(/^row /).map((l) => l.textContent)).toEqual(
            ROWS.slice(50),
        );
    });

    it("starts again at the first page when what is listed changes", () => {
        const { rerender } = render(
            <PageSizes initial={{ things: 10 }}>
                <List resetOn="all" />
            </PageSizes>,
        );
        fireEvent.click(screen.getByRole("button", { name: "Page 4" }));
        expect(screen.getAllByText(/^row /)[0]).toHaveTextContent("row 31");
        rerender(
            <PageSizes initial={{ things: 10 }}>
                <List resetOn="late" />
            </PageSizes>,
        );
        expect(screen.getAllByText(/^row /)[0]).toHaveTextContent("row 1");
    });
});

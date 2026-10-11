"use client";

import * as React from "react";

import {
    DEFAULT_PAGE_SIZE,
    ROWS_COOKIE,
    pagesOf,
    readRowsCookie,
    writeRowsCookie,
} from "../../lib/paging";
import { ListPaging } from "./list-toolbar";

/*
 * A list keeps the rows-per-page someone chose, between visits.
 *
 * The choice is kept per list, in one cookie (`ROWS_COOKIE`), so the
 * server can read it and draw the right number of rows the first time:
 * a size read only in the browser would draw 50 rows and then jump. The
 * shell hands the cookie's sizes to `PageSizes`; a list reads its own
 * with `usePageSize("orders")`, and choosing another writes it back.
 */

interface Sizes {
    sizes: Record<string, number>;
    choose: (list: string, size: number) => void;
}

const Context = React.createContext<Sizes | null>(null);

const YEAR = 60 * 60 * 24 * 365;

/** Keep `list`'s size for this browser's next visit. */
export function rememberPageSize(list: string, size: number): void {
    if (typeof document === "undefined") return;
    const found = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${ROWS_COOKIE}=`));
    const sizes = readRowsCookie(
        found ? decodeURIComponent(found.slice(ROWS_COOKIE.length + 1)) : "",
    );
    sizes[list] = size;
    document.cookie = `${ROWS_COOKIE}=${encodeURIComponent(
        writeRowsCookie(sizes),
    )}; path=/; max-age=${YEAR}; samesite=lax`;
}

export function PageSizes({
    initial,
    children,
}: {
    /** The cookie's sizes, as the server read them. */
    initial: Record<string, number>;
    children: React.ReactNode;
}) {
    const [sizes, setSizes] = React.useState(initial);
    const choose = React.useCallback((list: string, size: number) => {
        setSizes((prev) => ({ ...prev, [list]: size }));
        rememberPageSize(list, size);
    }, []);
    const value = React.useMemo(() => ({ sizes, choose }), [sizes, choose]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * `list`'s rows per page and how to change it. Outside `PageSizes` (a
 * test, a page with no shell) it is plain state that starts at 50.
 */
export function usePageSize(list: string): [number, (size: number) => void] {
    const shared = React.useContext(Context);
    const [own, setOwn] = React.useState(DEFAULT_PAGE_SIZE);
    const set = React.useCallback(
        (size: number) => {
            if (shared) shared.choose(list, size);
            else {
                setOwn(size);
                rememberPageSize(list, size);
            }
        },
        [shared, list],
    );
    return [shared ? (shared.sizes[list] ?? DEFAULT_PAGE_SIZE) : own, set];
}

/**
 * Pages over rows the screen already holds (a list read whole): the rows
 * of the page on screen, and the footer that moves between them. The size
 * is `list`'s own, kept between visits. A page past the end (the list
 * just got shorter) is the last one; pass `resetOn` (the search, the tab,
 * the sort) and a change of it starts again at page 1.
 *
 *     const { rows, paging } = useLocalPages("invoices", shown, {
 *         label: "Pages of invoices",
 *         resetOn: `${tab}|${search}`,
 *     });
 *     …rows.map(…)…  then  {paging}  under the table.
 */
export function useLocalPages<T>(
    list: string,
    all: readonly T[],
    { label, resetOn = "" }: { label: string; resetOn?: string },
): { rows: readonly T[]; paging: React.ReactNode; page: number } {
    const [size, setSize] = usePageSize(list);
    const [asked, setAsked] = React.useState({ page: 1, on: resetOn });
    const wanted = asked.on === resetOn ? asked.page : 1;
    const page = Math.min(wanted, pagesOf(all.length, size));
    const rows = React.useMemo(
        () => all.slice((page - 1) * size, page * size),
        [all, page, size],
    );
    const paging = (
        <ListPaging
            label={label}
            page={page}
            total={all.length}
            size={size}
            to={(n) => ({ onClick: () => setAsked({ page: n, on: resetOn }) })}
            onSize={(next) => {
                setSize(next);
                setAsked({ page: 1, on: resetOn });
            }}
        />
    );
    return { rows, paging, page };
}

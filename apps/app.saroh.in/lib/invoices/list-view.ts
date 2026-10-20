import type { SearchParams } from "@/lib/views/search-params";

import type { Invoice } from "./service";
import type { InvoiceTab } from "./status";
import { inTab, isOwed, tabFromView } from "./status";
import type { FigureKey, SummaryFilter } from "./summary";

/**
 * What the Invoices list is narrowed to, read from its address (DEC-173,
 * U8 #1120). Pure, so the page, the screen and their tests read the same.
 *
 * - `?tab=` (or the older `?view=`) is the status: All, Due, Overdue,
 *   Paid, Drafts. Home links `?view=overdue` and `?view=issued`.
 * - `?view=owed` is the strip's Owed: issued, overdue included.
 * - `?view=cheques` is the cheques line's: a cheque not in the bank yet.
 *   Home's "Cheques not in the bank" links it.
 * - `?paidFrom=2026-10-01` is the strip's Paid this month: money received
 *   from that day, part payments included.
 * - `?q=` is the search: a name, part of a number, or an amount.
 *
 * Owed, the cheques and Paid this month are one figure at a time, and
 * none of them is a status: picking a status puts them down.
 */
export interface ListQuery {
    tab: InvoiceTab;
    owed: boolean;
    cheques: boolean;
    /** A day in the business's zone, or null. */
    paidFrom: string | null;
    /** The search, trimmed; "" for none. */
    q: string;
}

/** The longest search the API takes (`SEARCH_MAX`). */
export const SEARCH_MAX = 80;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

export function listQueryFrom(params: SearchParams): ListQuery {
    const view = one(params.view);
    const tab = one(params.tab);
    const paidFrom = one(params.paidFrom);
    const q = (one(params.q) ?? "").trim().slice(0, SEARCH_MAX);
    const owed = !tab && view === "owed";
    const cheques = !tab && view === "cheques";
    return {
        tab: owed || cheques ? "all" : tabFromView(tab ?? view),
        owed,
        cheques,
        // A hand-edited date is no filter, never an empty list.
        paidFrom: paidFrom && DAY.test(paidFrom) ? paidFrom : null,
        q,
    };
}

/** The query needs the API to answer it: the newest page can't. */
export function readsOnServer(query: ListQuery): boolean {
    return query.q !== "" || query.cheques || query.paidFrom !== null;
}

/** Narrowed past the status: a figure or a search. */
export function narrowed(query: ListQuery): boolean {
    return (
        query.tab !== "all" ||
        query.owed ||
        query.cheques ||
        query.paidFrom !== null ||
        query.q !== ""
    );
}

/** Which of the strip's figures the list is showing, if any. */
export function figureOn(
    query: ListQuery,
    key: FigureKey,
    filter: SummaryFilter,
): boolean {
    const alone = !query.owed && !query.cheques && query.paidFrom === null;
    switch (key) {
        case "owed":
            return query.owed;
        case "overdue":
            return alone && query.tab === "overdue";
        case "drafts":
            return alone && query.tab === "draft";
        case "paid":
            return (
                query.paidFrom !== null && query.paidFrom === filter.paidFrom
            );
    }
}

/** The keys a figure, the cheques line or a status sets. */
const FIGURE_KEYS = ["tab", "view", "paidFrom", "since"] as const;

/**
 * The address with `filter` as the list's one figure, or with none
 * (`null`): the search, the source and a pack's or course's scope stay.
 */
export function withFigure(
    params: URLSearchParams,
    filter: SummaryFilter | null,
): URLSearchParams {
    const next = new URLSearchParams(params.toString());
    for (const key of FIGURE_KEYS) next.delete(key);
    if (!filter) return next;
    if (filter.paidFrom) next.set("paidFrom", filter.paidFrom);
    switch (filter.view) {
        case "owed":
            next.set("view", "owed");
            break;
        case "cheques":
            next.set("view", "cheques");
            break;
        // Overdue and Drafts are statuses too: the same filter as the
        // status dropdown's, so it reads them as chosen.
        case "overdue":
            next.set("tab", "overdue");
            break;
        case "draft":
            next.set("tab", "draft");
            break;
    }
    return next;
}

/** The address with a status chosen: a figure of its own goes. */
export function withTab(
    params: URLSearchParams,
    tab: InvoiceTab,
): URLSearchParams {
    const next = withFigure(params, null);
    // Home's "Last 24 hours" stays under a status, as before.
    const since = params.get("since");
    if (since) next.set("since", since);
    if (tab !== "all") next.set("tab", tab);
    return next;
}

/** The address with the search set, or cleared with "". */
export function withSearch(
    params: URLSearchParams,
    q: string,
): URLSearchParams {
    const next = new URLSearchParams(params.toString());
    const term = q.trim().slice(0, SEARCH_MAX);
    if (term) next.set("q", term);
    else next.delete("q");
    return next;
}

/** `/billing/invoices?…`, or the bare path with nothing left. */
export function hrefOf(pathname: string, params: URLSearchParams): string {
    const s = params.toString();
    return s ? `${pathname}?${s}` : pathname;
}

type Row = Pick<
    Invoice,
    "id" | "standing" | "kind" | "order" | "source" | "related"
> &
    Partial<Pick<Invoice, "chequeWaiting">>;

/**
 * Whether a row is one the query keeps: its status, and Owed or the
 * cheques when either is the figure. Paid this month and the search are
 * the API's, so whatever it sent for them is kept.
 */
export function inQuery(i: Row, query: ListQuery): boolean {
    if (query.owed && !isOwed(i)) return false;
    if (query.cheques && !i.chequeWaiting) return false;
    return inTab(i, query.tab);
}

/**
 * The rows the list shows, in order: those the query keeps, and a
 * correction under an invoice it keeps, which follows its invoice into
 * whatever shows it.
 */
export function shownRows<T extends Row>(
    rows: readonly T[],
    query: ListQuery,
): T[] {
    const kept = rows.filter((i) => inQuery(i, query));
    if (kept.length === rows.length) return [...rows];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return rows.filter((i) => {
        if (inQuery(i, query)) return true;
        const parent = i.related ? byId.get(i.related.id) : undefined;
        return parent !== undefined && inQuery(parent, query);
    });
}

/**
 * What an empty list says for a figure: "No invoices owed to you", "No
 * cheques waiting for the bank", "No money in since 1 Oct". Null for a
 * status or a search, which say their own.
 */
export function figureEmptyLine(
    query: ListQuery,
    day: (iso: string) => string,
): string | null {
    if (query.owed) return "No invoices owed to you";
    if (query.cheques) return "No cheques waiting for the bank";
    if (query.paidFrom) {
        return `No money in since ${day(query.paidFrom)}`;
    }
    return null;
}

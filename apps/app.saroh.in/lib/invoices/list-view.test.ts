import { describe, expect, it } from "vitest";

import type { ListQuery } from "./list-view";
import {
    figureEmptyLine,
    figureOn,
    hrefOf,
    listQueryFrom,
    narrowed,
    readsOnServer,
    shownRows,
    withFigure,
    withSearch,
    withTab,
} from "./list-view";

/**
 * What the Invoices list is narrowed to, from its address (DEC-173, U8
 * #1120): the status, the strip's figures, the cheques line and the
 * search; Home's links (`?view=overdue`, `?view=issued`, `?view=cheques`)
 * land where they say.
 */

const ALL: ListQuery = {
    tab: "all",
    owed: false,
    cheques: false,
    paidFrom: null,
    q: "",
};

describe("listQueryFrom", () => {
    it("reads Home's links", () => {
        expect(listQueryFrom({ view: "overdue" })).toEqual({
            ...ALL,
            tab: "overdue",
        });
        // "issued" was the Due tab's name.
        expect(listQueryFrom({ view: "issued" }).tab).toBe("due");
        expect(listQueryFrom({ view: "cheques" })).toEqual({
            ...ALL,
            cheques: true,
        });
    });

    it("reads the strip's Owed and Paid this month, and the search", () => {
        expect(listQueryFrom({ view: "owed" })).toEqual({ ...ALL, owed: true });
        expect(listQueryFrom({ paidFrom: "2026-10-01" }).paidFrom).toBe(
            "2026-10-01",
        );
        expect(listQueryFrom({ q: "  0106  " }).q).toBe("0106");
    });

    it("takes a hand-edited address as no filter, never an empty list", () => {
        expect(listQueryFrom({ paidFrom: "October" }).paidFrom).toBeNull();
        expect(listQueryFrom({ view: "nonsense" })).toEqual(ALL);
        expect(listQueryFrom({ q: "x".repeat(200) }).q).toHaveLength(80);
    });

    it("lets a status win over an old view", () => {
        expect(listQueryFrom({ tab: "paid", view: "cheques" })).toEqual({
            ...ALL,
            tab: "paid",
        });
    });
});

describe("what the API answers", () => {
    it("reads a search, the cheques and Paid this month on the server", () => {
        expect(readsOnServer({ ...ALL, q: "vivek" })).toBe(true);
        expect(readsOnServer({ ...ALL, cheques: true })).toBe(true);
        expect(readsOnServer({ ...ALL, paidFrom: "2026-10-01" })).toBe(true);
    });

    it("filters a status and Owed in the browser", () => {
        expect(readsOnServer({ ...ALL, tab: "overdue" })).toBe(false);
        expect(readsOnServer({ ...ALL, owed: true })).toBe(false);
        expect(narrowed(ALL)).toBe(false);
        expect(narrowed({ ...ALL, owed: true })).toBe(true);
    });
});

describe("figureOn", () => {
    it("marks Overdue and Drafts on with their status, and only alone", () => {
        const overdue = { ...ALL, tab: "overdue" as const };
        expect(figureOn(overdue, "overdue", { view: "overdue" })).toBe(true);
        expect(figureOn(overdue, "owed", { view: "owed" })).toBe(false);
        expect(
            figureOn({ ...ALL, tab: "draft" }, "drafts", { view: "draft" }),
        ).toBe(true);
    });

    it("marks Owed and Paid this month on by their own filters", () => {
        expect(figureOn({ ...ALL, owed: true }, "owed", {})).toBe(true);
        const paid = { ...ALL, paidFrom: "2026-10-01" };
        expect(figureOn(paid, "paid", { paidFrom: "2026-10-01" })).toBe(true);
        // Last month's link is not this month's figure.
        expect(figureOn(paid, "paid", { paidFrom: "2026-11-01" })).toBe(false);
    });
});

describe("the address", () => {
    const at = (s: string) => new URLSearchParams(s);

    it("sets one figure at a time and keeps the search and the source", () => {
        const from = at("q=vivek&source=MANUAL&tab=paid&since=x");
        expect(withFigure(from, { view: "owed" }).toString()).toBe(
            "q=vivek&source=MANUAL&view=owed",
        );
        expect(withFigure(from, { view: "overdue" }).toString()).toBe(
            "q=vivek&source=MANUAL&tab=overdue",
        );
        expect(withFigure(from, { paidFrom: "2026-10-01" }).toString()).toBe(
            "q=vivek&source=MANUAL&paidFrom=2026-10-01",
        );
        expect(withFigure(at("view=cheques&pack=p1"), null).toString()).toBe(
            "pack=p1",
        );
    });

    it("puts a figure down when a status is picked, and keeps Home's 24 hours", () => {
        expect(withTab(at("view=owed&since=x"), "due").toString()).toBe(
            "since=x&tab=due",
        );
        expect(withTab(at("paidFrom=2026-10-01"), "all").toString()).toBe("");
    });

    it("sets and clears the search", () => {
        expect(withSearch(at("tab=due"), " 8400 ").toString()).toBe(
            "tab=due&q=8400",
        );
        expect(withSearch(at("q=8400"), "").toString()).toBe("");
        expect(hrefOf("/billing/invoices", at(""))).toBe("/billing/invoices");
        expect(hrefOf("/billing/invoices", at("q=1"))).toBe(
            "/billing/invoices?q=1",
        );
    });
});

describe("shownRows", () => {
    const row = (
        id: string,
        standing: string,
        over: Record<string, unknown> = {},
    ) =>
        ({
            id,
            standing,
            kind: "INVOICE",
            order: null,
            source: "MANUAL",
            related: null,
            ...over,
        }) as never;

    const rows = [
        row("due", "ISSUED"),
        row("late", "OVERDUE"),
        row("paid", "PAID", { chequeWaiting: true }),
        row("cn", "ISSUED", {
            kind: "CREDIT_NOTE",
            related: { id: "late", number: "RC/0002" },
        }),
        row("order", "ISSUED", { source: "ORDER", order: { id: "o1" } }),
    ];
    const ids = (q: ListQuery) =>
        shownRows(rows, q).map((r: { id: string }) => r.id);

    it("keeps everything with nothing chosen", () => {
        expect(ids(ALL)).toEqual(["due", "late", "paid", "cn", "order"]);
    });

    it("Owed: issued and late, never an order's paper, its correction under it", () => {
        expect(ids({ ...ALL, owed: true })).toEqual(["due", "late", "cn"]);
    });

    it("the cheques: only an invoice whose cheque waits", () => {
        expect(ids({ ...ALL, cheques: true })).toEqual(["paid"]);
    });

    it("a status, with a correction following its invoice", () => {
        expect(ids({ ...ALL, tab: "overdue" })).toEqual(["late", "cn"]);
    });
});

describe("figureEmptyLine", () => {
    const day = (iso: string) => `day ${iso}`;
    it("says what each figure found none of", () => {
        expect(figureEmptyLine({ ...ALL, owed: true }, day)).toBe(
            "No invoices owed to you",
        );
        expect(figureEmptyLine({ ...ALL, cheques: true }, day)).toBe(
            "No cheques waiting for the bank",
        );
        expect(figureEmptyLine({ ...ALL, paidFrom: "2026-10-01" }, day)).toBe(
            "No money in since day 2026-10-01",
        );
        expect(figureEmptyLine({ ...ALL, tab: "paid" }, day)).toBeNull();
    });
});

import { describe, expect, it } from "vitest";

import { invoicesHref } from "./links";
import type { InvoiceKind, InvoiceSource } from "./service";
import {
    chipEmptyLine,
    chipFromQuery,
    chipsFor,
    filedUnder,
    inChip,
    scopeEmptyLine,
    scopeLine,
    scopeName,
} from "./sources";

const row = (
    id: string,
    source: InvoiceSource,
    over: { kind?: InvoiceKind; related?: { id: string } | null } = {},
) => ({ id, source, ...over });

// Every source now in the data: an online order's, a counter order's and a
// walk-in's paper are all ORDER; the rest are their own.
const ALL = [
    row("online", "ORDER"),
    row("counter", "ORDER"),
    row("walk_in", "ORDER"),
    row("booking", "BOOKING"),
    row("renewal", "SUBSCRIPTION"),
    // Written MANUAL by the API, against a renewal.
    row("renewal_cn", "MANUAL", {
        kind: "CREDIT_NOTE",
        related: { id: "renewal" },
    }),
    row("pack", "PACK"),
    row("course", "COURSE"),
    row("by_hand", "MANUAL"),
];

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("the source chips (D18)", () => {
    it("files a correction under its original", () => {
        expect(filedUnder(ALL).get("renewal_cn")).toBe("SUBSCRIPTION");
        expect(ids(inChip(ALL, "SUBSCRIPTION"))).toEqual([
            "renewal",
            "renewal_cn",
        ]);
        expect(ids(inChip(ALL, "MANUAL"))).toEqual(["by_hand"]);
    });

    it("keeps its own source when the original isn't on hand", () => {
        const alone = [
            row("cn", "MANUAL", { kind: "CREDIT_NOTE", related: { id: "x" } }),
        ];
        expect(filedUnder(alone).get("cn")).toBe("MANUAL");
    });

    it("Orders holds online, counter and walk-in papers alike", () => {
        expect(ids(inChip(ALL, "ORDER"))).toEqual([
            "online",
            "counter",
            "walk_in",
        ]);
    });

    it("All keeps every row, and every chip together covers them", () => {
        expect(inChip(ALL, "all")).toHaveLength(ALL.length);
        const covered = chipsFor(ALL, "all")
            .filter((c) => c.id !== "all")
            .flatMap((c) => ids(inChip(ALL, c.id)));
        expect(covered.sort()).toEqual(ids(ALL).sort());
    });

    it("offers a chip for each source the business has, in the design's order", () => {
        expect(chipsFor(ALL, "all").map((c) => c.label)).toEqual([
            "All",
            "Orders",
            "Bookings",
            "Subscriptions",
            "Packs",
            "Courses",
            "By hand",
        ]);
    });

    it("never offers Courses to a business with none", () => {
        const shop = [row("a", "ORDER"), row("b", "MANUAL")];
        expect(chipsFor(shop, "all").map((c) => c.label)).toEqual([
            "All",
            "Orders",
            "By hand",
        ]);
    });

    it("offers no chips at all when there is only one source", () => {
        expect(chipsFor([row("a", "ORDER"), row("b", "ORDER")], "all")).toEqual(
            [],
        );
        expect(chipsFor([], "all")).toEqual([]);
    });

    it("keeps a chip a link chose, so it can be seen and cleared", () => {
        expect(
            chipsFor([row("a", "ORDER")], "COURSE").map((c) => c.id),
        ).toEqual(["all", "ORDER", "COURSE"]);
    });

    it("reads ?source= and ignores anything else", () => {
        expect(chipFromQuery("PACK")).toBe("PACK");
        expect(chipFromQuery("pack")).toBe("all");
        expect(chipFromQuery(undefined)).toBe("all");
    });

    it("says what an empty chip is empty of", () => {
        expect(chipEmptyLine("Overdue", "PACK")).toBe(
            "No overdue invoices for packs.",
        );
        expect(chipEmptyLine("All", "COURSE")).toBe(
            "No invoices for courses yet.",
        );
        expect(chipEmptyLine("All", "MANUAL")).toBe(
            "No invoices written by hand yet.",
        );
        expect(chipEmptyLine("Drafts", "MANUAL")).toBe(
            "No draft invoices written by hand.",
        );
        expect(chipEmptyLine("Drafts", "all")).toBe("No draft invoices.");
        expect(chipEmptyLine("Paid", "all")).toBe("No paid invoices.");
    });
});

describe("one pack's or course's invoices (?pack=, ?course=)", () => {
    const morning = { kind: "pack" as const, id: "pk_1", name: "Morning" };

    it("names the pack as the design does", () => {
        expect(scopeLine(morning, 3)).toBe("Showing 3 for Morning pack");
        expect(scopeEmptyLine(morning)).toBe(
            "No invoices for Morning pack yet",
        );
    });

    it("doesn't say pack twice", () => {
        expect(scopeName({ ...morning, name: "10-class pack" })).toBe(
            "10-class pack",
        );
    });

    it("a course is named as it is", () => {
        expect(
            scopeLine({ kind: "course", id: "co_1", name: "Pottery" }, 1),
        ).toBe("Showing 1 for Pottery");
    });

    it("falls back to words when the name couldn't be read", () => {
        expect(scopeName({ ...morning, name: null })).toBe("this pack");
        expect(scopeEmptyLine({ kind: "course", id: "c", name: null })).toBe(
            "No invoices for this course yet",
        );
    });

    it("links to it, and back to the whole list", () => {
        expect(invoicesHref({ pack: "pk 1" })).toBe(
            "/billing/invoices?pack=pk%201",
        );
        expect(invoicesHref({ course: "co_1" })).toBe(
            "/billing/invoices?course=co_1",
        );
        expect(invoicesHref({ source: "PACK" })).toBe(
            "/billing/invoices?source=PACK",
        );
        expect(invoicesHref()).toBe("/billing/invoices");
    });
});

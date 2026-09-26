import { describe, expect, it } from "vitest";

import type { LogLine } from "./log";
import {
    checkWords,
    entryNote,
    entryQuantity,
    entryTone,
    entryWho,
    groupByDay,
    logCountWords,
    logKindId,
    logKinds,
} from "./log";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-09-26T06:30:00Z");

function line(over: Partial<LogLine> = {}): LogLine {
    return {
        id: "e1",
        kind: "COUNTED",
        word: "Counted",
        quantity: 0,
        before: 10,
        after: 10,
        expected: 10,
        mismatch: false,
        storeId: "h",
        storeName: "Hill Road",
        productId: "p1",
        productName: "Sourdough",
        variantTitle: null,
        pairId: null,
        undone: false,
        note: null,
        createdAt: "2026-09-26T01:42:00Z",
        by: null,
        order: null,
        ...over,
    };
}

describe("the log's filters", () => {
    it("maps a chip to the kinds it asks the API for", () => {
        expect(logKinds("in")).toEqual(["BAKED", "RECEIVED"]);
        expect(logKinds("out")).toEqual(["SOLD", "RETURNED"]);
        expect(logKinds("all")).toBeUndefined();
        expect(logKindId("wasted")).toBe("wasted");
        expect(logKindId("nonsense")).toBe("all");
        expect(logKindId(undefined)).toBe("all");
    });
});

describe("an entry", () => {
    it("colours its pill by kind, and a count that changed asks a look", () => {
        expect(entryTone({ kind: "BAKED", quantity: 12 })).toBe("ok");
        expect(entryTone({ kind: "WASTED", quantity: -2 })).toBe("warn");
        expect(entryTone({ kind: "COUNTED", quantity: -1 })).toBe("warn");
        expect(entryTone({ kind: "COUNTED", quantity: 0 })).toBe("muted");
        expect(entryTone({ kind: "SOLD", quantity: -1 })).toBe("muted");
        expect(entryQuantity(-2)).toEqual({ text: "−2", tone: "danger" });
        expect(entryQuantity(3)).toEqual({ text: "+3", tone: "ok" });
        expect(entryQuantity(0)).toEqual({ text: "0", tone: "muted" });
    });

    it("says what a count found", () => {
        expect(entryNote(line())).toBe("Matched the log (10)");
        expect(entryNote(line({ quantity: -2, before: 10, after: 8 }))).toBe(
            "Log expected 10, counted 8",
        );
        expect(
            entryNote(
                line({
                    quantity: -1,
                    before: 9,
                    after: 8,
                    expected: 10,
                    mismatch: true,
                }),
            ),
        ).toBe("Counted 8 against 10 shown; the log said 9");
    });

    it("says where a move went, with its note, and when it was undone", () => {
        const out = line({ kind: "MOVED", quantity: -3, note: "For the van" });
        expect(entryNote(out, { storeName: "Online" })).toBe(
            "To Online · For the van",
        );
        expect(entryNote(line({ kind: "MOVED", quantity: 3 }), null)).toBe(
            "Moved in",
        );
        expect(
            entryNote(line({ kind: "WASTED", quantity: -1, undone: true })),
        ).toBe("Undone");
    });

    it("names the order, else the person, else nobody", () => {
        expect(entryWho({ by: null, order: { id: "o", number: "1016" } })).toBe(
            "Order #1016",
        );
        expect(entryWho({ by: { id: "u", name: "Arjun" }, order: null })).toBe(
            "Arjun",
        );
        expect(entryWho({ by: null, order: null })).toBe("");
    });
});

describe("days", () => {
    it("groups newest first by the business's day", () => {
        const days = groupByDay(
            [
                line({ id: "a", createdAt: "2026-09-26T01:42:00Z" }),
                line({ id: "b", createdAt: "2026-09-25T20:00:00Z" }),
                line({ id: "c", createdAt: "2026-09-25T10:00:00Z" }),
                line({ id: "d", createdAt: "2026-09-18T01:00:00Z" }),
            ],
            TZ,
            NOW,
        );
        // 20:00 UTC on the 25th is 01:30 on the 26th in Kolkata.
        expect(days.map((d) => [d.label, d.rows.map((r) => r.id)])).toEqual([
            ["Today", ["a", "b"]],
            ["Yesterday", ["c"]],
            ["18 Sep", ["d"]],
        ]);
        expect(logCountWords(1, false)).toBe("1 entry");
        expect(logCountWords(50, true)).toBe("50 entries so far");
    });
});

describe("checks", () => {
    const base = {
        detail: "",
        storeName: "Hill Road",
        productName: "Sourdough",
        variantTitle: "800g",
        numbers: {},
        order: null,
    };

    it("says a short shelf the design's way", () => {
        expect(
            checkWords({
                ...base,
                kind: "SHORT",
                numbers: { onHand: 1, promised: 3, short: 2 },
            }),
        ).toEqual({
            title: "Sourdough 800g is 2 short at Hill Road",
            body: "3 promised to open orders, 1 on hand.",
        });
    });

    it("names the order behind a missed sale only for a role that reads orders", () => {
        expect(
            checkWords({
                ...base,
                kind: "SALE_NOT_TAKEN",
                order: { id: "o", number: "1014" },
            }).title,
        ).toBe("Order #1014 was fulfilled, but nothing left stock");
        expect(checkWords({ ...base, kind: "SALE_NOT_TAKEN" }).title).toBe(
            "An order was fulfilled, but nothing left stock",
        );
        expect(
            checkWords({
                ...base,
                kind: "PROMISED_MISMATCH",
                detail: "Shows 3 promised at Hill Road; open orders hold 0.",
            }).body,
        ).toBe("Shows 3 promised at Hill Road; open orders hold 0.");
    });
});

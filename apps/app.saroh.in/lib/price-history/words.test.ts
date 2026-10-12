import { describe, expect, it } from "vitest";

import type { PriceHistoryEntry } from "./words";
import {
    changeLine,
    entryWho,
    priceHistoryRows,
    priceHistoryShown,
} from "./words";

/**
 * Price history's words (owner, 12 Oct 2026): each field, an option, a
 * first entry, several fields in one save, and who.
 */

const KOLKATA = "Asia/Kolkata";
const NOW = new Date("2026-10-12T10:00:00.000Z");
const INR = { currency: "INR" };

const entry = (over: Partial<PriceHistoryEntry> = {}): PriceHistoryEntry => ({
    id: "e_1",
    at: "2026-10-12T06:30:00.000Z",
    first: false,
    who: { name: "Asha" },
    option: null,
    currency: "INR",
    source: "editor",
    changes: [{ field: "price", before: "780.00", after: "820.00" }],
    ...over,
});

describe("one change as a line", () => {
    it("a price, by the house money format", () => {
        expect(
            changeLine(
                { field: "price", before: "780.00", after: "820.00" },
                INR,
            ),
        ).toBe("Price ₹780 → ₹820");
        expect(
            changeLine(
                { field: "price", before: "1000.00", after: "1250.50" },
                INR,
            ),
        ).toBe("Price ₹1,000 → ₹1,250.50");
    });

    it("an MRP set, changed and taken away", () => {
        expect(
            changeLine({ field: "mrp", before: null, after: "1000.00" }, INR),
        ).toBe("MRP set to ₹1,000");
        expect(
            changeLine(
                { field: "mrp", before: "1000.00", after: "1200.00" },
                INR,
            ),
        ).toBe("MRP ₹1,000 → ₹1,200");
        expect(
            changeLine({ field: "mrp", before: "1000.00", after: null }, INR),
        ).toBe("MRP removed");
    });

    it("a GST rate, in the rates' own words: 0% is a rate, none is not set", () => {
        expect(
            changeLine({ field: "gstRate", before: "5", after: "18" }, INR),
        ).toBe("GST rate 5% → 18%");
        expect(
            changeLine({ field: "gstRate", before: null, after: "18" }, INR),
        ).toBe("GST rate set to 18%");
        expect(
            changeLine({ field: "gstRate", before: "18", after: "0" }, INR),
        ).toBe("GST rate 18% → 0%");
        expect(
            changeLine({ field: "gstRate", before: "18", after: null }, INR),
        ).toBe("GST rate 18% → not set");
    });

    it("GST on this price, in the select's own words", () => {
        expect(
            changeLine(
                { field: "gstPriceMode", before: "INCLUDED", after: "ADDED" },
                INR,
            ),
        ).toBe("GST on this price: includes GST → GST is added");
        expect(
            changeLine(
                { field: "gstPriceMode", before: null, after: "ADDED" },
                INR,
            ),
        ).toBe("GST on this price: same as the business → GST is added");
        expect(
            changeLine(
                { field: "gstPriceMode", before: "ADDED", after: null },
                INR,
            ),
        ).toBe("GST on this price: GST is added → same as the business");
    });

    it("a first entry says what the item started at", () => {
        const first = { ...INR, first: true };
        expect(
            changeLine(
                { field: "price", before: null, after: "780.00" },
                first,
            ),
        ).toBe("Price set at ₹780");
        expect(
            changeLine({ field: "mrp", before: null, after: "1000.00" }, first),
        ).toBe("MRP set to ₹1,000");
        expect(
            changeLine({ field: "gstRate", before: null, after: "5" }, first),
        ).toBe("GST rate set to 5%");
        expect(
            changeLine(
                { field: "gstPriceMode", before: null, after: "ADDED" },
                first,
            ),
        ).toBe("GST on this price: GST is added");
    });

    it("says the typed price, never an amount worked out from it", () => {
        // ₹1,000 at 18% under "GST is added" is ₹1,180 to pay: the history
        // says what was set.
        const rows = priceHistoryRows(
            [
                entry({
                    changes: [
                        { field: "price", before: "900.00", after: "1000.00" },
                        { field: "gstRate", before: null, after: "18" },
                        {
                            field: "gstPriceMode",
                            before: null,
                            after: "ADDED",
                        },
                    ],
                }),
            ],
            KOLKATA,
            NOW,
        );
        expect(rows[0].lines[0]).toBe("Price ₹900 → ₹1,000");
        expect(rows[0].lines.join(" ")).not.toContain("1,180");
    });

    it("says nothing for a field it doesn't know, or one that didn't move", () => {
        expect(
            changeLine({ field: "sku", before: "A", after: "B" }, INR),
        ).toBeNull();
        expect(
            changeLine(
                { field: "price", before: "780.00", after: "780.00" },
                INR,
            ),
        ).toBeNull();
    });
});

describe("an item's rows", () => {
    it("a row is the day, what changed and who: 12 Oct, Price ₹780 → ₹820, Asha", () => {
        expect(priceHistoryRows([entry()], KOLKATA, NOW)).toEqual([
            {
                id: "e_1",
                date: "12 Oct",
                who: "Asha",
                lines: ["Price ₹780 → ₹820"],
            },
        ]);
    });

    it("several fields in one save are one row, a line each, in order", () => {
        const [row] = priceHistoryRows(
            [
                entry({
                    changes: [
                        { field: "price", before: "780.00", after: "820.00" },
                        { field: "mrp", before: null, after: "1000.00" },
                        { field: "gstRate", before: "5", after: "18" },
                        {
                            field: "gstPriceMode",
                            before: "INCLUDED",
                            after: "ADDED",
                        },
                    ],
                }),
            ],
            KOLKATA,
            NOW,
        );
        expect(row.lines).toEqual([
            "Price ₹780 → ₹820",
            "MRP set to ₹1,000",
            "GST rate 5% → 18%",
            "GST on this price: includes GST → GST is added",
        ]);
    });

    it("an option's change names the option", () => {
        const [changed, back, made] = priceHistoryRows(
            [
                entry({
                    id: "e_3",
                    option: "Large",
                    changes: [
                        { field: "price", before: "900.00", after: "950.00" },
                        { field: "mrp", before: null, after: "1200.00" },
                    ],
                }),
                // No price of its own any more: it takes the product's.
                entry({
                    id: "e_2",
                    option: "Small",
                    changes: [
                        { field: "price", before: "500.00", after: null },
                    ],
                }),
                entry({
                    id: "e_1",
                    first: true,
                    option: "Large",
                    changes: [
                        { field: "price", before: null, after: "900.00" },
                    ],
                }),
            ],
            KOLKATA,
            NOW,
        );
        expect(changed.lines).toEqual([
            "Large: Price ₹900 → ₹950",
            "Large: MRP set to ₹1,200",
        ]);
        expect(back.lines).toEqual([
            "Small: Price now the same as the product",
        ]);
        expect(made.lines).toEqual(["Large: Price set at ₹900"]);
    });

    it("a new item's first row says what it was set at", () => {
        const [row] = priceHistoryRows(
            [
                entry({
                    first: true,
                    changes: [
                        { field: "price", before: null, after: "780.00" },
                        { field: "mrp", before: null, after: "1000.00" },
                        { field: "gstRate", before: null, after: "5" },
                    ],
                }),
            ],
            KOLKATA,
            NOW,
        );
        expect(row.lines).toEqual([
            "Price set at ₹780",
            "MRP set to ₹1,000",
            "GST rate set to 5%",
        ]);
    });

    it("says the year for a day in another year, and the day in the business's zone", () => {
        const [last, late] = priceHistoryRows(
            [
                entry({ id: "a", at: "2025-12-03T06:30:00.000Z" }),
                // 11 Oct, 11:30 pm in London is already 12 Oct in Kolkata.
                entry({ id: "b", at: "2026-10-11T22:30:00.000Z" }),
            ],
            KOLKATA,
            NOW,
        );
        expect(last.date).toBe("3 Dec 2025");
        expect(late.date).toBe("12 Oct");
    });

    it("keeps the order it was given, newest first, and drops an entry with nothing to say", () => {
        const rows = priceHistoryRows(
            [
                entry({ id: "newest" }),
                entry({
                    id: "unknown",
                    changes: [{ field: "sku", before: "A", after: "B" }],
                }),
                entry({ id: "oldest", first: true }),
            ],
            KOLKATA,
            NOW,
        );
        expect(rows.map((r) => r.id)).toEqual(["newest", "oldest"]);
    });

    it("a service's price in its own currency", () => {
        const [row] = priceHistoryRows(
            [
                entry({
                    currency: "GBP",
                    changes: [
                        { field: "price", before: "45.00", after: "50.00" },
                    ],
                }),
            ],
            KOLKATA,
            NOW,
        );
        expect(row.lines).toEqual(["Price £45 → £50"]);
    });
});

describe("who made it", () => {
    it("a person by name, Saroh support for an operator, Saroh for a job", () => {
        expect(entryWho(entry())).toBe("Asha");
        expect(
            entryWho(entry({ who: { name: "Saroh support", operator: true } })),
        ).toBe("Saroh support");
        expect(entryWho(entry({ who: { name: "Saroh", system: true } }))).toBe(
            "Saroh",
        );
    });

    it("someone who left, and someone with no name", () => {
        expect(entryWho(entry({ who: null }))).toBe("Someone no longer here");
        expect(entryWho(entry({ who: { name: null } }))).toBe("A team member");
        expect(entryWho(entry({ who: { name: "  " } }))).toBe("A team member");
    });

    it("says an import and a copy after the name, and nothing for the rest", () => {
        const who = (source: string | null) =>
            priceHistoryRows([entry({ source })], KOLKATA, NOW)[0].who;
        expect(who("import")).toBe("Asha, by import");
        expect(who("copy")).toBe("Asha, as a copy");
        expect(who("editor")).toBe("Asha");
        expect(who("rates")).toBe("Asha");
        expect(who("setup")).toBe("Asha");
        expect(who(null)).toBe("Asha");
    });
});

describe("whether a screen draws the section", () => {
    it("draws nothing for an item with no history yet, or a screen that didn't ask", () => {
        expect(priceHistoryShown({ entries: [], nextCursor: null })).toBe(
            false,
        );
        expect(priceHistoryShown(undefined)).toBe(false);
    });

    it("draws it with something to show, and when it couldn't be read", () => {
        expect(
            priceHistoryShown({ entries: [entry()], nextCursor: null }),
        ).toBe(true);
        expect(priceHistoryShown(null)).toBe(true);
    });
});

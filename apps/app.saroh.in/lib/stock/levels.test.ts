import { describe, expect, it } from "vitest";
import type { StockCell } from "./levels";
import {
    acrossStorefronts,
    addedWords,
    againstTheLog,
    canSellWords,
    countSaved,
    customersSee,
    levelLabel,
    logSays,
    movedWords,
    notSoldHereWords,
    readCount,
    shortWords,
    signed,
    warnsAtWords,
} from "./levels";

/** Stock in words, the same on every screen (#514). */
function cell(over: Partial<StockCell> = {}): StockCell {
    return {
        storeId: "hill",
        stockLevelId: "sl_1",
        soldHere: true,
        onHand: 12,
        promised: 2,
        canSell: 10,
        short: 0,
        warnAt: 5,
        word: "IN_STOCK",
        lastChange: null,
        ...over,
    };
}

describe("a shelf's label", () => {
    it("in stock says what it can sell", () => {
        expect(levelLabel(cell())).toEqual({
            label: "10 can sell",
            tone: "ok",
        });
        expect(canSellWords(-3)).toBe("0 can sell");
    });

    it("low warns with what it can sell", () => {
        expect(levelLabel(cell({ canSell: 3, word: "LOW" }))).toEqual({
            label: "Low · 3 can sell",
            tone: "warn",
        });
        expect(warnsAtWords(cell())).toBe("Warns at 5");
        expect(warnsAtWords(cell({ warnAt: 0 }))).toBeNull();
    });

    it("sold out at nothing to sell", () => {
        expect(
            levelLabel(
                cell({ onHand: 2, promised: 2, canSell: 0, word: "SOLD_OUT" }),
            ),
        ).toEqual({ label: "Sold out", tone: "danger" });
    });

    it("short comes before sold out: promised units aren't on the shelf", () => {
        const short = cell({
            onHand: 3,
            promised: 5,
            canSell: 0,
            short: 2,
            word: "SOLD_OUT",
        });
        expect(shortWords(short)).toBe("2 short");
        expect(levelLabel(short)).toEqual({ label: "2 short", tone: "danger" });
        expect(shortWords(cell())).toBeNull();
    });

    it("a storefront that doesn't sell it says so, with what is on its shelf", () => {
        const unlisted = cell({
            soldHere: false,
            word: "NOT_SOLD_HERE",
            onHand: 3,
            promised: 0,
            canSell: 3,
        });
        expect(levelLabel(unlisted)).toEqual({
            label: "Not sold here · 3 on hand",
            tone: "muted",
        });
        expect(notSoldHereWords(0)).toBe("Not sold here");
        expect(customersSee(unlisted)).toBe("Not sold here");
    });
});

describe("what customers see", () => {
    it("reads in stock, only N left, sold out", () => {
        expect(customersSee(cell())).toBe("In stock");
        expect(customersSee(cell({ canSell: 2, word: "LOW" }))).toBe(
            "Only 2 left",
        );
        expect(customersSee(cell({ canSell: 0, word: "SOLD_OUT" }))).toBe(
            "Sold out",
        );
    });
});

describe("across storefronts", () => {
    const names = { hill: "Hill Road", online: "Online" };

    it("puts sold out first, then what each can sell", () => {
        expect(
            acrossStorefronts(
                [
                    cell({ storeId: "hill", canSell: 4 }),
                    cell({ storeId: "online", canSell: 0, word: "SOLD_OUT" }),
                ],
                names,
            ),
        ).toBe("Sold out at Online · 4 at Hill Road");
    });

    it("leaves out storefronts that don't sell it", () => {
        expect(
            acrossStorefronts(
                [
                    cell({ storeId: "hill", canSell: 4 }),
                    cell({
                        storeId: "online",
                        soldHere: false,
                        word: "NOT_SOLD_HERE",
                    }),
                ],
                names,
            ),
        ).toBe("4 at Hill Road");
        expect(
            acrossStorefronts(
                [cell({ soldHere: false, word: "NOT_SOLD_HERE" })],
                names,
            ),
        ).toBeNull();
    });
});

describe("counting", () => {
    it("shows the log and the count against it", () => {
        expect(logSays(12)).toBe("Log says 12");
        expect(againstTheLog(12, 12)).toBe("Matches the log");
        expect(againstTheLog(10, 12)).toBe("+2 against the log");
        expect(againstTheLog(12, 9)).toBe("−3 against the log");
    });

    it("skips an empty box and refuses anything but a whole number", () => {
        expect(readCount("")).toEqual({ kind: "skip" });
        expect(readCount("  ")).toEqual({ kind: "skip" });
        expect(readCount(" 7 ")).toEqual({ kind: "count", value: 7 });
        expect(readCount("0")).toEqual({ kind: "count", value: 0 });
        for (const bad of ["1.5", "-2", "ten", "3e2"]) {
            expect(readCount(bad)).toEqual({
                kind: "invalid",
                error: "Whole numbers only.",
            });
        }
    });

    it("says what a save did", () => {
        expect(countSaved(3, 1)).toBe("Count saved: 3 counted, 1 changed.");
    });
});

describe("changes and toasts", () => {
    it("signs a change the way the log does", () => {
        expect(signed(5)).toBe("+5");
        expect(signed(-2)).toBe("−2");
        expect(signed(0)).toBe("0");
    });

    it("confirms a move and an add", () => {
        expect(movedWords(3, "Online")).toBe("Moved 3 to Online.");
        expect(addedWords(5, "Sourdough", 12)).toBe(
            "Added 5 to Sourdough — 12 can sell now",
        );
    });
});

import {
    adjustDelta,
    cantReverse,
    countMismatched,
    HAND_MADE_KINDS,
    isAdjustKind,
    isHandMade,
    movable,
    moveRefusal,
    promisedRefusal,
    shelfNeed,
    shortBy,
    shortWords,
    STOCK_ENTRY_WORDS,
} from "./stock-words";

/** The stock log's words and arithmetic, with no database (#513). */
describe("stock words", () => {
    it("judges a shelf the one way both Needs you lists do", () => {
        const at = (onHand: number, promised = 0, lowStockAlert = 5) => ({
            onHand,
            promised,
            lowStockAlert,
        });
        expect(shelfNeed(at(1, 3))).toBe("short");
        expect(shelfNeed(at(6, 6))).toBe("out");
        expect(shelfNeed(at(0))).toBe("out");
        expect(shelfNeed(at(5))).toBe("low");
        expect(shelfNeed(at(6))).toBeNull();
        // A level of 0 never warns.
        expect(shelfNeed(at(1, 0, 0))).toBeNull();
        // A shelf that sells nothing needs you only when short.
        expect(shelfNeed(at(2, 2), false)).toBeNull();
        expect(shelfNeed(at(0, 2), false)).toBe("short");
    });

    it("names every kind of entry", () => {
        expect(Object.keys(STOCK_ENTRY_WORDS).sort()).toEqual(
            [
                "BAKED",
                "COUNTED",
                "MOVED",
                "RECEIVED",
                "RETURNED",
                "REVERSED",
                "SOLD",
                "WASTED",
            ].sort(),
        );
    });

    it("only hand-made entries can be undone through the stock log", () => {
        expect([...HAND_MADE_KINDS].sort()).toEqual(
            ["BAKED", "COUNTED", "MOVED", "RECEIVED", "WASTED"].sort(),
        );
        expect(isHandMade("SOLD")).toBe(false);
        expect(isHandMade("RETURNED")).toBe(false);
        expect(isHandMade("REVERSED")).toBe(false);
        expect(cantReverse("SOLD")).toMatch(/through its order/);
        expect(cantReverse("REVERSED")).toBe("An undo can't be undone.");
    });

    it("received and baked add, wasted takes away", () => {
        expect(adjustDelta("RECEIVED", 5)).toBe(5);
        expect(adjustDelta("BAKED", 12)).toBe(12);
        expect(adjustDelta("WASTED", 2)).toBe(-2);
        expect(isAdjustKind("WASTED")).toBe(true);
        expect(isAdjustKind("COUNTED")).toBe(false);
        expect(isAdjustKind("SOLD")).toBe(false);
    });

    it("a count below promised reads N short", () => {
        expect(shortBy({ onHand: 3, promised: 5 })).toBe(2);
        expect(shortWords({ onHand: 3, promised: 5 })).toBe("2 short");
        expect(shortWords({ onHand: 5, promised: 5 })).toBeNull();
        // A shelf below none is short by everything promised.
        expect(shortBy({ onHand: -2, promised: 4 })).toBe(4);
    });

    it("only unpromised stock can move", () => {
        expect(movable({ onHand: 10, promised: 4 })).toBe(6);
        expect(movable({ onHand: 3, promised: 5 })).toBe(0);
        expect(moveRefusal(2, "Hill Road")).toBe(
            "Only 2 can be moved from Hill Road. The rest are promised to orders there.",
        );
        expect(moveRefusal(0, "Hill Road")).toMatch(/^None can be moved/);
    });

    it("a count didn't match when the shelf moved since it was shown", () => {
        expect(countMismatched(10, 9)).toBe(true);
        expect(countMismatched(10, 10)).toBe(false);
        // Shown nothing: nothing to disagree with.
        expect(countMismatched(null, 9)).toBe(false);
        expect(countMismatched(undefined, 9)).toBe(false);
    });

    it("Track stock refuses to go off while units are promised (#515)", () => {
        expect(promisedRefusal(3)).toBe(
            "3 are promised to open orders — fulfil or cancel them first.",
        );
        expect(promisedRefusal(1)).toBe(
            "1 is promised to open orders — fulfil or cancel them first.",
        );
    });
});

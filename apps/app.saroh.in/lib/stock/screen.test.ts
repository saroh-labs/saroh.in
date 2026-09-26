import { describe, expect, it } from "vitest";

import {
    cellHead,
    cellSub,
    countDiff,
    countDraft,
    countKey,
    entryProblem,
    entrySaved,
    lastChangeWords,
    moveNote,
    moveProblem,
    noRowsWords,
    parseCountKey,
    rowSub,
    stockSubline,
    untrackedLine,
} from "./screen";

const TZ = "Asia/Kolkata";
// 26 Sep 2026, 12:00 in Kolkata.
const NOW = new Date("2026-09-26T06:30:00Z");

describe("the Levels table", () => {
    it("says short first, then sold out, then what it can sell", () => {
        expect(cellHead({ short: 2, canSell: 0, warnAt: 4 })).toEqual({
            text: "2 short",
            tone: "danger",
        });
        expect(cellHead({ short: 0, canSell: 0, warnAt: 4 })).toEqual({
            text: "Sold out",
            tone: "danger",
        });
        expect(cellHead({ short: 0, canSell: 3, warnAt: 6 })).toEqual({
            text: "3 can sell",
            tone: "warn",
        });
        expect(cellHead({ short: 0, canSell: 10, warnAt: 6 })).toEqual({
            text: "10 can sell",
            tone: "plain",
        });
        // A shelf that never warns is never in the attention colour.
        expect(cellHead({ short: 0, canSell: 1, warnAt: 0 }).tone).toBe(
            "plain",
        );
        expect(cellSub({ onHand: 14, promised: 4 })).toBe(
            "14 on hand · 4 promised",
        );
    });

    it("names the size, the SKU and where it warns", () => {
        expect(
            rowSub({
                variantTitle: "800g",
                sku: "SD-800-L",
                cells: [
                    { soldHere: false, warnAt: 2 },
                    { soldHere: true, warnAt: 6 },
                ],
            }),
        ).toBe("800g · SD-800-L · warns at 6");
        expect(
            rowSub({
                variantTitle: null,
                sku: null,
                cells: [{ soldHere: true, warnAt: 0 }],
            }),
        ).toBe("");
    });

    it("says who made the last change, and when, in the business's day", () => {
        expect(
            lastChangeWords(
                {
                    at: "2026-09-26T01:42:00Z",
                    kind: "COUNTED",
                    quantity: -1,
                    by: "Arjun",
                },
                TZ,
                NOW,
            ),
        ).toBe("Counted by Arjun, today at 07:12");
        expect(
            lastChangeWords(
                {
                    at: "2026-09-25T10:50:00Z",
                    kind: "SOLD",
                    quantity: -2,
                    order: { id: "o1", number: "1016" },
                },
                TZ,
                NOW,
            ),
        ).toBe("Sold, Order #1016, yesterday at 16:20");
        // A role that can't see people or orders reads the change alone.
        expect(
            lastChangeWords(
                { at: "2026-09-18T01:40:00Z", kind: "WASTED", quantity: -1 },
                TZ,
                NOW,
            ),
        ).toBe("Wasted, 18 Sep at 07:10");
        expect(lastChangeWords(null, TZ, NOW)).toBe("No changes logged yet");
    });

    it("says storefronts count apart only when there are several", () => {
        expect(stockSubline("Rye & Co.", [{ name: "Hill Road" }])).toBe(
            "Rye & Co. · every change is logged",
        );
        expect(
            stockSubline("Rye & Co.", [
                { name: "Hill Road" },
                { name: "Online" },
            ]),
        ).toBe(
            "Rye & Co. · Hill Road and Online count separately · every change is logged",
        );
        expect(
            stockSubline("Rye", [{ name: "A" }, { name: "B" }, { name: "C" }]),
        ).toBe("Rye · 3 storefronts count separately · every change is logged");
    });

    it("words the footer and the empty table", () => {
        expect(untrackedLine(1)).toBe(
            "1 product isn't tracked and always sells:",
        );
        expect(untrackedLine(3)).toBe(
            "3 products aren't tracked and always sell:",
        );
        expect(noRowsWords({ needs: true, q: "" })).toMatch(/^Nothing needs/);
        expect(noRowsWords({ needs: false, q: "", all: true })).toMatch(
            /^No product counts stock yet/,
        );
        expect(noRowsWords({ needs: false, q: "rye" })).toBe(
            'No products match "rye".',
        );
    });
});

describe("counting", () => {
    it("keys a box by storefront, product and variant", () => {
        const key = countKey({ productId: "p1", variantId: null }, "s1");
        expect(parseCountKey(key)).toEqual({
            storeId: "s1",
            productId: "p1",
            variantId: null,
        });
        expect(
            parseCountKey(countKey({ productId: "p1", variantId: "v2" }, "s1"))
                .variantId,
        ).toBe("v2");
    });

    it("compares what was typed with what the log says", () => {
        expect(countDiff("", 12)).toEqual({
            text: "Log says 12",
            tone: "muted",
        });
        expect(countDiff("12", 12)).toEqual({
            text: "Matches the log",
            tone: "ok",
        });
        expect(countDiff("14", 12).text).toBe("+2 against the log");
        expect(countDiff("9", 12).text).toBe("−3 against the log");
        expect(countDiff("1.5", 12)).toEqual({
            text: "Whole numbers only.",
            tone: "danger",
        });
    });

    it("skips empty boxes, and keeps Save off while one isn't a whole number", () => {
        const logSays = { a: 10, b: 4, c: 0 };
        const draft = countDraft({ a: "8", b: "", c: "0" }, logSays);
        expect(draft.entered).toEqual([
            { key: "a", counted: 8, expected: 10 },
            { key: "c", counted: 0, expected: 0 },
        ]);
        expect(draft.differ).toBe(1);
        expect(draft.bad).toBe(false);
        expect(draft.status).toBe("2 counted · 1 differ from the log");

        const bad = countDraft({ a: "1.5" }, logSays);
        expect(bad.bad).toBe(true);
        expect(bad.status).toBe("Whole numbers only.");
        expect(countDraft({}, logSays).status).toBe("Nothing counted yet.");
    });
});

describe("Move stock", () => {
    const hill = {
        storeId: "h",
        name: "Hill Road",
        soldHere: true,
        onHand: 14,
        promised: 4,
        canSell: 10,
        has: true,
    };
    const online = {
        storeId: "o",
        name: "Online",
        soldHere: true,
        onHand: 6,
        promised: 0,
        canSell: 6,
        has: true,
    };

    it("refuses the same storefront, a bad number, and promised units", () => {
        expect(moveProblem({ from: hill, to: hill, units: "2" })).toBe(
            "Pick two different storefronts.",
        );
        expect(moveProblem({ from: hill, to: online, units: "" })).toBe(
            "How many to move — a whole number.",
        );
        expect(moveProblem({ from: hill, to: online, units: "11" })).toBe(
            "Only 10 can be moved from Hill Road. The rest are promised to orders there.",
        );
        expect(
            moveProblem({
                from: { ...hill, onHand: 4 },
                to: online,
                units: "1",
            }),
        ).toBe(
            "None can be moved from Hill Road. They are all promised to orders there.",
        );
        expect(
            moveProblem({
                from: { ...online, onHand: 0, has: false },
                to: hill,
                units: "1",
            }),
        ).toBe(
            "Online has none of it on the shelf, so there's nothing to move.",
        );
        expect(moveProblem({ from: hill, to: online, units: "10" })).toBeNull();
    });

    it("says what each side has", () => {
        expect(moveNote(hill, online)).toBe(
            "Hill Road has 10 to spare, Online has 6 on hand.",
        );
        expect(moveNote(hill, { ...online, has: false })).toBe(
            "Hill Road has 10 to spare. Online will start counting it.",
        );
    });
});

describe("entries", () => {
    it("says what was recorded", () => {
        expect(entrySaved("WASTED", 2, 10)).toBe(
            "Recorded 2 wasted — 10 on hand now.",
        );
    });

    it("wants a whole number, and no more waste than the shelf holds", () => {
        expect(entryProblem({ kind: "RECEIVED", units: "0", onHand: 3 })).toBe(
            "How many — a whole number, 1 or more.",
        );
        expect(entryProblem({ kind: "WASTED", units: "4", onHand: 3 })).toBe(
            "Only 3 on the shelf to waste.",
        );
        expect(
            entryProblem({ kind: "RECEIVED", units: "40", onHand: 0 }),
        ).toBeNull();
    });
});

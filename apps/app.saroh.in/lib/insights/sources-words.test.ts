import { describe, expect, it } from "vitest";

import type { SourceRowRead, SourcesRead } from "./reads";
import {
    countedFromLine,
    foldedLine,
    oneIn,
    overviewSourceRows,
    overviewSourcesAnswer,
    paidShares,
    pathAnswer,
    pathSteps,
    sourcesAnswer,
} from "./sources-words";

/**
 * The words of "From visit to paid" and "Where do visitors come from?"
 * (plan U16, #1101): a share as a count reads, never a percentage.
 */

const ROWS: SourceRowRead[] = [
    { source: "instagram", visits: 455, paid: 52 },
    { source: "google", visits: 288, paid: 61 },
    { source: "whatsapp", visits: 166, paid: 31 },
    { source: "direct", visits: 133, paid: 12 },
    { source: "other", visits: 67, paid: 3 },
];

describe("oneIn", () => {
    it("says a share as a count reads", () => {
        expect(oneIn(159, 1109)).toBe("1 in 7");
        expect(oneIn(52, 455)).toBe("1 in 9");
        expect(oneIn(612, 1109)).toBe("about half");
        expect(oneIn(214, 612)).toBe("1 in 3");
        expect(oneIn(159, 214)).toBe("3 in 4");
        expect(oneIn(2, 3)).toBe("2 in 3");
        expect(oneIn(4, 10)).toBe("2 in 5");
        expect(oneIn(1, 1204)).toBe("1 in 1,204");
    });

    it("says all, nearly all and none in words, and nothing of no whole", () => {
        expect(oneIn(5, 5)).toBe("all");
        expect(oneIn(7, 5)).toBe("all");
        expect(oneIn(97, 100)).toBe("nearly all");
        expect(oneIn(0, 30)).toBe("none");
        expect(oneIn(3, 0)).toBeNull();
    });
});

describe("pathAnswer", () => {
    it("says how many visits paid, then where the most are lost", () => {
        expect(
            pathAnswer(
                { visits: 1109, looked: 612, started: 214, paid: 159 },
                "4w",
            ),
        ).toBe(
            "1 in 7 visits ended in a payment. Most who start an order or booking finish it. The biggest drop is between looking and starting.",
        );
        expect(
            pathAnswer({ visits: 100, looked: 10, started: 8, paid: 2 }, "7d"),
        ).toBe(
            "1 in 50 visits ended in a payment. The biggest drop is between visiting and looking.",
        );
    });

    it("says no payment and no visit plainly", () => {
        expect(
            pathAnswer({ visits: 30, looked: 6, started: 0, paid: 0 }, "4w"),
        ).toBe(
            "None of the 30 visits ended in a payment yet. The biggest drop is between looking and starting.",
        );
        expect(
            pathAnswer({ visits: 0, looked: 0, started: 0, paid: 0 }, "4w"),
        ).toBe("No visits counted in the last 4 weeks.");
    });
});

describe("pathSteps", () => {
    it("draws four steps that never go up, each a share of the one before", () => {
        const steps = pathSteps({
            visits: 1109,
            looked: 612,
            started: 214,
            paid: 159,
        });
        expect(steps.map((s) => s.label)).toEqual([
            "Visited your site",
            "Looked at a product or class",
            "Started an order or booking",
            "Paid",
        ]);
        expect(steps.map((s) => s.share)).toEqual([
            null,
            "About half of them",
            "1 in 3 of them",
            "3 in 4 of them",
        ]);
        expect(steps.map((s) => s.widthPercent)).toEqual([100, 55, 19, 14]);
        for (let i = 1; i < steps.length; i++) {
            expect(steps[i].value).toBeLessThanOrEqual(steps[i - 1].value);
        }
    });

    it("draws no bar for a step nobody reached", () => {
        const steps = pathSteps({ visits: 0, looked: 0, started: 0, paid: 0 });
        expect(steps.every((s) => s.widthPercent === 0)).toBe(true);
        expect(steps[1].share).toBeNull();
    });
});

describe("sources", () => {
    it("names the source that brings most, and one that pays better", () => {
        expect(sourcesAnswer(ROWS, "4w")).toBe(
            "Instagram brings the most visits. Google search brings fewer, but more of them pay.",
        );
    });

    it("says when the biggest source pays best too, with plural sources in plural", () => {
        expect(
            sourcesAnswer(
                [
                    { source: "whatsapp", visits: 50, paid: 20 },
                    { source: "google", visits: 20, paid: 2 },
                ],
                "4w",
            ),
        ).toBe(
            "WhatsApp links bring the most visits, and more of them pay than from anywhere else.",
        );
        expect(
            sourcesAnswer([{ source: "direct", visits: 9, paid: 0 }], "7d"),
        ).toBe("People typing your address bring the most visits.");
        expect(sourcesAnswer([], "7d")).toBe(
            "No visits counted in the last 7 days.",
        );
    });

    it("says how many paid per row, each bar against the best", () => {
        expect(paidShares(ROWS)).toEqual([
            { words: "1 in 9", widthPercent: 54 },
            { words: "1 in 5", widthPercent: 100 },
            { words: "1 in 5", widthPercent: 88 },
            { words: "1 in 11", widthPercent: 43 },
            { words: "1 in 22", widthPercent: 21 },
        ]);
        expect(paidShares([{ source: "other", visits: 0, paid: 3 }])).toEqual([
            { words: null, widthPercent: 0 },
        ]);
    });

    it("names what was folded into Other sites", () => {
        expect(foldedLine([])).toBeNull();
        expect(foldedLine(["whatsapp"])).toBe(
            "WhatsApp links had too few visits to show apart, so it is counted in Other sites.",
        );
        expect(foldedLine(["google", "whatsapp", "direct"])).toBe(
            "Google search, WhatsApp links and Typed your address had too few visits to show apart, so they are counted in Other sites.",
        );
    });
});

describe("countedFromLine", () => {
    it("says from when counting began inside the period, and nothing when the whole is counted", () => {
        expect(
            countedFromLine(
                { countedFrom: "2026-10-10", countedPart: true },
                "2026-10-19",
            ),
        ).toBe(
            "Counted from 10 Oct, when your site began noting where each visit came from.",
        );
        expect(
            countedFromLine({ countedFrom: "2026-09-01", countedPart: false }),
        ).toBeNull();
    });

    it("says counting starts with the next visit when nothing is counted", () => {
        expect(countedFromLine({ countedFrom: null, countedPart: false })).toBe(
            "Where visits come from is counted from the next visit to your site.",
        );
    });
});

describe("the Overview's answer", () => {
    const read = (over: Partial<SourcesRead> = {}): SourcesRead => ({
        period: "4w",
        window: { days: 28, from: "2026-09-22", to: "2026-10-19" },
        siteId: null,
        countedFrom: "2026-09-01",
        countedPart: false,
        path: { visits: 1109, looked: 612, started: 214, paid: 159 },
        sources: ROWS,
        folded: [],
        refs: [],
        moreRefs: 0,
        ...over,
    });

    it("names the biggest source and how many visits paid, then three rows", () => {
        expect(overviewSourcesAnswer(read())).toBe(
            "Instagram brings the most visits. 1 in 7 visits ended in a payment.",
        );
        expect(overviewSourceRows(read())).toEqual([
            { key: "instagram", name: "Instagram", visits: "455 visits" },
            { key: "google", name: "Google search", visits: "288 visits" },
            { key: "whatsapp", name: "WhatsApp links", visits: "166 visits" },
        ]);
    });

    it("has no answer with no visit counted", () => {
        expect(
            overviewSourcesAnswer(
                read({
                    path: { visits: 0, looked: 0, started: 0, paid: 0 },
                    sources: [],
                }),
            ),
        ).toBeNull();
    });
});

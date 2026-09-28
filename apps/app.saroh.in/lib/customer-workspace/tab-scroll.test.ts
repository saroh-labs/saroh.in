import { describe, expect, it } from "vitest";

import { scrollToShow, TAB_PEEK } from "./tab-scroll";

/** A 343px row (a 375px phone less its gutters) over 600px of tabs. */
const row = (scrollLeft: number) => ({
    scrollLeft,
    clientWidth: 343,
    scrollWidth: 600,
});

describe("scrollToShow (C14, default 28)", () => {
    it("leaves a tab that already shows whole where it is", () => {
        expect(scrollToShow(row(0), { left: 0, width: 90 })).toBeNull();
        expect(scrollToShow(row(100), { left: 200, width: 90 })).toBeNull();
    });

    it("scrolls a tab past the right edge into view, with its neighbour peeking", () => {
        // Invoices at 400–480 on a row showing 0–343.
        expect(scrollToShow(row(0), { left: 400, width: 80 })).toBe(
            400 + 80 - 343 + TAB_PEEK,
        );
    });

    it("never scrolls past the end of the row", () => {
        expect(scrollToShow(row(0), { left: 530, width: 70 })).toBe(600 - 343);
    });

    it("scrolls back to a tab left of the view, and never before the start", () => {
        expect(scrollToShow(row(200), { left: 100, width: 80 })).toBe(
            100 - TAB_PEEK,
        );
        expect(scrollToShow(row(200), { left: 0, width: 80 })).toBe(0);
    });
});

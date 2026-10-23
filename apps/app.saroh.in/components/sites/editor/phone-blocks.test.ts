import { describe, expect, it } from "vitest";

import { nearestRow } from "./phone-blocks";

describe("nearestRow: where a dragged block lands", () => {
    it("is the row whose middle is nearest", () => {
        const middles = [20, 70, 120];
        expect(nearestRow(0, middles)).toBe(0);
        expect(nearestRow(60, middles)).toBe(1);
        expect(nearestRow(100, middles)).toBe(2);
        expect(nearestRow(500, middles)).toBe(2);
    });

    it("is the first row when there are none to compare", () => {
        expect(nearestRow(40, [])).toBe(0);
    });
});

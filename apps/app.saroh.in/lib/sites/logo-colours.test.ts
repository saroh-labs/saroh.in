import { describe, expect, it } from "vitest";

import { mainColours } from "./logo-colours";

/** RGBA pixels: `n` of each colour. */
function pixels(...runs: [number, number, number, number, number][]) {
    const out: number[] = [];
    for (const [n, r, g, b, a] of runs) {
        for (let i = 0; i < n; i++) out.push(r, g, b, a);
    }
    return out;
}

describe("mainColours", () => {
    it("gives the most used colours first, skipping the white ground and clear pixels", () => {
        const data = pixels(
            [500, 255, 255, 255, 255],
            [300, 0, 0, 0, 0],
            [200, 224, 96, 154, 255],
            [100, 40, 90, 60, 255],
        );
        expect(mainColours(data)).toEqual(["#E0609A", "#285A3C"]);
    });

    it("counts near shades as one colour and keeps at most three", () => {
        const data = pixels(
            [100, 200, 30, 30, 255],
            [90, 205, 35, 35, 255],
            [80, 30, 30, 200, 255],
            [70, 30, 200, 30, 255],
            [60, 200, 200, 30, 255],
        );
        const got = mainColours(data);
        expect(got).toHaveLength(3);
        expect(got[0]).toBe("#C81E1E");
    });

    it("offers black only when the logo has no colour in it", () => {
        expect(mainColours(pixels([50, 20, 20, 20, 255]))).toEqual(["#141414"]);
        expect(
            mainColours(pixels([90, 20, 20, 20, 255], [10, 224, 96, 154, 255])),
        ).toEqual(["#E0609A"]);
    });

    it("gives nothing for an empty or all-white logo", () => {
        expect(mainColours([])).toEqual([]);
        expect(mainColours(pixels([10, 255, 255, 255, 255]))).toEqual([]);
    });
});

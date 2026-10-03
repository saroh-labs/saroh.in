import { describe, expect, it } from "vitest";

import { trimTrailingSlashes } from "./url-path";

describe("trimTrailingSlashes", () => {
    it("drops the slashes a path ends with, and nothing else", () => {
        expect(trimTrailingSlashes("/shop/")).toBe("/shop");
        expect(trimTrailingSlashes("/shop///")).toBe("/shop");
        expect(trimTrailingSlashes("/a//b")).toBe("/a//b");
        expect(trimTrailingSlashes("/")).toBe("");
        expect(trimTrailingSlashes("")).toBe("");
    });

    it("stays fast on a long run of slashes that isn't at the end", () => {
        const hostile = `${"/".repeat(100_000)}x`;
        // The old regex takes seconds here (quadratic); a linear scan takes
        // about a millisecond. The bound leaves room for a busy machine.
        const started = performance.now();
        expect(trimTrailingSlashes(hostile)).toBe(hostile);
        expect(performance.now() - started).toBeLessThan(500);
    });
});

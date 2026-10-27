import { describe, expect, it } from "vitest";

import { nextIndex } from "./roving";

describe("nextIndex", () => {
    it("moves with the arrows and wraps at either end", () => {
        expect(nextIndex("ArrowRight", 0, 3)).toBe(1);
        expect(nextIndex("ArrowDown", 2, 3)).toBe(0);
        expect(nextIndex("ArrowLeft", 0, 3)).toBe(2);
        expect(nextIndex("ArrowUp", 1, 3)).toBe(0);
        expect(nextIndex("ArrowDown", -1, 3)).toBe(0);
    });

    it("ignores any other key", () => {
        expect(nextIndex("Enter", 0, 3)).toBeNull();
        expect(nextIndex("Home", 1, 3)).toBeNull();
    });
});

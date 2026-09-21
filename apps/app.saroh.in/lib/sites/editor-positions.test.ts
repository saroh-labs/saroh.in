import { describe, expect, it } from "vitest";

import { flagsByScreenPosition, insertPosition } from "./editor-positions";
import type { Flag } from "./service";

describe("where a new block goes", () => {
    it("goes after the selected block", () => {
        expect(insertPosition(0, 3)).toBe(1);
        expect(insertPosition(2, 3)).toBe(3);
    });

    it("goes at the end when nothing, or nothing real, is selected", () => {
        expect(insertPosition(null, 3)).toBe(3);
        expect(insertPosition(7, 3)).toBe(3);
        expect(insertPosition(null, 0)).toBe(0);
    });
});

describe("flags on the blocks they are about", () => {
    const flag = (sectionIndex: number | null, pageId = "p1") =>
        ({ pageId, sectionIndex, message: `m${sectionIndex}` }) as Flag;

    it("keys flags by position when every block was sent", () => {
        const map = flagsByScreenPosition([flag(0), flag(2)], "p1", [0, 1, 2]);
        expect(Array.from(map.keys())).toEqual([0, 2]);
    });

    it("skips over an unfinished block that the save left out", () => {
        // On screen: 0 hero, 1 NEW (unfinished, not sent), 2 rich text.
        // Sent: [hero, rich text] -> sentFrom = [0, 2].
        const map = flagsByScreenPosition([flag(1)], "p1", [0, 2]);
        expect(map.get(2)?.[0]?.message).toBe("m1");
        expect(map.has(1)).toBe(false);
    });

    it("ignores other pages and site-wide flags", () => {
        const map = flagsByScreenPosition(
            [flag(0, "p2"), flag(null)],
            "p1",
            [0],
        );
        expect(map.size).toBe(0);
    });
});

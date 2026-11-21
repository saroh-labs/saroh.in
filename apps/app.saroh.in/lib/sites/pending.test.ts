import { describe, expect, it } from "vitest";

import {
    describePendingChanges,
    pendingChangeCount,
    shortPendingChanges,
} from "./pending";

describe("what is waiting to go live", () => {
    it("says it in a sentence for settings and the sites list", () => {
        expect(describePendingChanges(2, ["style", "footer"])).toBe(
            "2 sections, the style and the footer",
        );
        expect(describePendingChanges(0, [])).toBeNull();
        // A page link changed: its old link forwards (website area U1).
        expect(describePendingChanges(0, ["pages", "redirects"])).toBe(
            "the page list and the old links that forward",
        );
    });

    it("says it in a short list for the editor's pill", () => {
        expect(shortPendingChanges(1, [])).toBe("1 block");
        expect(shortPendingChanges(2, ["footer"])).toBe("2 blocks, footer");
        expect(shortPendingChanges(0, ["style", "menu"])).toBe("brand, menu");
    });

    it("says nothing when nothing is waiting, or nothing is known", () => {
        expect(shortPendingChanges(0, [])).toBeNull();
        expect(shortPendingChanges(null, null)).toBeNull();
    });

    it("leaves out a kind this build does not know", () => {
        expect(shortPendingChanges(1, ["somethingNew", "footer"])).toBe(
            "1 block, footer",
        );
    });
});

describe("pendingChangeCount", () => {
    it("is the change units' count when the API sends one (U7)", () => {
        expect(pendingChangeCount(3, ["menu"], 2)).toBe(2);
        expect(pendingChangeCount(3, ["menu"], 0)).toBe(0);
    });

    it("adds sections and settings from an older API", () => {
        expect(pendingChangeCount(3, ["menu", "unknown"], null)).toBe(4);
        expect(pendingChangeCount(null, null)).toBe(0);
    });
});

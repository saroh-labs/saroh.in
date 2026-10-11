import { describe, expect, it } from "vitest";

import { moreToolsLine, splitTrackers } from "./tracker-order";

describe("the trackers list's order", () => {
    it("shows the common three and folds the other four", () => {
        expect(splitTrackers(new Set())).toEqual({
            shown: ["ga4", "meta-pixel", "google-ads"],
            folded: ["posthog", "clarity", "plausible", "umami"],
        });
        expect(moreToolsLine(4)).toBe("4 more tools");
        expect(moreToolsLine(1)).toBe("1 more tool");
    });

    it("never folds a connected tool away", () => {
        expect(splitTrackers(new Set(["plausible"] as const))).toEqual({
            shown: ["ga4", "meta-pixel", "google-ads", "plausible"],
            folded: ["posthog", "clarity", "umami"],
        });
    });
});

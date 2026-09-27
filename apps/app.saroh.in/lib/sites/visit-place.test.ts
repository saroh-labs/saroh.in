import { describe, expect, it } from "vitest";

import { visitPlaceChoice } from "./visit-place";

const hill = { id: "store_hill", name: "Hill Road" };
const pali = { id: "store_pali", name: "Pali Hill" };

describe("visitPlaceChoice (G8)", () => {
    it("waits for the read, and keeps a failed read apart from an empty one", () => {
        expect(visitPlaceChoice("loading", undefined)).toEqual({
            kind: "loading",
        });
        expect(
            visitPlaceChoice(
                { state: "failed", forbidden: true },
                "store_hill",
            ),
        ).toEqual({ kind: "failed", forbidden: true });
    });

    it("chooses the only shop for the merchant, and names it", () => {
        expect(
            visitPlaceChoice({ state: "ok", places: [hill] }, undefined),
        ).toEqual({ kind: "only", place: hill, adopt: true });
        // Already saved: nothing to adopt.
        expect(
            visitPlaceChoice({ state: "ok", places: [hill] }, "store_hill"),
        ).toEqual({ kind: "only", place: hill, adopt: false });
    });

    it("asks which with several, and never guesses", () => {
        expect(
            visitPlaceChoice({ state: "ok", places: [hill, pali] }, undefined),
        ).toEqual({ kind: "pick", places: [hill, pali], chosen: null });
        expect(
            visitPlaceChoice(
                { state: "ok", places: [hill, pali] },
                "store_pali",
            ),
        ).toEqual({ kind: "pick", places: [hill, pali], chosen: pali });
    });

    it("says there is no shop with only online storefronts, or Sell off", () => {
        expect(
            visitPlaceChoice({ state: "ok", places: [] }, undefined),
        ).toEqual({ kind: "none" });
        expect(visitPlaceChoice({ state: "sell-off" }, "store_hill")).toEqual({
            kind: "none",
        });
    });

    it("says so when the chosen shop closed or went online-only", () => {
        expect(
            visitPlaceChoice({ state: "ok", places: [pali] }, "store_hill"),
        ).toEqual({ kind: "missing", places: [pali] });
    });
});

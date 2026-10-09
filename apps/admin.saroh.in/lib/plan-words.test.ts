import { describe, expect, it } from "vitest";

import type { EffectivePlan } from "./plan-words";
import {
    legacyPickerBlocked,
    planLine,
    planNote,
    USAGE_NOTE_WORDS,
} from "./plan-words";

const PRO_OVER_FREE: EffectivePlan = {
    id: "pro",
    name: "Pro",
    basePlanId: "free",
    basePlanName: "Free",
    // The end of 31 Dec in India, as the API stores an override's end.
    override: { expiresAt: "2026-12-31T18:29:59.999Z" },
};

describe("planLine (UX-087)", () => {
    it("shows the override's plan, its end, and the base plan beside it", () => {
        expect(planLine(PRO_OVER_FREE)).toBe(
            "Pro (override until 31 Dec 2026) · base plan Free",
        );
    });

    it("says an override with no end lasts until removed", () => {
        expect(
            planLine({ ...PRO_OVER_FREE, override: { expiresAt: null } }),
        ).toBe("Pro (override until removed) · base plan Free");
    });

    it("leaves the base out when the override names the same plan", () => {
        expect(
            planLine({
                ...PRO_OVER_FREE,
                basePlanId: "pro",
                basePlanName: "Pro",
            }),
        ).toBe("Pro (override until 31 Dec 2026)");
    });

    it("is just the plan's name with no override", () => {
        expect(planLine({ ...PRO_OVER_FREE, override: null })).toBe("Pro");
    });

    it("falls back to the subscription's plan off the catalogue", () => {
        expect(planLine(null, "Business")).toBe("Business");
        expect(planLine(null)).toBe("No plan");
    });
});

describe("planNote", () => {
    it("is the second line under the plan's name in the directory", () => {
        expect(planNote(PRO_OVER_FREE)).toBe(
            "override until 31 Dec 2026 · base plan Free",
        );
    });

    it("is nothing with no override", () => {
        expect(planNote({ ...PRO_OVER_FREE, override: null })).toBeNull();
    });
});

describe("legacyPickerBlocked", () => {
    it("offers the old picker when it has plans", () => {
        expect(legacyPickerBlocked(2, true)).toBeNull();
        expect(legacyPickerBlocked(2, false)).toBeNull();
    });

    it("doesn't call a live catalogue 'no plan offered'", () => {
        expect(legacyPickerBlocked(0, true)).toBe("catalogue");
    });

    it("says no plan is offered only when none is, anywhere", () => {
        expect(legacyPickerBlocked(0, false)).toBe("none");
    });
});

describe("USAGE_NOTE_WORDS (UX-089)", () => {
    it("says an online-only business has no locations", () => {
        expect(USAGE_NOTE_WORDS["online-only"]).toBe(
            "Online only, no locations",
        );
    });
});

import { describe, expect, it } from "vitest";

import type { FreeRowEvidence } from "./pricing-free-subscriptions";
import { decideFreeRow } from "./pricing-free-subscriptions";

const CUTOFF = new Date("2026-06-01T00:00:00.000Z");

function org(over: Partial<FreeRowEvidence>): FreeRowEvidence {
    return {
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        deleted: false,
        hasSubscription: false,
        hasLivePlanOverride: false,
        ...over,
    };
}

describe("the U12 Free-row rule (OQ-2)", () => {
    it("starts a business that joined after the cutoff with no row", () => {
        expect(decideFreeRow(org({}), CUTOFF)).toBe("start");
    });

    it("starts a grandfathered business: its plan override still wins", () => {
        expect(
            decideFreeRow(
                org({
                    createdAt: new Date("2026-01-01T00:00:00.000Z"),
                    hasLivePlanOverride: true,
                }),
                CUTOFF,
            ),
        ).toBe("start");
    });

    it("never puts an existing business on Free before it is grandfathered", () => {
        expect(
            decideFreeRow(
                org({ createdAt: new Date("2026-01-01T00:00:00.000Z") }),
                CUTOFF,
            ),
        ).toBe("not-grandfathered");
    });

    it("leaves a business with any subscription row, or a deleted one, alone", () => {
        expect(
            decideFreeRow(
                org({ hasSubscription: true, hasLivePlanOverride: true }),
                CUTOFF,
            ),
        ).toBe("has-subscription");
        expect(decideFreeRow(org({ deleted: true }), CUTOFF)).toBe("deleted");
    });
});

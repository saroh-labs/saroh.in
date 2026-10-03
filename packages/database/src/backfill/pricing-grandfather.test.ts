import { describe, expect, it } from "vitest";

import type { GrandfatherEvidence } from "./pricing-grandfather";
import {
    assertGrandfatherOptions,
    decideGrandfather,
} from "./pricing-grandfather";

const RELEASE = new Date("2026-06-01T00:00:00.000Z");

function org(over: Partial<GrandfatherEvidence>): GrandfatherEvidence {
    return {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        deleted: false,
        subscription: null,
        hasLivePlanOverride: false,
        ...over,
    };
}

describe("the U5 grandfather rule", () => {
    it("grandfathers a business without a subscription that joined before the release", () => {
        expect(decideGrandfather(org({}), RELEASE)).toBe("grandfather");
    });

    it("grandfathers a business on Free or with a cancelled plan", () => {
        for (const subscription of [
            { status: "ACTIVE", planKey: "free" },
            { status: "ACTIVE", planKey: "catalog.free" },
            { status: "CANCELLED", planKey: "business" },
        ]) {
            expect(decideGrandfather(org({ subscription }), RELEASE)).toBe(
                "grandfather",
            );
        }
    });

    it("leaves a business on a plan of its own alone, paying or trialing", () => {
        for (const subscription of [
            { status: "ACTIVE", planKey: "business" },
            { status: "TRIALING", planKey: "pro" },
            { status: "PAST_DUE", planKey: "business" },
            { status: "ACTIVE", planKey: "catalog.grow" },
        ]) {
            expect(decideGrandfather(org({ subscription }), RELEASE)).toBe(
                "on-a-plan",
            );
        }
    });

    it("never grandfathers a business that joined at or after the release", () => {
        expect(decideGrandfather(org({ createdAt: RELEASE }), RELEASE)).toBe(
            "joined-after",
        );
    });

    it("skips a deleted business", () => {
        expect(decideGrandfather(org({ deleted: true }), RELEASE)).toBe(
            "deleted",
        );
    });

    it("writes nothing for a business that already has a live plan override", () => {
        expect(
            decideGrandfather(org({ hasLivePlanOverride: true }), RELEASE),
        ).toBe("already-overridden");
    });
});

describe("the backfill's options", () => {
    const now = new Date("2026-06-02T00:00:00.000Z");
    const ok = {
        planKey: "grow",
        until: new Date("2026-12-31T00:00:00.000Z"),
        joinedBefore: RELEASE,
        now,
    };

    it("accepts a plan id, an end in the future and a cutoff in the past", () => {
        expect(() => assertGrandfatherOptions(ok)).not.toThrow();
    });

    it("refuses an end date that has passed", () => {
        expect(() =>
            assertGrandfatherOptions({ ...ok, until: RELEASE }),
        ).toThrow(/future/);
    });

    it("refuses a cutoff in the future, which would catch new sign-ups", () => {
        expect(() =>
            assertGrandfatherOptions({
                ...ok,
                joinedBefore: new Date("2026-07-01T00:00:00.000Z"),
            }),
        ).toThrow(/cutoff/);
    });

    it("refuses something that isn't a plan id", () => {
        for (const planKey of ["", "Grow", "catalog.grow", "grow; drop"]) {
            expect(() => assertGrandfatherOptions({ ...ok, planKey })).toThrow(
                /plan id/,
            );
        }
    });
});

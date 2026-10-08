import { describe, expect, it } from "vitest";

import { edit, fixture } from "./catalog.fixture";
import { resolvePlanIntent } from "./plan-intent";

describe("resolvePlanIntent", () => {
    it("is nothing when no plan is named", () => {
        expect(resolvePlanIntent({}, fixture())).toEqual({ kind: "none" });
        expect(resolvePlanIntent({ plan: " " }, fixture())).toEqual({
            kind: "none",
        });
    });

    it("is nothing for the free plan: every business starts on it", () => {
        expect(resolvePlanIntent({ plan: "a" }, fixture())).toEqual({
            kind: "none",
        });
        expect(resolvePlanIntent({ plan: "free" }, null)).toEqual({
            kind: "none",
        });
    });

    it("is a checkout for a paid plan the catalogue offers", () => {
        expect(
            resolvePlanIntent({ plan: "b", cycle: "year" }, fixture()),
        ).toEqual({
            kind: "paid",
            plan: "b",
            name: "Plan B",
            cycle: "year",
            yearlyDropped: false,
        });
    });

    it("is monthly when no cycle, or a cycle that isn't one, is named", () => {
        for (const cycle of [undefined, null, "", "weekly"]) {
            expect(
                resolvePlanIntent({ plan: "c", cycle }, fixture()),
            ).toMatchObject({ kind: "paid", cycle: "month" });
        }
    });

    it("falls back to monthly, and says so, when yearly isn't offered", () => {
        const noYearly = edit(fixture(), (c) => {
            c.yearly.on = false;
        });
        expect(
            resolvePlanIntent({ plan: "b", cycle: "year" }, noYearly),
        ).toMatchObject({ kind: "paid", cycle: "month", yearlyDropped: true });
    });

    it("is unknown for a plan the catalogue doesn't have, or has retired", () => {
        expect(resolvePlanIntent({ plan: "zzz" }, fixture())).toEqual({
            kind: "unknown",
        });
        const retired = edit(fixture(), (c) => {
            c.plans[1].retired = true;
        });
        expect(resolvePlanIntent({ plan: "b" }, retired)).toEqual({
            kind: "unknown",
        });
    });

    it("is unknown for anything that isn't a plan id, catalogue or not", () => {
        for (const plan of ["B", "<b>", "b c", "1b", "x".repeat(41)]) {
            expect(resolvePlanIntent({ plan }, fixture())).toEqual({
                kind: "unknown",
            });
            expect(resolvePlanIntent({ plan }, null)).toEqual({
                kind: "unknown",
            });
        }
    });

    it("goes to the checkout unchecked when the catalogue couldn't be read", () => {
        expect(resolvePlanIntent({ plan: "b", cycle: "year" }, null)).toEqual({
            kind: "unchecked",
            plan: "b",
            cycle: "year",
        });
    });
});

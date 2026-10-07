import { describe, expect, it } from "vitest";

import { leftBusinessNotice } from "./left-business";

describe("leftBusinessNotice (UX-073)", () => {
    it("names the business a removed person was working in", () => {
        expect(
            leftBusinessNotice({
                activeId: "org_gone",
                activeName: "Hill Road Bakes",
                memberOf: [],
            }),
        ).toBe(
            "You're no longer in Hill Road Bakes — someone there removed you, or it closed. Your account is still yours: set one up of your own below, or ask them to invite you again.",
        );
    });

    it("says 'that business' when the cookie predates its name", () => {
        expect(
            leftBusinessNotice({
                activeId: "org_gone",
                activeName: undefined,
                memberOf: ["org_other"],
            }),
        ).toMatch(/^You're no longer in that business — /);
    });

    it("says nothing to someone still in it, or new", () => {
        expect(
            leftBusinessNotice({
                activeId: "org_1",
                activeName: "Mine",
                memberOf: ["org_1"],
            }),
        ).toBeNull();
        expect(
            leftBusinessNotice({
                activeId: null,
                activeName: null,
                memberOf: [],
            }),
        ).toBeNull();
    });
});

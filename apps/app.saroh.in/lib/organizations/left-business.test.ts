import { describe, expect, it } from "vitest";

import { leftBusinessNotice } from "./left-business";

describe("leftBusinessNotice (UX-073)", () => {
    it("names the business a removed person was working in", () => {
        expect(
            leftBusinessNotice({
                activeId: "org_gone",
                activeName: "Hill Road Bakes",
                activeUser: "user_1",
                userId: "user_1",
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
                activeUser: "user_1",
                userId: "user_1",
                memberOf: ["org_other"],
            }),
        ).toMatch(/^You're no longer in that business — /);
    });

    it("says nothing to someone still in it, or new", () => {
        expect(
            leftBusinessNotice({
                activeId: "org_1",
                activeName: "Mine",
                activeUser: "user_1",
                userId: "user_1",
                memberOf: ["org_1"],
            }),
        ).toBeNull();
        expect(
            leftBusinessNotice({
                activeId: null,
                activeName: null,
                activeUser: null,
                userId: "user_1",
                memberOf: [],
            }),
        ).toBeNull();
    });

    it("says nothing to someone else on the same browser (a new sign-up)", () => {
        const left = {
            activeId: "org_gone",
            activeName: "Hill Road Bakes",
            memberOf: [],
        };
        expect(
            leftBusinessNotice({
                ...left,
                activeUser: "user_before",
                userId: "user_new",
            }),
        ).toBeNull();
        // A cookie from before the user was kept beside it can't say whose.
        expect(
            leftBusinessNotice({
                ...left,
                activeUser: undefined,
                userId: "user_new",
            }),
        ).toBeNull();
    });
});

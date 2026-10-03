import { describe, expect, it } from "vitest";

import { limitNotice } from "./limit-notice";

const access = { inc: true, limit: 100, plan: "Plan A", upgradeTo: "Plan B" };

describe("limitNotice", () => {
    it("says nothing under 80%", () => {
        expect(limitNotice(access, 79, "things", "")).toEqual({
            on: false,
            full: false,
            left: 21,
        });
    });

    it("warns from 80%", () => {
        expect(limitNotice(access, 80, "things", "")).toMatchObject({
            on: true,
            full: false,
            left: 20,
            pct: "80%",
            title: "You've used 80 of 100 things on Plan A",
            body: "You'll be stopped at 100. Plan B gives you more.",
            cta: "Upgrade or add more",
            why: "",
        });
    });

    it("blocks at 100%, and past it", () => {
        const full = limitNotice(
            access,
            100,
            "things",
            "New things are paused.",
        );
        expect(full).toMatchObject({
            on: true,
            full: true,
            left: 0,
            pct: "100%",
            title: "You've reached your 100 things on Plan A",
            body: "New things are paused. Plan B raises the limit, or add more with an add-on.",
            why: "You've reached your things limit on Plan A",
        });
        expect(limitNotice(access, 140, "things", "")).toMatchObject({
            full: true,
            pct: "100%",
        });
    });

    it("offers only an add-on on the top plan, and nothing without a cap", () => {
        expect(
            limitNotice({ ...access, upgradeTo: "" }, 90, "things", ""),
        ).toMatchObject({
            body: "You'll be stopped at 100. An add-on gives you more.",
            cta: "Add more",
        });
        expect(
            limitNotice({ ...access, limit: null }, 1_000, "things", ""),
        ).toEqual({ on: false, full: false });
        expect(
            limitNotice({ ...access, inc: false }, 1_000, "things", ""),
        ).toEqual({ on: false, full: false });
    });

    it("groups counts the Indian way", () => {
        expect(
            limitNotice({ ...access, limit: 111_111 }, 100_000, "things", ""),
        ).toMatchObject({
            title: "You've used 1,00,000 of 1,11,111 things on Plan A",
        });
    });
});

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

    it("never says a soft cap stops anything", () => {
        const soft = { ...access, soft: true };
        expect(limitNotice(soft, 85, "GB of things", "")).toMatchObject({
            on: true,
            full: false,
            soft: true,
            body: "Nothing stops at 100; we'll let you know when you reach it. Plan B gives you more.",
            why: "",
        });
        const full = limitNotice(
            soft,
            120,
            "GB of things",
            "Nothing is blocked: things keep working.",
        );
        expect(full).toMatchObject({
            full: true,
            soft: true,
            title: "You've reached your 100 GB of things on Plan A",
            body: "Nothing is blocked: things keep working. Plan B raises the limit, or add more with an add-on.",
            why: "",
        });
        expect(full.on && full.body).not.toMatch(/stopped|paused|can't/);
        expect(limitNotice(soft, 82.34, "GB of things", "")).toMatchObject({
            title: "You've used 82.3 of 100 GB of things on Plan A",
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

    describe("a limit with its own way out (Saroh's emails, DEC-086)", () => {
        const action = {
            label: "Connect your email",
            href: "/settings/providers",
            sentence: "Connect your own email.",
        };

        it("says it first, a higher plan second, and no add-on", () => {
            const warn = limitNotice(access, 85, "emails", "", { action });
            expect(warn).toMatchObject({
                on: true,
                full: false,
                body: "You'll be stopped at 100. Connect your own email. Or Plan B gives you more.",
                cta: "Connect your email",
                href: "/settings/providers",
            });
            const full = limitNotice(access, 100, "emails", "Stopped.", {
                action,
                resetsOn: "1 Nov",
            });
            expect(full).toMatchObject({
                full: true,
                title: "You've reached your 100 emails on Plan A",
                body: "Stopped. It starts again on 1 Nov. Connect your own email. Or Plan B raises the limit.",
                cta: "Connect your email",
            });
            expect(full.on && full.body).not.toMatch(/add-on/);
        });

        it("on the top plan, offers the action alone", () => {
            expect(
                limitNotice(
                    { ...access, upgradeTo: "" },
                    100,
                    "emails",
                    "Stopped.",
                    {
                        action,
                    },
                ),
            ).toMatchObject({ body: "Stopped. Connect your own email." });
        });

        it("leaves every other limit's words as they were", () => {
            expect(
                limitNotice(access, 100, "things", "Paused."),
            ).not.toHaveProperty("href");
        });
    });
});

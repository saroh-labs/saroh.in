import { describe, expect, it } from "vitest";

import { cta } from "./links";

/** The one CTA builder (KTD-16, D-7): label and address from the mode. */
describe("cta", () => {
    it("waitlist mode: Join the waitlist, to /waitlist", () => {
        expect(cta({ src: "nav", mode: "waitlist" })).toMatchObject({
            label: "Join the waitlist",
            shortLabel: "Join waitlist",
            href: "/waitlist?src=nav",
        });
        expect(
            cta({ src: "home", plan: "free", mode: "waitlist" }),
        ).toMatchObject({
            label: "Join the waitlist",
            href: "/waitlist?plan=free&src=home",
        });
    });

    it("waitlist mode: a paid plan reads Get early access · Plan", () => {
        expect(
            cta({ src: "pricing", plan: "grow", mode: "waitlist" }),
        ).toMatchObject({
            label: "Get early access · Grow",
            href: "/waitlist?plan=grow&src=pricing",
        });
    });

    it("open mode: the design's labels, to sign-up with the plan", () => {
        const free = cta({ src: "nav", mode: "open" });
        expect(free.label).toBe("Start free");
        expect(free.href).toMatch(/\/signup\?src=nav$/);
        expect(cta({ src: "x", plan: "pro", mode: "open" }).label).toBe(
            "Choose Pro",
        );
        expect(
            cta({ src: "x", plan: "grow", trialDays: 14, mode: "open" }).label,
        ).toBe("Start 14-day trial");
        expect(cta({ src: "x", plan: "grow", mode: "open" }).href).toMatch(
            /\/signup\?plan=grow&cycle=month&src=x$/,
        );
    });

    it("open mode: a paid plan carries the cycle shown; Free carries none (U27)", () => {
        expect(
            cta({ src: "x", plan: "pro", cycle: "year", mode: "open" }).href,
        ).toMatch(/\/signup\?plan=pro&cycle=year&src=x$/);
        expect(
            cta({ src: "x", plan: "free", cycle: "year", mode: "open" }).href,
        ).toMatch(/\/signup\?plan=free&src=x$/);
    });

    it("waitlist mode never carries a cycle", () => {
        expect(
            cta({ src: "x", plan: "pro", cycle: "year", mode: "waitlist" })
                .href,
        ).toBe("/waitlist?plan=pro&src=x");
    });

    it("defaults to waitlist when the switch is unset", () => {
        expect(cta({ src: "nav" }).mode).toBe("waitlist");
    });
});

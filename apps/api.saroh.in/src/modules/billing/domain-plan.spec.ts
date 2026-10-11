/**
 * A business's own domain against its plan (DEC-139): the one rule, its
 * boundaries, the clock and the words. Pure; every domain is made up.
 */
import {
    clockStart,
    DOMAIN_GRACE_DAYS,
    domainEndedLine,
    domainEndingLine,
    domainNotice,
    domainPausedKey,
    domainPausedLine,
    domainPlanState,
    domainPlanView,
    domainStopsAt,
    domainToldKey,
    toldEndOf,
} from "./domain-plan";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-15T10:00:00.000Z");
const at = (days: number, ms = 0) => new Date(NOW.getTime() + days * DAY + ms);

const base = {
    enforced: true,
    includedNow: true,
    endsAt: null,
    endedAt: null,
    now: NOW,
};

describe("the domain's state (DEC-139)", () => {
    it("is included whatever else is true while plan enforcement is off", () => {
        for (const includedNow of [true, false]) {
            expect(
                domainPlanState({
                    ...base,
                    enforced: false,
                    includedNow,
                    endsAt: at(2),
                    endedAt: at(-30),
                }),
            ).toEqual({ state: "included" });
        }
    });

    it("is included on a plan with a domain and no end known", () => {
        expect(domainPlanState(base)).toEqual({ state: "included" });
    });

    it("is ending before a known end, and names the day it stops: 3 days after", () => {
        expect(domainPlanState({ ...base, endsAt: at(7) })).toEqual({
            state: "ending",
            endsAt: at(7),
            stopsAt: at(7 + DOMAIN_GRACE_DAYS),
        });
        // A millisecond before the end is still ending.
        expect(domainPlanState({ ...base, endsAt: at(0, 1) }).state).toBe(
            "ending",
        );
    });

    it("ignores an end that isn't ahead while the plan still includes a domain", () => {
        expect(domainPlanState({ ...base, endsAt: NOW })).toEqual({
            state: "included",
        });
        expect(domainPlanState({ ...base, endsAt: at(-1) })).toEqual({
            state: "included",
        });
    });

    it("still shows the site for 3 days after the plan ended", () => {
        const ended = { ...base, includedNow: false };
        // At the plan's end itself.
        expect(domainPlanState({ ...ended, endedAt: NOW })).toEqual({
            state: "grace",
            endedAt: NOW,
            stopsAt: at(3),
        });
        // A millisecond short of 3 days.
        expect(domainPlanState({ ...ended, endedAt: at(-3, 1) })).toEqual({
            state: "grace",
            endedAt: at(-3, 1),
            stopsAt: at(0, 1),
        });
    });

    it("is paused at exactly 3 days, and after", () => {
        const ended = { ...base, includedNow: false };
        expect(domainPlanState({ ...ended, endedAt: at(-3) })).toEqual({
            state: "paused",
            since: NOW,
        });
        expect(domainPlanState({ ...ended, endedAt: at(-40) })).toEqual({
            state: "paused",
            since: at(-37),
        });
    });

    it("counts the 3 days from now while no clock is written yet", () => {
        expect(domainPlanState({ ...base, includedNow: false })).toEqual({
            state: "grace",
            endedAt: NOW,
            stopsAt: at(3),
        });
        // A clock dated ahead of now can't be right: the same.
        expect(
            domainPlanState({ ...base, includedNow: false, endedAt: at(1) }),
        ).toEqual({ state: "grace", endedAt: NOW, stopsAt: at(3) });
    });

    it("comes back at once on a plan with a domain, whatever the clock says", () => {
        expect(domainPlanState({ ...base, endedAt: at(-40) })).toEqual({
            state: "included",
        });
    });

    it("stops 3 days after the end", () => {
        expect(domainStopsAt(NOW)).toEqual(at(3));
    });
});

describe("the clock (DEC-139)", () => {
    it("keys an end told ahead by its end and its stage, and reads the end back", () => {
        const key = domainToldKey(at(7), 7);
        expect(key).toBe(`domain-ending:${at(7).toISOString()}:7`);
        expect(toldEndOf(key)).toEqual(at(7));
        expect(toldEndOf("move-down:teamMembers=2")).toBeNull();
        expect(toldEndOf("domain-ending:not-a-date:7")).toBeNull();
    });

    it("starts at the end the business was told about once it has passed", () => {
        const told = [
            domainToldKey(at(-1, -500), 30),
            domainToldKey(at(-1, -500), 7),
        ];
        expect(clockStart(told, NOW)).toEqual(at(-1, -500));
    });

    it("starts now when nothing was told, or the end told is still ahead", () => {
        expect(clockStart([], NOW)).toEqual(NOW);
        // The plan ended early (an operator took it away): told for later.
        expect(clockStart([domainToldKey(at(5), 7)], NOW)).toEqual(NOW);
    });

    it("takes the latest end that has passed", () => {
        expect(
            clockStart(
                [domainToldKey(at(-9), 1), domainToldKey(at(-2), 1)],
                NOW,
            ),
        ).toEqual(at(-2));
    });

    it("keys the paused notice by its clock", () => {
        expect(domainPausedKey(NOW)).toBe(`domain-paused:${NOW.toISOString()}`);
    });
});

describe("what the workspace reads (DEC-139)", () => {
    it("gives the day for every state but included", () => {
        expect(domainPlanView({ state: "included" }, "a.saroh.app")).toEqual({
            state: "included",
            stopsAt: null,
            sendsTo: "a.saroh.app",
        });
        expect(
            domainPlanView(
                { state: "ending", endsAt: at(7), stopsAt: at(10) },
                null,
            ),
        ).toEqual({
            state: "ending",
            stopsAt: at(10).toISOString(),
            sendsTo: null,
        });
        expect(
            domainPlanView(
                { state: "grace", endedAt: NOW, stopsAt: at(3) },
                "a.saroh.app",
            ).stopsAt,
        ).toBe(at(3).toISOString());
        expect(
            domainPlanView({ state: "paused", since: at(-1) }, "a.saroh.app")
                .stopsAt,
        ).toBe(at(-1).toISOString());
    });
});

describe("the words (DEC-139)", () => {
    const one = {
        hostnames: ["shop.example.com"],
        stopsOn: "18 Nov 2026",
        address: "yourshop.saroh.app",
    };

    it("names the day, where visitors go, and that nothing is disconnected", () => {
        expect(domainEndingLine(one)).toBe(
            "shop.example.com stops showing your site on 18 Nov 2026, 3 days after your plan ends. After that, visitors are sent to yourshop.saroh.app. Your domain stays connected. It shows your site again as soon as you're on a plan with your own domain, with nothing to set up again.",
        );
        expect(domainEndedLine(one)).toContain(
            "Your plan no longer includes your own domain. shop.example.com shows your site until 18 Nov 2026. After that, visitors are sent to yourshop.saroh.app.",
        );
        expect(domainPausedLine(one)).toContain(
            "shop.example.com is paused: your plan doesn't include your own domain, so visitors are sent to yourshop.saroh.app.",
        );
    });

    it("lists several domains, and says less when they go to different addresses", () => {
        const two = {
            hostnames: ["shop.example.com", "www.example.org"],
            stopsOn: "18 Nov 2026",
            address: null,
        };
        expect(domainEndingLine(two)).toContain(
            "shop.example.com and www.example.org stop showing your site on 18 Nov 2026",
        );
        expect(domainEndingLine(two)).toContain(
            "visitors are sent to your Saroh address",
        );
        expect(domainPausedLine(two)).toContain(
            "shop.example.com and www.example.org are paused",
        );
    });

    it("titles the inbox notice with what is true", () => {
        expect(domainNotice("ending", one).title).toBe(
            "Your domain stops showing your site on 18 Nov 2026",
        );
        expect(domainNotice("ended", one).title).toBe(
            "Your domain stops showing your site on 18 Nov 2026",
        );
        expect(domainNotice("paused", one)).toEqual({
            title: "Your domain is paused",
            body: domainPausedLine(one),
        });
    });

    it("never says a price, a limit or which plan includes a domain", () => {
        for (const line of [
            domainEndingLine(one),
            domainEndedLine(one),
            domainPausedLine(one),
        ]) {
            expect(line).not.toMatch(/₹|\bFree\b|\bper month\b/);
        }
    });
});

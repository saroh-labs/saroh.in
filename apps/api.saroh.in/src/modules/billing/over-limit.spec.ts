import type { ModuleAccess } from "@saroh/pricing-catalog";

import type { PauseLimits, PauseMeasure, TeamPerson } from "./over-limit";
import {
    anythingPauses,
    claimStands,
    keepNewest,
    keepOldest,
    keepTeam,
    keptByCut,
    limitsKey,
    moveDownClaimKey,
    pauseDate,
    pausedByCut,
    pausedFromMeasure,
    pauseLimitsOf,
    pauseLines,
    pausesFrom,
    summaryEmpty,
    summaryOf,
    UNCAPPED,
} from "./over-limit";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-11-01T00:00:00.000Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);

function row(
    moduleId: string,
    patch: Partial<ModuleAccess> = {},
): ModuleAccess {
    return {
        moduleId,
        state: "on",
        inc: true,
        off: "locked",
        text: "",
        limit: null,
        per: "",
        soft: false,
        name: moduleId,
        what: "",
        override: "",
        upgradeTo: "",
        upgradePlanId: "",
        upgradePricePaise: 0,
        upgradeUncapped: false,
        plan: "Test",
        planId: "test",
        ...patch,
    };
}

const limits = (patch: Partial<PauseLimits>): PauseLimits => ({
    ...UNCAPPED,
    ...patch,
});

describe("pauseLimitsOf", () => {
    it("reads each row's cap; a row off caps at nothing, unknown or uncapped caps nothing", () => {
        const l = pauseLimitsOf([
            row("members", { limit: 4 }),
            row("reviewers", { limit: 2 }),
            row("products", { limit: 10 }),
            row("blog", { state: "locked", inc: false }),
            row("locations", { limit: null }),
        ]);
        expect(l).toEqual({
            teamMembers: 4,
            reviewers: 2,
            products: 10,
            blogPosts: 0,
            shopLocations: null,
            sites: null,
        });
    });

    it("a soft row that is off caps nothing, as metering never refuses it", () => {
        expect(
            pauseLimitsOf([row("products", { state: "locked", soft: true })])
                .products,
        ).toBeNull();
    });

    it("is stable as a claim key, and changes when any limit does", () => {
        const a = limits({ products: 10 });
        expect(limitsKey(a)).toBe(limitsKey({ ...a }));
        expect(moveDownClaimKey(a)).not.toBe(
            moveDownClaimKey(limits({ products: 11 })),
        );
        expect(moveDownClaimKey(a).startsWith("move-down:")).toBe(true);
    });
});

describe("products and posts: the newest stay", () => {
    const items = [
        { id: "a", createdAt: at(1) },
        { id: "b", createdAt: at(3) },
        { id: "c", createdAt: at(2) },
        { id: "d", createdAt: at(3) },
    ];

    it("keeps the most recently created up to the limit, ties by id", () => {
        const { kept, paused } = keepNewest(items, 2);
        expect(kept.map((i) => i.id)).toEqual(["d", "b"]);
        expect(paused.map((i) => i.id)).toEqual(["c", "a"]);
    });

    it("keeps everything with no cap, nothing at 0", () => {
        expect(keepNewest(items, null).paused).toEqual([]);
        expect(keepNewest(items, 0).kept).toEqual([]);
    });

    it("a cut at the oldest kept pauses exactly the rest", () => {
        const { kept, paused } = keepNewest(items, 2);
        const cut = kept[kept.length - 1];
        for (const i of paused) expect(pausedByCut(i, cut)).toBe(true);
        for (const i of kept) expect(pausedByCut(i, cut)).toBe(false);
        expect(pausedByCut(items[0], null)).toBe(false);
        expect(pausedByCut(items[0], "all")).toBe(true);
    });

    it("the cut's where keeps the same rows", () => {
        expect(keptByCut(null)).toEqual({});
        expect(keptByCut("all")).toEqual({ id: { in: [] } });
        expect(keptByCut({ id: "b", createdAt: at(3) })).toEqual({
            OR: [
                { createdAt: { gt: at(3) } },
                { createdAt: at(3), id: { gte: "b" } },
            ],
        });
    });
});

describe("locations and websites: the first made stay", () => {
    it("pauses the later ones", () => {
        const places = [
            { id: "s2", name: "Hill Road", createdAt: at(5) },
            { id: "s1", name: "Main Street", createdAt: at(1) },
            { id: "s3", name: "Pop-up", createdAt: at(9) },
        ];
        expect(keepOldest(places, 1).paused.map((p) => p.name)).toEqual([
            "Hill Road",
            "Pop-up",
        ]);
        expect(keepOldest(places, null).paused).toEqual([]);
    });
});

describe("team: the owner, then the earliest to join", () => {
    const person = (
        id: string,
        days: number,
        patch: Partial<TeamPerson> = {},
    ): TeamPerson => ({
        id,
        createdAt: at(days),
        kind: "member",
        label: id,
        owner: false,
        seat: "seat",
        ...patch,
    });
    const team = [
        person("late", 9),
        person("owner", 5, { owner: true }),
        person("early", 1),
        person("diary", 3, { kind: "diary" }),
        person("invite", 0, { kind: "invite" }),
        person("viewer1", 2, { seat: "viewOnly" }),
        person("viewer2", 4, { seat: "viewOnly" }),
    ];

    it("keeps the owner first, then members and diary people by join date, invitations last", () => {
        const { kept, paused } = keepTeam(team, "seat", 3);
        expect(kept.map((p) => p.id)).toEqual(["owner", "early", "diary"]);
        expect(paused.map((p) => p.id)).toEqual(["late", "invite"]);
    });

    it("never pauses the owner, even at a limit of 0", () => {
        expect(keepTeam(team, "seat", 0).kept.map((p) => p.id)).toEqual([
            "owner",
        ]);
    });

    it("counts view-only people against their own limit (DEC-105)", () => {
        expect(keepTeam(team, "viewOnly", 1).paused.map((p) => p.id)).toEqual([
            "viewer2",
        ]);
        expect(keepTeam(team, "seat", null).paused).toEqual([]);
    });
});

describe("the 7-day clock", () => {
    it("pauses 7 days after the business was told, never sooner", () => {
        expect(pausesFrom(T0)).toEqual(at(7));
        // Told 30 days ahead: pauses on the move's date.
        expect(pauseDate(at(0), at(30))).toEqual(at(30));
        // Told 7 days ahead: on the date.
        expect(pauseDate(at(0), at(7))).toEqual(at(7));
        // Told 1 day ahead: 7 days after the notice, 6 after the move.
        expect(pauseDate(at(0), at(1))).toEqual(at(7));
        // Moved already (told the hour it happened): 7 days on.
        expect(pauseDate(at(0), at(0))).toEqual(at(7));
    });
});

describe("claimStands: moving back up starts again", () => {
    const low = limits({ products: 3 });
    const key = moveDownClaimKey(low);

    it("stands while the business is over the limits it was told about", () => {
        expect(
            claimStands({
                eventKey: key,
                toldAt: at(0),
                current: low,
                over: true,
                now: at(90),
            }),
        ).toBe(true);
    });

    it("goes once the business is back under them", () => {
        expect(
            claimStands({
                eventKey: key,
                toldAt: at(0),
                current: low,
                over: false,
                now: at(10),
            }),
        ).toBe(false);
    });

    it("waits a month for a move told ahead, then goes once it moved back up", () => {
        const higher = limits({ products: 50 });
        const ahead = {
            eventKey: key,
            toldAt: at(0),
            current: higher,
            over: false,
        };
        expect(claimStands({ ...ahead, now: at(30) })).toBe(true);
        expect(claimStands({ ...ahead, now: at(32) })).toBe(false);
        // Enforcement switched off: the same, read as no limits.
        expect(claimStands({ ...ahead, current: null, now: at(32) })).toBe(
            false,
        );
    });
});

describe("what a notice lists", () => {
    const measure: PauseMeasure = {
        limits: limits({ teamMembers: 2, products: 3 }),
        people: [
            {
                id: "m3",
                createdAt: at(3),
                kind: "member",
                label: "Asha",
                owner: false,
                seat: "seat",
            },
            {
                id: "m4",
                createdAt: at(4),
                kind: "member",
                label: "Ravi",
                owner: false,
                seat: "seat",
            },
        ],
        products: { cut: { id: "p", createdAt: at(1) }, count: 4 },
        posts: { cut: null, count: 0 },
        locations: [{ id: "s2", name: "Hill Road", createdAt: at(2) }],
        sites: [],
    };

    it("names the people, counts products and posts, names the places", () => {
        const s = summaryOf(measure);
        expect(s).toEqual({
            people: ["Asha", "Ravi"],
            products: 4,
            posts: 0,
            locations: ["Hill Road"],
            sites: [],
        });
        expect(pauseLines(s)).toEqual([
            "Asha and Ravi are paused: they can't open the business until you move up again.",
            "4 products, your oldest, are hidden from your site and read-only.",
            "Hill Road stops taking orders. Stock and history are kept.",
        ]);
    });

    it("lists nothing when nothing pauses", () => {
        const none: PauseMeasure = {
            ...measure,
            people: [],
            products: { cut: null, count: 0 },
            locations: [],
        };
        expect(anythingPauses(none)).toBe(false);
        expect(summaryEmpty(summaryOf(none))).toBe(true);
        expect(pauseLines(summaryOf(none))).toEqual([]);
    });

    it("is what the enforcing reads get, by kind", () => {
        const p = pausedFromMeasure("org", at(7), measure);
        expect([...p.memberIds]).toEqual(["m3", "m4"]);
        expect(p.products).toEqual({ id: "p", createdAt: at(1) });
        expect(p.posts).toBeNull();
        expect([...p.storeIds]).toEqual(["s2"]);
        expect(p.siteIds.size).toBe(0);
    });
});

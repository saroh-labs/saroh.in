import type { OrgAction } from "../organizations/organization-actions";
import type { PauseMeasure } from "./over-limit";
import { UNCAPPED } from "./over-limit";
import type { OverLimitStanding } from "./over-limit.service";
import { NOTHING_PAUSED, pausedView } from "./paused-view";

const CUT_AT = new Date("2026-10-01T10:00:00.000Z");

const measure: PauseMeasure = {
    limits: { ...UNCAPPED, products: 3 },
    people: [
        {
            id: "mem_2",
            createdAt: CUT_AT,
            kind: "member",
            label: "Asha",
            owner: false,
            seat: "seat",
        },
        {
            id: "inv_1",
            createdAt: CUT_AT,
            kind: "invite",
            label: "ravi@example.com",
            owner: false,
            seat: "seat",
        },
    ],
    products: { cut: { createdAt: CUT_AT, id: "p_9" }, count: 4 },
    posts: { cut: null, count: 0 },
    locations: [{ id: "st_2", name: "Hill Road", createdAt: CUT_AT }],
    sites: [],
};

function standing(over: Partial<OverLimitStanding> = {}): OverLimitStanding {
    return {
        limits: measure.limits,
        measure,
        over: true,
        toldAt: new Date("2026-10-02T00:00:00.000Z"),
        pausesFrom: new Date("2026-10-09T00:00:00.000Z"),
        paused: true,
        ...over,
    };
}

const owner = { role: "OWNER" as const };
const only = (...a: OrgAction[]) => ({
    role: "MEMBER" as const,
    actions: new Set<OrgAction>(a),
});

describe("pausedView", () => {
    it("says nothing when nothing is enforced or over", () => {
        expect(pausedView(null, owner)).toEqual(NOTHING_PAUSED);
        expect(pausedView(standing({ over: false }), owner)).toEqual(
            NOTHING_PAUSED,
        );
    });

    it("is paused once the 7 days are up, with what and since when", () => {
        const v = pausedView(standing(), owner);
        expect(v.state).toBe("paused");
        expect(v.pausesFrom).toBe("2026-10-09T00:00:00.000Z");
        expect(v.products).toEqual({
            cut: { createdAt: CUT_AT.toISOString(), id: "p_9" },
            count: 4,
        });
        expect(v.posts).toEqual({ cut: null, count: 0 });
        expect(v.people).toEqual([
            { id: "mem_2", kind: "member", label: "Asha" },
            { id: "inv_1", kind: "invite", label: "ravi@example.com" },
        ]);
        expect(v.locations).toEqual([{ id: "st_2", name: "Hill Road" }]);
        expect(v.sites).toEqual([]);
    });

    it("is pending while the business has been told but the 7 days run", () => {
        const v = pausedView(standing({ paused: false }), owner);
        expect(v.state).toBe("pending");
        expect(v.pausesFrom).toBe("2026-10-09T00:00:00.000Z");
    });

    it("is pending with no date before the business is told", () => {
        const v = pausedView(
            standing({ paused: false, toldAt: null, pausesFrom: null }),
            owner,
        );
        expect(v.state).toBe("pending");
        expect(v.pausesFrom).toBeNull();
    });

    it("names people, locations and sites only to who may see them", () => {
        const v = pausedView(standing(), only("store:read"));
        expect(v.people).toBeNull();
        expect(v.sites).toBeNull();
        expect(v.locations).toEqual([{ id: "st_2", name: "Hill Road" }]);
        // The cut is no secret to anyone who lists products.
        expect(v.products.count).toBe(4);
    });

    it("names a paused team member's user, for the Team screen", () => {
        const v = pausedView(standing(), owner, new Map([["mem_2", "u_2"]]));
        expect(v.people?.[0]).toEqual({
            id: "mem_2",
            kind: "member",
            label: "Asha",
            userId: "u_2",
        });
        expect(v.people?.[1]).not.toHaveProperty("userId");
    });

    it("passes a limit of nothing through as all", () => {
        const v = pausedView(
            standing({
                measure: { ...measure, posts: { cut: "all", count: 2 } },
            }),
            owner,
        );
        expect(v.posts).toEqual({ cut: "all", count: 2 });
    });
});

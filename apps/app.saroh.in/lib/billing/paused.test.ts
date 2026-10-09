import { describe, expect, it } from "vitest";

import type { PausedView } from "./paused";
import {
    activeCut,
    NONE_PAUSED,
    pausedBanner,
    pausedByCut,
    pausedListWords,
    pausedLocationIds,
    pausedParts,
    pausedTeam,
    pausedWords,
    postPaused,
} from "./paused";

const CUT = { createdAt: "2026-06-01T00:00:00.000Z", id: "p_m" };

const view = (over: Partial<PausedView> = {}): PausedView => ({
    state: "paused",
    pausesFrom: "2026-10-09T00:00:00.000Z",
    people: [
        { id: "mem_2", kind: "member", label: "Asha", userId: "u_2" },
        { id: "inv_1", kind: "invite", label: "ravi@example.com" },
        { id: "st_9", kind: "diary", label: "Meena" },
    ],
    products: { cut: CUT, count: 2 },
    posts: { cut: null, count: 0 },
    locations: [{ id: "s_2", name: "Hill Road" }],
    sites: [],
    ...over,
});

describe("pausedByCut (#800)", () => {
    it("pauses a row made before the oldest one kept", () => {
        expect(
            pausedByCut({ id: "p_z", createdAt: "2026-05-01T00:00:00Z" }, CUT),
        ).toBe(true);
        expect(
            pausedByCut({ id: "p_a", createdAt: "2026-07-01T00:00:00Z" }, CUT),
        ).toBe(false);
    });

    it("breaks a tie at the same instant by id, as the API does", () => {
        expect(pausedByCut({ id: "p_a", createdAt: CUT.createdAt }, CUT)).toBe(
            true,
        );
        expect(pausedByCut({ id: "p_m", createdAt: CUT.createdAt }, CUT)).toBe(
            false,
        );
        expect(pausedByCut({ id: "p_z", createdAt: CUT.createdAt }, CUT)).toBe(
            false,
        );
    });

    it("pauses everything at a cut of all, and nothing with none", () => {
        expect(pausedByCut({ id: "x" }, "all")).toBe(true);
        expect(pausedByCut({ id: "x", createdAt: CUT.createdAt }, null)).toBe(
            false,
        );
    });

    it("never marks a row it can't date", () => {
        expect(pausedByCut({ id: "x" }, CUT)).toBe(false);
        expect(pausedByCut({ id: "x", createdAt: "not a date" }, CUT)).toBe(
            false,
        );
    });
});

describe("postPaused", () => {
    it("marks only a live post: a draft never counts toward the limit", () => {
        const old = { id: "a", createdAt: "2026-01-01T00:00:00Z" };
        expect(postPaused({ ...old, live: true }, "all")).toBe(true);
        expect(postPaused({ ...old, live: false }, "all")).toBe(false);
    });
});

describe("what marks rows", () => {
    it("only a pause in force marks rows; pending is the banner's alone", () => {
        expect(activeCut(view(), "products")).toEqual(CUT);
        expect(activeCut(view({ state: "pending" }), "products")).toBeNull();
        expect(activeCut(null, "products")).toBeNull();
        expect(pausedTeam(view({ state: "pending" }))).toBe(NONE_PAUSED);
        expect(pausedLocationIds(view({ state: "pending" }))).toEqual([]);
    });

    it("names team members by user and invitations by id", () => {
        expect(pausedTeam(view())).toEqual({
            userIds: ["u_2"],
            invitationIds: ["inv_1"],
        });
        expect(pausedTeam(view({ people: null }))).toBe(NONE_PAUSED);
    });

    it("lists the locations that stopped taking orders", () => {
        expect(pausedLocationIds(view())).toEqual(["s_2"]);
        expect(pausedLocationIds(view({ locations: null }))).toEqual([]);
    });
});

describe("the words", () => {
    it("say what, why and the way back, as the API's refusal does", () => {
        expect(pausedWords("product")).toBe(
            "This product is paused. Your plan includes fewer products than you have, so your oldest are hidden from your site and read-only. Choose a plan in Plan and billing to bring it back.",
        );
        expect(pausedWords("location")).toContain(
            "Stock and history are kept.",
        );
    });

    it("count a list's paused rows", () => {
        expect(pausedListWords("product", 1)).toBe(
            "1 product is paused. Your plan includes fewer products than you have, so your oldest are hidden from your site and read-only. Choose a plan in Plan and billing to bring it back.",
        );
        expect(pausedListWords("post", 3)).toMatch(
            /^3 blog posts are paused\..*bring them back\.$/,
        );
    });

    it("sum up what pauses, and leave out what the reader can't see", () => {
        expect(pausedParts(view())).toEqual([
            "3 team members",
            "2 products",
            "1 location",
        ]);
        expect(pausedParts(view({ people: null, locations: null }))).toEqual([
            "2 products",
        ]);
    });

    it("banner: paused now, pending with its date, nothing for none", () => {
        expect(pausedBanner(view())?.title).toBe(
            "Paused by your plan: 3 team members, 2 products and 1 location",
        );
        const pending = pausedBanner(view({ state: "pending" }));
        expect(pending?.title).toBe(
            "Your plan includes less than you have: 3 team members, 2 products and 1 location will pause",
        );
        expect(pending?.pausesFrom).toBe("2026-10-09T00:00:00.000Z");
        expect(pending?.body).toContain("choose or renew a plan");
        expect(pausedBanner(view({ state: "none" }))).toBeNull();
        expect(pausedBanner(null)).toBeNull();
    });
});

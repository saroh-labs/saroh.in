import { describe, expect, it, vi } from "vitest";

import { hasPlans, plansFeed, underPrefix } from "./plans-feed";

const PLAN = {
    id: "p_1",
    name: "Monthly box",
    description: null,
    price: "1200.00",
    currency: "INR",
    interval: "MONTH",
    mostChosen: false,
};

describe("the Plans block's plans on a served page (G9)", () => {
    it("reads nothing for a page without a Plans block", async () => {
        const read = vi.fn(() =>
            Promise.resolve({ plans: [PLAN], payOnline: true }),
        );
        const feed = await plansFeed(
            [{ type: "hero" }, { type: "journal" }],
            "/contact",
            read,
        );
        expect(feed).toBeUndefined();
        expect(read).not.toHaveBeenCalled();
    });

    it("reads once for a page with one, with where its button goes", async () => {
        const read = vi.fn(() =>
            Promise.resolve({ plans: [PLAN], payOnline: true }),
        );
        const feed = await plansFeed(
            [{ type: "plans" }, { type: "plans" }],
            "/contact",
            read,
        );
        expect(read).toHaveBeenCalledTimes(1);
        expect(feed).toEqual({
            plans: [PLAN],
            joinHref: "/contact",
            payOnline: true,
            // An API from before D12 names no autopay methods: none.
            autopayMethods: [],
        });
    });

    it("hands in an empty list when nothing is on sale, so the block draws nothing", async () => {
        const feed = await plansFeed([{ type: "plans" }], null, () =>
            Promise.resolve({ plans: [], payOnline: false }),
        );
        expect(feed).toEqual({
            plans: [],
            joinHref: null,
            payOnline: false,
            autopayMethods: [],
        });
    });

    it("hands the join sheet the provider's autopay methods (D12)", async () => {
        const feed = await plansFeed([{ type: "plans" }], "/contact", () =>
            Promise.resolve({
                plans: [PLAN],
                payOnline: true,
                autopayMethods: ["UPI", "CARD"],
            }),
        );
        expect(feed?.autopayMethods).toEqual(["UPI", "CARD"]);
    });

    it("knows a Plans block when it sees one", () => {
        expect(hasPlans([])).toBe(false);
        expect(hasPlans([{ type: "plans" }])).toBe(true);
    });

    it("keeps a preview's button inside the preview", () => {
        expect(underPrefix("/", "/preview/tok")).toBe("/preview/tok");
        expect(underPrefix("/contact", "/preview/tok")).toBe(
            "/preview/tok/contact",
        );
        expect(underPrefix(null, "/preview/tok")).toBeNull();
        expect(underPrefix("/contact", "")).toBe("/contact");
    });
});

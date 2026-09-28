import { describe, expect, it, vi } from "vitest";

import { hasPacks, packsFeed } from "./packs-feed";

const PACK = {
    id: "k_1",
    name: "10 classes",
    description: null,
    credits: 10,
    validityDays: 60,
    price: "4500.00",
    currency: "INR",
    kind: "CLASSES" as const,
    singlePrice: "600.00",
};

describe("the Class packs block's packs on a served page (G20)", () => {
    it("reads nothing for a page without a Class packs block", async () => {
        const read = vi.fn(() =>
            Promise.resolve({ packs: [PACK], payOnline: true }),
        );
        const feed = await packsFeed(
            [{ type: "hero" }, { type: "plans" }],
            "/contact",
            read,
        );
        expect(feed).toBeUndefined();
        expect(read).not.toHaveBeenCalled();
    });

    it("reads once for a page with one, with where Ask goes and whether Buy works", async () => {
        const read = vi.fn(() =>
            Promise.resolve({ packs: [PACK], payOnline: false }),
        );
        const feed = await packsFeed(
            [{ type: "packs" }, { type: "packs" }],
            "/contact#enquiry",
            read,
        );
        expect(read).toHaveBeenCalledTimes(1);
        expect(feed).toEqual({
            packs: [PACK],
            payOnline: false,
            askHref: "/contact#enquiry",
        });
    });

    it("knows a Class packs block when it sees one", () => {
        expect(hasPacks([])).toBe(false);
        expect(hasPacks([{ type: "packs" }])).toBe(true);
    });
});

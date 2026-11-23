// Copied product reviews read live: a published one shows, a hidden or
// deleted one is dropped, a hand-written one stays, and another business's
// id is ignored (the read is scoped to the site's own business).
jest.mock("@saroh/database", () => ({
    prisma: { productReview: { findMany: jest.fn() } },
}));

import { prisma } from "@saroh/database";

import { liveReviewSnapshot } from "./review-live";

const find = prisma.productReview.findMany as jest.Mock;

const snap = (items: unknown[]) => ({
    pages: [
        {
            path: "/",
            sections: [
                { type: "hero", content: {} },
                { type: "testimonials", content: { items } },
            ],
        },
    ],
    keys: { "/": { id: "p", sections: ["k0", "k1"] } },
});
const items = (s: unknown) =>
    (
        s as {
            pages: { sections: { content: { items: { name: string }[] } }[] }[];
        }
    ).pages[0]?.sections[1]?.content.items.map((i) => i.name);

const mine = { quote: "q", name: "Mine", reviewId: "r_ok" };
const hidden = { quote: "q", name: "Hidden", reviewId: "r_hidden" };
const typed = { quote: "q", name: "Typed" };
const other = { quote: "q", name: "Other", reviewId: "r_other_org" };

describe("copied reviews, read live", () => {
    beforeEach(() => find.mockReset());

    it("reads once, scoped to the business and to published, and keeps published and hand-written", async () => {
        find.mockResolvedValue([{ id: "r_ok" }]);
        const out = await liveReviewSnapshot(
            snap([mine, hidden, typed, other]),
            "org_1",
        );
        expect(find).toHaveBeenCalledTimes(1);
        expect(find).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                status: "PUBLISHED",
                id: { in: ["r_ok", "r_hidden", "r_other_org"] },
            },
            select: { id: true },
        });
        // Hidden/deleted dropped; another business's id isn't returned by
        // the scoped read, so it is dropped too.
        expect(items(out)).toEqual(["Mine", "Typed"]);
    });

    it("drops a section left empty, with its key", async () => {
        find.mockResolvedValue([]);
        const out = (await liveReviewSnapshot(snap([hidden]), "org_1")) as {
            pages: { sections: unknown[] }[];
            keys: Record<string, { sections: string[] }>;
        };
        expect(out.pages[0]?.sections).toHaveLength(1);
        expect(out.keys["/"]?.sections).toEqual(["k0"]);
    });

    it("returns a snapshot with no copied review untouched, with no read", async () => {
        const plain = snap([typed]);
        await expect(liveReviewSnapshot(plain, "org_1")).resolves.toBe(plain);
        expect(find).not.toHaveBeenCalled();
    });
});

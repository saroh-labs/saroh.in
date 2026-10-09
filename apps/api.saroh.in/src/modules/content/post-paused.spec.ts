// A live blog post past the plan's limit after a move to a lower plan is
// hidden and read-only (#800). DB-free: Prisma and the over-limit read are
// mocked.
jest.mock("@saroh/database", () => ({
    prisma: {
        post: { findFirst: jest.fn() },
        site: { findUnique: jest.fn() },
    },
}));
jest.mock("../billing/over-limit.service", () => ({
    overLimit: { pausedNow: jest.fn() },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { overLimit } from "../billing/over-limit.service";
import { assertPostEditable, keptPostsOnSite } from "./post-paused";

const post = prisma.post.findFirst as jest.Mock;
const site = prisma.site.findUnique as jest.Mock;
const pausedNow = overLimit.pausedNow as jest.Mock;

const CUT = { createdAt: new Date("2026-06-01T00:00:00Z"), id: "post_m" };

beforeEach(() => {
    post.mockReset();
    site.mockReset();
    pausedNow.mockReset();
});

describe("assertPostEditable (#800)", () => {
    it("refuses editing or republishing a live post older than the cut", async () => {
        pausedNow.mockResolvedValue({ posts: CUT });
        post.mockResolvedValue({
            id: "post_old",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            currentPublicationId: "pub_1",
        });
        const err = await assertPostEditable("org_1", "post_old").catch(
            (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).message).toBe(
            "This blog post is paused. Your plan includes fewer blog posts than you have, so your oldest are hidden from your site and read-only. Choose a plan in Plan and billing to bring it back.",
        );
    });

    it("lets a draft be edited: it isn't counted, so never paused", async () => {
        pausedNow.mockResolvedValue({ posts: "all" });
        post.mockResolvedValue({
            id: "post_d",
            createdAt: new Date("2020-01-01T00:00:00Z"),
            currentPublicationId: null,
        });
        await expect(
            assertPostEditable("org_1", "post_d"),
        ).resolves.toBeUndefined();
    });

    it("lets a kept live post be edited", async () => {
        pausedNow.mockResolvedValue({ posts: CUT });
        post.mockResolvedValue({ ...CUT, currentPublicationId: "pub_2" });
        await expect(
            assertPostEditable("org_1", "post_m"),
        ).resolves.toBeUndefined();
    });

    it("refuses nothing when nothing is paused", async () => {
        pausedNow.mockResolvedValue(null);
        await expect(
            assertPostEditable("org_1", "post_old"),
        ).resolves.toBeUndefined();
        expect(post).not.toHaveBeenCalled();
    });
});

describe("keptPostsOnSite (#800)", () => {
    it("is the cut's kept rows for the site's business", async () => {
        site.mockResolvedValue({ organizationId: "org_1" });
        pausedNow.mockResolvedValue({ posts: CUT });
        await expect(keptPostsOnSite("site_1")).resolves.toEqual({
            OR: [
                { createdAt: { gt: CUT.createdAt } },
                { createdAt: CUT.createdAt, id: { gte: CUT.id } },
            ],
        });
        expect(pausedNow).toHaveBeenCalledWith("org_1");
    });

    it("hides every live post at a limit of none", async () => {
        site.mockResolvedValue({ organizationId: "org_1" });
        pausedNow.mockResolvedValue({ posts: "all" });
        await expect(keptPostsOnSite("site_1")).resolves.toEqual({
            id: { in: [] },
        });
    });

    it("hides nothing when nothing is paused, or the site is gone", async () => {
        site.mockResolvedValue({ organizationId: "org_1" });
        pausedNow.mockResolvedValue(null);
        await expect(keptPostsOnSite("site_1")).resolves.toEqual({});
        site.mockResolvedValue(null);
        await expect(keptPostsOnSite("site_x")).resolves.toEqual({});
    });
});

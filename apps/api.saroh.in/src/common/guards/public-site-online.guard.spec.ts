jest.mock("@saroh/database", () => ({
    prisma: { site: { findUnique: jest.fn() } },
}));

import type { ExecutionContext } from "@nestjs/common";
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { PublicSiteOnlineGuard } from "./public-site-online.guard";

const findSite = prisma.site.findUnique as jest.Mock;

function contextFor(request: {
    params?: Record<string, string>;
    query?: Record<string, unknown>;
}): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
}

const guard = new PublicSiteOnlineGuard();

beforeEach(() => jest.clearAllMocks());

describe("PublicSiteOnlineGuard (#921)", () => {
    it.each(["ACTIVE", "SUSPENDED", "PENDING_DELETION"])(
        "lets a %s business's site answer",
        async (lifecycleStatus) => {
            findSite.mockResolvedValue({ organization: { lifecycleStatus } });
            await expect(
                guard.canActivate(contextFor({ params: { siteId: "s1" } })),
            ).resolves.toBe(true);
            expect(findSite).toHaveBeenCalledWith({
                where: { id: "s1" },
                select: {
                    organization: { select: { lifecycleStatus: true } },
                },
            });
        },
    );

    it("answers 404 for a deleted business's site", async () => {
        findSite.mockResolvedValue({
            organization: { lifecycleStatus: "DELETED_RETAINED" },
        });
        await expect(
            guard.canActivate(contextFor({ params: { siteId: "s1" } })),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("reads the site from the query when the route has none", async () => {
        findSite.mockResolvedValue({
            organization: { lifecycleStatus: "DELETED_RETAINED" },
        });
        await expect(
            guard.canActivate(contextFor({ query: { siteId: "s2" } })),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("leaves a route with no site, or a site it can't find, to the handler", async () => {
        await expect(
            guard.canActivate(contextFor({ params: {} })),
        ).resolves.toBe(true);
        expect(findSite).not.toHaveBeenCalled();
        findSite.mockResolvedValue(null);
        await expect(
            guard.canActivate(contextFor({ params: { siteId: "nope" } })),
        ).resolves.toBe(true);
    });
});

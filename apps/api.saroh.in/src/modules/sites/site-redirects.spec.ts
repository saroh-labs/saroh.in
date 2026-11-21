// Old page links that forward (KTD-3): the pure rules, then the service's
// refusals with a mocked database.
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {
        site: { findFirst: jest.fn() },
        page: { findMany: jest.fn() },
        siteRedirect: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    },
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    ownRedirectProblem,
    planPageMove,
    snapshotRedirectList,
    snapshotRedirects,
} from "./site-redirects";
import { SiteRedirectsService } from "./site-redirects.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const pageFindMany = prisma.page.findMany as jest.Mock;
const redirectFindFirst = prisma.siteRedirect.findFirst as jest.Mock;
const redirectCreate = prisma.siteRedirect.create as jest.Mock;
const redirectUpdate = prisma.siteRedirect.update as jest.Mock;

describe("planPageMove", () => {
    it("forwards a live page's old link to its new one", () => {
        expect(
            planPageMove({
                redirects: [],
                oldPath: "/services/bridal-makeup-packages",
                newPath: "/bridal",
                oldPathIsLive: true,
            }),
        ).toEqual({
            create: {
                from: "/services/bridal-makeup-packages",
                to: "/bridal",
            },
            retarget: [],
            remove: [],
        });
    });

    it("leaves nothing for a page that never went live", () => {
        expect(
            planPageMove({
                redirects: [],
                oldPath: "/draft",
                newPath: "/new",
                oldPathIsLive: false,
            }).create,
        ).toBeNull();
    });

    it.each(["/book", "/checkout/thanks", "/account"])(
        "never forwards from a built-in route: a page moved off %s leaves no forward",
        (oldPath) => {
            // The route answers there, so the forward could never take effect.
            expect(
                planPageMove({
                    redirects: [],
                    oldPath,
                    newPath: "/book-a-walkthrough",
                    oldPathIsLive: true,
                }).create,
            ).toBeNull();
        },
    );

    it("collapses a chain: A to B, then B to C, forwards A to C", () => {
        // After A→B: one row A→B. B never went live, so moving B to C makes
        // no row for B; the A row now lands on C.
        const plan = planPageMove({
            redirects: [{ id: "r1", fromPath: "/a", toPath: "/b" }],
            oldPath: "/b",
            newPath: "/c",
            oldPathIsLive: false,
        });
        expect(plan).toEqual({ create: null, retarget: ["r1"], remove: [] });
    });

    it("leaves no forward when a page goes back to its live link", () => {
        const plan = planPageMove({
            redirects: [{ id: "r1", fromPath: "/x", toPath: "/y" }],
            oldPath: "/y",
            newPath: "/x",
            oldPathIsLive: false,
        });
        expect(plan).toEqual({ create: null, retarget: [], remove: ["r1"] });
    });

    it("takes out the merchant's own forward from the link the page takes", () => {
        const plan = planPageMove({
            redirects: [{ id: "own", fromPath: "/prices", toPath: "/" }],
            oldPath: "/rates",
            newPath: "/prices",
            oldPathIsLive: true,
        });
        expect(plan.remove).toEqual(["own"]);
        expect(plan.create).toEqual({ from: "/rates", to: "/prices" });
    });
});

describe("ownRedirectProblem", () => {
    const pages = new Set(["/", "/prices", "/about"]);

    it("allows an old link that is not a page, to a page", () => {
        expect(ownRedirectProblem("/old-prices", "/prices", pages)).toBeNull();
    });

    it.each([
        ["/a", "/a", /itself/],
        ["/about", "/prices", /is a page on your site/],
        ["/old", "/gone", /isn't a page on your site/],
        ["/shop", "/prices", /online shop/],
        ["/book/old", "/prices", /booking page/],
        ["/account", "/prices", /can't forward/],
    ])("refuses %s to %s", (from, to, words) => {
        expect(ownRedirectProblem(from, to, pages)).toMatch(words);
    });

    it("never says redirect or slug", () => {
        for (const [from, to] of [
            ["/a", "/a"],
            ["/about", "/prices"],
            ["/old", "/gone"],
            ["/shop", "/prices"],
        ]) {
            expect(ownRedirectProblem(from, to, pages)).not.toMatch(
                /redirect|slug/i,
            );
        }
    });
});

describe("snapshotRedirects", () => {
    it("keeps only forwards that land on a page and never shadow one, sorted", () => {
        expect(
            snapshotRedirects(
                [
                    { fromPath: "/z", toPath: "/a" },
                    { fromPath: "/b", toPath: "/a" },
                    { fromPath: "/a", toPath: "/c" }, // shadows a page
                    { fromPath: "/gone", toPath: "/hidden" }, // lands nowhere
                ],
                new Set(["/", "/a", "/c"]),
            ),
        ).toEqual([
            { from: "/b", to: "/a" },
            { from: "/z", to: "/a" },
        ]);
    });

    it("never carries a forward from a built-in route, even one already stored", () => {
        expect(
            snapshotRedirects(
                [
                    { fromPath: "/book", toPath: "/book-a-walkthrough" },
                    { fromPath: "/old", toPath: "/book-a-walkthrough" },
                ],
                new Set(["/", "/book-a-walkthrough"]),
            ),
        ).toEqual([{ from: "/old", to: "/book-a-walkthrough" }]);
    });

    it("reads no forwards from a snapshot made before them", () => {
        expect(snapshotRedirectList({ pages: [] })).toEqual([]);
        expect(snapshotRedirectList(null)).toEqual([]);
    });
});

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        ...over,
    };
}

describe("SiteRedirectsService", () => {
    const service = new SiteRedirectsService();

    beforeEach(() => {
        jest.clearAllMocks();
        siteFindFirst.mockResolvedValue({
            id: "site_1",
            currentPublicationId: null,
        });
        pageFindMany.mockResolvedValue([
            { path: "/", title: "Home" },
            { path: "/prices", title: "Prices" },
        ]);
        redirectFindFirst.mockResolvedValue(null);
    });

    it("forwards an old link the merchant adds, waiting for Publish", async () => {
        redirectCreate.mockResolvedValue({
            id: "r1",
            fromPath: "/old-prices",
            toPath: "/prices",
            source: "OWN",
            createdAt: new Date(),
        });
        const made = await service.create(ctx(), "site_1", {
            fromPath: "/old-prices",
            toPath: "/prices",
        });
        expect(made).toMatchObject({ toTitle: "Prices", live: false });
        expect(redirectCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_1",
            source: "OWN",
            createdByUserId: "user_1",
        });
    });

    it("refuses an old link forwarding to itself with a 400", async () => {
        await expect(
            service.create(ctx(), "site_1", { fromPath: "/a", toPath: "/a" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(redirectCreate).not.toHaveBeenCalled();
    });

    it("refuses an old link that already forwards with a 409", async () => {
        redirectFindFirst.mockResolvedValue({ toPath: "/" });
        await expect(
            service.create(ctx(), "site_1", {
                fromPath: "/old",
                toPath: "/prices",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses a reviewer before touching the database", async () => {
        await expect(
            service.create(ctx({ role: "REVIEWER" }), "site_1", {
                fromPath: "/old",
                toPath: "/prices",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(siteFindFirst).not.toHaveBeenCalled();
    });

    it("keeps a forward a page's link change made (forever)", async () => {
        redirectFindFirst.mockResolvedValue({ id: "r1", source: "AUTO" });
        await expect(
            service.remove(ctx(), "site_1", "r1"),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(redirectUpdate).not.toHaveBeenCalled();
    });

    it("stops forwarding the merchant's own old link from the next publish", async () => {
        redirectFindFirst.mockResolvedValue({ id: "r1", source: "OWN" });
        await expect(service.remove(ctx(), "site_1", "r1")).resolves.toEqual({
            removed: true,
        });
        expect(redirectUpdate.mock.calls[0][0].data.removedAt).toBeInstanceOf(
            Date,
        );
    });
});

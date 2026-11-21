// A page's results (website editor plan U47a): the pure fold, then the read
// with a mocked database.
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {
        site: { findFirst: jest.fn() },
        analyticsDailyAggregate: { findMany: jest.fn(), groupBy: jest.fn() },
    },
}));
jest.mock("../bookings/staff-availability", () => ({
    businessTimezone: jest.fn().mockResolvedValue("Asia/Kolkata"),
}));
jest.mock("./module-pages", () => ({ modulePageState: jest.fn() }));

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { modulePageState } from "./module-pages";
import { foldPageResults, PageResultsService } from "./page-results";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const aggFindMany = prisma.analyticsDailyAggregate.findMany as jest.Mock;
const aggGroupBy = prisma.analyticsDailyAggregate.groupBy as jest.Mock;
const moduleState = modulePageState as jest.Mock;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const WINDOW = { fromDate: "2026-11-10", toDate: "2026-11-16" };
const BOTH = { bookings: true, shop: false };

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        ...over,
    };
}

describe("foldPageResults", () => {
    const counting = new Map([
        ["site.view", day("2026-01-01")],
        ["enquiry.submitted", day("2026-01-01")],
        ["site.started", day("2026-01-01")],
        ["site.paid", day("2026-01-01")],
    ]);

    it("counts three views and one enquiry on the page", () => {
        const r = foldPageResults(
            "/bridal",
            [
                { type: "site.view", count: 2 },
                { type: "site.view", count: 1 },
                { type: "enquiry.submitted", count: 1 },
            ],
            counting,
            WINDOW,
            BOTH,
        );
        expect(r.visits).toEqual({ count: 3, since: null });
        expect(r.questions).toEqual({ count: 1, since: null });
        // Measured and none: a real 0.
        expect(r.started).toEqual({ count: 0, since: null });
    });

    it("leaves out started and paid when nothing is sold", () => {
        const r = foldPageResults("/", [], counting, WINDOW, {
            bookings: false,
            shop: false,
        });
        expect(r.started).toBeNull();
        expect(r.paid).toBeNull();
    });

    it("says since when a part began counting mid-window, null when never", () => {
        const r = foldPageResults(
            "/bridal",
            [{ type: "site.started", count: 2 }],
            new Map([
                ["site.view", day("2026-01-01")],
                ["site.started", day("2026-11-13")],
            ]),
            WINDOW,
            BOTH,
        );
        expect(r.started).toEqual({ count: 2, since: "2026-11-13" });
        expect(r.questions).toBeNull();
        expect(r.paid).toBeNull();
    });
});

describe("PageResultsService.read", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    beforeEach(() => {
        jest.clearAllMocks();
        siteFindFirst.mockResolvedValue({ id: "site_1" });
        aggFindMany.mockResolvedValue([{ type: "site.view", count: 4 }]);
        aggGroupBy.mockResolvedValue([
            { type: "site.view", _min: { date: day("2026-01-01") } },
        ]);
        moduleState.mockResolvedValue({ state: "on" });
    });

    it("reads the page's path rows, the query cut off", async () => {
        const { results } = await new PageResultsService().read(
            ctx(),
            "site_1",
            "/bridal?ref=ig",
            now,
        );
        expect(results?.visits).toEqual({ count: 4, since: null });
        expect(results?.path).toBe("/bridal");
        expect(aggFindMany.mock.calls[0][0].where).toMatchObject({
            organizationId: "org_1",
            siteId: "site_1",
            dimension: "path",
            dimensionValue: "/bridal",
        });
    });

    it("answers null to someone who may not read Insights", async () => {
        const { results } = await new PageResultsService().read(
            ctx({ role: "MEMBER" }),
            "site_1",
            "/",
            now,
        );
        expect(results).toBeNull();
        expect(aggFindMany).not.toHaveBeenCalled();
    });

    it("is a 404 for a reviewer of another site", async () => {
        siteFindFirst.mockResolvedValue(null);
        await expect(
            new PageResultsService().read(
                ctx({ role: "REVIEWER" }),
                "site_2",
                "/",
                now,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(siteFindFirst.mock.calls[0][0].where).toMatchObject({
            reviewers: { some: { userId: "user_1" } },
        });
    });
});

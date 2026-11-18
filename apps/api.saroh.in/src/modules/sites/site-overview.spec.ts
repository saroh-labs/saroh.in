// A site's Overview (website area U4): the pure folds, then the read with a
// mocked database.
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {
        site: { findFirst: jest.fn() },
        publication: { findMany: jest.fn() },
        auditEvent: { findMany: jest.fn() },
        analyticsDailyAggregate: { findMany: jest.fn(), groupBy: jest.fn() },
        pageVersion: { findMany: jest.fn() },
        page: { findMany: jest.fn() },
        user: { findMany: jest.fn() },
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
import {
    foldResults,
    newestFirst,
    siteCardExtras,
    SiteOverviewService,
} from "./site-overview";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const pubFindMany = prisma.publication.findMany as jest.Mock;
const auditFindMany = prisma.auditEvent.findMany as jest.Mock;
const aggFindMany = prisma.analyticsDailyAggregate.findMany as jest.Mock;
const aggGroupBy = prisma.analyticsDailyAggregate.groupBy as jest.Mock;
const versionFindMany = prisma.pageVersion.findMany as jest.Mock;
const pageFindMany = prisma.page.findMany as jest.Mock;
const userFindMany = prisma.user.findMany as jest.Mock;
const moduleState = modulePageState as jest.Mock;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const WINDOW = { fromDate: "2026-11-10", toDate: "2026-11-16" };

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        ...over,
    };
}

describe("foldResults", () => {
    const rows = [
        { date: day("2026-11-10"), type: "site.visit", count: 31 },
        { date: day("2026-11-16"), type: "site.visit", count: 47 },
        { date: day("2026-11-12"), type: "site.started", count: 6 },
        { date: day("2026-11-13"), type: "enquiry.submitted", count: 2 },
        { date: day("2026-11-14"), type: "site.paid", count: 1 },
    ];

    it("adds up each part and draws seven days", () => {
        const r = foldResults(rows, WINDOW, { bookings: true, shop: true });
        expect(r).toMatchObject({
            from: "2026-11-10",
            to: "2026-11-16",
            visits: 78,
            started: 6,
            questions: 2,
            paid: 1,
        });
        expect(r.days.map((d) => d.visits)).toEqual([31, 0, 0, 0, 0, 0, 47]);
        expect(r.days[6]?.date).toBe("2026-11-16");
    });

    it("leaves out started and paid when nothing on the site is sold", () => {
        const r = foldResults(rows, WINDOW, { bookings: false, shop: false });
        expect(r.started).toBeNull();
        expect(r.paid).toBeNull();
        expect(r.questions).toBe(2);
    });

    it("says 0, not nothing, for a site with no visits", () => {
        const r = foldResults([], WINDOW, { bookings: true, shop: false });
        expect(r.visits).toBe(0);
        expect(r.started).toBe(0);
    });
});

describe("newestFirst", () => {
    it("sorts by time and keeps the limit", () => {
        const at = (h: number) => `2026-11-16T0${h}:00:00.000Z`;
        const e = (h: number) => ({
            kind: "saved" as const,
            at: at(h),
            by: null,
            subject: null,
        });
        expect(newestFirst([e(1), e(3), e(2)], 2).map((x) => x.at)).toEqual([
            at(3),
            at(2),
        ]);
    });
});

describe("SiteOverviewService.read", () => {
    const service = new SiteOverviewService();
    const NOW = new Date("2026-11-16T10:00:00Z");

    beforeEach(() => {
        jest.clearAllMocks();
        siteFindFirst.mockResolvedValue({
            socialImageUrl: null,
            currentPublication: {
                publishedAt: new Date("2026-11-14T06:00:00Z"),
                publishedByUserId: "u_mohit",
            },
            pages: [
                {
                    id: "p_home",
                    title: "Home",
                    path: "/",
                    hidden: false,
                    kind: "FREE",
                    inMenu: true,
                    noindex: false,
                    seoDescription: null,
                    shareImageUrl: "https://x/y.jpg",
                    shareImageMediaId: null,
                    settingsEditedAt: new Date("2026-11-15T09:00:00Z"),
                    settingsEditedByUserId: "u_ritika",
                    versions: [
                        {
                            revision: 3,
                            updatedAt: new Date("2026-11-16T08:00:00Z"),
                            sections: [],
                        },
                    ],
                },
            ],
        });
        pubFindMany.mockResolvedValue([
            {
                publishedAt: new Date("2026-11-14T06:00:00Z"),
                publishedByUserId: "u_mohit",
                postId: null,
                sourcePublicationId: null,
                post: null,
                wentLiveFor: null,
            },
            {
                publishedAt: new Date("2026-11-13T06:00:00Z"),
                publishedByUserId: "u_arjun",
                postId: "post_1",
                sourcePublicationId: null,
                post: { title: "Monsoon hair care" },
                wentLiveFor: null,
            },
        ]);
        auditFindMany.mockResolvedValue([
            {
                action: "site.publish_approval.on",
                actorUserId: "u_mohit",
                createdAt: new Date("2026-11-12T06:00:00Z"),
            },
        ]);
        aggFindMany.mockResolvedValue([
            { date: day("2026-11-16"), type: "site.visit", count: 5 },
        ]);
        userFindMany.mockResolvedValue([
            { id: "u_mohit", name: "Mohit Mehta", email: "m@example.com" },
            { id: "u_ritika", name: "Ritika Sharma", email: "r@example.com" },
            { id: "u_arjun", name: "Arjun Kapoor", email: "a@example.com" },
        ]);
        moduleState.mockImplementation((kind: string) =>
            Promise.resolve({ state: kind === "BOOK" ? "on" : "off" }),
        );
    });

    it("reads results, what needs doing and activity, newest first", async () => {
        const o = await service.read(ctx(), "site_1", NOW);
        expect(o.results).toMatchObject({
            from: "2026-11-10",
            to: "2026-11-16",
            visits: 5,
            sells: { bookings: true, shop: false },
        });
        expect(o.needsDoing).toEqual([
            {
                pageId: "p_home",
                title: "Home",
                path: "/",
                issues: ["googleText"],
            },
        ]);
        expect(o.activity.map((a) => [a.kind, a.by, a.subject])).toEqual([
            ["saved", null, "Home"],
            ["page_settings", "Ritika Sharma", "Home"],
            ["published", "Mohit Mehta", null],
            ["post_published", "Arjun Kapoor", "Monsoon hair care"],
            ["approval_on", "Mohit Mehta", null],
        ]);
        expect(o.lastPublished).toEqual({
            at: "2026-11-14T06:00:00.000Z",
            by: "Mohit Mehta",
        });
        // The business's last 7 days, as UTC day buckets.
        expect(aggFindMany.mock.calls[0]?.[0].where).toMatchObject({
            siteId: "site_1",
            dimension: "",
            date: { gte: day("2026-11-10"), lte: day("2026-11-16") },
        });
    });

    it("gives a reviewer no results and asks for only their sites", async () => {
        const o = await service.read(ctx({ role: "REVIEWER" }), "site_1", NOW);
        expect(o.results).toBeNull();
        expect(aggFindMany).not.toHaveBeenCalled();
        expect(siteFindFirst.mock.calls[0]?.[0].where).toMatchObject({
            reviewers: { some: { userId: "user_1" } },
        });
    });

    it("is not found for a site outside the business or the reviewer's reach", async () => {
        siteFindFirst.mockResolvedValue(null);
        await expect(service.read(ctx(), "site_x", NOW)).rejects.toThrow(
            NotFoundException,
        );
    });
});

describe("siteCardExtras", () => {
    beforeEach(() => jest.clearAllMocks());

    it("counts 7-day visits and picks the latest edit or publish", async () => {
        aggGroupBy.mockResolvedValue([{ siteId: "s1", _sum: { count: 297 } }]);
        versionFindMany.mockResolvedValue([
            {
                updatedAt: new Date("2026-11-16T08:00:00Z"),
                page: { siteId: "s1" },
            },
        ]);
        pageFindMany.mockResolvedValue([]);
        userFindMany.mockResolvedValue([
            { id: "u_mohit", name: "Mohit Mehta", email: "m@example.com" },
        ]);
        const pub = {
            publishedAt: new Date("2026-11-14T06:00:00Z"),
            publishedByUserId: "u_mohit",
        };
        const extras = await siteCardExtras(
            ctx(),
            [
                { id: "s1", currentPublication: pub },
                { id: "s2", currentPublication: pub },
            ],
            new Date("2026-11-16T10:00:00Z"),
        );
        expect(extras.get("s1")).toEqual({
            visitsLast7Days: 297,
            lastActivity: {
                kind: "edited",
                by: null,
                at: "2026-11-16T08:00:00.000Z",
            },
        });
        expect(extras.get("s2")).toEqual({
            visitsLast7Days: 0,
            lastActivity: {
                kind: "published",
                by: "Mohit Mehta",
                at: "2026-11-14T06:00:00.000Z",
            },
        });
    });

    it("leaves visits out for someone who can't read Insights", async () => {
        versionFindMany.mockResolvedValue([]);
        pageFindMany.mockResolvedValue([]);
        userFindMany.mockResolvedValue([]);
        const extras = await siteCardExtras(ctx({ role: "REVIEWER" }), [
            { id: "s1", currentPublication: null },
        ]);
        expect(aggGroupBy).not.toHaveBeenCalled();
        expect(extras.get("s1")).toEqual({
            visitsLast7Days: null,
            lastActivity: null,
        });
    });
});

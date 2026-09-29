import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { REVIEW_PAGE_LIMIT } from "./home-reviewer";
import { HomeService } from "./home.service";

/**
 * A Reviewer's Home (round 2, F9): the sites they were asked to review and
 * the notes waiting on them, and nothing about the business.
 *
 * The client is strict: any table but the four the reviewer view may read
 * throws, and so does module availability. So "no other source is read" is
 * what these specs prove, not what they hope.
 */

const REVIEWER = {
    organizationId: "org_rye",
    organizationRole: "REVIEWER" as const,
    userId: "user_dalia",
};

interface Grant {
    site: {
        id: string;
        name: string;
        subdomain: string | null;
        currentPublicationId: string | null;
        pages: { id: string; title: string; path: string }[];
    };
}

interface Fixture {
    grants?: Grant[];
    approvals?: {
        siteId: string;
        outcome: string;
        createdAt: Date;
        by: { name: string | null; email: string };
    }[];
    notes?: {
        siteId: string;
        pageId: string | null;
        _count: { _all: number };
    }[];
    failGrants?: boolean;
}

const RYE_SITE: Grant = {
    site: {
        id: "site_rye",
        name: "Rye & Co.",
        subdomain: "rye",
        currentPublicationId: "pub_1",
        pages: [
            { id: "page_home", title: "Home", path: "/" },
            { id: "page_menu", title: "Menu", path: "/menu" },
        ],
    },
};

function build(fixture: Fixture = {}) {
    const siteReviewer = {
        findMany: jest.fn(() =>
            fixture.failGrants
                ? Promise.reject(new Error("grants down"))
                : Promise.resolve(fixture.grants ?? []),
        ),
    };
    const siteApproval = {
        findMany: jest.fn().mockResolvedValue(fixture.approvals ?? []),
    };
    const siteComment = {
        groupBy: jest.fn().mockResolvedValue(fixture.notes ?? []),
    };
    const businessProfile = {
        findUnique: jest.fn().mockResolvedValue({ timezone: "Asia/Kolkata" }),
    };
    const allowed: Record<string, unknown> = {
        siteReviewer,
        siteApproval,
        siteComment,
        businessProfile,
    };
    const read: string[] = [];
    const db = new Proxy(allowed, {
        get(target, table: string) {
            if (table in target) return target[table];
            read.push(table);
            throw new Error(`Reviewer Home read "${table}"`);
        },
    });
    const availability = {
        listViews: jest.fn(() => {
            throw new Error("Reviewer Home read module availability");
        }),
    } as unknown as ModuleAvailabilityService;
    const stockChecks = {
        openShort: jest.fn(() => {
            throw new Error("Reviewer Home read stock");
        }),
    };
    const service = new HomeService(
        availability,
        db as never,
        stockChecks as never,
    );
    return { service, siteReviewer, siteApproval, siteComment, read };
}

/** Every key anywhere in a JSON value. */
function keysOf(value: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
    else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
            out.add(k);
            keysOf(v, out);
        }
    }
    return out;
}

describe("Home for a Reviewer (F9)", () => {
    it("lists the one site they were granted, its pages and its open notes", async () => {
        const { service } = build({
            grants: [RYE_SITE],
            approvals: [
                {
                    siteId: "site_rye",
                    outcome: "REQUESTED",
                    createdAt: new Date("2026-09-17T06:00:00.000Z"),
                    by: { name: "Priya Raman", email: "priya@rye.example" },
                },
            ],
            notes: [
                {
                    siteId: "site_rye",
                    pageId: "page_home",
                    _count: { _all: 2 },
                },
                { siteId: "site_rye", pageId: null, _count: { _all: 1 } },
            ],
        });

        const home = await service.build(REVIEWER);

        expect(home.view).toBe("reviewer");
        expect(home.reviews).toEqual([
            {
                id: "site_rye",
                name: "Rye & Co.",
                href: "/sites/site_rye/review",
                requestedBy: "Priya Raman",
                requestedAt: "2026-09-17T06:00:00.000Z",
                // The page's two, and one on a page that's gone.
                openNotes: 3,
                pages: [
                    {
                        id: "page_home",
                        title: "Home",
                        path: "/",
                        openNotes: 2,
                        href: "/sites/site_rye/review?page=page_home",
                    },
                    {
                        id: "page_menu",
                        title: "Menu",
                        path: "/menu",
                        openNotes: 0,
                        href: "/sites/site_rye/review?page=page_menu",
                    },
                ],
                pageCount: 2,
                subdomain: "rye",
                live: true,
            },
        ]);
        expect(home.unavailable).toEqual([]);
        // The greeting still has its clock, in the business's zone.
        expect(home.lastDay.zone).toBe("Asia/Kolkata");
        expect(home.lastDay.items).toEqual([]);
    });

    it("asks only for this person's grants, in this business, on sites not deleted", async () => {
        const { service, siteReviewer, siteApproval, siteComment } = build({
            grants: [RYE_SITE],
        });

        await service.build(REVIEWER);

        const where = (
            siteReviewer.findMany.mock.calls[0] as unknown as [
                { where: unknown },
            ]
        )[0].where;
        expect(where).toEqual({
            organizationId: "org_rye",
            userId: "user_dalia",
            site: { organizationId: "org_rye", deletedAt: null },
        });
        // The verdicts and notes are asked only of the granted site.
        expect(siteApproval.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    organizationId: "org_rye",
                    siteId: { in: ["site_rye"] },
                }),
            }),
        );
        expect(siteComment.groupBy).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_rye",
                    siteId: { in: ["site_rye"] },
                    resolvedAt: null,
                },
            }),
        );
    });

    it("carries no order, booking or money field, and reads no other source", async () => {
        const { service, read } = build({ grants: [RYE_SITE] });

        const home = await service.build(REVIEWER);

        expect(read).toEqual([]);
        expect(home.actions).toEqual([]);
        expect(home).not.toHaveProperty("primaryAction");
        expect(home.needs).toEqual([]);
        expect(home.needsTotal).toBe(0);
        expect(home).not.toHaveProperty("numbers");
        expect(home.upcoming).toEqual([]);
        expect(home.today).toBeNull();
        const keys = keysOf(JSON.parse(JSON.stringify(home)));
        for (const money of [
            "amountMinor",
            "currency",
            "total",
            "orderId",
            "startAt",
            "evidence",
            "week",
        ]) {
            expect(keys.has(money)).toBe(false);
        }
        // Only the granted site's id travels.
        const text = JSON.stringify(home);
        expect(text).not.toContain("site_other");
    });

    it("says nothing is waiting when no review has been asked for, or it was answered", async () => {
        const { service } = build({
            grants: [RYE_SITE],
            approvals: [
                {
                    siteId: "site_rye",
                    outcome: "APPROVED",
                    createdAt: new Date("2026-09-17T06:00:00.000Z"),
                    by: { name: "Dalia Haddad", email: "dalia@example.com" },
                },
            ],
        });

        const [site] = (await service.build(REVIEWER)).reviews ?? [];

        expect(site.requestedBy).toBeNull();
        expect(site.requestedAt).toBeNull();
    });

    it("names who asked by email when they have no name", async () => {
        const { service } = build({
            grants: [RYE_SITE],
            approvals: [
                {
                    siteId: "site_rye",
                    outcome: "REQUESTED",
                    createdAt: new Date("2026-09-17T06:00:00.000Z"),
                    by: { name: "  ", email: "priya@rye.example" },
                },
            ],
        });

        const [site] = (await service.build(REVIEWER)).reviews ?? [];

        expect(site.requestedBy).toBe("priya@rye.example");
    });

    it("lists five pages and counts the rest", async () => {
        const pages = Array.from({ length: 8 }, (_, i) => ({
            id: `page_${i}`,
            title: i === 3 ? " " : `Page ${i}`,
            path: `/p${i}`,
        }));
        const { service } = build({
            grants: [{ site: { ...RYE_SITE.site, pages } }],
        });

        const [site] = (await service.build(REVIEWER)).reviews ?? [];

        expect(site.pages).toHaveLength(REVIEW_PAGE_LIMIT);
        expect(site.pageCount).toBe(8);
        // A page with no title is called by its path.
        expect(site.pages[3].title).toBe("/p3");
    });

    it("gives a reviewer with no sites an empty list, and reads nothing after the grants", async () => {
        const { service, siteApproval, siteComment } = build({ grants: [] });

        const home = await service.build(REVIEWER);

        expect(home.view).toBe("reviewer");
        expect(home.reviews).toEqual([]);
        expect(home.unavailable).toEqual([]);
        expect(siteApproval.findMany).not.toHaveBeenCalled();
        expect(siteComment.groupBy).not.toHaveBeenCalled();
    });

    it("reads nothing without a viewer to scope the grants to", async () => {
        const { service, siteReviewer } = build({ grants: [RYE_SITE] });

        const home = await service.build({
            organizationId: "org_rye",
            organizationRole: "REVIEWER",
        });

        expect(home.reviews).toEqual([]);
        expect(siteReviewer.findMany).not.toHaveBeenCalled();
    });

    it("names the sites as missing when they can't be read, never as none", async () => {
        const { service } = build({ failGrants: true });

        const home = await service.build(REVIEWER);

        expect(home.reviews).toEqual([]);
        expect(home.unavailable).toEqual([
            { moduleKey: "WEBSITE", label: "Sites to review" },
        ]);
    });

    it("an unpublished site has no live site to see", async () => {
        const { service } = build({
            grants: [
                {
                    site: {
                        ...RYE_SITE.site,
                        subdomain: null,
                        currentPublicationId: null,
                    },
                },
            ],
        });

        const [site] = (await service.build(REVIEWER)).reviews ?? [];

        expect(site.live).toBe(false);
        expect(site.subdomain).toBeNull();
    });
});

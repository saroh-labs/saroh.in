// DB-free unit tests for the site-level half of the pre-publish check. The
// detectors themselves are covered by site-flags.spec.ts; what is proven here
// is what the service feeds them — in particular whether "there are edits
// visitors cannot see yet" is true, which depends on two different reads.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            site: { findFirst: jest.fn(), findMany: jest.fn() },
        },
    };
});

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const siteFindMany = prisma.site.findMany as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        ...over,
    };
}

const service = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as import("../billing/entitlement.service").EntitlementService);

const PUBLISHED_AT = new Date("2026-09-01T10:00:00Z");
const BEFORE_PUBLISH = new Date("2026-08-31T10:00:00Z");
const AFTER_PUBLISH = new Date("2026-09-02T10:00:00Z");

/** A one-page site as getSiteFlags loads it. */
function flagsRow(over: { published?: boolean; pageUpdatedAt?: Date } = {}) {
    const published = over.published ?? true;
    return {
        seoDescription: "Racking and shelving for small warehouses.",
        currentPublicationId: published ? "pub_1" : null,
        currentPublication: published ? { publishedAt: PUBLISHED_AT } : null,
        navigation: null,
        pages: [
            {
                id: "page_1",
                path: "/",
                title: "Home",
                hidden: false,
                // Page-row edits (rename, move, hide) are the only ones that
                // move this timestamp.
                updatedAt: over.pageUpdatedAt ?? BEFORE_PUBLISH,
                versions: [{ sections: [] }],
            },
        ],
    };
}

/** A site as the pending-changes diff loads it: every field publish reads. */
function draftSite(
    over: Record<string, unknown> = {},
    sections: unknown[] = [],
) {
    return {
        id: "site_1",
        name: "Northwind Supply",
        slug: "northwind",
        postsPrefix: "/blog",
        style: null,
        seoTitle: null,
        seoDescription: "Racking and shelving for small warehouses.",
        socialImageUrl: null,
        socialImageWidth: null,
        socialImageHeight: null,
        socialImageBytes: null,
        footer: null,
        navigation: null,
        pages: [
            {
                id: "page_1",
                path: "/",
                title: "Home",
                isHome: true,
                versions: [{ sections }],
            },
        ],
        ...over,
    };
}

/**
 * The site the diff loads, with the publication it is compared against.
 *
 * The live snapshot is built FROM a draft by the same builder publish runs
 * (#282), so "nothing has changed" is true by construction. A test that wants
 * a difference states the difference — rather than hand-writing a snapshot
 * that would quietly drift from the builder and make this test lie.
 */
function pendingRow(
    draftSections: unknown[],
    liveSections: unknown[],
    over: {
        draft?: Record<string, unknown>;
        live?: Record<string, unknown>;
    } = {},
) {
    return {
        ...draftSite(over.draft, draftSections),
        currentPublication: {
            snapshot: service.buildSnapshot(
                draftSite(over.live, liveSections) as never,
                new Date(0),
                { lenient: true },
            ),
        },
    };
}

const A_SECTION = {
    type: "hero",
    contractVersion: 1,
    content: { headline: "Racking that fits" },
};

function flagTypes(result: { flags: { type: string }[] }): string[] {
    return result.flags.map((f) => f.type);
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe("SitesService.getSiteFlags — unpublished changes", () => {
    it("fires for a section-only edit, which leaves no timestamp behind", async () => {
        // Saving a draft recreates the Section rows and never touches the
        // PageVersion or Page row, so every timestamp still predates the
        // publish. Only the diff can see this edit.
        siteFindFirst.mockResolvedValue(flagsRow());
        siteFindMany.mockResolvedValue([pendingRow([A_SECTION], [])]);

        const result = await service.getSiteFlags(ctx(), "site_1");

        expect(flagTypes(result)).toContain("unpublishedChanges");
        expect(siteFindMany.mock.calls[0][0].where).toEqual({
            id: { in: ["site_1"] },
        });
    });

    it("fires for a page rename, which the diff counts as a site change", async () => {
        // #282: the page's own timestamp is no longer consulted. A rename,
        // a move or a hide all change what the snapshot would say about the
        // site's pages, so the diff is what sees them.
        siteFindFirst.mockResolvedValue(flagsRow());
        siteFindMany.mockResolvedValue([
            pendingRow([], [], {
                draft: {
                    pages: [
                        {
                            id: "page_1",
                            path: "/",
                            title: "Home page",
                            isHome: true,
                            versions: [{ sections: [] }],
                        },
                    ],
                },
            }),
        ]);

        const result = await service.getSiteFlags(ctx(), "site_1");

        expect(flagTypes(result)).toContain("unpublishedChanges");
    });

    it("fires for a settings edit that touches no page at all (#282)", async () => {
        siteFindFirst.mockResolvedValue(flagsRow());
        siteFindMany.mockResolvedValue([
            pendingRow([], [], { draft: { seoTitle: "Racking, delivered" } }),
        ]);

        const result = await service.getSiteFlags(ctx(), "site_1");

        expect(flagTypes(result)).toContain("unpublishedChanges");
    });

    it("stays quiet when the draft matches what is live", async () => {
        siteFindFirst.mockResolvedValue(flagsRow());
        siteFindMany.mockResolvedValue([pendingRow([], [])]);

        const result = await service.getSiteFlags(ctx(), "site_1");

        expect(flagTypes(result)).not.toContain("unpublishedChanges");
    });

    it("does not diff a site that has never been published", async () => {
        // Nothing is live to compare against, and the first-run nudge already
        // says so — the extra query would buy nothing.
        siteFindFirst.mockResolvedValue(flagsRow({ published: false }));

        const result = await service.getSiteFlags(ctx(), "site_1");

        expect(siteFindMany).not.toHaveBeenCalled();
        expect(flagTypes(result)).not.toContain("unpublishedChanges");
    });
});

describe("SitesService.getSiteFlags — access", () => {
    it("lets a MEMBER read the flags: site:read is every role's floor", async () => {
        // Deliberate, and so pinned: the check reports and changes nothing,
        // and a MEMBER who can see the site can see what is wrong with it.
        siteFindFirst.mockResolvedValue(flagsRow());
        siteFindMany.mockResolvedValue([pendingRow([], [])]);

        await expect(
            service.getSiteFlags(ctx({ role: "MEMBER" }), "site_1"),
        ).resolves.toHaveProperty("flags");
    });

    it("404s a site in another org without diffing anything", async () => {
        siteFindFirst.mockResolvedValue(null);

        await expect(
            service.getSiteFlags(ctx(), "site_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(siteFindFirst.mock.calls[0][0].where).toEqual({
            id: "site_1",
            organizationId: "org_1",
            deletedAt: null,
        });
        expect(siteFindMany).not.toHaveBeenCalled();
    });
});

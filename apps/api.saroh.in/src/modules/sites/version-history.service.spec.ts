// #283: version history says who published each version, and a version read
// for preview says whether this build can still draw it.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            site: { findFirst: jest.fn() },
            publication: { findMany: jest.fn(), findFirst: jest.fn() },
            user: { findMany: jest.fn() },
        },
    };
});

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const publicationFindMany = prisma.publication.findMany as jest.Mock;
const publicationFindFirst = prisma.publication.findFirst as jest.Mock;
const userFindMany = prisma.user.findMany as jest.Mock;

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

const service = new SitesService({
    check: jest.fn(),
    can: jest.fn(),
    getEntitlements: jest.fn(),
} as unknown as import("../billing/entitlement.service").EntitlementService);

function publication(id: string, publishedByUserId: string | null) {
    return {
        id,
        publishedAt: new Date("2026-09-01T10:00:00Z"),
        publishedByUserId,
        templateId: "starter",
        templateVersion: 1,
        approvals: [],
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    siteFindFirst.mockResolvedValue({
        id: "site_1",
        currentPublicationId: "pub_2",
    });
});

describe("SitesService.listPublications names the publisher (#283)", () => {
    it("shows a name, falls back to email, and says null when nobody is recorded", async () => {
        publicationFindMany.mockResolvedValue([
            publication("pub_3", "user_a"),
            publication("pub_2", "user_b"),
            publication("pub_1", null),
            publication("pub_0", "user_a"),
        ]);
        userFindMany.mockResolvedValue([
            { id: "user_a", name: "Priya Raman", email: "priya@example.test" },
            { id: "user_b", name: null, email: "ops@example.test" },
        ]);

        const rows = await service.listPublications(ctx, "site_1");

        expect(rows.map((r) => [r.id, r.publishedBy, r.isCurrent])).toEqual([
            ["pub_3", "Priya Raman", false],
            ["pub_2", "ops@example.test", true],
            ["pub_1", null, false],
            ["pub_0", "Priya Raman", false],
        ]);
        // One lookup, for each distinct publisher once.
        expect(userFindMany).toHaveBeenCalledTimes(1);
        expect(userFindMany.mock.calls[0][0].where.id.in.sort()).toEqual([
            "user_a",
            "user_b",
        ]);
    });

    it("asks for no users when no version records a publisher", async () => {
        publicationFindMany.mockResolvedValue([publication("pub_1", null)]);

        const rows = await service.listPublications(ctx, "site_1");

        expect(rows[0].publishedBy).toBeNull();
        expect(userFindMany).not.toHaveBeenCalled();
    });
});

describe("SitesService.getPublication reports what it can draw (#283)", () => {
    it("returns the publisher and a renderability check of the snapshot", async () => {
        publicationFindFirst.mockResolvedValue({
            ...publication("pub_1", "user_a"),
            snapshot: {
                pages: [
                    {
                        path: "/",
                        sections: [
                            { type: "hero", content: { heading: "Northwind" } },
                            { type: "carousel3000", content: {} },
                        ],
                    },
                ],
            },
        });
        userFindMany.mockResolvedValue([
            { id: "user_a", name: "Priya Raman", email: "priya@example.test" },
        ]);

        const detail = await service.getPublication(ctx, "site_1", "pub_1");

        expect(detail.publishedBy).toBe("Priya Raman");
        expect(detail.renderability).toEqual({
            renderable: false,
            unrenderable: [{ path: "/", index: 1, type: "carousel3000" }],
        });
    });
});

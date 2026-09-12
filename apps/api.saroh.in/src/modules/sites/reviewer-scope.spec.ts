// #276: a REVIEWER reaches the sites they were invited to, and no others.
jest.mock("@saroh/database", () => ({
    prisma: { site: { findFirst: jest.fn() } },
}));

import { prisma } from "@saroh/database";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { assertSiteInOrg, reviewerScope } from "./site-access";

const siteFindFirst = (prisma as unknown as { site: { findFirst: jest.Mock } })
    .site.findFirst;

const ctx = (role: OrgRole): OrganizationContext => ({
    organizationId: "org_1",
    userId: "user_1",
    role,
});

beforeEach(() => {
    jest.clearAllMocks();
    siteFindFirst.mockResolvedValue({
        id: "site_1",
        currentPublicationId: null,
    });
});

describe("reviewerScope (#276)", () => {
    it("narrows a REVIEWER to their granted sites", () => {
        expect(reviewerScope(ctx("REVIEWER"))).toEqual({
            reviewers: { some: { userId: "user_1" } },
        });
    });

    it.each(["OWNER", "ADMIN", "MEMBER"] as const)(
        "costs %s nothing",
        (role) => {
            expect(reviewerScope(ctx(role))).toEqual({});
        },
    );
});

describe("assertSiteInOrg carries the scope (#276)", () => {
    it("asks for a grant when the caller is a REVIEWER", async () => {
        await assertSiteInOrg(ctx("REVIEWER"), "site_1");

        expect(siteFindFirst.mock.calls[0][0].where).toEqual({
            id: "site_1",
            organizationId: "org_1",
            deletedAt: null,
            reviewers: { some: { userId: "user_1" } },
        });
    });

    it("404s an ungranted site rather than saying it exists", async () => {
        siteFindFirst.mockResolvedValue(null);

        await expect(
            assertSiteInOrg(ctx("REVIEWER"), "someone_elses_site"),
        ).rejects.toThrow(/not found/);
    });

    it("leaves an OWNER's lookup as it was", async () => {
        await assertSiteInOrg(ctx("OWNER"), "site_1");

        expect(siteFindFirst.mock.calls[0][0].where).toEqual({
            id: "site_1",
            organizationId: "org_1",
            deletedAt: null,
        });
    });
});

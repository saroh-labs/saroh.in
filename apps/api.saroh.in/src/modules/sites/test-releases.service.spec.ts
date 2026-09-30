/**
 * Test releases with a mocked Prisma (DEC-071, T2): the order of the gates
 * (who may, which site, the flag), the pure link rules, and the test address.
 * What the writes do against a real database is `test-releases.db.spec.ts`.
 */
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {
        site: { findFirst: jest.fn(), findUnique: jest.fn() },
        siteTestRelease: { findFirst: jest.fn(), findMany: jest.fn() },
        siteTestReleaseLink: { findFirst: jest.fn(), create: jest.fn() },
        $transaction: jest.fn(),
    },
}));

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { rendererHost } from "./site-origin";
import { hashPreviewToken } from "./site-preview-links.service";
import type { SitesService } from "./sites.service";
import {
    hashTestReleaseToken,
    mintTestReleaseToken,
    platformTestHost,
    testReleaseLinkState,
    testReleaseUrl,
} from "./test-release-links";
import { testReleaseStatus } from "./test-release-view";
import { TestReleasesService } from "./test-releases.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const siteFindUnique = prisma.site.findUnique as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

const SITE = "site_1";
const ctx = (role: OrganizationContext["role"]): OrganizationContext => ({
    organizationId: "org_1",
    userId: "user_1",
    role,
});

function build(flagOn: boolean) {
    const flags = { isEnabled: jest.fn().mockResolvedValue(flagOn) };
    const sites = {
        loadDraftSite: jest.fn(),
        buildSnapshot: jest.fn(),
        currentDraftFingerprint: jest.fn(),
    };
    const service = new TestReleasesService(
        sites as unknown as SitesService,
        flags as unknown as FeatureFlagService,
    );
    return { service, flags, sites };
}

beforeEach(() => {
    jest.clearAllMocks();
    siteFindFirst.mockResolvedValue({ id: SITE, currentPublicationId: null });
    siteFindUnique.mockResolvedValue({ id: SITE, subdomain: "northwind" });
});

describe("the gates, in order (DEC-071, T2)", () => {
    it("refuses a MEMBER making one before reading anything", async () => {
        const { service, flags } = build(true);
        await expect(
            service.create(ctx("MEMBER"), SITE, {}),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(siteFindFirst).not.toHaveBeenCalled();
        expect(flags.isEnabled).not.toHaveBeenCalled();
    });

    it("answers 404 with the flag off, and never loads the draft or writes", async () => {
        const { service, flags, sites } = build(false);
        await expect(
            service.create(ctx("OWNER"), SITE, {}),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(flags.isEnabled).toHaveBeenCalledWith(
            "SITE_TEST_RELEASES",
            "org_1",
        );
        expect(sites.loadDraftSite).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });

    it("answers 404 for a site outside the business before asking the flag", async () => {
        const { service, flags } = build(true);
        siteFindFirst.mockResolvedValue(null);
        await expect(service.list(ctx("OWNER"), SITE)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(flags.isEnabled).not.toHaveBeenCalled();
    });

    it("narrows a reviewer's site lookup to the sites they were invited to", async () => {
        const { service } = build(true);
        siteFindFirst.mockResolvedValue(null);
        await expect(
            service.list(ctx("REVIEWER"), SITE),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(siteFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    reviewers: { some: { userId: "user_1" } },
                }),
            }),
        );
    });

    it("turns buildSnapshot's refusal into one about the release", async () => {
        const { service, sites } = build(true);
        sites.loadDraftSite.mockResolvedValue({ id: SITE });
        const { BadRequestException } = jest.requireActual("@nestjs/common");
        sites.buildSnapshot.mockImplementation(() => {
            throw new BadRequestException(
                'Cannot publish: page "/menu" has an invalid "richText" section (value: Required)',
            );
        });
        await expect(service.create(ctx("OWNER"), SITE, {})).rejects.toThrow(
            'Can\'t make a test release: page "/menu" has an invalid "richText" section (value: Required)',
        );
        expect(transaction).not.toHaveBeenCalled();
    });

    it("refuses a section this build can't draw, naming its page", async () => {
        const { service, sites } = build(true);
        sites.loadDraftSite.mockResolvedValue({ id: SITE });
        sites.buildSnapshot.mockReturnValue({
            site: {},
            pages: [
                {
                    path: "/offers",
                    sections: [{ type: "retiredBlock", content: {} }],
                },
            ],
        });
        await expect(service.create(ctx("OWNER"), SITE, {})).rejects.toThrow(
            /page "\/offers" has a "retiredBlock" section/,
        );
        expect(transaction).not.toHaveBeenCalled();
    });
});

describe("test release links (DEC-071, KTD-6)", () => {
    it("mints 32 random bytes as base64url, different each time", () => {
        const a = mintTestReleaseToken();
        expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(mintTestReleaseToken()).not.toBe(a);
    });

    it("hashes a token the way a preview token is hashed", () => {
        expect(hashTestReleaseToken("abc")).toBe(hashPreviewToken("abc"));
        expect(hashTestReleaseToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    });

    it("reads a link as revoked, ended, expired or active, in that order", () => {
        const now = new Date("2026-10-01T10:00:00Z");
        const future = new Date("2026-10-02T10:00:00Z");
        const past = new Date("2026-09-30T10:00:00Z");
        const ready = { discardedAt: null, wentLiveAt: null };

        expect(
            testReleaseLinkState(
                { expiresAt: future, revokedAt: null },
                ready,
                now,
            ),
        ).toBe("active");
        expect(
            testReleaseLinkState(
                { expiresAt: now, revokedAt: null },
                ready,
                now,
            ),
        ).toBe("expired");
        expect(
            testReleaseLinkState(
                { expiresAt: future, revokedAt: null },
                { discardedAt: past, wentLiveAt: null },
                now,
            ),
        ).toBe("ended");
        expect(
            testReleaseLinkState(
                { expiresAt: past, revokedAt: null },
                { discardedAt: null, wentLiveAt: past },
                now,
            ),
        ).toBe("ended");
        expect(
            testReleaseLinkState(
                { expiresAt: future, revokedAt: past },
                { discardedAt: past, wentLiveAt: null },
                now,
            ),
        ).toBe("revoked");
    });

    it("puts the test host in one DNS label, or offers none", () => {
        const apex = rendererHost();
        expect(platformTestHost("northwind")).toBe(`test--northwind.${apex}`);
        expect(platformTestHost("NorthWind")).toBe(`test--northwind.${apex}`);
        expect(platformTestHost("a".repeat(57))).toBe(
            `test--${"a".repeat(57)}.${apex}`,
        );
        expect(platformTestHost("a".repeat(58))).toBeNull();
        expect(platformTestHost(null)).toBeNull();
        expect(platformTestHost("")).toBeNull();
    });

    it("carries the token in ?release= on the test host", () => {
        expect(testReleaseUrl("test--northwind.saroh.app", "a_b-c")).toBe(
            "https://test--northwind.saroh.app/?release=a_b-c",
        );
    });
});

describe("a release's status", () => {
    const at = new Date();
    it.each([
        [{ discardedAt: null, wentLiveAt: null, goLiveAt: null }, "ready"],
        [{ discardedAt: null, wentLiveAt: null, goLiveAt: at }, "scheduled"],
        [{ discardedAt: null, wentLiveAt: at, goLiveAt: at }, "live"],
        [{ discardedAt: at, wentLiveAt: null, goLiveAt: null }, "discarded"],
    ] as const)("%o is %s", (release, status) => {
        expect(testReleaseStatus(release)).toBe(status);
    });
});

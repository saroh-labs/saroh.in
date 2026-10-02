/**
 * Test releases against a real Postgres (DEC-071, T2): making one freezes the
 * draft without putting anything live, numbering, names and notes, who may,
 * the flag, a draft that can't be frozen, links (never a token in a read),
 * and discarding.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { draftFingerprint } from "./review-route";
import { rendererHost } from "./site-origin";
import { SitesService } from "./sites.service";
import { hashTestReleaseToken } from "./test-release-links";
import { TestReleasesService } from "./test-releases.service";

/** Every character a RegExp reads specially, escaped. */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const releases = new TestReleasesService(sites, new FeatureFlagService());

const FLAG = "SITE_TEST_RELEASES";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

beforeAll(async () => {
    // Off for everyone; each business below turns it on for itself.
    await prisma.featureFlag.upsert({
        where: { key: FLAG },
        create: { key: FLAG, enabledByDefault: false },
        update: { enabledByDefault: false },
    });
});

/**
 * A business with the flag on, a site at `t2sub…` whose home page holds one
 * rich text section in its draft, and its owner.
 */
async function business(
    over: { flag?: boolean; subdomain?: string; body?: unknown } = {},
) {
    const org = await prisma.organization.create({
        data: { name: "Northwind T2", slug: uniq("t2-org-") },
    });
    if (over.flag !== false) {
        await prisma.featureFlagOverride.create({
            data: { flagKey: FLAG, organizationId: org.id, enabled: true },
        });
    }
    const owner = await prisma.user.create({
        data: { email: `${uniq("t2-owner-")}@example.test`, name: "Asha" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("t2-site-"),
            subdomain: over.subdomain ?? uniq("t2sub"),
        },
    });
    const page = await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Home",
            isHome: true,
        },
    });
    const version = await prisma.pageVersion.create({
        data: {
            pageId: page.id,
            organizationId: org.id,
            status: "DRAFT",
            createdByUserId: owner.id,
        },
    });
    const section = await prisma.section.create({
        data: {
            pageVersionId: version.id,
            organizationId: org.id,
            type: "richText",
            contractVersion: 1,
            order: 0,
            key: "intro",
            content: (over.body ?? { value: "<p>Fresh bread daily</p>" }) as
                string | object,
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
    };
    return { org, owner, site, page, section, ctx };
}

type Business = Awaited<ReturnType<typeof business>>;

/** Someone else in the same business, with `role`. */
async function person(
    b: Business,
    role: OrganizationContext["role"],
): Promise<OrganizationContext> {
    const user = await prisma.user.create({
        data: { email: `${uniq(`t2-${role.toLowerCase()}-`)}@example.test` },
    });
    return { organizationId: b.org.id, userId: user.id, role };
}

/** The token in a link's URL. */
function tokenOf(url: string | null): string {
    const token = url ? new URL(url).searchParams.get("release") : null;
    if (!token) throw new Error(`no token in ${url}`);
    return token;
}

describe("making a test release (DEC-071, T2)", () => {
    it("freezes the draft into a TEST publication, puts nothing live and leaves the draft alone", async () => {
        const b = await business();
        const before = await prisma.section.findMany({
            where: { organizationId: b.org.id },
        });

        const made = await releases.create(b.ctx, b.site.id, {
            name: "Diwali menu",
            note: "Check the prices on the menu page",
        });

        expect(made.release).toMatchObject({
            number: 1,
            name: "Diwali menu",
            note: "Check the prices on the menu page",
            status: "ready",
            createdBy: { name: "Asha" },
            draftChangedSince: false,
            schedule: null,
            wentLiveAt: null,
            discardedAt: null,
        });
        expect(made.release.standing).toMatchObject({
            outstanding: false,
            route: "NONE",
            latest: null,
        });

        // Not live: the pointer is where it was, and the row is a TEST row.
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { currentPublicationId: true },
        });
        expect(site.currentPublicationId).toBeNull();
        const row = await prisma.siteTestRelease.findUniqueOrThrow({
            where: { id: made.release.id },
            select: {
                fingerprint: true,
                publication: { select: { kind: true, snapshot: true } },
            },
        });
        expect(row.publication.kind).toBe("TEST");
        expect(row.fingerprint).toBe(
            draftFingerprint(row.publication.snapshot),
        );
        expect(JSON.stringify(row.publication.snapshot)).toContain(
            "Fresh bread daily",
        );
        await expect(
            sites.getPublicationBySubdomain(b.site.subdomain!),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await sites.listPublications(b.ctx, b.site.id)).toHaveLength(0);

        // The draft is exactly as it was.
        expect(
            await prisma.section.findMany({
                where: { organizationId: b.org.id },
            }),
        ).toEqual(before);
    });

    it("keeps a live site on what it was serving", async () => {
        const b = await business();
        const live = await sites.publishSite(b.ctx, b.site.id);
        await prisma.section.update({
            where: { id: b.section.id },
            data: { content: { value: "<p>New prices</p>" } },
        });

        await releases.create(b.ctx, b.site.id, {});

        const site = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { currentPublicationId: true },
        });
        expect(site.currentPublicationId).toBe(live.publicationId);
        const served = await sites.getPublicationBySubdomain(b.site.subdomain!);
        expect(JSON.stringify(served)).not.toContain("New prices");
    });

    it("hands back the first link once, on the test address, lasting 7 days", async () => {
        const b = await business();
        const before = Date.now();
        const made = await releases.create(b.ctx, b.site.id, {});

        expect(made.link.purpose).toBe("SHARE");
        expect(made.link.state).toBe("active");
        expect(made.link.url).toMatch(
            new RegExp(
                `^https://test--${b.site.subdomain}\\.${escapeRegExp(rendererHost())}/\\?release=`,
            ),
        );
        expect(made.link.urls).toEqual([made.link.url]);
        const lasts = made.link.expiresAt.getTime() - before;
        expect(lasts).toBeGreaterThan(7 * DAY - HOUR);
        expect(lasts).toBeLessThanOrEqual(7 * DAY + HOUR);

        // Only the hash of what the URL carries is stored.
        const stored = await prisma.siteTestReleaseLink.findUniqueOrThrow({
            where: { id: made.link.id },
            select: { tokenHash: true },
        });
        expect(stored.tokenHash).toBe(
            hashTestReleaseToken(tokenOf(made.link.url)),
        );
    });

    it("numbers releases 1, 2 … and names one it wasn't given a name for", async () => {
        const b = await business();
        const one = await releases.create(b.ctx, b.site.id, {
            name: "First look",
        });
        const two = await releases.create(b.ctx, b.site.id, {});

        expect(one.release).toMatchObject({ number: 1, name: "First look" });
        expect(two.release).toMatchObject({
            number: 2,
            name: "Test release 2",
            note: null,
        });

        const list = await releases.list(b.ctx, b.site.id);
        expect(list.releases.map((r) => r.number)).toEqual([2, 1]);
        // The zone a scheduled go-live is read in (T11): the business's,
        // India's while it has none of its own.
        expect(list.zone).toBe("Asia/Kolkata");
    });

    it("gives two made at once different numbers", async () => {
        const b = await business();
        const made = await Promise.all([
            releases.create(b.ctx, b.site.id, {}),
            releases.create(b.ctx, b.site.id, {}),
        ]);
        expect(made.map((m) => m.release.number).sort()).toEqual([1, 2]);
    });

    it("refuses a draft with an invalid section, naming the page, and writes nothing", async () => {
        const b = await business({ body: { value: 5 } });

        const refusal = releases.create(b.ctx, b.site.id, {});
        await expect(refusal).rejects.toBeInstanceOf(BadRequestException);
        await expect(refusal).rejects.toThrow(
            /Can't make a test release: page "\/" has an invalid "richText" section/,
        );
        expect(
            await prisma.publication.count({
                where: { organizationId: b.org.id },
            }),
        ).toBe(0);
        expect(
            await prisma.siteTestRelease.count({
                where: { organizationId: b.org.id },
            }),
        ).toBe(0);
    });

    it("has no test address for an address too long to fit one (KTD-12)", async () => {
        // 58 characters: `test--` + it is 64, one over a DNS label.
        const long = `${uniq("t2long")}${"a".repeat(60)}`.slice(0, 58);
        const b = await business({ subdomain: long });
        const made = await releases.create(b.ctx, b.site.id, {});
        expect(made.link.url).toBeNull();
        expect(made.link.urls).toEqual([]);
        expect((await releases.list(b.ctx, b.site.id)).testHosts).toEqual([]);
    });
});

describe("who may, and the flag (DEC-071, T2)", () => {
    it("is not found while the flag is off for the business", async () => {
        const b = await business({ flag: false });
        await expect(
            releases.create(b.ctx, b.site.id, {}),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(releases.list(b.ctx, b.site.id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(
            await prisma.siteTestRelease.count({
                where: { organizationId: b.org.id },
            }),
        ).toBe(0);
    });

    it("lets a MEMBER read and open, not make, share or discard", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const member = await person(b, "MEMBER");

        await expect(
            releases.create(member, b.site.id, {}),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            releases.createLink(member, b.site.id, made.release.id, {
                days: 7,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            releases.discard(member, b.site.id, made.release.id),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect((await releases.list(member, b.site.id)).releases).toHaveLength(
            1,
        );
        const opened = await releases.open(member, b.site.id, made.release.id);
        expect(opened.purpose).toBe("OPEN");
    });

    it("shows a reviewer only the sites they were invited to", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const reviewer = await person(b, "REVIEWER");

        await expect(releases.list(reviewer, b.site.id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            releases.open(reviewer, b.site.id, made.release.id),
        ).rejects.toBeInstanceOf(NotFoundException);

        await prisma.siteReviewer.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                userId: reviewer.userId,
            },
        });
        expect(
            (await releases.list(reviewer, b.site.id)).releases,
        ).toHaveLength(1);
        const opened = await releases.open(
            reviewer,
            b.site.id,
            made.release.id,
        );
        expect(opened.url).toContain("?release=");
        await expect(
            releases.create(reviewer, b.site.id, {}),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("never shows another business's site or release", async () => {
        const a = await business();
        const other = await business();
        const made = await releases.create(a.ctx, a.site.id, {});

        await expect(
            releases.list(other.ctx, a.site.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            releases.discard(other.ctx, other.site.id, made.release.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            releases.revokeLink(other.ctx, other.site.id, made.link.id),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("the list (DEC-071, T2)", () => {
    it("never carries a token or its hash", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const shared = await releases.createLink(
            b.ctx,
            b.site.id,
            made.release.id,
            { days: 1 },
        );
        const hashes = await prisma.siteTestReleaseLink.findMany({
            where: { testReleaseId: made.release.id },
            select: { tokenHash: true },
        });

        const body = JSON.stringify(await releases.list(b.ctx, b.site.id));
        for (const url of [made.link.url, shared.url]) {
            expect(body).not.toContain(tokenOf(url));
        }
        for (const { tokenHash } of hashes) {
            expect(body).not.toContain(tokenHash);
        }
        expect(body).not.toContain("release=");
    });

    it("says when the draft has moved on since the release was made", async () => {
        const b = await business();
        await releases.create(b.ctx, b.site.id, {});
        expect(
            (await releases.list(b.ctx, b.site.id)).releases[0]
                ?.draftChangedSince,
        ).toBe(false);

        await prisma.section.update({
            where: { id: b.section.id },
            data: { content: { value: "<p>Closed on Monday</p>" } },
        });
        expect(
            (await releases.list(b.ctx, b.site.id)).releases[0]
                ?.draftChangedSince,
        ).toBe(true);
    });

    it("reads a verdict on the release against its own fingerprint", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const reviewer = await person(b, "ADMIN");
        const release = await prisma.siteTestRelease.findUniqueOrThrow({
            where: { id: made.release.id },
            select: { fingerprint: true },
        });
        await prisma.siteApproval.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                byUserId: reviewer.userId,
                outcome: "APPROVED",
                testReleaseId: made.release.id,
                draftFingerprint: release.fingerprint,
            },
        });
        // The draft moves on; the release's approval still stands.
        await prisma.section.update({
            where: { id: b.section.id },
            data: { content: { value: "<p>Later edit</p>" } },
        });

        const [row] = (await releases.list(b.ctx, b.site.id)).releases;
        expect(row?.standing).toMatchObject({
            outstanding: false,
            route: "APPROVED",
            latest: { outcome: "APPROVED" },
        });
        expect(row?.draftChangedSince).toBe(true);
    });
});

describe("names, notes and links (DEC-071, T2)", () => {
    it("renames a release and clears its note", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {
            note: "For Priya",
        });
        const renamed = await releases.update(
            b.ctx,
            b.site.id,
            made.release.id,
            { name: "Diwali menu", note: null },
        );
        expect(renamed).toMatchObject({ name: "Diwali menu", note: null });
    });

    it("makes a share link for 30 days and an open link for 12 hours", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const before = Date.now();

        const shared = await releases.createLink(
            b.ctx,
            b.site.id,
            made.release.id,
            { days: 30 },
        );
        const opened = await releases.open(b.ctx, b.site.id, made.release.id);

        expect(shared.purpose).toBe("SHARE");
        expect(shared.expiresAt.getTime() - before).toBeGreaterThan(
            30 * DAY - HOUR,
        );
        expect(opened.purpose).toBe("OPEN");
        expect(opened.expiresAt.getTime() - before).toBeLessThanOrEqual(
            12 * HOUR + HOUR,
        );
        expect(opened.expiresAt.getTime() - before).toBeGreaterThan(11 * HOUR);
        expect(tokenOf(shared.url)).not.toBe(tokenOf(opened.url));
    });

    it("revokes a link, and revoking twice is fine", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});

        const revoked = await releases.revokeLink(
            b.ctx,
            b.site.id,
            made.link.id,
        );
        expect(revoked.state).toBe("revoked");
        const again = await releases.revokeLink(b.ctx, b.site.id, made.link.id);
        expect(again.revokedAt).toEqual(revoked.revokedAt);

        const stored = await prisma.siteTestReleaseLink.findUniqueOrThrow({
            where: { tokenHash: hashTestReleaseToken(tokenOf(made.link.url)) },
            select: { revokedAt: true },
        });
        expect(stored.revokedAt).not.toBeNull();
    });
});

describe("discarding (DEC-071, T2)", () => {
    it("ends its links, stops new ones, and is fine twice", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});

        const discarded = await releases.discard(
            b.ctx,
            b.site.id,
            made.release.id,
        );
        expect(discarded.status).toBe("discarded");
        expect(discarded.links.map((l) => l.state)).toEqual(["ended"]);
        await releases.discard(b.ctx, b.site.id, made.release.id);

        await expect(
            releases.createLink(b.ctx, b.site.id, made.release.id, {
                days: 7,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            releases.open(b.ctx, b.site.id, made.release.id),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            releases.update(b.ctx, b.site.id, made.release.id, {
                name: "Again",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses a release that is scheduled or live", async () => {
        const b = await business();
        const scheduled = await releases.create(b.ctx, b.site.id, {});
        const live = await releases.create(b.ctx, b.site.id, {});
        await prisma.siteTestRelease.update({
            where: { id: scheduled.release.id },
            data: { goLiveAt: new Date(Date.now() + DAY) },
        });
        await prisma.siteTestRelease.update({
            where: { id: live.release.id },
            data: { wentLiveAt: new Date() },
        });

        await expect(
            releases.discard(b.ctx, b.site.id, scheduled.release.id),
        ).rejects.toThrow(/Cancel the scheduled go-live first/);
        await expect(
            releases.discard(b.ctx, b.site.id, live.release.id),
        ).rejects.toThrow(/live now/);

        const list = await releases.list(b.ctx, b.site.id);
        expect(
            Object.fromEntries(list.releases.map((r) => [r.number, r.status])),
        ).toEqual({ 1: "scheduled", 2: "live" });
        await expect(
            releases.open(b.ctx, b.site.id, live.release.id),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

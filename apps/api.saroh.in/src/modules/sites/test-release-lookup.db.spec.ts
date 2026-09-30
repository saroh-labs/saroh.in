/**
 * The test-host lookup against a real Postgres (DEC-071, T3): a link opens
 * its release's FROZEN snapshot on that site's test host and nowhere else;
 * a live host never serves a test release, and a test host never serves the
 * live site, through any public read (R12). Stopped links answer 410 with
 * their reason. Under `TEST_RLS=on` the lookup, which reads across every
 * business before it knows one, still answers, even from inside another
 * business's context.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { GoneException, NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";
import { randomBytes } from "node:crypto";

import type { EntitlementService } from "../billing/entitlement.service";
import { resolveSiteHost } from "../site-accounts/site-host";
import { siteRootDomain } from "./site-host-mode";
import { hashPreviewToken } from "./site-preview-links.service";
import { SitesService } from "./sites.service";
import { resolveTestRelease } from "./test-release-lookup";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;
const DAY = 86_400_000;
const root = siteRootDomain();

const LIVE = { pages: [{ path: "/", title: "Live home", sections: [] }] };
const FROZEN = { pages: [{ path: "/", title: "Frozen home", sections: [] }] };

beforeAll(async () => {
    await prisma.featureFlag.upsert({
        where: { key: "SITE_TEST_RELEASES" },
        create: { key: "SITE_TEST_RELEASES", enabledByDefault: false },
        update: { enabledByDefault: false },
    });
});

/**
 * A published business with test releases on, at `<subdomain>.<root>`.
 * `subdomain` is taken as given when passed.
 */
async function business(opts: { flag?: boolean; subdomain?: string } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Northwind T3", slug: uniq("t3-org-") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("t3-user-")}@example.test` },
    });
    const subdomain = opts.subdomain ?? uniq("tthree");
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("t3-site-"),
            subdomain,
        },
    });
    const live = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            snapshot: LIVE,
            templateId: "starter",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: live.id },
    });
    if (opts.flag ?? true) {
        await prisma.featureFlagOverride.create({
            data: {
                flagKey: "SITE_TEST_RELEASES",
                organizationId: org.id,
                enabled: true,
            },
        });
    }
    return {
        org,
        user,
        site,
        subdomain,
        testHost: `test--${subdomain}.${root}`,
    };
}

type Business = Awaited<ReturnType<typeof business>>;

/** A test release of `b` and one link to it; returns the raw token. */
async function release(
    b: Business,
    link: { expiresAt?: Date; revokedAt?: Date } = {},
) {
    const publication = await prisma.publication.create({
        data: {
            siteId: b.site.id,
            organizationId: b.org.id,
            kind: "TEST",
            snapshot: FROZEN,
            templateId: "starter",
            templateVersion: 1,
            publishedByUserId: b.user.id,
        },
    });
    const number =
        (await prisma.siteTestRelease.count({ where: { siteId: b.site.id } })) +
        1;
    const row = await prisma.siteTestRelease.create({
        data: {
            siteId: b.site.id,
            organizationId: b.org.id,
            publicationId: publication.id,
            number,
            name: `Diwali menu ${number}`,
            fingerprint: `fp-${number}`,
            createdByUserId: b.user.id,
        },
    });
    const token = randomBytes(32).toString("base64url");
    const created = await prisma.siteTestReleaseLink.create({
        data: {
            testReleaseId: row.id,
            siteId: b.site.id,
            organizationId: b.org.id,
            tokenHash: hashPreviewToken(token),
            purpose: "SHARE",
            createdByUserId: b.user.id,
            expiresAt: link.expiresAt ?? new Date(Date.now() + 7 * DAY),
            revokedAt: link.revokedAt ?? null,
        },
    });
    return { token, release: row, publication, linkId: created.id };
}

async function goneReason(p: Promise<unknown>): Promise<unknown> {
    const err: unknown = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(GoneException);
    return ((err as GoneException).getResponse() as { details: unknown })
        .details;
}

describe("a test host shows its release (DEC-071, T3)", () => {
    it("returns the frozen TEST snapshot, not the live one, and records the visit", async () => {
        const b = await business();
        const { token, linkId } = await release(b);

        const view = await resolveTestRelease(b.testHost, token);

        expect(view.snapshot).toEqual(FROZEN);
        expect(view.siteId).toBe(b.site.id);
        expect(view.release).toEqual({
            name: "Diwali menu 1",
            number: 1,
            madeAt: expect.any(Date),
        });
        expect(view.liveUrl).toBe(`https://${b.subdomain}.${root}`);

        // Recorded without being awaited, so wait for it.
        let lastUsedAt: Date | null = null;
        for (let i = 0; i < 50 && !lastUsedAt; i++) {
            ({ lastUsedAt } =
                await prisma.siteTestReleaseLink.findUniqueOrThrow({
                    where: { id: linkId },
                    select: { lastUsedAt: true },
                }));
            if (!lastUsedAt) await new Promise((r) => setTimeout(r, 20));
        }
        expect(lastUsedAt).not.toBeNull();
    });

    it("accepts the host however the browser spelled it", async () => {
        const b = await business();
        const { token } = await release(b);
        const view = await resolveTestRelease(
            `${b.testHost.toUpperCase()}.:443`,
            token,
        );
        expect(view.snapshot).toEqual(FROZEN);
    });
});

describe("a link opens one release of one site, and nothing else (R12)", () => {
    it("is a 404 on another business's test host", async () => {
        const northwind = await business();
        const rye = await business();
        const { token } = await release(northwind);

        await expect(
            resolveTestRelease(rye.testHost, token),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("is a 404 on the site's own live host", async () => {
        const b = await business();
        const { token } = await release(b);

        await expect(
            resolveTestRelease(`${b.subdomain}.${root}`, token),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("is a 404 for no token, an unknown token, or a preview link's token", async () => {
        const b = await business();
        await release(b);
        const preview = randomBytes(32).toString("base64url");
        await prisma.sitePreviewLink.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                createdByUserId: b.user.id,
                tokenHash: hashPreviewToken(preview),
                expiresAt: new Date(Date.now() + DAY),
            },
        });

        for (const token of [undefined, "", "not-a-token", preview]) {
            await expect(
                resolveTestRelease(b.testHost, token),
            ).rejects.toBeInstanceOf(NotFoundException);
        }
    });

    it("is a 404 while the business has test releases off (the kill switch)", async () => {
        const b = await business({ flag: false });
        const { token } = await release(b);

        await expect(
            resolveTestRelease(b.testHost, token),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("never 410s to a token tried on the wrong host", async () => {
        const northwind = await business();
        const rye = await business();
        const { token } = await release(northwind, {
            revokedAt: new Date(),
        });

        await expect(
            resolveTestRelease(rye.testHost, token),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("a stopped link says why (410)", () => {
    it("expired", async () => {
        const b = await business();
        const { token } = await release(b, {
            expiresAt: new Date(Date.now() - 1_000),
        });
        expect(await goneReason(resolveTestRelease(b.testHost, token))).toEqual(
            {
                reason: "expired",
            },
        );
    });

    it("revoked", async () => {
        const b = await business();
        const { token } = await release(b, { revokedAt: new Date() });
        expect(await goneReason(resolveTestRelease(b.testHost, token))).toEqual(
            {
                reason: "revoked",
            },
        );
    });

    it("discarded", async () => {
        const b = await business();
        const { token, release: row } = await release(b);
        await prisma.siteTestRelease.update({
            where: { id: row.id },
            data: { discardedAt: new Date() },
        });
        expect(await goneReason(resolveTestRelease(b.testHost, token))).toEqual(
            {
                reason: "discarded",
            },
        );
    });

    it("live, with the live site's address, even for a revoked link (Q6)", async () => {
        const b = await business();
        const { token, release: row } = await release(b, {
            revokedAt: new Date(),
        });
        await prisma.siteTestRelease.update({
            where: { id: row.id },
            data: { wentLiveAt: new Date() },
        });
        expect(await goneReason(resolveTestRelease(b.testHost, token))).toEqual(
            {
                reason: "live",
                liveUrl: `https://${b.subdomain}.${root}`,
            },
        );
    });
});

describe("no live read answers for a test host (KTD-7, R11)", () => {
    it("by-subdomain and the relay lookup refuse test--<address>", async () => {
        const b = await business();
        await release(b);

        await expect(
            sites.getPublicationBySubdomain(`test--${b.subdomain}`),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(resolveSiteHost(b.testHost)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        // The live host still resolves, so the refusal is the host's shape.
        await expect(
            resolveSiteHost(`${b.subdomain}.${root}`),
        ).resolves.toMatchObject({ siteId: b.site.id });
    });

    it("refuses a site that somehow holds a test-- address, on every live read", async () => {
        // The address rules refuse `--` (DEC-069); this is the fail-closed
        // half, whatever the table holds.
        const b = await business({ subdomain: uniq("test--odd") });

        await expect(
            sites.getPublicationBySubdomain(b.subdomain),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            resolveSiteHost(`${b.subdomain}.${root}`),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            sites.getPublicationByHostname(`${b.subdomain}.${root}`),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("test.<custom domain> (KTD-7)", () => {
    async function domain(
        b: Business,
        hostname: string,
        status: "VERIFIED" | "PENDING",
    ) {
        return prisma.domain.create({
            data: {
                organizationId: b.org.id,
                siteId: b.site.id,
                hostname,
                status,
                verificationToken: uniq("vt-"),
                verifiedAt: status === "VERIFIED" ? new Date() : null,
            },
        });
    }

    it("opens only while the domain is VERIFIED and bound to the site", async () => {
        const b = await business();
        const { token } = await release(b);
        const hostname = `${uniq("shop")}.acme.test`;
        const row = await domain(b, hostname, "PENDING");

        await expect(
            resolveTestRelease(`test.${hostname}`, token),
        ).rejects.toBeInstanceOf(NotFoundException);

        await prisma.domain.update({
            where: { id: row.id },
            data: { status: "VERIFIED", verifiedAt: new Date() },
        });
        const view = await resolveTestRelease(`test.${hostname}`, token);
        expect(view.snapshot).toEqual(FROZEN);
        // A site with a custom domain goes live there.
        expect(view.liveUrl).toBe(`https://${hostname}`);

        // The live read refuses the test host, however it is asked.
        await expect(
            sites.getPublicationByHostname(`test.${hostname}`),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            resolveSiteHost(`test.${hostname}`),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("is refused for another business's domain", async () => {
        const northwind = await business();
        const rye = await business();
        const { token } = await release(northwind);
        const hostname = `${uniq("rye")}.acme.test`;
        await domain(rye, hostname, "VERIFIED");

        await expect(
            resolveTestRelease(`test.${hostname}`, token),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("serves an exact claim on test.<H> live, and never as a test host", async () => {
        const b = await business();
        const { token } = await release(b);
        const hostname = `${uniq("shop")}.acme.test`;
        await domain(b, hostname, "VERIFIED");
        await domain(b, `test.${hostname}`, "VERIFIED");

        const live = await sites.getPublicationByHostname(`test.${hostname}`);
        expect(live.snapshot).toEqual(LIVE);
        await expect(
            resolveSiteHost(`test.${hostname}`),
        ).resolves.toMatchObject({ siteId: b.site.id });
        await expect(
            resolveTestRelease(`test.${hostname}`, token),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("the lookup reads across businesses (RLS)", () => {
    it("answers from inside another business's context, and scopes nothing to it", async () => {
        const northwind = await business();
        const rye = await business();
        const { token } = await release(northwind);

        const view = await runInOrgContext(rye.org.id, () =>
            resolveTestRelease(northwind.testHost, token),
        );
        expect(view.snapshot).toEqual(FROZEN);
        await expect(
            runInOrgContext(rye.org.id, () =>
                resolveTestRelease(rye.testHost, token),
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import { starterTemplate } from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { authorize } from "../organizations/organization-policy";
import { checkRenderability } from "./publication-renderability";
import { draftFingerprint } from "./review-route";
import { assertSiteInOrg } from "./site-access";
import { SitesService } from "./sites.service";
import type {
    TestReleaseLinkDays,
    TestReleaseLinkPurpose,
} from "./test-release-links";
import {
    FIRST_LINK_DAYS,
    hashTestReleaseToken,
    mintTestReleaseToken,
    OPEN_LINK_HOURS,
} from "./test-release-links";
import type {
    CreatedTestReleaseLinkView,
    CreatedTestReleaseView,
    TestReleaseLinkView,
    TestReleaseList,
    TestReleaseView,
} from "./test-release-view";
import {
    linkSelect,
    namesFor,
    peopleIn,
    releaseSelect,
    testHosts,
    toLinkView,
    toReleaseView,
    withToken,
} from "./test-release-view";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Test releases (DEC-071, T2): freeze the draft into a named version that is
 * not live, share it by link, and discard it.
 *
 * The frozen snapshot is an ordinary `Publication` with `kind = 'TEST'`,
 * built by the same strict `buildSnapshot` publish uses, so what a tester
 * sees is byte for byte what going live would write (KTD-1). Making one never
 * touches `Site.currentPublicationId`: nothing here puts anything live.
 *
 * Who may do what (KTD-11, Q5): making, renaming, discarding and sharing is
 * `site:update`, the people who edit the site; reading the list and opening a
 * release from the workspace is `site:read`, narrowed per site for a
 * reviewer. Everything answers 404 while `SITE_TEST_RELEASES` is off for the
 * business (KTD-16).
 */

@Injectable()
export class TestReleasesService {
    constructor(
        private readonly sites: SitesService,
        private readonly flags: FeatureFlagService,
    ) {}

    /**
     * Freeze the current draft into test release N, with a first link that
     * lasts 7 days. Requires `site:update`.
     *
     * Strict, as publish is: a section that fails its contract is a 400
     * naming its page, and so is one this build can no longer draw. The
     * release, its TEST publication and its first link are written in one
     * transaction, under a lock on the site row so two at once get numbers
     * 1 and 2 rather than a clash.
     */
    async create(
        ctx: OrganizationContext,
        siteId: string,
        input: { name?: string; note?: string | null },
    ): Promise<CreatedTestReleaseView> {
        const site = await this.gate(ctx, "site:update", siteId);

        const draft = await this.sites.loadDraftSite({
            id: siteId,
            organizationId: ctx.organizationId,
            deletedAt: null,
        });
        if (!draft) throw new NotFoundException(`Site "${siteId}" not found`);

        const now = new Date();
        const snapshot = this.freeze(draft, now);
        const fingerprint = draftFingerprint(snapshot);
        const token = mintTestReleaseToken();

        const releaseId = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Site" WHERE id = ${siteId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
            const last = await tx.siteTestRelease.findFirst({
                where: { siteId, organizationId: ctx.organizationId },
                orderBy: { number: "desc" },
                select: { number: true },
            });
            const number = (last?.number ?? 0) + 1;

            const publication = await tx.publication.create({
                data: {
                    siteId,
                    organizationId: ctx.organizationId,
                    // Never pointed at by the site (KTD-2); every reader that
                    // means "published" filters it out.
                    kind: "TEST",
                    // Through `unknown`, as publish does: SiteStyle is a
                    // precise interface Prisma's JSON input does not accept.
                    snapshot: snapshot as unknown as Prisma.InputJsonValue,
                    templateId: starterTemplate.id,
                    templateVersion: starterTemplate.version,
                    publishedByUserId: ctx.userId,
                    publishedAt: now,
                },
                select: { id: true },
            });
            const release = await tx.siteTestRelease.create({
                data: {
                    siteId,
                    organizationId: ctx.organizationId,
                    publicationId: publication.id,
                    number,
                    name: input.name ?? `Test release ${number}`,
                    note: input.note ?? null,
                    fingerprint,
                    createdByUserId: ctx.userId,
                    createdAt: now,
                },
                select: { id: true },
            });
            await tx.siteTestReleaseLink.create({
                data: {
                    testReleaseId: release.id,
                    siteId,
                    organizationId: ctx.organizationId,
                    // Only the hash is stored (#284).
                    tokenHash: hashTestReleaseToken(token),
                    purpose: "SHARE" satisfies TestReleaseLinkPurpose,
                    createdByUserId: ctx.userId,
                    expiresAt: new Date(
                        now.getTime() + FIRST_LINK_DAYS * DAY_MS,
                    ),
                    createdAt: now,
                },
                select: { id: true },
            });
            return release.id;
        });

        // Read back through the one view every other answer uses. The draft
        // is exactly what was just frozen, so it has not changed since.
        const release = await this.readOne(ctx, siteId, releaseId, fingerprint);
        const link = release.links.length > 0 ? release.links[0] : null;
        if (!link) throw new Error("A new test release has no link");
        return {
            release,
            link: withToken(link, token, testHosts(site.subdomain)),
        };
    }

    /**
     * Every test release of the site, newest first, with its status, who made
     * it, its review standing, whether the draft has moved on since, and its
     * links (never a token). Requires `site:read`.
     */
    async list(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<TestReleaseList> {
        const site = await this.gate(ctx, "site:read", siteId);
        const [rows, currentFingerprint] = await Promise.all([
            prisma.siteTestRelease.findMany({
                where: { siteId, organizationId: ctx.organizationId },
                orderBy: { number: "desc" },
                select: releaseSelect,
            }),
            this.sites.currentDraftFingerprint(ctx, siteId),
        ]);
        const names = await namesFor(peopleIn(rows));
        const now = new Date();
        return {
            testHosts: testHosts(site.subdomain),
            releases: rows.map((row) =>
                toReleaseView(row, ctx, currentFingerprint, names, now),
            ),
        };
    }

    /**
     * Rename a release, or change or clear its note. Requires `site:update`.
     * A discarded release is history and is not renamed (409).
     */
    async update(
        ctx: OrganizationContext,
        siteId: string,
        releaseId: string,
        input: { name?: string; note?: string | null },
    ): Promise<TestReleaseView> {
        await this.gate(ctx, "site:update", siteId);
        const release = await this.findRelease(ctx, siteId, releaseId);
        if (release.discardedAt) {
            throw new ConflictException("This test release was discarded.");
        }
        await prisma.siteTestRelease.update({
            where: { id: release.id },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.note !== undefined ? { note: input.note } : {}),
            },
            select: { id: true },
        });
        return this.readOne(ctx, siteId, release.id);
    }

    /**
     * Discard a release: its links stop opening it, and it can no longer go
     * live. Requires `site:update`. Discarding twice is not an error.
     *
     * Fenced in the write itself, so a release that went live or was
     * scheduled a moment ago is never discarded underneath it: a live one is
     * history (409), and a scheduled one must have its go-live cancelled
     * first (409), so no job is left waiting on a release nobody wants.
     */
    async discard(
        ctx: OrganizationContext,
        siteId: string,
        releaseId: string,
    ): Promise<TestReleaseView> {
        await this.gate(ctx, "site:update", siteId);
        const release = await this.findRelease(ctx, siteId, releaseId);
        const { count } = await prisma.siteTestRelease.updateMany({
            where: {
                id: release.id,
                organizationId: ctx.organizationId,
                discardedAt: null,
                wentLiveAt: null,
                goLiveAt: null,
            },
            data: { discardedAt: new Date() },
        });
        if (count === 0) {
            const now = await this.findRelease(ctx, siteId, releaseId);
            if (now.wentLiveAt) {
                throw new ConflictException(
                    "This test release is live now, so it can't be discarded.",
                );
            }
            if (!now.discardedAt && now.goLiveAt) {
                throw new ConflictException(
                    "This test release is scheduled to go live. Cancel the scheduled go-live first.",
                );
            }
        }
        return this.readOne(ctx, siteId, release.id);
    }

    /**
     * A new link to share a release, lasting 1, 7 or 30 days. Requires
     * `site:update`: deciding who sees unreleased work is the editor's call,
     * as it is for a preview link.
     */
    async createLink(
        ctx: OrganizationContext,
        siteId: string,
        releaseId: string,
        input: { days: TestReleaseLinkDays },
    ): Promise<CreatedTestReleaseLinkView> {
        const site = await this.gate(ctx, "site:update", siteId);
        return this.mintLink(ctx, site, releaseId, {
            purpose: "SHARE",
            lifetimeMs: input.days * DAY_MS,
        });
    }

    /**
     * "Open test release" from the workspace: a 12-hour link for the caller
     * alone. Requires `site:read`, so a reviewer invited to this site can
     * open what they were asked to look at without anyone forwarding a token.
     */
    async open(
        ctx: OrganizationContext,
        siteId: string,
        releaseId: string,
    ): Promise<CreatedTestReleaseLinkView> {
        const site = await this.gate(ctx, "site:read", siteId);
        return this.mintLink(ctx, site, releaseId, {
            purpose: "OPEN",
            lifetimeMs: OPEN_LINK_HOURS * HOUR_MS,
        });
    }

    /**
     * Take a link back. It stops opening the release on its next request.
     * Requires `site:update`. Revoking twice is not an error.
     */
    async revokeLink(
        ctx: OrganizationContext,
        siteId: string,
        linkId: string,
    ): Promise<TestReleaseLinkView> {
        await this.gate(ctx, "site:update", siteId);
        const existing = await prisma.siteTestReleaseLink.findFirst({
            where: { id: linkId, siteId, organizationId: ctx.organizationId },
            select: {
                id: true,
                revokedAt: true,
                testRelease: {
                    select: { discardedAt: true, wentLiveAt: true },
                },
            },
        });
        if (!existing) {
            throw new NotFoundException(
                `Test release link "${linkId}" not found`,
            );
        }
        const link = await prisma.siteTestReleaseLink.update({
            where: { id: existing.id },
            data: { revokedAt: existing.revokedAt ?? new Date() },
            select: linkSelect,
        });
        const names = await namesFor([link.createdByUserId]);
        return toLinkView(link, existing.testRelease, names, new Date());
    }

    // -----------------------------------------------------------------------

    /**
     * Who may, which site, and whether the business has test releases at
     * all, in that order. The flag answers 404, as a missing route would
     * (KTD-16): a business without it is not told the feature exists.
     */
    private async gate(
        ctx: OrganizationContext,
        action: "site:read" | "site:update",
        siteId: string,
    ): Promise<{ id: string; subdomain: string | null }> {
        authorize(ctx, action);
        await assertSiteInOrg(ctx, siteId);
        const enabled = await this.flags.isEnabled(
            FlagKey.SITE_TEST_RELEASES,
            ctx.organizationId,
        );
        if (!enabled) throw new NotFoundException("Not found");
        const site = await prisma.site.findUnique({
            where: { id: siteId },
            select: { id: true, subdomain: true },
        });
        if (!site) throw new NotFoundException(`Site "${siteId}" not found`);
        return site;
    }

    /**
     * The draft, frozen: `buildSnapshot` strict, then the check version
     * history makes, so a release never holds a section this build cannot
     * draw. Both refusals name the page.
     */
    private freeze(
        draft: NonNullable<Awaited<ReturnType<SitesService["loadDraftSite"]>>>,
        now: Date,
    ) {
        let snapshot: ReturnType<SitesService["buildSnapshot"]>;
        try {
            snapshot = this.sites.buildSnapshot(draft, now);
        } catch (err) {
            if (err instanceof BadRequestException) {
                // buildSnapshot speaks for publish; say what was being made.
                throw new BadRequestException(
                    err.message.replace(
                        /^Cannot publish:/,
                        "Can't make a test release:",
                    ),
                );
            }
            throw err;
        }
        const { renderable, unrenderable } = checkRenderability(snapshot);
        const first = unrenderable.length > 0 ? unrenderable[0] : null;
        if (!renderable && first) {
            throw new BadRequestException({
                message: `Can't make a test release: page "${first.path}" has a "${first.type}" section this version of Saroh can't show.`,
                details: { unrenderable },
            });
        }
        return snapshot;
    }

    private async findRelease(
        ctx: OrganizationContext,
        siteId: string,
        releaseId: string,
    ) {
        const release = await prisma.siteTestRelease.findFirst({
            where: {
                id: releaseId,
                siteId,
                organizationId: ctx.organizationId,
            },
            select: {
                id: true,
                discardedAt: true,
                wentLiveAt: true,
                goLiveAt: true,
            },
        });
        if (!release) {
            throw new NotFoundException(
                `Test release "${releaseId}" not found`,
            );
        }
        return release;
    }

    /** One release, as the list shows it. */
    private async readOne(
        ctx: OrganizationContext,
        siteId: string,
        releaseId: string,
        knownFingerprint?: string,
    ): Promise<TestReleaseView> {
        const [row, currentFingerprint] = await Promise.all([
            prisma.siteTestRelease.findFirst({
                where: {
                    id: releaseId,
                    siteId,
                    organizationId: ctx.organizationId,
                },
                select: releaseSelect,
            }),
            knownFingerprint ?? this.sites.currentDraftFingerprint(ctx, siteId),
        ]);
        if (!row) {
            throw new NotFoundException(
                `Test release "${releaseId}" not found`,
            );
        }
        const names = await namesFor(peopleIn([row]));
        return toReleaseView(row, ctx, currentFingerprint, names, new Date());
    }

    /**
     * A new link for a release that can still be opened: not discarded, not
     * live (Q6). The token leaves the API here and nowhere else.
     */
    private async mintLink(
        ctx: OrganizationContext,
        site: { id: string; subdomain: string | null },
        releaseId: string,
        opts: { purpose: TestReleaseLinkPurpose; lifetimeMs: number },
    ): Promise<CreatedTestReleaseLinkView> {
        const release = await this.findRelease(ctx, site.id, releaseId);
        if (release.discardedAt) {
            throw new ConflictException("This test release was discarded.");
        }
        if (release.wentLiveAt) {
            throw new ConflictException("This test release is live now.");
        }
        const now = new Date();
        const token = mintTestReleaseToken();
        const link = await prisma.siteTestReleaseLink.create({
            data: {
                testReleaseId: release.id,
                siteId: site.id,
                organizationId: ctx.organizationId,
                tokenHash: hashTestReleaseToken(token),
                purpose: opts.purpose,
                createdByUserId: ctx.userId,
                expiresAt: new Date(now.getTime() + opts.lifetimeMs),
                createdAt: now,
            },
            select: linkSelect,
        });
        const names = await namesFor([link.createdByUserId]);
        return withToken(
            toLinkView(link, release, names, now),
            token,
            testHosts(site.subdomain),
        );
    }
}

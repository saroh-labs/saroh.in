/**
 * A test release's scheduled go-live against a real Postgres (DEC-071, T10):
 * scheduling in the business's zone, cancelling, and what the job does when
 * its time comes: go live once, or not at all when the merchant would not
 * expect it (KTD-14), and tell the team either way.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";
import { DateTime } from "luxon";

import { backendPid, waitUntilBlockedBy } from "../../../test/lock-wait";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { CommunicationsService } from "../communications/communications.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { tellTeam } from "../notifications/team-alert.handler";
import type { TeamAlertPayload } from "../notifications/team-alerts";
import { TEAM_ALERT_TYPE } from "../notifications/team-alerts";
import {
    GoLiveHandler,
    recordGaveUp,
    SITE_GO_LIVE_TYPE,
} from "./go-live.handler";
import { putLive } from "./live-pointer";
import { draftFingerprint } from "./review-route";
import { SitesService } from "./sites.service";
import { TestReleasesService } from "./test-releases.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const releases = new TestReleasesService(sites, new FeatureFlagService());
const handler = new GoLiveHandler();

const FLAG = "SITE_TEST_RELEASES";

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

beforeAll(async () => {
    await prisma.featureFlag.upsert({
        where: { key: FLAG },
        create: { key: FLAG, enabledByDefault: false },
        update: { enabledByDefault: false },
    });
});

/**
 * A business with test releases on, a published site with one rich text
 * section, and its owner Asha, a member of it. `zone` is the business's
 * own time zone; without one it keeps India's.
 */
async function business(over: { zone?: string } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Northwind T10", slug: uniq("t10-org-") },
    });
    await prisma.featureFlagOverride.create({
        data: { flagKey: FLAG, organizationId: org.id, enabled: true },
    });
    if (over.zone) {
        await prisma.businessProfile.create({
            data: { organizationId: org.id, timezone: over.zone },
        });
    }
    const owner = await prisma.user.create({
        data: { email: `${uniq("t10-owner-")}@example.test`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("t10-site-"),
            subdomain: uniq("t10sub"),
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
            content: { value: "<p>Fresh bread daily</p>" },
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
        roleKey: "OWNER",
    };
    await sites.publishSite(ctx, site.id);
    return { org, owner, site, section, ctx };
}

type Business = Awaited<ReturnType<typeof business>>;

/** Someone else on the team, with a membership as a request would find it. */
async function person(
    b: Business,
    role: OrganizationContext["role"],
    name = "Ravi",
): Promise<OrganizationContext> {
    const user = await prisma.user.create({
        data: {
            email: `${uniq(`t10-${role.toLowerCase()}-`)}@example.test`,
            name,
        },
    });
    await prisma.membership.create({
        data: { organizationId: b.org.id, userId: user.id, role },
    });
    return {
        organizationId: b.org.id,
        userId: user.id,
        role,
        roleKey: role,
    };
}

async function editDraft(b: Business, value: string) {
    await prisma.section.update({
        where: { id: b.section.id },
        data: { content: { value } },
    });
}

/** A date and time `days` from now, in `zone`, as the form sends them. */
function localIn(zone: string, days: number, time = "18:00") {
    const date = DateTime.now().setZone(zone).plus({ days }).toISODate();
    if (!date) throw new Error("no date");
    return { date, time };
}

async function releaseRow(id: string) {
    return prisma.siteTestRelease.findUniqueOrThrow({
        where: { id },
        select: {
            fingerprint: true,
            publicationId: true,
            goLiveAt: true,
            goLiveZone: true,
            goLiveJobId: true,
            scheduledByUserId: true,
            scheduledOverPublicationId: true,
            scheduleOverride: true,
            wentLiveAt: true,
            livePublicationId: true,
            lastGoLiveOutcome: true,
            lastGoLiveReason: true,
        },
    });
}

/** The schedule's own job, as the worker would claim it. */
async function claimedJob(releaseId: string): Promise<Job> {
    const { goLiveJobId } = await releaseRow(releaseId);
    if (!goLiveJobId) throw new Error("no job");
    return prisma.job.update({
        where: { id: goLiveJobId },
        data: { status: "PROCESSING", lockedAt: new Date(), lockedBy: "t10" },
    });
}

/** The team.alert jobs the business has queued, as payloads. */
async function alerts(organizationId: string): Promise<TeamAlertPayload[]> {
    const jobs = await prisma.job.findMany({
        where: { organizationId, type: TEAM_ALERT_TYPE },
        orderBy: { createdAt: "asc" },
        select: { payload: true },
    });
    return jobs.map((j) => j.payload as unknown as TeamAlertPayload);
}

async function liveCount(siteId: string) {
    return prisma.publication.count({ where: { siteId, kind: "LIVE" } });
}

async function scheduled(b: Business, over: { override?: boolean } = {}) {
    const made = await releases.create(b.ctx, b.site.id, {
        name: "Diwali menu",
    });
    const view = await releases.schedule(b.ctx, b.site.id, made.release.id, {
        ...localIn("Asia/Kolkata", 1),
        ...over,
    });
    return { made, view };
}

describe("scheduling a go-live (DEC-071, T10)", () => {
    it("takes tomorrow 18:00 in Asia/Kolkata as 12:30 UTC, with its job", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const { date, time } = localIn("Asia/Kolkata", 1);

        const view = await releases.schedule(
            b.ctx,
            b.site.id,
            made.release.id,
            { date, time },
        );

        const at = new Date(`${date}T12:30:00.000Z`);
        expect(view.status).toBe("scheduled");
        expect(view.schedule).toEqual({
            goLiveAt: at,
            zone: "Asia/Kolkata",
            by: { name: "Asha" },
        });
        const row = await releaseRow(made.release.id);
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { currentPublicationId: true },
        });
        expect(row).toMatchObject({
            goLiveAt: at,
            goLiveZone: "Asia/Kolkata",
            scheduledByUserId: b.owner.id,
            scheduledOverPublicationId: site.currentPublicationId,
            scheduleOverride: false,
        });
        const job = await prisma.job.findUniqueOrThrow({
            where: { id: row.goLiveJobId ?? "" },
        });
        expect(job).toMatchObject({
            type: SITE_GO_LIVE_TYPE,
            organizationId: b.org.id,
            status: "PENDING",
            runAt: at,
            payload: {
                testReleaseId: made.release.id,
                goLiveAt: at.toISOString(),
            },
        });
        // Nothing went live by scheduling it.
        expect(await liveCount(b.site.id)).toBe(1);
    });

    it("keeps the local time in Europe/London, whatever its offset that day", async () => {
        const b = await business({ zone: "Europe/London" });
        const made = await releases.create(b.ctx, b.site.id, {});
        const { date, time } = localIn("Europe/London", 30);

        await releases.schedule(b.ctx, b.site.id, made.release.id, {
            date,
            time,
        });

        const row = await releaseRow(made.release.id);
        const local = DateTime.fromJSDate(row.goLiveAt ?? new Date(0), {
            zone: "Europe/London",
        });
        expect(local.toFormat("yyyy-MM-dd HH:mm")).toBe(`${date} 18:00`);
        expect(row.goLiveZone).toBe("Europe/London");
    });

    it("moves a schedule: the waiting job is replaced, not doubled", async () => {
        const b = await business();
        const { made } = await scheduled(b);
        const first = await releaseRow(made.release.id);

        await releases.schedule(b.ctx, b.site.id, made.release.id, {
            ...localIn("Asia/Kolkata", 2, "09:30"),
        });

        const moved = await releaseRow(made.release.id);
        expect(moved.goLiveJobId).not.toBe(first.goLiveJobId);
        expect(
            await prisma.job.findUnique({
                where: { id: first.goLiveJobId ?? "" },
            }),
        ).toBeNull();
        expect(
            await prisma.job.count({
                where: { organizationId: b.org.id, type: SITE_GO_LIVE_TYPE },
            }),
        ).toBe(1);
    });

    it("refuses sooner than 5 minutes and further than 60 days", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const now = DateTime.now().setZone("Asia/Kolkata");
        const soon = now.plus({ minutes: 2 });
        await expect(
            releases.schedule(b.ctx, b.site.id, made.release.id, {
                date: soon.toISODate() ?? "",
                time: soon.toFormat("HH:mm"),
            }),
        ).rejects.toThrow(BadRequestException);
        await expect(
            releases.schedule(b.ctx, b.site.id, made.release.id, {
                ...localIn("Asia/Kolkata", 61),
            }),
        ).rejects.toThrow(/next 60 days/);
        expect((await releaseRow(made.release.id)).goLiveAt).toBeNull();
    });

    it("allows one schedule per site", async () => {
        const b = await business();
        await scheduled(b);
        const other = await releases.create(b.ctx, b.site.id, {});

        await expect(
            releases.schedule(b.ctx, b.site.id, other.release.id, {
                ...localIn("Asia/Kolkata", 3),
            }),
        ).rejects.toThrow(/"Diwali menu" is already scheduled to go live/);
    });

    it("refuses a release that is live or discarded", async () => {
        const b = await business();
        const live = await releases.create(b.ctx, b.site.id, {});
        await releases.goLive(b.ctx, b.site.id, live.release.id);
        await expect(
            releases.schedule(b.ctx, b.site.id, live.release.id, {
                ...localIn("Asia/Kolkata", 1),
            }),
        ).rejects.toThrow("This test release is live now.");

        const gone = await releases.create(b.ctx, b.site.id, {});
        await releases.discard(b.ctx, b.site.id, gone.release.id);
        await expect(
            releases.schedule(b.ctx, b.site.id, gone.release.id, {
                ...localIn("Asia/Kolkata", 1),
            }),
        ).rejects.toThrow("This test release was discarded.");
    });

    it("is site:publish, and going live without approval is the owner's alone", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const member = await person(b, "MEMBER");
        await expect(
            releases.schedule(member, b.site.id, made.release.id, {
                ...localIn("Asia/Kolkata", 1),
            }),
        ).rejects.toThrow(ForbiddenException);

        const admin = await person(b, "ADMIN");
        await expect(
            releases.schedule(admin, b.site.id, made.release.id, {
                ...localIn("Asia/Kolkata", 1),
                override: true,
            }),
        ).rejects.toThrow("Only an owner can go live without approval.");

        const view = await releases.schedule(
            admin,
            b.site.id,
            made.release.id,
            { ...localIn("Asia/Kolkata", 1) },
        );
        expect(view.status).toBe("scheduled");
    });

    it("with Publishing needs approval on, takes only an approved release, or an owner's override", async () => {
        const b = await business();
        await prisma.site.update({
            where: { id: b.site.id },
            data: { publishNeedsApproval: true },
        });
        const made = await releases.create(b.ctx, b.site.id, {});

        const refused = releases.schedule(b.ctx, b.site.id, made.release.id, {
            ...localIn("Asia/Kolkata", 1),
        });
        await expect(refused).rejects.toThrow(ConflictException);
        await expect(refused).rejects.toThrow(
            "This site goes live only from an approved test release.",
        );

        await releases.schedule(b.ctx, b.site.id, made.release.id, {
            ...localIn("Asia/Kolkata", 1),
            override: true,
        });
        expect((await releaseRow(made.release.id)).scheduleOverride).toBe(true);

        // Approved by someone else: no override needed.
        const other = await releases.create(b.ctx, b.site.id, {});
        await releases.cancelSchedule(b.ctx, b.site.id, made.release.id);
        const reviewer = await person(b, "REVIEWER", "Meera");
        await prisma.siteApproval.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                byUserId: reviewer.userId,
                outcome: "APPROVED",
                draftFingerprint: (await releaseRow(other.release.id))
                    .fingerprint,
                testReleaseId: other.release.id,
            },
        });
        const view = await releases.schedule(
            b.ctx,
            b.site.id,
            other.release.id,
            { ...localIn("Asia/Kolkata", 1) },
        );
        expect(view.status).toBe("scheduled");
        expect((await releaseRow(other.release.id)).scheduleOverride).toBe(
            false,
        );
    });

    it("answers 404 with test releases off", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        await prisma.featureFlagOverride.deleteMany({
            where: { organizationId: b.org.id, flagKey: FLAG },
        });
        await expect(
            releases.schedule(b.ctx, b.site.id, made.release.id, {
                ...localIn("Asia/Kolkata", 1),
            }),
        ).rejects.toThrow("Not found");
    });
});

describe("cancelling a scheduled go-live (T10)", () => {
    it("deletes its job, and the release is ready again", async () => {
        const b = await business();
        const { made } = await scheduled(b);
        const { goLiveJobId } = await releaseRow(made.release.id);

        const view = await releases.cancelSchedule(
            b.ctx,
            b.site.id,
            made.release.id,
        );

        expect(view.status).toBe("ready");
        expect(view.schedule).toBeNull();
        expect(
            await prisma.job.findUnique({ where: { id: goLiveJobId ?? "" } }),
        ).toBeNull();
        expect(await releaseRow(made.release.id)).toMatchObject({
            goLiveAt: null,
            goLiveJobId: null,
            scheduledByUserId: null,
        });
        // Ready means it can go live by hand now, and be discarded.
        await releases.goLive(b.ctx, b.site.id, made.release.id);
        // Cancelling what has no schedule is not an error.
        await expect(
            releases.cancelSchedule(b.ctx, b.site.id, made.release.id),
        ).resolves.toMatchObject({ status: "live" });
    });

    it("refuses once the job is running: it's going live now", async () => {
        const b = await business();
        const { made } = await scheduled(b);
        await claimedJob(made.release.id);

        await expect(
            releases.cancelSchedule(b.ctx, b.site.id, made.release.id),
        ).rejects.toThrow("This test release is going live now.");
        expect((await releaseRow(made.release.id)).goLiveAt).not.toBeNull();
    });
});

describe("the site.go_live job (T10)", () => {
    it("puts exactly the release live as the person who scheduled it, once, and tells the team once", async () => {
        const b = await business();
        const { made } = await scheduled(b);
        // The merchant keeps working after scheduling it.
        await editDraft(b, "<p>Half-written winter menu</p>");
        const job = await claimedJob(made.release.id);

        await handler.handle(job);
        await handler.handle(job);

        const row = await releaseRow(made.release.id);
        expect(row.wentLiveAt).not.toBeNull();
        expect(row.lastGoLiveOutcome).toBe("LIVE");
        const live = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: {
                currentPublication: {
                    select: {
                        id: true,
                        snapshot: true,
                        sourcePublicationId: true,
                        publishedByUserId: true,
                    },
                },
            },
        });
        expect(live.currentPublication?.id).toBe(row.livePublicationId);
        expect(live.currentPublication?.sourcePublicationId).toBe(
            row.publicationId,
        );
        expect(live.currentPublication?.publishedByUserId).toBe(b.owner.id);
        expect(draftFingerprint(live.currentPublication?.snapshot)).toBe(
            row.fingerprint,
        );
        // The first publish, and this go-live: one, not two.
        expect(await liveCount(b.site.id)).toBe(2);

        const told = await alerts(b.org.id);
        expect(told).toEqual([
            {
                event: "site",
                testReleaseId: made.release.id,
                goLiveAt: row.goLiveAt?.toISOString(),
                outcome: "LIVE",
                schedulerUserId: b.owner.id,
            },
        ]);
        // The notice, told twice, is one notice.
        const comms = new CommunicationsService();
        await prisma.$transaction((tx) =>
            tellTeam(tx, comms, b.org.id, told[0]),
        );
        await prisma.$transaction((tx) =>
            tellTeam(tx, comms, b.org.id, told[0]),
        );
        const notices = await prisma.notification.findMany({
            where: { organizationId: b.org.id },
            select: { type: true, title: true },
        });
        expect(notices).toEqual([
            { type: "site.live", title: "Diwali menu is live on Northwind" },
        ]);
    });

    it("does nothing for a schedule that was cancelled or moved since", async () => {
        const b = await business();
        const { made } = await scheduled(b);
        const first = await prisma.job.findUniqueOrThrow({
            where: {
                id: (await releaseRow(made.release.id)).goLiveJobId ?? "",
            },
        });
        // Moved to the day after: the first job's instant no longer matches.
        await releases.schedule(b.ctx, b.site.id, made.release.id, {
            ...localIn("Asia/Kolkata", 2),
        });

        await handler.handle(first);

        expect((await releaseRow(made.release.id)).wentLiveAt).toBeNull();
        expect(await liveCount(b.site.id)).toBe(1);
        expect(await alerts(b.org.id)).toEqual([]);
    });

    it("doesn't go live over a site published after it was scheduled, and says so", async () => {
        const b = await business();
        const { made } = await scheduled(b);
        await editDraft(b, "<p>A price fix</p>");
        await sites.publishSite(b.ctx, b.site.id);
        const job = await claimedJob(made.release.id);

        await handler.handle(job);

        const row = await releaseRow(made.release.id);
        expect(row.wentLiveAt).toBeNull();
        expect(row.lastGoLiveOutcome).toBe("NOT_LIVE");
        expect(row.lastGoLiveReason).toMatch(
            /^The site was published at \d{1,2}:\d{2}[ap]m, after this was scheduled\. Go live now, or schedule it again\.$/,
        );
        // Cleared, so the merchant can schedule again.
        expect(row).toMatchObject({
            goLiveAt: null,
            goLiveJobId: null,
            scheduledByUserId: null,
        });
        expect(await liveCount(b.site.id)).toBe(2);
        const told = await alerts(b.org.id);
        expect(told).toHaveLength(1);
        expect(told[0]).toMatchObject({
            event: "site",
            outcome: "NOT_LIVE",
            reason: row.lastGoLiveReason,
        });
        // And it can be scheduled again at once.
        await expect(
            releases.schedule(b.ctx, b.site.id, made.release.id, {
                ...localIn("Asia/Kolkata", 1),
            }),
        ).resolves.toMatchObject({ status: "scheduled", lastGoLive: null });
    });

    it("doesn't go live over a publish that commits while it runs (KTD-14)", async () => {
        const b = await business();
        const { made } = await scheduled(b);
        const job = await claimedJob(made.release.id);
        const { currentPublication: now } = await prisma.site.findUniqueOrThrow(
            {
                where: { id: b.site.id },
                select: {
                    currentPublication: {
                        select: {
                            snapshot: true,
                            templateId: true,
                            templateVersion: true,
                        },
                    },
                },
            },
        );
        if (!now) throw new Error("not published");

        // A publish is mid-flight: it has put its fix live and not yet
        // committed when the job's time comes.
        let commit = () => {};
        const held = new Promise<void>((resolve) => {
            commit = resolve;
        });
        let written = (_pid: number) => {};
        const wrote = new Promise<number>((resolve) => {
            written = resolve;
        });
        const publish = runInOrgContext(b.org.id, () =>
            prisma.$transaction(
                async (tx) => {
                    const pid = await backendPid(tx);
                    const live = await putLive(tx, {
                        site: { id: b.site.id, organizationId: b.org.id },
                        snapshot: now.snapshot,
                        source: "publish",
                        actor: { userId: b.owner.id, owner: true },
                        fingerprint: draftFingerprint(now.snapshot),
                        template: {
                            id: now.templateId,
                            version: now.templateVersion,
                        },
                    });
                    written(pid);
                    await held;
                    return live.publicationId;
                },
                { timeout: 20_000 },
            ),
        );
        const publisher = await wrote;

        const run = handler.handle(job);
        // The job has reached the site's lock and waits on the publish:
        // Postgres says so, rather than a sleep guessing it.
        await waitUntilBlockedBy(publisher);
        commit();
        const fix = await publish;
        await run;

        const row = await releaseRow(made.release.id);
        expect(row.wentLiveAt).toBeNull();
        expect(row.lastGoLiveOutcome).toBe("NOT_LIVE");
        expect(row.lastGoLiveReason).toMatch(
            /^The site was published at .+, after this was scheduled\. Go live now, or schedule it again\.$/,
        );
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { currentPublicationId: true },
        });
        // The fix stays live.
        expect(site.currentPublicationId).toBe(fix);
        expect(await liveCount(b.site.id)).toBe(2);
    });

    it("doesn't go live once whoever scheduled it has left the team, and the owner hears", async () => {
        const b = await business();
        const admin = await person(b, "ADMIN", "Ravi");
        const made = await releases.create(b.ctx, b.site.id, {
            name: "Diwali menu",
        });
        await releases.schedule(admin, b.site.id, made.release.id, {
            ...localIn("Asia/Kolkata", 1),
        });
        await prisma.membership.delete({
            where: {
                organizationId_userId: {
                    organizationId: b.org.id,
                    userId: admin.userId,
                },
            },
        });
        const job = await claimedJob(made.release.id);

        await handler.handle(job);

        const row = await releaseRow(made.release.id);
        expect(row.wentLiveAt).toBeNull();
        expect(row.lastGoLiveReason).toBe(
            "Ravi, who scheduled it, is no longer on the team. Go live now, or schedule it again.",
        );
        const told = await alerts(b.org.id);
        await prisma.$transaction((tx) =>
            tellTeam(tx, new CommunicationsService(), b.org.id, told[0]),
        );
        // The bell is the business's: its owner, who can publish, sees it.
        expect(
            await prisma.notification.findMany({
                where: { organizationId: b.org.id },
                select: { type: true, title: true, body: true },
            }),
        ).toEqual([
            {
                type: "site.not_live",
                title: "Diwali menu didn't go live on Northwind",
                body: row.lastGoLiveReason,
            },
        ]);
    });

    it("doesn't go live once whoever scheduled it can no longer publish", async () => {
        const b = await business();
        const admin = await person(b, "ADMIN", "Ravi");
        const made = await releases.create(b.ctx, b.site.id, {});
        await releases.schedule(admin, b.site.id, made.release.id, {
            ...localIn("Asia/Kolkata", 1),
        });
        await prisma.membership.update({
            where: {
                organizationId_userId: {
                    organizationId: b.org.id,
                    userId: admin.userId,
                },
            },
            data: { role: "MEMBER" },
        });

        await handler.handle(await claimedJob(made.release.id));

        expect(await releaseRow(made.release.id)).toMatchObject({
            wentLiveAt: null,
            lastGoLiveOutcome: "NOT_LIVE",
            lastGoLiveReason:
                "Ravi, who scheduled it, can no longer publish the site. Go live now, or schedule it again.",
        });
    });

    it("doesn't go live when Publishing needs approval was turned on since and it isn't approved", async () => {
        const b = await business();
        const { made } = await scheduled(b);
        await prisma.site.update({
            where: { id: b.site.id },
            data: { publishNeedsApproval: true },
        });

        await handler.handle(await claimedJob(made.release.id));

        expect(await releaseRow(made.release.id)).toMatchObject({
            wentLiveAt: null,
            lastGoLiveOutcome: "NOT_LIVE",
            lastGoLiveReason:
                "Publishing needs approval, and this test release isn't approved. Get it approved, then go live or schedule it again.",
        });
        expect(await liveCount(b.site.id)).toBe(1);
    });

    it("goes live with the setting on when an owner scheduled it past approval", async () => {
        const b = await business();
        await prisma.site.update({
            where: { id: b.site.id },
            data: { publishNeedsApproval: true },
        });
        const { made } = await scheduled(b, { override: true });

        await handler.handle(await claimedJob(made.release.id));

        expect(await releaseRow(made.release.id)).toMatchObject({
            lastGoLiveOutcome: "LIVE",
        });
        expect(await liveCount(b.site.id)).toBe(2);
        // Recorded as the owner's override, as going live by hand with one
        // is (T9), and against the release.
        const live = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: {
                currentPublication: { select: { id: true, reviewRoute: true } },
            },
        });
        expect(live.currentPublication?.reviewRoute).toBe("OVERRIDDEN");
        expect(
            await prisma.siteApproval.findMany({
                where: { siteId: b.site.id, outcome: "OVERRIDDEN" },
                select: { publicationId: true, testReleaseId: true },
            }),
        ).toEqual([
            {
                publicationId: live.currentPublication?.id,
                testReleaseId: made.release.id,
            },
        ]);
    });

    it("doesn't go live with a section this build can no longer draw, and names it", async () => {
        const b = await business();
        const { made } = await scheduled(b);
        const { publicationId } = await releaseRow(made.release.id);
        const test = await prisma.publication.findUniqueOrThrow({
            where: { id: publicationId },
            select: { snapshot: true },
        });
        const snapshot = test.snapshot as {
            pages: { sections: { type: string }[] }[];
        };
        snapshot.pages[0].sections[0].type = "retiredBlock";
        await prisma.publication.update({
            where: { id: publicationId },
            data: { snapshot },
        });

        await handler.handle(await claimedJob(made.release.id));

        const row = await releaseRow(made.release.id);
        expect(row.lastGoLiveOutcome).toBe("NOT_LIVE");
        expect(row.lastGoLiveReason).toMatch(/"\/".*"retiredBlock"/);
        expect(await liveCount(b.site.id)).toBe(1);
    });

    it("on its last attempt, records that it didn't go live before giving up", async () => {
        const b = await business();
        const { made } = await scheduled(b);
        const { goLiveAt } = await releaseRow(made.release.id);
        // What the handler writes when the last try fails
        // (go-live.handler.spec.ts pins that it is called then, and only then).
        await prisma.$transaction((tx) =>
            recordGaveUp(tx, b.org.id, {
                testReleaseId: made.release.id,
                goLiveAt: goLiveAt?.toISOString() ?? "",
            }),
        );

        expect(await releaseRow(made.release.id)).toMatchObject({
            wentLiveAt: null,
            goLiveAt: null,
            lastGoLiveOutcome: "NOT_LIVE",
            lastGoLiveReason:
                "Something went wrong putting it live. Go live now, or schedule it again.",
        });
        expect(await alerts(b.org.id)).toHaveLength(1);
    });
});

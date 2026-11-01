/**
 * Search pages' publish records (DEC-193) against a real Postgres: each
 * action's transitions, all or nothing with a 409 naming the paths, a
 * history row and an audit entry per page. Publish, unpublish, archive and
 * restore only stage; Deploy changes releases every staged page at once and
 * queues one web deploy (R13, owner 31 Oct). The public list the site
 * builds from reads what was released.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => {
    const actual = jest.requireActual<typeof import("../../env")>("../../env");
    return {
        env: {
            ...actual.env,
            SITE_DEPLOY_GITHUB_TOKEN: "token-for-tests",
            SITE_DEPLOY_ENVIRONMENT: "development",
        },
    };
});

import { readFileSync } from "node:fs";
import * as path from "node:path";

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditService } from "../admin/admin-audit.service";
import { pathsOf, SEARCH_PAGES_DEPLOY_TYPE } from "./search-pages-deploy.job";
import { SearchPagesService } from "./search-pages.service";

const service = new SearchPagesService(new AdminAuditService());
let staff: PlatformAdminInfo;

const deployJobs = () =>
    prisma.job.findMany({
        where: { type: SEARCH_PAGES_DEPLOY_TYPE },
        orderBy: { createdAt: "asc" },
    });
const deploys = async () => (await deployJobs()).length;
const statusOf = async (p: string) =>
    (await prisma.searchPage.findUnique({ where: { path: p } }))?.status ??
    null;
/** Every queued deploy has run: no rebuild is waiting any more. */
const finishDeploys = () =>
    prisma.job.updateMany({
        where: { type: SEARCH_PAGES_DEPLOY_TYPE },
        data: { status: "DONE" },
    });
const forPaths = (n: number, prefix = "p") =>
    Array.from({ length: n }, (_, i) => `/for/${prefix}-${i}`);

beforeAll(async () => {
    const user = await prisma.user.create({
        data: { email: "asha.staff@example.com", name: "Asha Rao" },
    });
    staff = {
        userId: user.id,
        platformAdminId: null,
        roles: [],
        permissions: [],
        viaBootstrap: true,
    };
});

async function reset(): Promise<void> {
    await prisma.searchPage.deleteMany();
    await prisma.searchPageEvent.deleteMany();
    await prisma.job.deleteMany({ where: { type: SEARCH_PAGES_DEPLOY_TYPE } });
}

describe("staging and deploying search pages", () => {
    beforeEach(reset);

    it("publishes 30 pages with no rebuild, then deploys them in one", async () => {
        const paths = forPaths(30);
        await service.act(staff, "publish", paths.slice(0, 20));
        for (const p of paths.slice(20)) {
            await service.act(staff, "publish", [p]);
        }
        expect(await deploys()).toBe(0);
        expect((await service.publicList()).live).toEqual([]);

        const out = await service.deploy(staff);

        expect(out).toEqual({
            paths: [...paths].sort(),
            rebuildQueued: true,
        });
        const jobs = await deployJobs();
        expect(jobs).toHaveLength(1);
        expect(pathsOf(jobs[0]?.payload)).toHaveLength(30);
        expect((await service.publicList()).live).toEqual([...paths].sort());
        expect(
            await prisma.searchPageEvent.count({ where: { action: "deploy" } }),
        ).toBe(30);
        expect(
            await prisma.adminAuditEvent.count({
                where: { action: "search-page.deploy" },
            }),
        ).toBe(30);
        const one = await prisma.searchPage.findUnique({
            where: { path: paths[0] },
        });
        expect(one).toMatchObject({
            status: "LIVE",
            releasedStatus: "LIVE",
            deployedByUserId: staff.userId,
            deployedAt: expect.any(Date),
            liveSince: expect.any(Date),
        });
    });

    it("deploys a guide and the tool it links to, published together, in one job (U12)", async () => {
        const guide = "/guides/reduce-no-shows";
        const tool = "/tools/cancellation-policy-generator";
        // Admin's "Publish these too" sends both in one publish.
        await service.act(staff, "publish", [guide, tool]);
        expect(await deploys()).toBe(0);

        await service.deploy(staff);

        const jobs = await deployJobs();
        expect(jobs).toHaveLength(1);
        expect(pathsOf(jobs[0]?.payload).sort()).toEqual([guide, tool]);
        expect((await service.publicList()).live).toEqual([guide, tool]);
    });

    it("publishes 3 and takes 1 off in one deploy", async () => {
        await service.act(staff, "publish", ["/for/salons"]);
        await service.deploy(staff);
        await finishDeploys();

        await service.act(staff, "publish", [
            "/for/a",
            "/for/b",
            "/gst/hsn-and-sac-codes",
        ]);
        await service.act(staff, "unpublish", ["/for/salons"]);
        // Still on the site until it's deployed.
        expect((await service.publicList()).live).toEqual(["/for/salons"]);

        const out = await service.deploy(staff);

        expect(out.paths).toEqual([
            "/for/a",
            "/for/b",
            "/for/salons",
            "/gst/hsn-and-sac-codes",
        ]);
        expect(await deploys()).toBe(2);
        const site = await service.publicList();
        expect(site.live).toEqual([
            "/for/a",
            "/for/b",
            "/gst/hsn-and-sac-codes",
        ]);
        // Taken off: its old address redirects.
        expect(site.takenOff).toEqual([
            { path: "/for/salons", at: expect.any(Date) },
        ]);
        expect(
            (await service.history("/for/salons")).events.map((e) => [
                e.action,
                e.fromStatus,
                e.toStatus,
            ]),
        ).toEqual([
            ["deploy", "LIVE", "UNPUBLISHED"],
            ["unpublish", "LIVE", "UNPUBLISHED"],
            ["deploy", "DRAFT", "LIVE"],
            ["publish", "DRAFT", "LIVE"],
        ]);
    });

    it("answers nothing to deploy, and queues nothing", async () => {
        const call = service.deploy(staff);
        await expect(call).rejects.toBeInstanceOf(ConflictException);
        await call.catch((error: ConflictException) => {
            expect(error.getResponse()).toMatchObject({
                message: "Nothing is waiting to deploy.",
            });
        });
        expect(await deploys()).toBe(0);
    });

    it("counts no change for a page published and unpublished before deploying", async () => {
        await service.act(staff, "publish", ["/for/tutors"]);
        await service.act(staff, "unpublish", ["/for/tutors"]);
        const row = await prisma.searchPage.findUnique({
            where: { path: "/for/tutors" },
        });
        expect(row).toMatchObject({
            status: "UNPUBLISHED",
            releasedStatus: "UNPUBLISHED",
            takenOffAt: null,
        });
        await expect(service.deploy(staff)).rejects.toBeInstanceOf(
            ConflictException,
        );
        // It was never on the site, so nothing redirects.
        expect(await service.publicList()).toEqual({ live: [], takenOff: [] });
    });

    it("cancels staged changes back to what the site has, with history and audit (DEC-201 amendment)", async () => {
        const since = new Date();
        await service.act(staff, "publish", ["/for/florists"]);
        await service.act(staff, "publish", ["/for/bakers"]);
        await service.deploy(staff);
        await finishDeploys();
        await service.act(staff, "archive", ["/for/bakers"]);

        const out = await service
            .act(staff, "cancel", ["/for/florists", "/for/bakers"])
            .catch((e: unknown) => e);
        // florists was deployed: nothing waits for it, so the call is refused whole.
        expect(out).toBeInstanceOf(ConflictException);
        expect(await statusOf("/for/bakers")).toBe("ARCHIVED");

        await service.act(staff, "publish", ["/for/opticians"]);
        await service.act(staff, "cancel", ["/for/bakers", "/for/opticians"]);
        expect(
            await prisma.searchPage.findMany({
                where: { path: { in: ["/for/bakers", "/for/opticians"] } },
                select: { path: true, status: true, releasedStatus: true },
                orderBy: { path: "asc" },
            }),
        ).toEqual([
            { path: "/for/bakers", status: "LIVE", releasedStatus: "LIVE" },
            {
                path: "/for/opticians",
                status: "DRAFT",
                releasedStatus: "DRAFT",
            },
        ]);
        await expect(service.deploy(staff)).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(
            await prisma.searchPageEvent.findMany({
                where: { action: "cancel" },
                select: { path: true, fromStatus: true, toStatus: true },
                orderBy: { path: "asc" },
            }),
        ).toEqual([
            { path: "/for/bakers", fromStatus: "ARCHIVED", toStatus: "LIVE" },
            { path: "/for/opticians", fromStatus: "LIVE", toStatus: "DRAFT" },
        ]);
        expect(
            await prisma.adminAuditEvent.count({
                where: {
                    action: "search-page.cancel",
                    permission: "search-pages:publish",
                    createdAt: { gte: since },
                },
            }),
        ).toBe(2);
    });

    it("adds to a rebuild still waiting to start instead of queueing another", async () => {
        await service.act(staff, "publish", ["/for/a"]);
        await service.deploy(staff);
        await service.act(staff, "publish", ["/for/b"]);
        await service.deploy(staff);

        const jobs = await deployJobs();
        expect(jobs).toHaveLength(1);
        expect(pathsOf(jobs[0]?.payload)).toEqual(["/for/a", "/for/b"]);

        // Once it has started, the next deploy gets a rebuild of its own.
        await prisma.job.updateMany({
            where: { type: SEARCH_PAGES_DEPLOY_TYPE },
            data: { status: "PROCESSING" },
        });
        await service.act(staff, "publish", ["/for/c"]);
        await service.deploy(staff);
        expect(await deploys()).toBe(2);
    });

    it("keeps staged pages off the site through any build until deployed", async () => {
        await service.act(staff, "publish", ["/for/live-one"]);
        await service.deploy(staff);
        const before = JSON.stringify(await service.publicList());

        await service.act(staff, "publish", forPaths(5, "staged"));
        // An ordinary code release builds from this list.
        expect(JSON.stringify(await service.publicList())).toBe(before);
    });

    it("moves nothing and queues nothing when the deploy fails midway", async () => {
        await service.act(staff, "publish", ["/for/a", "/for/b", "/for/c"]);
        const audit = new AdminAuditService();
        let calls = 0;
        const failing = new SearchPagesService({
            write: async (...args: Parameters<AdminAuditService["write"]>) => {
                if (++calls === 2) throw new Error("audit down");
                return audit.write(...args);
            },
        } as AdminAuditService);

        await expect(failing.deploy(staff)).rejects.toThrow("audit down");

        expect(await deploys()).toBe(0);
        expect(
            (await prisma.searchPage.findMany()).map((r) => r.releasedStatus),
        ).toEqual(["DRAFT", "DRAFT", "DRAFT"]);
        expect(
            await prisma.searchPageEvent.count({ where: { action: "deploy" } }),
        ).toBe(0);
    });

    it("leaves the public list as it was for every record after the migration's backfill", async () => {
        const now = new Date("2026-10-30T10:00:00Z");
        // Records as they were before the migration, released column at
        // its default.
        await prisma.searchPage.createMany({
            data: [
                { path: "/for/live", status: "LIVE", liveSince: now },
                { path: "/for/draft", status: "DRAFT" },
                {
                    path: "/for/off",
                    status: "UNPUBLISHED",
                    takenOffAt: now,
                },
                { path: "/for/gone", status: "ARCHIVED", takenOffAt: now },
                { path: "/for/back", status: "DRAFT", takenOffAt: now },
                { path: "/for/hidden", status: "ARCHIVED" },
            ],
        });
        // The list as the old code built it, from `status`.
        const rows = await prisma.searchPage.findMany({
            orderBy: { path: "asc" },
        });
        const before = JSON.stringify({
            live: rows.filter((r) => r.status === "LIVE").map((r) => r.path),
            takenOff: rows.flatMap((r) =>
                r.status !== "LIVE" && r.takenOffAt
                    ? [{ path: r.path, at: r.takenOffAt }]
                    : [],
            ),
        });

        const sql = readFileSync(
            path.resolve(
                __dirname,
                "../../../../../packages/database/prisma/migrations/20270116100000_search_page_released_status/migration.sql",
            ),
            "utf8",
        );
        const backfill = sql.match(/^UPDATE "SearchPage"[^;]*;/m)?.[0];
        expect(backfill).toBeDefined();
        await prisma.$executeRawUnsafe(backfill ?? "");

        expect(JSON.stringify(await service.publicList())).toBe(before);
        // And nothing waits to deploy.
        await expect(service.deploy(staff)).rejects.toBeInstanceOf(
            ConflictException,
        );
    });
});

describe("search page actions", () => {
    beforeAll(reset);

    it("stages new pages, with history and audit, and no deploy", async () => {
        const since = new Date();
        const out = await service.act(staff, "publish", [
            "/for/salons",
            "/for/yoga-studios",
        ]);

        expect(out).not.toHaveProperty("rebuildQueued");
        expect(out.pages).toEqual([
            expect.objectContaining({
                path: "/for/salons",
                status: "LIVE",
                releasedStatus: "DRAFT",
                changedBy: { name: "Asha Rao" },
                deployedAt: null,
                deployedBy: null,
            }),
            expect.objectContaining({
                path: "/for/yoga-studios",
                status: "LIVE",
            }),
        ]);
        expect(await deploys()).toBe(0);
        expect(
            await prisma.searchPageEvent.count({
                where: { action: "publish" },
            }),
        ).toBe(2);
        expect(
            await prisma.adminAuditEvent.findMany({
                where: {
                    action: "search-page.publish",
                    createdAt: { gte: since },
                },
                select: { targetId: true, permission: true, actorUserId: true },
                orderBy: { targetId: "asc" },
            }),
        ).toEqual([
            {
                targetId: "/for/salons",
                permission: "search-pages:publish",
                actorUserId: staff.userId,
            },
            {
                targetId: "/for/yoga-studios",
                permission: "search-pages:publish",
                actorUserId: staff.userId,
            },
        ]);
        await service.deploy(staff);
        await finishDeploys();
    });

    it("refuses the whole call with 409 naming every path it can't do", async () => {
        const call = service.act(staff, "publish", [
            "/for/dental-clinics",
            "/for/salons",
        ]);
        await expect(call).rejects.toBeInstanceOf(ConflictException);
        await call.catch((error: ConflictException) => {
            expect(error.getResponse()).toMatchObject({
                details: { action: "publish", paths: ["/for/salons"] },
            });
        });
        // All or nothing: the valid path was not published either.
        expect(await statusOf("/for/dental-clinics")).toBeNull();
    });

    it("releases at once a change the site can't see", async () => {
        await service.act(staff, "archive", ["/for/home-bakers"]);
        expect(
            await prisma.searchPage.findUnique({
                where: { path: "/for/home-bakers" },
            }),
        ).toMatchObject({ status: "ARCHIVED", releasedStatus: "ARCHIVED" });

        await service.act(staff, "restore", ["/for/home-bakers"]);
        expect(await statusOf("/for/home-bakers")).toBe("DRAFT");
        await expect(service.deploy(staff)).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it("can't publish an archived page until it is restored", async () => {
        await service.act(staff, "archive", ["/for/tutors"]);
        await expect(
            service.act(staff, "publish", ["/for/tutors"]),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            service.act(staff, "unpublish", ["/for/tutors"]),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("takes pages off on deploy, and keeps them in takenOff", async () => {
        await service.act(staff, "unpublish", ["/for/yoga-studios"]);
        // Archiving a live page takes it off in the same change.
        await service.act(staff, "archive", ["/for/salons"]);
        await service.deploy(staff);
        await finishDeploys();
        expect(await statusOf("/for/salons")).toBe("ARCHIVED");

        // Restored, it is a draft again but its old address still redirects.
        await service.act(staff, "restore", ["/for/salons"]);

        const site = await service.publicList();
        expect(site.live).toEqual([]);
        expect(site.takenOff.map((t) => t.path)).toEqual([
            "/for/salons",
            "/for/yoga-studios",
        ]);
        expect(site.takenOff[0]?.at).toBeInstanceOf(Date);
    });

    it("lists live pages sorted, and not taken off once back", async () => {
        await service.act(staff, "publish", [
            "/for/yoga-studios",
            "/for/bakeries",
        ]);
        await service.deploy(staff);
        const site = await service.publicList();
        expect(site.live).toEqual(["/for/bakeries", "/for/yoga-studios"]);
        expect(site.takenOff.map((t) => t.path)).toEqual(["/for/salons"]);
    });

    it("lists every record with whether a rebuild is under way", async () => {
        const { pages, rebuild } = await service.list(null);
        expect(pages.map((p) => [p.path, p.status, p.releasedStatus])).toEqual([
            ["/for/bakeries", "LIVE", "LIVE"],
            ["/for/home-bakers", "DRAFT", "DRAFT"],
            ["/for/salons", "DRAFT", "DRAFT"],
            ["/for/tutors", "ARCHIVED", "ARCHIVED"],
            ["/for/yoga-studios", "LIVE", "LIVE"],
        ]);
        expect(pages[0]?.deployedBy).toEqual({ name: "Asha Rao" });
        // A deploy is queued and no worker runs here.
        expect(rebuild).toEqual({
            running: true,
            startedAt: expect.any(Date),
            paths: ["/for/bakeries", "/for/yoga-studios"],
        });

        await finishDeploys();
        expect((await service.list(null)).rebuild).toEqual({ running: false });
        const run = {
            state: "running" as const,
            url: "https://github.com/run/1",
            trigger: "workflow_dispatch",
            commit: "abc",
            startedAt: "2026-10-26T10:00:00Z",
        };
        expect((await service.list(run)).rebuild).toEqual({
            running: true,
            startedAt: run.startedAt,
            url: run.url,
        });
    });

    it("gives a page's history newest first", async () => {
        const { events } = await service.history("/for/salons");
        expect(events.map((e) => [e.action, e.fromStatus, e.toStatus])).toEqual(
            [
                ["restore", "ARCHIVED", "DRAFT"],
                ["deploy", "LIVE", "ARCHIVED"],
                ["archive", "LIVE", "ARCHIVED"],
                ["deploy", "DRAFT", "LIVE"],
                ["publish", "DRAFT", "LIVE"],
            ],
        );
        expect(events[0]?.by).toEqual({ name: "Asha Rao" });
    });
});

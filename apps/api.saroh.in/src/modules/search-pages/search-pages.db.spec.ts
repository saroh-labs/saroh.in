/**
 * Search pages' publish records (DEC-193) against a real Postgres: each
 * action's transitions, all or nothing with a 409 naming the paths, a
 * history row and an audit entry per page, one web deploy queued per action
 * that changes what is live (none when it doesn't), and the public list the
 * site builds from.
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

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditService } from "../admin/admin-audit.service";
import { SEARCH_PAGES_DEPLOY_TYPE } from "./search-pages-deploy.job";
import { SearchPagesService } from "./search-pages.service";

const service = new SearchPagesService(new AdminAuditService());
let staff: PlatformAdminInfo;

const deploys = () =>
    prisma.job.count({ where: { type: SEARCH_PAGES_DEPLOY_TYPE } });
const statusOf = async (path: string) =>
    (await prisma.searchPage.findUnique({ where: { path } }))?.status ?? null;

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

describe("search pages", () => {
    it("publishes new pages, with history, audit and one deploy", async () => {
        const out = await service.act(staff, "publish", [
            "/for/salons",
            "/for/yoga-studios",
        ]);

        expect(out.rebuildQueued).toBe(true);
        expect(out.pages).toEqual([
            expect.objectContaining({
                path: "/for/salons",
                status: "LIVE",
                changedBy: { name: "Asha Rao" },
                liveSince: expect.any(Date),
            }),
            expect.objectContaining({
                path: "/for/yoga-studios",
                status: "LIVE",
            }),
        ]);
        expect(await deploys()).toBe(1);
        expect(
            await prisma.searchPageEvent.count({
                where: { action: "publish" },
            }),
        ).toBe(2);
        expect(
            await prisma.adminAuditEvent.findMany({
                where: { action: "search-page.publish" },
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
        expect(await deploys()).toBe(1);
    });

    it("queues no deploy when nothing live changed", async () => {
        const out = await service.act(staff, "archive", ["/for/home-bakers"]);
        expect(out.rebuildQueued).toBe(false);
        expect(await statusOf("/for/home-bakers")).toBe("ARCHIVED");

        await service.act(staff, "restore", ["/for/home-bakers"]);
        expect(await statusOf("/for/home-bakers")).toBe("DRAFT");
        expect(await deploys()).toBe(1);
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

    it("takes pages off with one deploy, and keeps them in takenOff", async () => {
        await service.act(staff, "unpublish", ["/for/yoga-studios"]);
        // Archiving a live page takes it off in the same change.
        await service.act(staff, "archive", ["/for/salons"]);
        expect(await deploys()).toBe(3);
        expect(await statusOf("/for/salons")).toBe("ARCHIVED");

        // Restored, it is a draft again but its old address still redirects.
        await service.act(staff, "restore", ["/for/salons"]);
        expect(await deploys()).toBe(3);

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
        const site = await service.publicList();
        expect(site.live).toEqual(["/for/bakeries", "/for/yoga-studios"]);
        expect(site.takenOff.map((t) => t.path)).toEqual(["/for/salons"]);
    });

    it("lists every record with whether a rebuild is under way", async () => {
        const { pages, rebuild } = await service.list(null);
        expect(pages.map((p) => [p.path, p.status])).toEqual([
            ["/for/bakeries", "LIVE"],
            ["/for/home-bakers", "DRAFT"],
            ["/for/salons", "DRAFT"],
            ["/for/tutors", "ARCHIVED"],
            ["/for/yoga-studios", "LIVE"],
        ]);
        // Deploys are queued and no worker runs here.
        expect(rebuild).toEqual({ running: true, startedAt: expect.any(Date) });

        await prisma.job.updateMany({
            where: { type: SEARCH_PAGES_DEPLOY_TYPE },
            data: { status: "DONE" },
        });
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
                ["archive", "LIVE", "ARCHIVED"],
                ["publish", "DRAFT", "LIVE"],
            ],
        );
        expect(events[0]?.by).toEqual({ name: "Asha Rao" });
    });
});

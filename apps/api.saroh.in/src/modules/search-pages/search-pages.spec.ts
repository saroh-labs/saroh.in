const mockEnv: Record<string, string | undefined> = {};
jest.mock("../../env", () => ({ env: mockEnv }));
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/platform-admin.guard", () => ({
    PlatformAdminGuard: class PlatformAdminGuard {},
}));

import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { Job } from "@saroh/database";

import { REQUIRE_ADMIN_PERMISSIONS } from "../../common/decorators/require-admin-permission.decorator";
import { validationPipeOptions } from "../../common/validation";
import { AdminPermission } from "../admin/admin-permissions";
import { SearchPageActionDto, SearchPageHistoryQueryDto } from "./dto";
import type { SearchPageAction, SearchPageStatus } from "./search-page-rules";
import { changesLive, nextStatus } from "./search-page-rules";
import {
    enqueueWebDeploy,
    SEARCH_PAGES_DEPLOY_TYPE,
    SearchPagesDeployHandler,
} from "./search-pages-deploy.job";
import { SearchPagesController } from "./search-pages.controller";

describe("who may use the console's search pages", () => {
    const required = (name: keyof SearchPagesController) =>
        Reflect.getMetadata(
            REQUIRE_ADMIN_PERMISSIONS,
            SearchPagesController.prototype[name],
        ) as unknown;

    it("reads with the console read, acts and deploys with search-pages:publish", () => {
        expect(required("list")).toEqual([AdminPermission.PlatformRead]);
        expect(required("history")).toEqual([AdminPermission.PlatformRead]);
        expect(required("act")).toEqual([AdminPermission.SearchPagesPublish]);
        expect(required("deploy")).toEqual([
            AdminPermission.SearchPagesPublish,
        ]);
    });
});

describe("search page transitions (DEC-193)", () => {
    const from: (SearchPageStatus | null)[] = [
        null,
        "DRAFT",
        "UNPUBLISHED",
        "LIVE",
        "ARCHIVED",
    ];
    const table: Record<SearchPageAction, (SearchPageStatus | null)[]> = {
        publish: ["LIVE", "LIVE", "LIVE", null, null],
        unpublish: [null, null, null, "UNPUBLISHED", null],
        archive: ["ARCHIVED", "ARCHIVED", "ARCHIVED", "ARCHIVED", null],
        restore: [null, null, null, null, "DRAFT"],
    };

    it.each(Object.entries(table))("%s from each status", (action, to) => {
        expect(
            from.map((f) => nextStatus(action as SearchPageAction, f)),
        ).toEqual(to);
    });

    it("counts only a move onto or off the site as a live change", () => {
        expect(changesLive(null, "LIVE")).toBe(true);
        expect(changesLive("LIVE", "ARCHIVED")).toBe(true);
        expect(changesLive("LIVE", "UNPUBLISHED")).toBe(true);
        expect(changesLive(null, "ARCHIVED")).toBe(false);
        expect(changesLive("ARCHIVED", "DRAFT")).toBe(false);
    });
});

describe("search page DTOs", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const body = (value: unknown) =>
        pipe.transform(value, { type: "body", metatype: SearchPageActionDto });

    it("takes an action on 1 to 100 /for/ and /tools/ paths", async () => {
        await expect(
            body({ action: "publish", paths: ["/for/salons"] }),
        ).resolves.toBeInstanceOf(SearchPageActionDto);
        await expect(
            body({
                action: "publish",
                paths: ["/tools/no-show-cost-calculator", "/for/salons"],
            }),
        ).resolves.toBeInstanceOf(SearchPageActionDto);
        const hundred = Array.from({ length: 100 }, (_, i) => `/for/p-${i}`);
        await expect(
            body({ action: "archive", paths: hundred }),
        ).resolves.toBeDefined();
    });

    it("takes the new page groups' paths too (plan 2026-10-31-002)", async () => {
        await expect(
            body({
                action: "publish",
                paths: ["/gst/x", "/guides/x", "/downloads/x"],
            }),
        ).resolves.toBeInstanceOf(SearchPageActionDto);
        await expect(
            body({ action: "publish", paths: ["/gst/"] }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
        ["no paths", { action: "publish", paths: [] }],
        [
            "101 paths",
            {
                action: "publish",
                paths: Array.from({ length: 101 }, (_, i) => `/for/p-${i}`),
            },
        ],
        ["another kind", { action: "publish", paths: ["/blog/qr"] }],
        ["a bare kind", { action: "publish", paths: ["/tools/"] }],
        ["capitals", { action: "publish", paths: ["/for/Salons"] }],
        ["a nested path", { action: "publish", paths: ["/for/a/b"] }],
        ["a repeat", { action: "publish", paths: ["/for/a", "/for/a"] }],
        ["an unknown action", { action: "delete", paths: ["/for/a"] }],
        ["an extra field", { action: "publish", paths: ["/for/a"], x: 1 }],
    ])("refuses %s", async (_, value) => {
        await expect(body(value)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("checks the history's path", async () => {
        const query = (value: unknown) =>
            pipe.transform(value, {
                type: "query",
                metatype: SearchPageHistoryQueryDto,
            });
        await expect(query({ path: "/for/salons" })).resolves.toBeDefined();
        await expect(
            query({ path: "/tools/qr-code-maker" }),
        ).resolves.toBeDefined();
        await expect(query({ path: "/for/../x" })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});

describe("the web deploy a search page change queues", () => {
    const job = { id: "job_1", payload: { paths: [] } } as unknown as Job;

    function configure(on: boolean) {
        mockEnv.SITE_DEPLOY_GITHUB_TOKEN = on ? "token-for-tests" : undefined;
        mockEnv.SITE_DEPLOY_ENVIRONMENT = on ? "development" : undefined;
    }
    afterEach(() => configure(false));

    const fakeTx = (waiting: unknown, updated = 1) => ({
        job: {
            create: jest.fn().mockResolvedValue({}),
            findFirst: jest.fn().mockResolvedValue(waiting),
            updateMany: jest.fn().mockResolvedValue({ count: updated }),
        },
    });

    it("queues only when a web deploy can run", async () => {
        const tx = fakeTx(null);
        expect(await enqueueWebDeploy(tx as never, ["/for/a"])).toBe(false);
        expect(tx.job.create).not.toHaveBeenCalled();

        configure(true);
        expect(await enqueueWebDeploy(tx as never, ["/for/a"])).toBe(true);
        expect(tx.job.create).toHaveBeenCalledWith({
            data: {
                type: SEARCH_PAGES_DEPLOY_TYPE,
                payload: { paths: ["/for/a"] },
            },
        });
    });

    it("adds the paths to a deploy still waiting to start", async () => {
        configure(true);
        const tx = fakeTx({ id: "job_w", payload: { paths: ["/for/b"] } });
        expect(await enqueueWebDeploy(tx as never, ["/for/a", "/for/b"])).toBe(
            true,
        );
        expect(tx.job.updateMany).toHaveBeenCalledWith({
            where: { id: "job_w", status: "PENDING" },
            data: { payload: { paths: ["/for/a", "/for/b"] } },
        });
        expect(tx.job.create).not.toHaveBeenCalled();
    });

    it("queues its own when a worker claimed the waiting one first", async () => {
        configure(true);
        const tx = fakeTx({ id: "job_w", payload: { paths: [] } }, 0);
        expect(await enqueueWebDeploy(tx as never, ["/for/a"])).toBe(true);
        expect(tx.job.create).toHaveBeenCalledTimes(1);
    });

    it("dispatches deploy-frontends.yml for web in this environment", async () => {
        configure(true);
        const handler = new SearchPagesDeployHandler();
        const fetchFn = jest
            .fn()
            .mockResolvedValue(new Response(null, { status: 204 }));
        handler.fetchFn = fetchFn;

        await handler.handle(job);

        const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(
            "https://api.github.com/repos/saroh-labs/saroh.in/actions/workflows/deploy-frontends.yml/dispatches",
        );
        expect(JSON.parse(init.body as string)).toEqual({
            ref: "development",
            inputs: { app: "web", environment: "development" },
        });
    });

    it("throws so the queue retries when GitHub refuses", async () => {
        configure(true);
        const handler = new SearchPagesDeployHandler();
        handler.fetchFn = jest
            .fn()
            .mockResolvedValue(new Response(null, { status: 502 }));
        await expect(handler.handle(job)).rejects.toThrow(/502/);
    });

    it("does nothing when the deploy was unset since", async () => {
        const handler = new SearchPagesDeployHandler();
        const fetchFn = jest.fn();
        handler.fetchFn = fetchFn;
        await handler.handle(job);
        expect(fetchFn).not.toHaveBeenCalled();
    });
});

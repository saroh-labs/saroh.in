const mockEnv: Record<string, string | undefined> = {};
jest.mock("../../env", () => ({ env: mockEnv }));
jest.mock("@saroh/database", () => ({ prisma: { adminAuditEvent: {} } }));

import {
    BadGatewayException,
    BadRequestException,
    HttpException,
    ServiceUnavailableException,
    ValidationPipe,
} from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { validationPipeOptions } from "../../common/validation";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import type { AdminAuditService } from "./admin-audit.service";
import { jobName } from "./admin-deployments";
import { AdminDeploymentsService } from "./admin-deployments.service";
import {
    AdminPermission,
    AdminRole,
    permissionsFor,
} from "./admin-permissions";
import { StartDeploymentDto } from "./dto";

// Built at runtime: a literal token-shaped string would trip the secret scan.
const TOKEN = ["fake", "deploy", "token", "x".repeat(24)].join("-");
// An idempotency key, built the same way so the scan sees no literal.
const KEY = "k".repeat(12);

const staff: PlatformAdminInfo = {
    userId: "user_owner",
    platformAdminId: "pa_1",
    roles: [AdminRole.PlatformOwner],
    permissions: permissionsFor([AdminRole.PlatformOwner]),
    viaBootstrap: false,
};

function setup(limits: { perTarget?: number; perOperator?: number } = {}) {
    const write = jest.fn().mockResolvedValue(undefined);
    const audit = { write } as unknown as AdminAuditService;
    const service = new AdminDeploymentsService(
        audit,
        new FixedWindowRateLimiter(limits.perTarget ?? 1, 60_000),
        new FixedWindowRateLimiter(limits.perOperator ?? 10, 60_000),
    );
    const fetchFn = jest.fn();
    service.fetchFn = fetchFn;
    return { service, write, fetchFn };
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

describe("AdminDeploymentsService.start (#886)", () => {
    beforeEach(() => {
        mockEnv.SITE_DEPLOY_GITHUB_TOKEN = TOKEN;
        mockEnv.SITE_DEPLOY_GITHUB_REPO = undefined;
    });

    it("is for Platform Owners only", () => {
        const holders = Object.values(AdminRole).filter((role) =>
            permissionsFor([role]).includes(AdminPermission.DeploymentsRun),
        );
        expect(holders).toEqual([AdminRole.PlatformOwner]);
    });

    it("starts a dev deploy at once, from development, and records it", async () => {
        const { service, write, fetchFn } = setup();
        fetchFn.mockResolvedValue(new Response(null, { status: 204 }));

        const started = await service.start(staff, {
            app: "admin",
            environment: "development",
        });

        expect(started).toMatchObject({ ref: "development" });
        const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(
            "https://api.github.com/repos/saroh-labs/saroh.in/actions/workflows/deploy-frontends.yml/dispatches",
        );
        expect(JSON.parse(init.body as string)).toEqual({
            ref: "development",
            inputs: { app: "admin", environment: "development" },
        });
        expect((init.headers as Record<string, string>).authorization).toBe(
            `Bearer ${TOKEN}`,
        );
        expect(write).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                actorUserId: "user_owner",
                permission: AdminPermission.DeploymentsRun,
                action: "deployment.start",
                targetId: "admin:development",
                outcome: "SUCCESS",
                metadata: expect.objectContaining({
                    app: "admin",
                    environment: "development",
                    worker: "saroh-admin-dev",
                }) as unknown,
            }),
        );
    });

    it("refuses production unless the Worker's name is typed back", async () => {
        const { service, fetchFn } = setup();
        fetchFn.mockResolvedValue(new Response(null, { status: 204 }));

        await expect(
            service.start(staff, { app: "web", environment: "production" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.start(staff, {
                app: "web",
                environment: "production",
                confirm: "saroh-web-dev",
            }),
        ).rejects.toThrow("Type saroh-web to deploy Marketing site");
        expect(fetchFn).not.toHaveBeenCalled();

        await service.start(staff, {
            app: "web",
            environment: "production",
            confirm: "saroh-web",
        });
        const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
        expect(JSON.parse(init.body as string)).toMatchObject({ ref: "main" });
    });

    it("refuses when the API holds no token, calling nothing", async () => {
        mockEnv.SITE_DEPLOY_GITHUB_TOKEN = undefined;
        const { service, fetchFn, write } = setup();
        await expect(
            service.start(staff, { app: "web", environment: "development" }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(fetchFn).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
    });

    it("rate-limits a second press for the same app and environment, on the record", async () => {
        const { service, fetchFn, write } = setup();
        fetchFn.mockResolvedValue(new Response(null, { status: 204 }));
        await service.start(staff, {
            app: "sites",
            environment: "development",
        });

        const second = service.start(staff, {
            app: "sites",
            environment: "development",
        });
        await expect(second).rejects.toBeInstanceOf(HttpException);
        await expect(second).rejects.toMatchObject({ status: 429 });
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ outcome: "DENIED" }),
        );

        // Another app is its own window.
        await service.start(staff, { app: "auth", environment: "development" });
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("says GitHub refused, deploys nothing, and records the failure", async () => {
        const { service, fetchFn, write } = setup();
        fetchFn.mockResolvedValue(new Response(null, { status: 403 }));

        await expect(
            service.start(staff, { app: "web", environment: "development" }),
        ).rejects.toBeInstanceOf(BadGatewayException);
        expect(write).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                outcome: "FAILURE",
                metadata: expect.objectContaining({
                    githubStatus: 403,
                }) as unknown,
            }),
        );
    });

    it("keeps a started deploy when the ledger can't be written", async () => {
        const { service, fetchFn, write } = setup();
        fetchFn.mockResolvedValue(new Response(null, { status: 204 }));
        write.mockRejectedValue(new Error("db down"));
        await expect(
            service.start(staff, { app: "web", environment: "development" }),
        ).resolves.toMatchObject({ app: "web" });
    });
});

describe("AdminDeploymentsService.list", () => {
    beforeEach(() => {
        mockEnv.SITE_DEPLOY_GITHUB_TOKEN = TOKEN;
    });

    it("reads the runs and their deploy jobs into rows, and caches briefly", async () => {
        const { service, fetchFn } = setup();
        fetchFn.mockImplementation((url: string) =>
            Promise.resolve(
                url.includes("/jobs")
                    ? json({
                          jobs: [
                              {
                                  name: jobName("web", "production"),
                                  status: "completed",
                                  conclusion: "success",
                                  html_url: "https://github.example.test/j/1",
                                  started_at: "2026-10-08T00:00:00Z",
                                  completed_at: "2026-10-08T00:04:00Z",
                              },
                          ],
                      })
                    : json({
                          workflow_runs: [
                              {
                                  id: 7,
                                  event: "push",
                                  status: "completed",
                                  conclusion: "success",
                                  html_url: "https://github.example.test/r/7",
                                  head_sha: "abc1234",
                                  display_title: "fix",
                                  created_at: "2026-10-08T00:00:00Z",
                              },
                          ],
                      }),
            ),
        );

        const view = await service.list();
        expect(view).toMatchObject({
            configured: true,
            source: "github",
            readError: null,
        });
        expect(
            view.rows.find(
                (r) => r.app === "web" && r.environment === "production",
            )?.lastDeploy,
        ).toEqual({
            at: "2026-10-08T00:04:00Z",
            commit: "abc1234",
            url: "https://github.example.test/j/1",
        });

        await service.list();
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("says GitHub could not be read rather than showing nothing deployed", async () => {
        const { service, fetchFn } = setup();
        fetchFn.mockResolvedValue(json({}, 401));
        const view = await service.list();
        expect(view.readError).toBe("GitHub answered 401.");
        expect(view.rows.every((r) => r.latestRun === null)).toBe(true);
    });

    it("reads nothing when the API holds no token", async () => {
        mockEnv.SITE_DEPLOY_GITHUB_TOKEN = undefined;
        const { service, fetchFn } = setup();
        const view = await service.list();
        expect(view.configured).toBe(false);
        expect(fetchFn).not.toHaveBeenCalled();
    });
});

describe("StartDeploymentDto", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const validate = (value: unknown) =>
        pipe.transform(value, { type: "body", metatype: StartDeploymentDto });

    it("takes a known app and environment", async () => {
        await expect(
            validate({
                app: "web",
                environment: "production",
                confirm: " saroh-web ",
                idempotencyKey: KEY,
            }),
        ).resolves.toMatchObject({ confirm: "saroh-web" });
    });

    it.each([
        { app: "api", environment: "development" },
        { app: "web", environment: "staging" },
        { app: "all", environment: "production" },
    ])("refuses %o", async (body) => {
        await expect(
            validate({ ...body, idempotencyKey: KEY }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

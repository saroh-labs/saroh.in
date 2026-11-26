import {
    ExecutionContext,
    ForbiddenException,
    UnauthorizedException,
} from "@nestjs/common";

jest.mock("@saroh/database", () => ({
    prisma: {
        platformAdmin: { findUnique: jest.fn() },
        platformAdminRoleAssignment: { findFirst: jest.fn() },
        adminAuditEvent: { findFirst: jest.fn(), create: jest.fn() },
    },
}));

jest.mock("../../env", () => ({
    env: {
        ADMIN_ALLOWLIST: undefined,
        ADMIN_SESSION_MAX_AGE_MINUTES: 720,
        BETTER_AUTH_URL: "https://api.saroh.in",
        NODE_ENV: "test",
    },
}));

import { prisma } from "@saroh/database";

import { env } from "../../env";
import {
    AdminPermission,
    AdminRole,
} from "../../modules/admin/admin-permissions";
import { PlatformAdminGuard } from "./platform-admin.guard";

const findUnique = prisma.platformAdmin.findUnique as jest.Mock;
const findOwner = prisma.platformAdminRoleAssignment.findFirst as jest.Mock;
const auditSeen = prisma.adminAuditEvent.findFirst as jest.Mock;
const auditCreate = prisma.adminAuditEvent.create as jest.Mock;
const mutableEnv = env as { ADMIN_ALLOWLIST?: string; NODE_ENV?: string };

interface TestRequest {
    method?: string;
    headers?: Record<string, string>;
    session?: { id: string; createdAt: Date };
    user?: { id: string; email: string };
    platformAdmin?: {
        userId: string;
        platformAdminId: string | null;
        roles: AdminRole[];
        permissions: AdminPermission[];
        viaBootstrap: boolean;
        edition: string | null;
    };
}

function contextFor(request: TestRequest): ExecutionContext {
    // A fresh session unless the test says otherwise.
    if (request.user && !request.session) {
        request.session = { id: "sess_1", createdAt: new Date() };
    }
    return {
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
}

describe("PlatformAdminGuard", () => {
    const guard = new PlatformAdminGuard();

    beforeEach(() => {
        jest.clearAllMocks();
        mutableEnv.ADMIN_ALLOWLIST = undefined;
        findUnique.mockResolvedValue(null);
        findOwner.mockResolvedValue(null);
        auditSeen.mockResolvedValue(null);
        auditCreate.mockResolvedValue({});
    });

    it("admits a user with an ACTIVE PlatformAdmin grant", async () => {
        findUnique.mockResolvedValue({
            id: "pa_1",
            revokedAt: null,
            roleAssignments: [
                {
                    role: AdminRole.Support,
                    expiresAt: null,
                    revokedAt: null,
                },
            ],
        });
        const request: TestRequest = {
            user: { id: "user_1", email: "staff@saroh.in" },
        };

        await expect(guard.canActivate(contextFor(request))).resolves.toBe(
            true,
        );
        expect(request.platformAdmin).toEqual({
            userId: "user_1",
            platformAdminId: "pa_1",
            roles: [AdminRole.Support],
            permissions: expect.arrayContaining([
                AdminPermission.OrganizationRead,
            ]),
            viaBootstrap: false,
            edition: null,
        });
    });

    it("REFUSES a revoked grant — revocation takes effect immediately", async () => {
        findUnique.mockResolvedValue({
            id: "pa_1",
            revokedAt: new Date(),
            roleAssignments: [],
        });

        await expect(
            guard.canActivate(
                contextFor({ user: { id: "user_1", email: "ex@saroh.in" } }),
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses a user with no grant at all", async () => {
        await expect(
            guard.canActivate(
                contextFor({
                    user: { id: "user_2", email: "tenant@acme.test" },
                }),
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("fails closed when ADMIN_ALLOWLIST is unset (a fresh deploy has no admins)", async () => {
        await expect(
            guard.canActivate(
                contextFor({
                    user: { id: "user_3", email: "anyone@saroh.in" },
                }),
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("admits a break-glass allowlisted email, flagged as bootstrap", async () => {
        mutableEnv.ADMIN_ALLOWLIST = "founder@saroh.in, ops@saroh.in";
        const request: TestRequest = {
            user: { id: "user_4", email: "OPS@saroh.in" },
        };

        await expect(guard.canActivate(contextFor(request))).resolves.toBe(
            true,
        );
        // Marked so the surface can tell config-based access from a real grant.
        expect(request.platformAdmin).toEqual({
            userId: "user_4",
            platformAdminId: null,
            roles: [AdminRole.PlatformOwner],
            permissions: expect.arrayContaining([
                AdminPermission.StaffGrant,
                AdminPermission.FlagsPublish,
            ]),
            viaBootstrap: true,
            edition: null,
        });
    });

    it("ignores expired and revoked role assignments", async () => {
        findUnique.mockResolvedValue({
            id: "pa_1",
            revokedAt: null,
            roleAssignments: [
                {
                    role: AdminRole.Operations,
                    expiresAt: new Date(Date.now() - 60_000),
                    revokedAt: null,
                },
                {
                    role: AdminRole.Billing,
                    expiresAt: null,
                    revokedAt: new Date(),
                },
                {
                    role: AdminRole.Support,
                    expiresAt: null,
                    revokedAt: null,
                },
            ],
        });
        const request: TestRequest = {
            user: { id: "user_roles", email: "roles@saroh.in" },
        };

        await guard.canActivate(contextFor(request));

        expect(request.platformAdmin?.roles).toEqual([AdminRole.Support]);
        expect(request.platformAdmin?.permissions).not.toContain(
            AdminPermission.JobsRetry,
        );
        expect(request.platformAdmin?.permissions).not.toContain(
            AdminPermission.SubscriptionOverride,
        );
    });

    it("refuses an active grant with no active roles", async () => {
        findUnique.mockResolvedValue({
            id: "pa_1",
            revokedAt: null,
            roleAssignments: [],
        });

        await expect(
            guard.canActivate(
                contextFor({
                    user: { id: "user_roleless", email: "roleless@saroh.in" },
                }),
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("unions permissions from multiple active roles", async () => {
        findUnique.mockResolvedValue({
            id: "pa_multi",
            revokedAt: null,
            roleAssignments: [
                {
                    role: AdminRole.Operations,
                    expiresAt: null,
                    revokedAt: null,
                },
                {
                    role: AdminRole.Billing,
                    expiresAt: null,
                    revokedAt: null,
                },
            ],
        });
        const request: TestRequest = {
            user: { id: "user_multi", email: "multi@saroh.in" },
        };

        await guard.canActivate(contextFor(request));

        expect(request.platformAdmin?.permissions).toEqual(
            expect.arrayContaining([
                AdminPermission.JobsRetry,
                AdminPermission.SubscriptionOverride,
            ]),
        );
    });

    it("re-resolves role changes on the next request", async () => {
        findUnique
            .mockResolvedValueOnce({
                id: "pa_1",
                revokedAt: null,
                roleAssignments: [
                    {
                        role: AdminRole.Support,
                        expiresAt: null,
                        revokedAt: null,
                    },
                ],
            })
            .mockResolvedValueOnce({
                id: "pa_1",
                revokedAt: null,
                roleAssignments: [
                    {
                        role: AdminRole.Auditor,
                        expiresAt: null,
                        revokedAt: null,
                    },
                ],
            });
        const first: TestRequest = {
            user: { id: "user_1", email: "staff@saroh.in" },
        };
        const second: TestRequest = {
            user: { id: "user_1", email: "staff@saroh.in" },
        };

        await guard.canActivate(contextFor(first));
        await guard.canActivate(contextFor(second));

        expect(first.platformAdmin?.roles).toEqual([AdminRole.Support]);
        expect(second.platformAdmin?.roles).toEqual([AdminRole.Auditor]);
        expect(findUnique).toHaveBeenCalledTimes(2);
    });

    it("does not admit an email merely similar to an allowlisted one", async () => {
        mutableEnv.ADMIN_ALLOWLIST = "ops@saroh.in";

        await expect(
            guard.canActivate(
                contextFor({
                    user: { id: "user_5", email: "ops@saroh.in.evil.com" },
                }),
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("closes break-glass once an active Platform owner grant exists (A3)", async () => {
        mutableEnv.ADMIN_ALLOWLIST = "ops@saroh.in";
        findOwner.mockResolvedValue({ id: "ra_1" });
        await expect(
            guard.canActivate(
                contextFor({ user: { id: "user_4", email: "ops@saroh.in" } }),
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("writes one break-glass ledger row per session (A3)", async () => {
        mutableEnv.ADMIN_ALLOWLIST = "ops@saroh.in";
        await guard.canActivate(
            contextFor({ user: { id: "user_4", email: "ops@saroh.in" } }),
        );
        expect(auditCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "staff.break-glass.used",
                actorUserId: "user_4",
            }),
        });
        auditCreate.mockClear();
        auditSeen.mockResolvedValue({ id: "row" });
        await guard.canActivate(
            contextFor({ user: { id: "user_4", email: "ops@saroh.in" } }),
        );
        expect(auditCreate).not.toHaveBeenCalled();
    });

    it("records a refused caller on the ledger, at most once an hour (B4)", async () => {
        await guard
            .canActivate(
                contextFor({ user: { id: "user_9", email: "x@acme.test" } }),
            )
            .catch(() => undefined);
        expect(auditCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "admin.access.refused",
                outcome: "DENIED",
            }),
        });
    });

    it("asks a staff member to sign in again when the session is old (A2)", async () => {
        findUnique.mockResolvedValue({
            id: "pa_1",
            revokedAt: null,
            editions: [],
            roleAssignments: [
                { role: AdminRole.Support, expiresAt: null, revokedAt: null },
            ],
        });
        const old = new Date(Date.now() - 13 * 60 * 60 * 1000);
        await expect(
            guard.canActivate(
                contextFor({
                    user: { id: "user_1", email: "staff@saroh.in" },
                    session: { id: "s", createdAt: old },
                }),
            ),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("refuses an admin write with no origin at all (A7)", async () => {
        mutableEnv.ADMIN_ALLOWLIST = "ops@saroh.in";
        const write = (headers: Record<string, string>) =>
            guard.canActivate(
                contextFor({
                    method: "POST",
                    headers,
                    user: { id: "user_4", email: "ops@saroh.in" },
                }),
            );
        await expect(write({})).rejects.toThrow("request origin");
        await expect(write({ "sec-fetch-site": "same-site" })).resolves.toBe(
            true,
        );
        await expect(write({ origin: "https://admin.saroh.in" })).resolves.toBe(
            true,
        );
    });

    it("takes an admin write only from the admin console, not another Saroh app (L3)", async () => {
        mutableEnv.ADMIN_ALLOWLIST = "ops@saroh.in";
        const write = (headers: Record<string, string>) =>
            guard.canActivate(
                contextFor({
                    method: "POST",
                    headers: { host: "api.saroh.in", ...headers },
                    user: { id: "user_4", email: "ops@saroh.in" },
                }),
            );
        for (const origin of [
            "https://app.saroh.in",
            "https://accounts.saroh.in",
            "https://admin.saroh.tech",
            "https://admin.saroh.in.example.com",
            "not a url",
        ]) {
            await expect(write({ origin })).rejects.toThrow(
                "Admin changes are made from the admin console",
            );
        }
        await expect(
            write({ referer: "https://app.saroh.in/settings" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            write({ referer: "https://admin.saroh.in/businesses" }),
        ).resolves.toBe(true);
    });

    it("in production, serves no console on an address that isn't an edition's (A9)", async () => {
        mutableEnv.ADMIN_ALLOWLIST = "ops@saroh.in";
        mutableEnv.NODE_ENV = "production";
        try {
            const read = (host: string) =>
                guard.canActivate(
                    contextFor({
                        headers: { host },
                        user: { id: "user_4", email: "ops@saroh.in" },
                    }),
                );
            await expect(read("internal.example")).rejects.toBeInstanceOf(
                ForbiddenException,
            );
            await expect(read("api.saroh.in")).resolves.toBe(true);
        } finally {
            mutableEnv.NODE_ENV = "test";
        }
        // Elsewhere (a local or CI stack on ports) it still opens.
        await expect(
            guard.canActivate(
                contextFor({
                    headers: { host: "localhost:3333" },
                    user: { id: "user_4", email: "ops@saroh.in" },
                }),
            ),
        ).resolves.toBe(true);
    });

    it("rejects an unauthenticated request (guard misordering)", async () => {
        await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
            "Authentication required",
        );
        expect(findUnique).not.toHaveBeenCalled();
    });

    it("never leaks whether a refused user used to be staff", async () => {
        findUnique.mockResolvedValue({
            id: "pa_1",
            revokedAt: new Date(),
            roleAssignments: [],
        });
        const revoked = await guard
            .canActivate(
                contextFor({ user: { id: "user_6", email: "ex@saroh.in" } }),
            )
            .catch((err: Error) => err.message);

        findUnique.mockResolvedValue(null);
        const never = await guard
            .canActivate(
                contextFor({ user: { id: "user_7", email: "nobody@x.test" } }),
            )
            .catch((err: Error) => err.message);

        expect(revoked).toBe(never);
    });

    describe("the console's edition (DEC-204)", () => {
        const grant = (role: AdminRole, editions: string[]) => ({
            id: "pa_1",
            revokedAt: null,
            editions,
            roleAssignments: [{ role, expiresAt: null, revokedAt: null }],
        });
        const onGlobal = (): TestRequest => ({
            headers: { host: "api.saroh.tech" },
            user: { id: "user_1", email: "staff@saroh.in" },
        });

        it("refuses staff whose grant doesn't include the edition", async () => {
            findUnique.mockResolvedValue(grant(AdminRole.Support, ["INDIA"]));
            await expect(
                guard.canActivate(contextFor(onGlobal())),
            ).rejects.toThrow("Your access doesn't include this edition.");
        });

        it("admits staff granted the edition, and says which it is", async () => {
            findUnique.mockResolvedValue(
                grant(AdminRole.Support, ["INDIA", "GLOBAL"]),
            );
            const request = onGlobal();
            await guard.canActivate(contextFor(request));
            expect(request.platformAdmin?.edition).toBe("GLOBAL");
        });

        it("lets a Platform owner open every edition", async () => {
            findUnique.mockResolvedValue(
                grant(AdminRole.PlatformOwner, ["INDIA"]),
            );
            const request = onGlobal();
            await guard.canActivate(contextFor(request));
            expect(request.platformAdmin?.edition).toBe("GLOBAL");
        });

        it("reads India's address as India", async () => {
            findUnique.mockResolvedValue(grant(AdminRole.Support, ["INDIA"]));
            const request: TestRequest = {
                ...onGlobal(),
                headers: { host: "api.saroh.in" },
            };
            await guard.canActivate(contextFor(request));
            expect(request.platformAdmin?.edition).toBe("INDIA");
        });
    });
});

import { ExecutionContext, ForbiddenException } from "@nestjs/common";

jest.mock("@saroh/database", () => ({
    prisma: { platformAdmin: { findUnique: jest.fn() } },
}));

jest.mock("../../env", () => ({ env: { ADMIN_ALLOWLIST: undefined } }));

import { prisma } from "@saroh/database";

import { env } from "../../env";
import { PlatformAdminGuard } from "./platform-admin.guard";

const findUnique = prisma.platformAdmin.findUnique as jest.Mock;
const mutableEnv = env as { ADMIN_ALLOWLIST?: string };

interface TestRequest {
    user?: { id: string; email: string };
    platformAdmin?: { userId: string; viaBootstrap: boolean };
}

function contextFor(request: TestRequest): ExecutionContext {
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
    });

    it("admits a user with an ACTIVE PlatformAdmin grant", async () => {
        findUnique.mockResolvedValue({ revokedAt: null });
        const request: TestRequest = {
            user: { id: "user_1", email: "staff@saroh.in" },
        };

        await expect(guard.canActivate(contextFor(request))).resolves.toBe(
            true,
        );
        expect(request.platformAdmin).toEqual({
            userId: "user_1",
            viaBootstrap: false,
        });
    });

    it("REFUSES a revoked grant — revocation takes effect immediately", async () => {
        findUnique.mockResolvedValue({ revokedAt: new Date() });

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
            viaBootstrap: true,
        });
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

    it("rejects an unauthenticated request (guard misordering)", async () => {
        await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
            "Authentication required",
        );
        expect(findUnique).not.toHaveBeenCalled();
    });

    it("never leaks whether a refused user used to be staff", async () => {
        findUnique.mockResolvedValue({ revokedAt: new Date() });
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
});

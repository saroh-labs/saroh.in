import type { ExecutionContext } from "@nestjs/common";
import {
    BadRequestException,
    ForbiddenException,
    UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { AdminAccessService } from "./admin-access.service";
import {
    ACCESS_SESSION_HEADER,
    ORGANIZATION_ACCESS_INTENT,
    OrganizationAccessSessionGuard,
} from "./organization-access-session.guard";

const staff: PlatformAdminInfo = {
    userId: "staff_1",
    platformAdminId: "platform_admin_1",
    roles: ["SUPPORT"],
    permissions: ["organization:view-as"],
    viaBootstrap: false,
};

interface RequestShape {
    platformAdmin: PlatformAdminInfo;
    params: Record<string, string | undefined>;
    headers: Record<string, string | string[] | undefined>;
    adminAccessSessionId?: string;
}

function contextFor(request: RequestShape): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => function handler() {},
        getClass: () => class Controller {},
    } as unknown as ExecutionContext;
}

function requestFor(overrides: Partial<RequestShape> = {}): RequestShape {
    return {
        platformAdmin: staff,
        params: { organizationId: "org_1" },
        headers: { [ACCESS_SESSION_HEADER]: "access_1" },
        ...overrides,
    };
}

describe("OrganizationAccessSessionGuard", () => {
    let authorize: jest.Mock;
    let reflector: Reflector;
    let guard: OrganizationAccessSessionGuard;

    beforeEach(() => {
        authorize = jest.fn().mockResolvedValue({ id: "access_1" });
        reflector = new Reflector();
        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue("READ");
        guard = new OrganizationAccessSessionGuard(reflector, {
            authorize,
        } as unknown as AdminAccessService);
    });

    // The whole point of #139: authorize() had zero production callers, so the
    // audit ledger recorded an authorization that no code performed.
    it("calls authorize() for a marked route, with the route's Organization and the caller's staff context", async () => {
        const request = requestFor();

        await expect(guard.canActivate(contextFor(request))).resolves.toBe(
            true,
        );

        expect(authorize).toHaveBeenCalledTimes(1);
        expect(authorize).toHaveBeenCalledWith({
            sessionId: "access_1",
            organizationId: "org_1",
            staff,
            intent: "READ",
        });
        expect(request.adminAccessSessionId).toBe("access_1");
    });

    it("leaves an unmarked route alone without consulting a session", async () => {
        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);

        await expect(
            guard.canActivate(contextFor(requestFor({ headers: {} }))),
        ).resolves.toBe(true);
        expect(authorize).not.toHaveBeenCalled();
    });

    it("refuses a marked route with no session named, without inventing a denial to audit", async () => {
        await expect(
            guard.canActivate(contextFor(requestFor({ headers: {} }))),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(authorize).not.toHaveBeenCalled();
    });

    it("refuses a marked route that carries no organizationId to check the session against", async () => {
        await expect(
            guard.canActivate(contextFor(requestFor({ params: {} }))),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(authorize).not.toHaveBeenCalled();
    });

    // Node lower-cases header names, but a duplicated header arrives as an
    // array. Taking the first entry keeps a second, attacker-appended header
    // from selecting a different session than the one authorize() is told about.
    it("uses the first value when the session header is sent more than once", async () => {
        await guard.canActivate(
            contextFor(
                requestFor({
                    headers: {
                        [ACCESS_SESSION_HEADER]: ["access_1", "access_other"],
                    },
                }),
            ),
        );

        expect(authorize).toHaveBeenCalledWith(
            expect.objectContaining({ sessionId: "access_1" }),
        );
    });

    // authorize() throws on every failure path — expired, revoked, wrong org,
    // wrong staff member, write intent — and each one audits its own reason
    // code. The guard must not soften any of them into a pass.
    it.each([
        ["expired", "Organization access session expired"],
        ["revoked", "Organization access denied"],
    ])("propagates a %s session's refusal", async (_label, message) => {
        authorize.mockRejectedValue(new ForbiddenException(message));

        await expect(
            guard.canActivate(contextFor(requestFor())),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // SEC-008: a denial that cannot be written to the audit log fails the
    // request rather than proceeding unlogged. authorize() raises; the guard
    // must not catch it.
    it("fails the request when the denial itself could not be audited", async () => {
        authorize.mockRejectedValue(new Error("audit ledger unavailable"));

        await expect(
            guard.canActivate(contextFor(requestFor())),
        ).rejects.toThrow("audit ledger unavailable");
    });

    it("passes WRITE intent through so authorize() can refuse it", async () => {
        jest.spyOn(reflector, "getAllAndOverride").mockReturnValue("WRITE");

        await guard.canActivate(contextFor(requestFor()));

        expect(authorize).toHaveBeenCalledWith(
            expect.objectContaining({ intent: "WRITE" }),
        );
    });

    it("reads the intent from the handler before the controller", async () => {
        const spy = jest
            .spyOn(reflector, "getAllAndOverride")
            .mockReturnValue("READ");

        await guard.canActivate(contextFor(requestFor()));

        expect(spy).toHaveBeenCalledWith(ORGANIZATION_ACCESS_INTENT, [
            expect.any(Function),
            expect.any(Function),
        ]);
    });
});

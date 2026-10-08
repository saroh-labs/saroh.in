jest.mock("@saroh/database", () => {
    const prisma = {
        organization: { findUnique: jest.fn() },
        site: { findFirst: jest.fn(), findMany: jest.fn() },
        siteTrackingSettings: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
            updateMany: jest.fn(),
        },
        siteTracker: { groupBy: jest.fn() },
        auditEvent: { create: jest.fn() },
        platformAdmin: { findUnique: jest.fn() },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
            callback(prisma),
        ),
    };
    return { prisma };
});
jest.mock("../../env", () => ({ env: { ADMIN_ALLOWLIST: undefined } }));
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import type { ExecutionContext } from "@nestjs/common";
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationPipe,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { validationPipeOptions } from "../../common/validation";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminOrganizationsController } from "./admin-organizations.controller";
import {
    AdminPermission,
    AdminRole,
    permissionsFor,
} from "./admin-permissions";
import {
    AdminSiteTrackersService,
    siteTrackerStates,
} from "./admin-site-trackers.service";
import { OperatorReasonDto } from "./dto";

const orgFind = prisma.organization.findUnique as jest.Mock;
const siteFind = prisma.site.findFirst as jest.Mock;
const settingsFind = prisma.siteTrackingSettings.findFirst as jest.Mock;
const settingsUpsert = prisma.siteTrackingSettings.upsert as jest.Mock;
const settingsUpdateMany = prisma.siteTrackingSettings.updateMany as jest.Mock;
const tenantAudit = prisma.auditEvent.create as jest.Mock;

const staff: PlatformAdminInfo = {
    userId: "staff_1",
    platformAdminId: "pa_1",
    roles: [AdminRole.Support],
    permissions: permissionsFor([AdminRole.Support]),
    viaBootstrap: false,
};

function build() {
    const audit = { write: jest.fn() } as unknown as AdminAuditService & {
        write: jest.Mock;
    };
    return { service: new AdminSiteTrackersService(audit), audit };
}

const command = (over: Partial<{ reason: string; siteId: string }> = {}) => ({
    staff,
    organizationId: "org_1",
    siteId: "site_1",
    reason: "Pixel account reported for misuse",
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    orgFind.mockResolvedValue({ id: "org_1", lifecycleStatus: "ACTIVE" });
    siteFind.mockResolvedValue({ id: "site_1", name: "Northwind" });
    settingsFind.mockResolvedValue(null);
    settingsUpdateMany.mockResolvedValue({ count: 1 });
});

describe("AdminSiteTrackersService — switch off", () => {
    it("writes who, when and why, and records it in both ledgers", async () => {
        const { service, audit } = build();

        await expect(service.switchOff(command())).resolves.toEqual({
            ok: true,
            changed: true,
            switchedOff: true,
        });

        expect(siteFind).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "site_1", organizationId: "org_1" },
            }),
        );
        const off = {
            switchedOffAt: expect.any(Date),
            switchedOffByStaffId: "staff_1",
            switchedOffReason: "Pixel account reported for misuse",
        };
        expect(settingsUpsert).toHaveBeenCalledWith({
            where: { siteId: "site_1" },
            create: { siteId: "site_1", organizationId: "org_1", ...off },
            update: off,
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                actorUserId: "staff_1",
                permission: AdminPermission.OrganizationTrackersWrite,
                action: "site.trackers.switched-off",
                targetType: "site",
                targetId: "site_1",
                organizationId: "org_1",
                reason: "Pixel account reported for misuse",
                outcome: "SUCCESS",
            }),
        );
        // The business's own history shows Saroh support, not the reason.
        const tenantRow = tenantAudit.mock.calls[0]?.[0] as {
            data: Record<string, unknown>;
        };
        expect(tenantRow.data).toEqual(
            expect.objectContaining({
                action: "site.trackers.switched-off",
                organizationId: "org_1",
                targetId: "site_1",
                metadata: { byOperator: true },
            }),
        );
        expect(JSON.stringify(tenantRow)).not.toMatch(/misuse/);
    });

    it("refuses a missing or too-short reason before writing anything", async () => {
        const { service, audit } = build();

        await expect(
            service.switchOff(command({ reason: "  no " })),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(settingsUpsert).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it("is a no-op when the site is already switched off", async () => {
        settingsFind.mockResolvedValue({ switchedOffAt: new Date() });
        const { service, audit } = build();

        await expect(service.switchOff(command())).resolves.toEqual({
            ok: true,
            changed: false,
            switchedOff: true,
        });
        expect(settingsUpsert).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it("404s a site that isn't this business's", async () => {
        siteFind.mockResolvedValue(null);
        const { service } = build();

        await expect(service.switchOff(command())).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(settingsUpsert).not.toHaveBeenCalled();
    });

    it("refuses a deleted business", async () => {
        orgFind.mockResolvedValue({
            id: "org_1",
            lifecycleStatus: "DELETED_RETAINED",
        });
        const { service } = build();

        await expect(service.switchOff(command())).rejects.toBeInstanceOf(
            ConflictException,
        );
    });
});

describe("AdminSiteTrackersService — switch on", () => {
    it("clears all three fields and records it", async () => {
        const { service, audit } = build();

        await expect(service.switchOn(command())).resolves.toEqual({
            ok: true,
            changed: true,
            switchedOff: false,
        });
        expect(settingsUpdateMany).toHaveBeenCalledWith({
            where: {
                siteId: "site_1",
                organizationId: "org_1",
                switchedOffAt: { not: null },
            },
            data: {
                switchedOffAt: null,
                switchedOffByStaffId: null,
                switchedOffReason: null,
            },
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "site.trackers.switched-on",
                permission: AdminPermission.OrganizationTrackersWrite,
                reason: "Pixel account reported for misuse",
            }),
        );
    });

    it("does nothing (and records nothing) when it was not off", async () => {
        settingsUpdateMany.mockResolvedValue({ count: 0 });
        const { service, audit } = build();

        await expect(service.switchOn(command())).resolves.toEqual({
            ok: true,
            changed: false,
            switchedOff: false,
        });
        expect(audit.write).not.toHaveBeenCalled();
        expect(tenantAudit).not.toHaveBeenCalled();
    });
});

describe("siteTrackerStates", () => {
    it("returns each site's switch and how many trackers are on, no ids", async () => {
        const at = new Date("2026-10-08T10:00:00Z");
        (prisma.site.findMany as jest.Mock).mockResolvedValue([
            { id: "site_1", name: "Northwind", subdomain: "northwind" },
            { id: "site_2", name: "Second", subdomain: null },
        ]);
        (prisma.siteTrackingSettings.findMany as jest.Mock).mockResolvedValue([
            {
                siteId: "site_1",
                switchedOffAt: at,
                switchedOffReason: "Misuse",
                switchedOffByStaffId: "staff_1",
            },
        ]);
        (prisma.siteTracker.groupBy as jest.Mock).mockResolvedValue([
            { siteId: "site_1", _count: { _all: 2 } },
        ]);

        await expect(siteTrackerStates("org_1")).resolves.toEqual([
            {
                id: "site_1",
                name: "Northwind",
                subdomain: "northwind",
                trackersOn: 2,
                switchedOff: { at, reason: "Misuse", byUserId: "staff_1" },
            },
            {
                id: "site_2",
                name: "Second",
                subdomain: null,
                trackersOn: 0,
                switchedOff: null,
            },
        ]);
    });
});

describe("the switch's request body", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const IDEMPOTENCY_KEY = "key-12345678"; // gitleaks:allow (test key)
    const transform = (body: unknown) =>
        pipe.transform(body, { type: "body", metatype: OperatorReasonDto });

    it.each([
        ["missing", { idempotencyKey: IDEMPOTENCY_KEY }],
        ["too short", { reason: "no", idempotencyKey: IDEMPOTENCY_KEY }],
        [
            "too long",
            { reason: "x".repeat(501), idempotencyKey: IDEMPOTENCY_KEY },
        ],
    ])("is a 400 when the reason is %s", async (_label, body) => {
        await expect(transform(body)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it("accepts a reason and an idempotency key", async () => {
        await expect(
            transform({ reason: "Misuse", idempotencyKey: IDEMPOTENCY_KEY }),
        ).resolves.toEqual(expect.objectContaining({ reason: "Misuse" }));
    });
});

describe("who may reach the switch", () => {
    const routes = [
        AdminOrganizationsController.prototype.switchTrackersOff,
        AdminOrganizationsController.prototype.switchTrackersOn,
    ];
    const permissionGuard = new PlatformPermissionGuard(new Reflector());

    function contextFor(
        handler: (...args: never[]) => unknown,
        request: Record<string, unknown>,
    ): ExecutionContext {
        return {
            getHandler: () => handler,
            getClass: () => AdminOrganizationsController,
            switchToHttp: () => ({ getRequest: () => request }),
        } as unknown as ExecutionContext;
    }

    it.each(routes)("lets staff holding the permission in", (handler) => {
        expect(
            permissionGuard.canActivate(
                contextFor(handler, { platformAdmin: staff }),
            ),
        ).toBe(true);
    });

    it.each(routes)("refuses staff without the permission", (handler) => {
        const billing: PlatformAdminInfo = {
            ...staff,
            roles: [AdminRole.Billing],
            permissions: permissionsFor([AdminRole.Billing]),
        };
        expect(() =>
            permissionGuard.canActivate(
                contextFor(handler, { platformAdmin: billing }),
            ),
        ).toThrow(ForbiddenException);
    });

    it("refuses a merchant who is not staff, however senior in their business", async () => {
        (prisma.platformAdmin.findUnique as jest.Mock).mockResolvedValue(null);
        const guard = new PlatformAdminGuard();
        const request = { user: { id: "owner_1", email: "owner@example.com" } };

        await expect(
            guard.canActivate(contextFor(routes[0]!, request)),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("gives the permission to Support and Platform Owner only", () => {
        const holders = Object.values(AdminRole)
            .filter((role) =>
                permissionsFor([role]).includes(
                    AdminPermission.OrganizationTrackersWrite,
                ),
            )
            .sort();
        expect(holders).toEqual(
            [AdminRole.PlatformOwner, AdminRole.Support].sort(),
        );
    });
});

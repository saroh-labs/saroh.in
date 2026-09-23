jest.mock("@saroh/database", () => {
    const prisma = {
        organization: { findUnique: jest.fn(), updateMany: jest.fn() },
        subscription: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
            update: jest.fn(),
        },
        plan: { findUnique: jest.fn() },
        entitlementOverride: {
            create: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        auditEvent: { create: jest.fn() },
        adminOrganizationNote: { create: jest.fn() },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
            callback(prisma),
        ),
    };
    return { prisma };
});

import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { EntitlementService } from "../billing/entitlement.service";
import type { ModuleLifecycleService } from "../capabilities/module-lifecycle.service";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminLifecycleService } from "./admin-lifecycle.service";

const orgFind = prisma.organization.findUnique as jest.Mock;
const orgUpdateMany = prisma.organization.updateMany as jest.Mock;
const subFind = prisma.subscription.findUnique as jest.Mock;
const subUpsert = prisma.subscription.upsert as jest.Mock;
const planFind = prisma.plan.findUnique as jest.Mock;
const overrideCreate = prisma.entitlementOverride.create as jest.Mock;
const tenantAudit = prisma.auditEvent.create as jest.Mock;

const staff: PlatformAdminInfo = {
    userId: "staff_1",
    platformAdminId: "pa_1",
    roles: ["SUPPORT"],
    permissions: [],
    viaBootstrap: false,
};

function build(
    overrides: {
        planValues?: Record<string, number | boolean>;
        modules?: Partial<ModuleLifecycleService>;
    } = {},
) {
    const audit = { write: jest.fn() } as unknown as AdminAuditService & {
        write: jest.Mock;
    };
    const entitlements = {
        getPlanEntitlements: jest.fn(
            async () => overrides.planValues ?? { sites: 1 },
        ),
    } as unknown as EntitlementService;
    const modules = {
        enable: jest.fn(async (_ctx, _key, also) => also?.(prisma)),
        disable: jest.fn(async (_ctx, _key, also) => also?.(prisma)),
        ...overrides.modules,
    } as unknown as ModuleLifecycleService;
    return {
        service: new AdminLifecycleService(audit, modules, entitlements),
        audit,
        modules,
    };
}

const northwind = {
    id: "org_1",
    name: "Northwind Supply",
    lifecycleStatus: "ACTIVE",
    lifecycleVersion: 3,
};

beforeEach(() => {
    jest.clearAllMocks();
    orgFind.mockResolvedValue(northwind);
    orgUpdateMany.mockResolvedValue({ count: 1 });
});

describe("AdminLifecycleService — lifecycle", () => {
    it("suspends when the name is typed exactly, in both ledgers", async () => {
        const { service, audit } = build();

        await expect(
            service.suspend({
                staff,
                organizationId: "org_1",
                reason: "Chargeback investigation",
                confirmName: "Northwind Supply",
            }),
        ).resolves.toEqual({ ok: true, changed: true, status: "SUSPENDED" });

        expect(orgUpdateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "org_1", lifecycleVersion: 3 },
                data: expect.objectContaining({
                    lifecycleStatus: "SUSPENDED",
                    suspendedByUserId: "staff_1",
                    suspensionReason: "Chargeback investigation",
                }),
            }),
        );
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "organization.suspended",
                organizationId: "org_1",
                reason: "Chargeback investigation",
            }),
        );
        // The business's own history names the operator, not a member.
        expect(tenantAudit).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "organization.suspended",
                actorUserId: "staff_1",
                organizationId: "org_1",
            }),
        });
    });

    it("refuses when the typed name does not match, and changes nothing", async () => {
        const { service } = build();
        await expect(
            service.suspend({
                staff,
                organizationId: "org_1",
                reason: "Chargeback investigation",
                confirmName: "northwind",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(orgUpdateMany).not.toHaveBeenCalled();
    });

    it("refuses an illegal transition with its reason", async () => {
        orgFind.mockResolvedValue({
            ...northwind,
            lifecycleStatus: "DELETED_RETAINED",
        });
        const { service } = build();
        await expect(
            service.reinstate({
                staff,
                organizationId: "org_1",
                reason: "Mistake",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("loses cleanly to a concurrent change instead of overwriting it", async () => {
        orgUpdateMany.mockResolvedValue({ count: 0 });
        const { service } = build();
        await expect(
            service.suspend({
                staff,
                organizationId: "org_1",
                reason: "Chargeback investigation",
                confirmName: "Northwind Supply",
            }),
        ).rejects.toThrow(/changed while you were looking/);
    });

    it("treats a repeat of the current state as a no-op", async () => {
        orgFind.mockResolvedValue({
            ...northwind,
            lifecycleStatus: "SUSPENDED",
        });
        const { service, audit } = build();
        await expect(
            service.suspend({
                staff,
                organizationId: "org_1",
                reason: "Again",
                confirmName: "Northwind Supply",
            }),
        ).resolves.toEqual({ ok: true, changed: false, status: "SUSPENDED" });
        expect(audit.write).not.toHaveBeenCalled();
    });

    it("schedules deletion only inside the retention window", async () => {
        const { service } = build();
        await expect(
            service.scheduleDeletion({
                staff,
                organizationId: "org_1",
                reason: "Owner asked to close",
                confirmName: "Northwind Supply",
                retentionDays: 3,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);

        await service.scheduleDeletion({
            staff,
            organizationId: "org_1",
            reason: "Owner asked to close",
            confirmName: "Northwind Supply",
            retentionDays: 30,
        });
        const data = orgUpdateMany.mock.calls[0][0].data as {
            lifecycleStatus: string;
            deletionScheduledAt: Date;
        };
        expect(data.lifecycleStatus).toBe("PENDING_DELETION");
        const days =
            (data.deletionScheduledAt.getTime() - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(29.9);
        expect(days).toBeLessThanOrEqual(30);
    });

    it("cancels a scheduled deletion by reinstating", async () => {
        orgFind.mockResolvedValue({
            ...northwind,
            lifecycleStatus: "PENDING_DELETION",
        });
        const { service } = build();
        await expect(
            service.reinstate({
                staff,
                organizationId: "org_1",
                reason: "Owner changed mind",
            }),
        ).resolves.toEqual({ ok: true, changed: true, status: "ACTIVE" });
        expect(orgUpdateMany.mock.calls[0][0].data).toEqual(
            expect.objectContaining({ deletionScheduledAt: null }),
        );
    });

    it("demands a real reason", async () => {
        const { service } = build();
        await expect(
            service.reinstate({
                staff,
                organizationId: "org_1",
                reason: " x ",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe("AdminLifecycleService — plan, trial and limits", () => {
    const pro = { id: "plan_pro", key: "pro", version: 1, active: true };

    it("refuses to change a plan a billing provider manages", async () => {
        planFind.mockResolvedValue(pro);
        subFind.mockResolvedValue({
            planId: "plan_free",
            provider: "RAZORPAY",
        });
        const { service } = build();
        await expect(
            service.changePlan({
                staff,
                organizationId: "org_1",
                reason: "Upgrade agreed on call",
                planId: "plan_pro",
            }),
        ).rejects.toThrow(/billed through RAZORPAY/);
        expect(subUpsert).not.toHaveBeenCalled();
    });

    it("moves an unmanaged business to a current plan", async () => {
        planFind.mockResolvedValue(pro);
        subFind.mockResolvedValue(null);
        const { service, audit } = build();
        await expect(
            service.changePlan({
                staff,
                organizationId: "org_1",
                reason: "Upgrade agreed on call",
                planId: "plan_pro",
            }),
        ).resolves.toEqual({ ok: true, changed: true });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({ action: "organization.plan.changed" }),
        );
    });

    it("refuses a plan that is no longer offered", async () => {
        planFind.mockResolvedValue({ ...pro, active: false });
        const { service } = build();
        await expect(
            service.changePlan({
                staff,
                organizationId: "org_1",
                reason: "Upgrade",
                planId: "plan_pro",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("needs a plan to start a trial for a business with none", async () => {
        subFind.mockResolvedValue(null);
        const { service } = build();
        await expect(
            service.trial({
                staff,
                organizationId: "org_1",
                reason: "Pilot",
                days: 14,
            }),
        ).rejects.toThrow(/choose the plan/);
    });

    it("extends a running trial from its current end", async () => {
        const end = new Date(Date.now() + 5 * 86_400_000);
        subFind.mockResolvedValue({
            status: "TRIALING",
            provider: null,
            currentPeriodEnd: end,
            planId: "plan_pro",
        });
        const { service } = build();
        const result = await service.trial({
            staff,
            organizationId: "org_1",
            reason: "Needs another week",
            days: 7,
        });
        expect(result.endsAt.getTime()).toBe(end.getTime() + 7 * 86_400_000);
    });

    it("refuses a trial that would replace a paying plan", async () => {
        subFind.mockResolvedValue({
            status: "ACTIVE",
            provider: null,
            currentPeriodEnd: null,
            planId: "plan_pro",
        });
        const { service } = build();
        await expect(
            service.trial({
                staff,
                organizationId: "org_1",
                reason: "Pilot",
                days: 7,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("raises a numeric cap the plan sets, for a while", async () => {
        overrideCreate.mockImplementation(async ({ data }) => ({
            id: "ovr_1",
            ...data,
        }));
        const { service } = build({ planValues: { sites: 1 } });
        const override = await service.raiseLimit({
            staff,
            organizationId: "org_1",
            reason: "Launching a second brand",
            key: "sites",
            value: 3,
            days: 30,
        });
        expect(override).toEqual(
            expect.objectContaining({ key: "sites", value: 3 }),
        );
    });

    it("refuses to raise a limit the plan does not set, or to lower one", async () => {
        const { service } = build({
            planValues: { sites: 5, customDomain: false },
        });
        await expect(
            service.raiseLimit({
                staff,
                organizationId: "org_1",
                reason: "x-large",
                key: "customDomain",
                value: 2,
                days: 30,
            }),
        ).rejects.toThrow(/not a limit/);
        await expect(
            service.raiseLimit({
                staff,
                organizationId: "org_1",
                reason: "smaller",
                key: "sites",
                value: 4,
                days: 30,
            }),
        ).rejects.toThrow(/must be higher/);
    });
});

describe("AdminLifecycleService — modules", () => {
    it("runs the change as the operator and records it in the same transaction", async () => {
        const { service, audit, modules } = build();
        await service.setModule({
            staff,
            organizationId: "org_1",
            reason: "Owner locked out of settings",
            moduleKey: "CRM",
            enabled: true,
        });
        const ctx = (modules.enable as jest.Mock).mock.calls[0][0];
        expect(ctx).toEqual(
            expect.objectContaining({
                organizationId: "org_1",
                userId: "staff_1",
            }),
        );
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({ action: "organization.module.enabled" }),
        );
    });

    it("refuses an unknown module", async () => {
        const { service } = build();
        await expect(
            service.setModule({
                staff,
                organizationId: "org_1",
                reason: "Try it",
                moduleKey: "AI",
                enabled: true,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a business that does not exist", async () => {
        orgFind.mockResolvedValue(null);
        const { service } = build();
        await expect(
            service.setModule({
                staff,
                organizationId: "org_x",
                reason: "Try it",
                moduleKey: "CRM",
                enabled: true,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

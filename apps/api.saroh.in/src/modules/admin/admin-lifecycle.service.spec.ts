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
        // Scheduling deletion stops renewals (#921).
        billingCheckout: {
            findMany: jest.fn(async () => []),
            findUnique: jest.fn(async () => null),
            update: jest.fn(),
        },
        job: { create: jest.fn() },
        $queryRaw: jest.fn(),
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
import {
    AdminLifecycleService,
    LEGAL_HOLD_BLOCKS_DELETION,
    LEGAL_HOLD_BLOCKS_REINSTATE,
} from "./admin-lifecycle.service";

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

    it("charges no renewal during the window: the provider subscription ends with the period paid (#921)", async () => {
        subFind.mockResolvedValue({
            id: "sub_1",
            status: "ACTIVE",
            provider: "RAZORPAY",
            providerSubscriptionId: "rzp_sub_1",
            cancelAtPeriodEnd: false,
        });
        const { service } = build();
        await service.scheduleDeletion({
            staff,
            organizationId: "org_1",
            reason: "Owner asked to close",
            confirmName: "Northwind Supply",
            retentionDays: 30,
        });
        expect(prisma.subscription.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: { cancelAtPeriodEnd: true },
        });
        expect(prisma.job.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                type: "billing.provider.cancel",
                payload: {
                    provider: "RAZORPAY",
                    providerSubscriptionId: "rzp_sub_1",
                    atCycleEnd: true,
                },
            }),
        });
        // Written to both ledgers with the counts.
        expect(tenantAudit).toHaveBeenCalledWith({
            data: expect.objectContaining({
                metadata: expect.objectContaining({ providerCancels: 1 }),
            }),
        });
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

describe("AdminLifecycleService — legal hold (DEC-119)", () => {
    const HELD_AT = new Date("2026-10-10T06:00:00.000Z");
    const suspended = { ...northwind, lifecycleStatus: "SUSPENDED" };
    const held = {
        ...suspended,
        legalHoldAt: HELD_AT,
        legalHoldReason: "Selling counterfeit goods",
        legalHoldByUserId: "staff_9",
    };

    it("places the hold with the suspension, in both ledgers, the reason on Saroh's only", async () => {
        const { service, audit } = build();

        await service.suspend({
            staff,
            organizationId: "org_1",
            reason: "Selling counterfeit goods",
            confirmName: "Northwind Supply",
            legalHold: true,
        });

        expect(orgUpdateMany.mock.calls[0][0].data).toEqual(
            expect.objectContaining({
                lifecycleStatus: "SUSPENDED",
                legalHoldAt: expect.any(Date),
                legalHoldReason: "Selling counterfeit goods",
                legalHoldByUserId: "staff_1",
            }),
        );
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "organization.legal_hold.placed",
                permission: "organization:lifecycle:write",
                reason: "Selling counterfeit goods",
            }),
        );
        // Its people see that a hold exists, never why.
        const own = tenantAudit.mock.calls
            .map(([arg]) => (arg as { data: Record<string, unknown> }).data)
            .find((d) => d.action === "organization.legal_hold.placed");
        expect(own).toEqual(
            expect.objectContaining({
                organizationId: "org_1",
                metadata: { byOperator: true },
            }),
        );
        expect(JSON.stringify(own)).not.toContain("counterfeit");
    });

    it("suspends without a hold unless it is asked for", async () => {
        const { service, audit } = build();
        await service.suspend({
            staff,
            organizationId: "org_1",
            reason: "Chargeback investigation",
            confirmName: "Northwind Supply",
        });
        expect(orgUpdateMany.mock.calls[0][0].data).not.toHaveProperty(
            "legalHoldAt",
        );
        expect(audit.write.mock.calls.map(([, entry]) => entry.action)).toEqual(
            ["organization.suspended"],
        );
    });

    it("places a hold on a business already suspended, fenced on its version", async () => {
        orgFind.mockResolvedValue({ ...suspended, legalHoldAt: null });
        const { service, audit } = build();

        await expect(
            service.placeLegalHold({
                staff,
                organizationId: "org_1",
                reason: "Police notice 14/2026",
            }),
        ).resolves.toEqual({ ok: true, changed: true });

        expect(orgUpdateMany).toHaveBeenCalledWith({
            where: { id: "org_1", lifecycleVersion: 3, legalHoldAt: null },
            data: {
                legalHoldAt: expect.any(Date),
                legalHoldReason: "Police notice 14/2026",
                legalHoldByUserId: "staff_1",
                // Bumped, so a deletion the sweep is writing loses.
                lifecycleVersion: { increment: 1 },
            },
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "organization.legal_hold.placed",
                reason: "Police notice 14/2026",
            }),
        );
    });

    it.each(["PENDING_DELETION", "DELETED_RETAINED"])(
        "places a hold on a %s business too",
        async (lifecycleStatus) => {
            orgFind.mockResolvedValue({
                ...northwind,
                lifecycleStatus,
                legalHoldAt: null,
            });
            const { service } = build();
            await expect(
                service.placeLegalHold({
                    staff,
                    organizationId: "org_1",
                    reason: "Police notice 14/2026",
                }),
            ).resolves.toEqual({ ok: true, changed: true });
        },
    );

    it("refuses a hold on an active business: it is suspended with the hold", async () => {
        orgFind.mockResolvedValue({ ...northwind, legalHoldAt: null });
        const { service } = build();
        await expect(
            service.placeLegalHold({
                staff,
                organizationId: "org_1",
                reason: "Police notice 14/2026",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(orgUpdateMany).not.toHaveBeenCalled();
    });

    it("needs a reason to place one and to lift one", async () => {
        orgFind.mockResolvedValue(held);
        const { service } = build();
        await expect(
            service.placeLegalHold({
                staff,
                organizationId: "org_1",
                reason: " ",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.liftLegalHold({
                staff,
                organizationId: "org_1",
                reason: "ok",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(orgUpdateMany).not.toHaveBeenCalled();
    });

    it("refuses to schedule a held business's deletion", async () => {
        orgFind.mockResolvedValue(held);
        const { service, audit } = build();
        await expect(
            service.scheduleDeletion({
                staff,
                organizationId: "org_1",
                reason: "Owner asked to close",
                confirmName: "Northwind Supply",
            }),
        ).rejects.toThrow(LEGAL_HOLD_BLOCKS_DELETION);
        expect(orgUpdateMany).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it("refuses to reinstate a held business: it is never active", async () => {
        orgFind.mockResolvedValue(held);
        const { service } = build();
        await expect(
            service.reinstate({
                staff,
                organizationId: "org_1",
                reason: "Owner called",
            }),
        ).rejects.toThrow(LEGAL_HOLD_BLOCKS_REINSTATE);
        expect(orgUpdateMany).not.toHaveBeenCalled();
    });

    it("lifts the hold under the Platform Owner's permission, keeping who placed it and why on the ledger", async () => {
        orgFind.mockResolvedValue(held);
        const { service, audit } = build();

        await expect(
            service.liftLegalHold({
                staff,
                organizationId: "org_1",
                reason: "Case closed, order of 2 Dec",
            }),
        ).resolves.toEqual({ ok: true, changed: true });

        expect(orgUpdateMany).toHaveBeenCalledWith({
            where: {
                id: "org_1",
                lifecycleVersion: 3,
                legalHoldAt: { not: null },
            },
            data: {
                legalHoldAt: null,
                legalHoldReason: null,
                legalHoldByUserId: null,
                lifecycleVersion: { increment: 1 },
            },
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "organization.legal_hold.lifted",
                permission: "organization:legal-hold:lift",
                reason: "Case closed, order of 2 Dec",
                metadata: expect.objectContaining({
                    heldSince: HELD_AT.toISOString(),
                    placedBy: "staff_9",
                    placedFor: "Selling counterfeit goods",
                }),
            }),
        );
        expect(tenantAudit).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "organization.legal_hold.lifted",
                metadata: { byOperator: true },
            }),
        });
        // Suspended, not deleted: no clean-up to queue.
        expect(prisma.job.create).not.toHaveBeenCalled();
    });

    it("queues the clean-up again when a deleted business's hold is lifted", async () => {
        orgFind.mockResolvedValue({
            ...held,
            lifecycleStatus: "DELETED_RETAINED",
        });
        const { service } = build();
        await service.liftLegalHold({
            staff,
            organizationId: "org_1",
            reason: "Case closed, order of 2 Dec",
        });
        expect(prisma.job.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                type: "organization.deletion.cleanup",
                organizationId: "org_1",
            }),
        });
    });

    it("treats a second place or lift as done already", async () => {
        const { service, audit } = build();
        orgFind.mockResolvedValue(held);
        await expect(
            service.placeLegalHold({
                staff,
                organizationId: "org_1",
                reason: "Police notice 14/2026",
            }),
        ).resolves.toEqual({ ok: true, changed: false });
        orgFind.mockResolvedValue({ ...suspended, legalHoldAt: null });
        await expect(
            service.liftLegalHold({
                staff,
                organizationId: "org_1",
                reason: "Case closed, order of 2 Dec",
            }),
        ).resolves.toEqual({ ok: true, changed: false });
        expect(orgUpdateMany).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it("loses cleanly to a change made at the same moment", async () => {
        orgFind.mockResolvedValue({ ...suspended, legalHoldAt: null });
        orgUpdateMany.mockResolvedValue({ count: 0 });
        const { service } = build();
        await expect(
            service.placeLegalHold({
                staff,
                organizationId: "org_1",
                reason: "Police notice 14/2026",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("answers 404 for a business that doesn't exist", async () => {
        orgFind.mockResolvedValue(null);
        const { service } = build();
        await expect(
            service.liftLegalHold({
                staff,
                organizationId: "nope",
                reason: "Case closed, order of 2 Dec",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
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

    it("tells the business's own history which plan it moved to (#509)", async () => {
        planFind.mockResolvedValue({ ...pro, name: "Pro" });
        subFind.mockResolvedValue({
            planId: "plan_free",
            provider: null,
            plan: { name: "Free" },
        });
        const { service } = build();
        await service.changePlan({
            staff,
            organizationId: "org_1",
            reason: "Upgrade agreed on call",
            planId: "plan_pro",
        });
        expect(tenantAudit).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "organization.plan.changed",
                organizationId: "org_1",
                metadata: { from: "Free", to: "Pro", byOperator: true },
            }),
        });
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

/**
 * A legal hold against a real Postgres (DEC-122): placed with a suspension
 * or on a business on its way out, lifted by a Platform Owner; and while it
 * lasts nothing deletes the business's data — no deletion can be scheduled,
 * the sweep leaves it, a privacy removal and "Download your data" are
 * refused with the refusal on its history, and the retention sweeps leave
 * its rows. Runs in the integration project (TEST_DATABASE_URL).
 */
import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AnalyticsRetentionHandler } from "../analytics/analytics-retention.handler";
import { AuditService } from "../audit/audit.service";
import type { EntitlementService } from "../billing/entitlement.service";
import type { ModuleLifecycleService } from "../capabilities/module-lifecycle.service";
import { PrivacyRemovalService } from "../customer-workspace/privacy-removal.service";
import { DataExportStatus } from "../data-export/data-export-types";
import { DataExportHandler } from "../data-export/data-export.handler";
import { DataExportService } from "../data-export/data-export.service";
import { LEGAL_HOLD_MESSAGE } from "../organizations/legal-hold";
import { resolveCapabilities } from "../organizations/organization-policy";
import { AdminAuditService } from "./admin-audit.service";
import {
    AdminLifecycleService,
    LEGAL_HOLD_BLOCKS_DELETION,
    LEGAL_HOLD_BLOCKS_REINSTATE,
} from "./admin-lifecycle.service";
import { deletionTrail } from "./deletion-trail";
import { OrganizationDeletionHandler } from "./organization-deletion.handler";
import { SecurityLogRetentionHandler } from "./security-log-retention.handler";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;
const DAY = 86_400_000;

const lifecycle = new AdminLifecycleService(
    new AdminAuditService(),
    {} as ModuleLifecycleService,
    {} as EntitlementService,
);
const sweep = new OrganizationDeletionHandler(new AdminAuditService());
const storage = createMemoryStorage();
const dataExports = new DataExportService(storage, new AuditService());
const exportJobs = new DataExportHandler(storage);
const removals = new PrivacyRemovalService();

const operator: PlatformAdminInfo = {
    userId: "staff_ops",
    platformAdminId: null,
    roles: ["PLATFORM_OWNER"],
    permissions: [],
    viaBootstrap: true,
};

async function business(
    data: {
        lifecycleStatus?: string;
        deletionScheduledAt?: Date;
        held?: boolean;
    } = {},
) {
    const owner = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com`, name: "Owner" },
    });
    const org = await prisma.organization.create({
        data: {
            name: "Rye Bakery",
            slug: uniq("rye"),
            lifecycleStatus: data.lifecycleStatus ?? "ACTIVE",
            deletionScheduledAt: data.deletionScheduledAt ?? null,
            ...(data.held
                ? {
                      legalHoldAt: new Date(),
                      legalHoldReason: "Police notice 14/2026",
                      legalHoldByUserId: "staff_ops",
                  }
                : {}),
        },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const ctx = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
        roleKey: "OWNER",
        actions: resolveCapabilities("OWNER"),
    } as unknown as OrganizationContext;
    return { org, owner, ctx };
}

const read = (id: string) =>
    prisma.organization.findUniqueOrThrow({ where: { id } });

describe("placing and lifting a legal hold (DEC-122)", () => {
    it("suspends with the hold: the business is suspended, held, and both ledgers say so", async () => {
        const b = await business();

        await lifecycle.suspend({
            staff: operator,
            organizationId: b.org.id,
            reason: "Selling counterfeit goods",
            confirmName: "Rye Bakery",
            legalHold: true,
        });

        const org = await read(b.org.id);
        expect(org.lifecycleStatus).toBe("SUSPENDED");
        expect(org.legalHoldAt).toBeInstanceOf(Date);
        expect(org.legalHoldReason).toBe("Selling counterfeit goods");
        expect(org.legalHoldByUserId).toBe("staff_ops");

        const ledger = await prisma.adminAuditEvent.findMany({
            where: { organizationId: b.org.id },
            select: { action: true, reason: true, permission: true },
        });
        expect(ledger).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: "organization.suspended",
                    reason: "Selling counterfeit goods",
                }),
                {
                    action: "organization.legal_hold.placed",
                    reason: "Selling counterfeit goods",
                    permission: "organization:lifecycle:write",
                },
            ]),
        );
        // Its own history says a hold was placed, never why.
        const own = await prisma.auditEvent.findMany({
            where: {
                organizationId: b.org.id,
                action: "organization.legal_hold.placed",
            },
        });
        expect(own).toHaveLength(1);
        expect(own[0]?.metadata).toEqual({ byOperator: true });
        // And the console's deletion trail lists it.
        const trail = await deletionTrail(b.org.id);
        expect(trail.map((row) => row.action)).toContain(
            "organization.legal_hold.placed",
        );
    });

    it("holds a business already suspended, and refuses an active one", async () => {
        const suspended = await business({ lifecycleStatus: "SUSPENDED" });
        await expect(
            lifecycle.placeLegalHold({
                staff: operator,
                organizationId: suspended.org.id,
                reason: "Police notice 14/2026",
            }),
        ).resolves.toEqual({ ok: true, changed: true });
        expect((await read(suspended.org.id)).legalHoldAt).not.toBeNull();

        const active = await business();
        await expect(
            lifecycle.placeLegalHold({
                staff: operator,
                organizationId: active.org.id,
                reason: "Police notice 14/2026",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect((await read(active.org.id)).legalHoldAt).toBeNull();
    });

    it("refuses to schedule a held business's deletion, or to reinstate it", async () => {
        const b = await business({ lifecycleStatus: "SUSPENDED", held: true });

        await expect(
            lifecycle.scheduleDeletion({
                staff: operator,
                organizationId: b.org.id,
                reason: "Owner asked to close",
                confirmName: "Rye Bakery",
            }),
        ).rejects.toThrow(LEGAL_HOLD_BLOCKS_DELETION);
        await expect(
            lifecycle.reinstate({
                staff: operator,
                organizationId: b.org.id,
                reason: "Owner called",
            }),
        ).rejects.toThrow(LEGAL_HOLD_BLOCKS_REINSTATE);

        const org = await read(b.org.id);
        expect(org.lifecycleStatus).toBe("SUSPENDED");
        expect(org.deletionScheduledAt).toBeNull();
    });

    it("lifts the hold with a reason, keeping who placed it and why on Saroh's ledger", async () => {
        const b = await business({ lifecycleStatus: "SUSPENDED", held: true });

        await lifecycle.liftLegalHold({
            staff: operator,
            organizationId: b.org.id,
            reason: "Case closed, order of 2 Dec",
        });

        const org = await read(b.org.id);
        expect(org).toMatchObject({
            lifecycleStatus: "SUSPENDED",
            legalHoldAt: null,
            legalHoldReason: null,
            legalHoldByUserId: null,
        });
        const lifted = await prisma.adminAuditEvent.findFirstOrThrow({
            where: {
                organizationId: b.org.id,
                action: "organization.legal_hold.lifted",
            },
        });
        expect(lifted.permission).toBe("organization:legal-hold:lift");
        expect(lifted.reason).toBe("Case closed, order of 2 Dec");
        expect(lifted.metadata).toMatchObject({
            placedBy: "staff_ops",
            placedFor: "Police notice 14/2026",
        });
        expect(
            await prisma.auditEvent.count({
                where: {
                    organizationId: b.org.id,
                    action: "organization.legal_hold.lifted",
                },
            }),
        ).toBe(1);
        // Now its deletion can be scheduled again.
        await expect(
            lifecycle.scheduleDeletion({
                staff: operator,
                organizationId: b.org.id,
                reason: "Owner asked to close",
                confirmName: "Rye Bakery",
            }),
        ).resolves.toMatchObject({ status: "PENDING_DELETION" });
    });
});

describe("the deletion sweep and a legal hold (DEC-122)", () => {
    it("leaves a held business past its window, and deletes it once the hold is lifted", async () => {
        const now = new Date();
        const b = await business({
            lifecycleStatus: "PENDING_DELETION",
            deletionScheduledAt: new Date(now.getTime() - DAY),
        });
        // The hold lands after the owner asked for deletion.
        await lifecycle.placeLegalHold({
            staff: operator,
            organizationId: b.org.id,
            reason: "Police notice 14/2026",
        });

        const swept = await sweep.sweep(now);

        expect(swept.deleted).not.toContain(b.org.id);
        expect(swept.held).toBeGreaterThanOrEqual(1);
        expect(await sweep.deleteOne(b.org.id, now)).toBe(false);
        const held = await read(b.org.id);
        expect(held.lifecycleStatus).toBe("PENDING_DELETION");
        expect(held.deletedRetainedAt).toBeNull();
        expect(
            await prisma.job.count({
                where: {
                    organizationId: b.org.id,
                    type: "organization.deletion.cleanup",
                },
            }),
        ).toBe(0);

        await lifecycle.liftLegalHold({
            staff: operator,
            organizationId: b.org.id,
            reason: "Case closed, order of 2 Dec",
        });
        expect(await sweep.deleteOne(b.org.id, now)).toBe(true);
        expect((await read(b.org.id)).lifecycleStatus).toBe("DELETED_RETAINED");
    });
});

describe("Download your data and a legal hold (DEC-122)", () => {
    it("refuses a new export in words, and puts the refusal on the business's history", async () => {
        const b = await business({ lifecycleStatus: "SUSPENDED", held: true });

        await expect(dataExports.request(b.ctx)).rejects.toThrow(
            LEGAL_HOLD_MESSAGE,
        );

        expect(
            await prisma.dataExport.count({
                where: { organizationId: b.org.id },
            }),
        ).toBe(0);
        expect(
            await prisma.job.count({ where: { organizationId: b.org.id } }),
        ).toBe(0);
        const denied = await prisma.auditEvent.findFirstOrThrow({
            where: {
                organizationId: b.org.id,
                action: "organization.data_export.requested",
            },
        });
        expect(denied.outcome).toBe("DENIED");
        expect(denied.metadata).toMatchObject({ reason: "LEGAL_HOLD" });
        // The list still reads.
        await expect(dataExports.list(b.ctx)).resolves.toMatchObject({
            exports: [],
        });
    });

    it("refuses a link to an export made before the hold, and builds none asked for before it", async () => {
        const b = await business({ lifecycleStatus: "SUSPENDED" });
        const ready = await prisma.dataExport.create({
            data: {
                organizationId: b.org.id,
                requestedByUserId: b.owner.id,
                status: DataExportStatus.Ready,
                storageKey: "exports/made-before.zip",
                readyAt: new Date(),
                expiresAt: new Date(Date.now() + DAY),
            },
        });
        const asked = await dataExports.request(b.ctx);
        await lifecycle.placeLegalHold({
            staff: operator,
            organizationId: b.org.id,
            reason: "Police notice 14/2026",
        });

        await expect(dataExports.link(b.ctx, ready.id)).rejects.toThrow(
            LEGAL_HOLD_MESSAGE,
        );
        const job = await prisma.job.findFirstOrThrow({
            where: { organizationId: b.org.id, type: "data-export.build" },
        });
        await exportJobs.build(job);
        const row = await prisma.dataExport.findUniqueOrThrow({
            where: { id: asked.export.id },
        });
        expect(row.status).toBe(DataExportStatus.Failed);
        expect(row.failure).toBe(LEGAL_HOLD_MESSAGE);
        expect(row.storageKey).toBeNull();
    });
});

describe("a customer's privacy removal and a legal hold (DEC-122)", () => {
    async function customer(organizationId: string) {
        return prisma.contact.create({
            data: {
                organizationId,
                email: `${uniq("asha")}@example.com`,
                firstName: "Asha",
                lastName: "Rao",
                phone: "+91 98450 00001",
            },
        });
    }

    it("refuses the removal, changes nothing, and records why", async () => {
        const b = await business({ lifecycleStatus: "SUSPENDED", held: true });
        const asha = await customer(b.org.id);

        await expect(removals.remove(b.ctx, asha.id)).rejects.toMatchObject({
            response: {
                message: LEGAL_HOLD_MESSAGE,
                details: { reason: "legal-hold" },
            },
        });

        const after = await prisma.contact.findUniqueOrThrow({
            where: { id: asha.id },
        });
        expect(after).toMatchObject({
            firstName: "Asha",
            phone: "+91 98450 00001",
            removedAt: null,
        });
        const refused = await prisma.auditEvent.findMany({
            where: {
                organizationId: b.org.id,
                action: "customer.removal.refused",
            },
        });
        expect(refused).toHaveLength(1);
        expect(refused[0]).toMatchObject({
            targetType: "contact",
            targetId: asha.id,
            actorUserId: b.owner.id,
            outcome: "DENIED",
        });
        expect(refused[0]?.metadata).toMatchObject({ reason: "LEGAL_HOLD" });
        // Ids and a code only.
        expect(JSON.stringify(refused[0])).not.toMatch(/Asha|example\.com/);
    });

    it("says so first in the preview the dialog reads, and records that too", async () => {
        const b = await business({ lifecycleStatus: "SUSPENDED", held: true });
        const asha = await customer(b.org.id);

        const preview = await removals.preview(b.ctx, asha.id);

        expect(preview.refusals[0]).toEqual({
            reason: "legal-hold",
            message: LEGAL_HOLD_MESSAGE,
        });
        expect(
            await prisma.auditEvent.count({
                where: {
                    organizationId: b.org.id,
                    action: "customer.removal.refused",
                    targetId: asha.id,
                },
            }),
        ).toBe(1);
    });

    it("removes as before for a business with no hold", async () => {
        const b = await business();
        const asha = await customer(b.org.id);
        const preview = await removals.preview(b.ctx, asha.id);
        expect(preview.refusals).toEqual([]);
        await removals.remove(b.ctx, asha.id);
        expect(
            (
                await prisma.contact.findUniqueOrThrow({
                    where: { id: asha.id },
                })
            ).removedAt,
        ).not.toBeNull();
        expect(
            await prisma.auditEvent.count({
                where: {
                    organizationId: b.org.id,
                    action: "customer.removal.refused",
                },
            }),
        ).toBe(0);
    });
});

describe("the retention sweeps and a legal hold (DEC-122)", () => {
    const now = new Date();

    async function expiredEvent(organizationId: string) {
        return prisma.analyticsEvent.create({
            data: {
                organizationId,
                type: "site.view",
                properties: { path: "/" },
                visitorHash: uniq("v"),
                occurredAt: new Date(now.getTime() - 401 * DAY),
                receivedAt: new Date(now.getTime() - 401 * DAY),
                expiresAt: new Date(now.getTime() - DAY),
            },
        });
    }

    it("analytics retention deletes another business's expired events and leaves the held one's", async () => {
        const held = await business({
            lifecycleStatus: "SUSPENDED",
            held: true,
        });
        const other = await business();
        const kept = await expiredEvent(held.org.id);
        const gone = await expiredEvent(other.org.id);

        await new AnalyticsRetentionHandler().sweep(now);

        expect(
            await prisma.analyticsEvent.count({ where: { id: kept.id } }),
        ).toBe(1);
        expect(
            await prisma.analyticsEvent.count({ where: { id: gone.id } }),
        ).toBe(0);

        // Lifted: the next run takes them.
        await lifecycle.liftLegalHold({
            staff: operator,
            organizationId: held.org.id,
            reason: "Case closed, order of 2 Dec",
        });
        await new AnalyticsRetentionHandler().sweep(now);
        expect(
            await prisma.analyticsEvent.count({ where: { id: kept.id } }),
        ).toBe(0);
    });

    it("security logs go after a year, but not a live session, a recent one, or a held business's", async () => {
        const held = await business({
            lifecycleStatus: "SUSPENDED",
            held: true,
        });
        const other = await business();
        const session = (userId: string, endedDaysAgo: number) =>
            prisma.session.create({
                data: {
                    id: uniq("sess"),
                    token: uniq("tok"),
                    userId,
                    ipAddress: "203.0.113.7",
                    userAgent: "Chrome on Android",
                    createdAt: new Date(
                        now.getTime() - (endedDaysAgo + 7) * DAY,
                    ),
                    expiresAt: new Date(now.getTime() - endedDaysAgo * DAY),
                },
            });
        const old = await session(other.owner.id, 366);
        const recent = await session(other.owner.id, 364);
        const live = await session(other.owner.id, -7);
        const heldOld = await session(held.owner.id, 500);
        const code = (organizationId: string, daysAgo: number) =>
            prisma.customerSignInCode.create({
                data: {
                    organizationId,
                    destinationHash: uniq("dest"),
                    codeHash: uniq("code"),
                    clientHash: "hash-of-an-address",
                    expiresAt: new Date(now.getTime() - daysAgo * DAY),
                    createdAt: new Date(now.getTime() - daysAgo * DAY),
                },
            });
        const oldCode = await code(other.org.id, 400);
        const recentCode = await code(other.org.id, 100);
        const heldCode = await code(held.org.id, 400);

        const swept = await new SecurityLogRetentionHandler().sweep(now);

        expect(swept.deleted.Session).toBeGreaterThanOrEqual(1);
        const left = async (id: string) =>
            prisma.session.count({ where: { id } });
        expect(await left(old.id)).toBe(0);
        expect(await left(recent.id)).toBe(1);
        expect(await left(live.id)).toBe(1);
        expect(await left(heldOld.id)).toBe(1);
        const codeLeft = async (id: string) =>
            prisma.customerSignInCode.count({ where: { id } });
        expect(await codeLeft(oldCode.id)).toBe(0);
        expect(await codeLeft(recentCode.id)).toBe(1);
        expect(await codeLeft(heldCode.id)).toBe(1);

        // The audit trails are records, never pruned: an event of two
        // years ago is still there.
        const ancient = await prisma.auditEvent.create({
            data: {
                action: "organization.onboard",
                actorUserId: other.owner.id,
                organizationId: other.org.id,
                outcome: "SUCCESS",
                createdAt: new Date(now.getTime() - 800 * DAY),
            },
        });
        await new SecurityLogRetentionHandler().sweep(now);
        expect(
            await prisma.auditEvent.count({ where: { id: ancient.id } }),
        ).toBe(1);
    });
});

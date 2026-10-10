/**
 * The business deletion sweep against a real Postgres (#907): a business
 * whose PENDING_DELETION window has ended goes to DELETED_RETAINED with both
 * ledgers written; one inside its window — or not scheduled at all — is
 * never touched. Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { AdminAuditService } from "./admin-audit.service";
import {
    ORGANIZATION_DELETION_TYPE,
    OrganizationDeletionHandler,
} from "./organization-deletion.handler";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;
const handler = new OrganizationDeletionHandler(new AdminAuditService());

async function business(
    name: string,
    data: {
        lifecycleStatus: string;
        deletionScheduledAt?: Date | null;
    },
) {
    return prisma.organization.create({
        data: {
            name,
            slug: `del-${name.toLowerCase()}-${tag}`,
            lifecycleStatus: data.lifecycleStatus,
            deletionScheduledAt: data.deletionScheduledAt ?? null,
            deletionScheduledBy: data.deletionScheduledAt ? "staff_1" : null,
            deletionReason: data.deletionScheduledAt ? "Owner asked" : null,
        },
        select: { id: true },
    });
}

const snapshot = (id: string) =>
    prisma.organization.findUniqueOrThrow({
        where: { id },
        select: {
            lifecycleStatus: true,
            lifecycleVersion: true,
            deletionScheduledAt: true,
            deletedRetainedAt: true,
            deletionScheduledBy: true,
            deletionReason: true,
            name: true,
            slug: true,
        },
    });

const ledgers = async (id: string) => ({
    admin: await prisma.adminAuditEvent.count({
        where: { organizationId: id, action: "organization.deleted" },
    }),
    own: await prisma.auditEvent.count({
        where: { organizationId: id, action: "organization.deleted" },
    }),
});

describe("organization deletion sweep (DB, #907)", () => {
    const now = new Date();
    let due: string;
    let inside: string;
    let justInside: string;
    let active: string;
    let suspended: string;

    beforeAll(async () => {
        due = (
            await business("Due", {
                lifecycleStatus: "PENDING_DELETION",
                deletionScheduledAt: new Date(now.getTime() - DAY),
            })
        ).id;
        inside = (
            await business("Inside", {
                lifecycleStatus: "PENDING_DELETION",
                deletionScheduledAt: new Date(now.getTime() + 20 * DAY),
            })
        ).id;
        justInside = (
            await business("JustInside", {
                lifecycleStatus: "PENDING_DELETION",
                deletionScheduledAt: new Date(now.getTime() + 60 * 1000),
            })
        ).id;
        active = (await business("Active", { lifecycleStatus: "ACTIVE" })).id;
        // Suspended after it was scheduled: the old date stays, the window
        // no longer runs.
        suspended = (
            await business("Suspended", {
                lifecycleStatus: "SUSPENDED",
                deletionScheduledAt: new Date(now.getTime() - DAY),
            })
        ).id;
    });

    it("never touches a business inside its window, or one not pending deletion", async () => {
        const before = await Promise.all(
            [inside, justInside, active, suspended].map(snapshot),
        );

        const result = await handler.sweep(now);

        expect(result.deleted).toEqual([due]);
        expect(result.failed).toBe(0);
        const after = await Promise.all(
            [inside, justInside, active, suspended].map(snapshot),
        );
        expect(after).toEqual(before);
        for (const id of [inside, justInside, active, suspended]) {
            expect(await ledgers(id)).toEqual({ admin: 0, own: 0 });
        }
    });

    it("takes the business past its window to DELETED_RETAINED, on both ledgers", async () => {
        const row = await snapshot(due);
        expect(row.lifecycleStatus).toBe("DELETED_RETAINED");
        expect(row.deletedRetainedAt).not.toBeNull();
        expect(row.lifecycleVersion).toBe(2);
        expect(await ledgers(due)).toEqual({ admin: 1, own: 1 });

        const entry = await prisma.adminAuditEvent.findFirstOrThrow({
            where: { organizationId: due, action: "organization.deleted" },
        });
        expect(entry).toMatchObject({
            actorUserId: "system:organization-deletion",
            permission: "organization:lifecycle:write",
            outcome: "SUCCESS",
            idempotencyKey: `organization-deletion:${due}`,
        });
    });

    it("refuses a business inside its window even when asked for it by id", async () => {
        expect(await handler.deleteOne(inside, now)).toBe(false);
        expect((await snapshot(inside)).lifecycleStatus).toBe(
            "PENDING_DELETION",
        );
    });

    it("does nothing a second time", async () => {
        const result = await handler.sweep(now);
        expect(result.deleted).toEqual([]);
        expect(await ledgers(due)).toEqual({ admin: 1, own: 1 });
    });

    it("keeps one waiting run of the chain", async () => {
        expect(await handler.schedule(new Date())).toBe(true);
        expect(await handler.schedule(new Date())).toBe(true);
        expect(
            await prisma.job.count({
                where: { type: ORGANIZATION_DELETION_TYPE, status: "PENDING" },
            }),
        ).toBe(1);
    });
});

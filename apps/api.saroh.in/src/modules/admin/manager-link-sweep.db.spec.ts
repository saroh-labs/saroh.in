/**
 * The manager link sweep (DEC-169, R34, admin console U25) against a real
 * Postgres: a link ends when its manager's Account manager role has run
 * out, was taken away, or their access was revoked, at the moment that
 * happened; the business then shows as having no manager; a manager who
 * still holds the role keeps theirs; each end is on the ledger as the
 * sweep's; and the chain keeps one waiting run.
 *
 * The U19 migration's trigger and CHECKs are added where `db push` left
 * them out, so the sweep's writes pass the append-only rule. Under
 * `TEST_RLS=on` the migrations are replayed and they are already there.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { managerOf } from "./admin-account-managers.service";
import { AdminRole } from "./admin-permissions";
import {
    MANAGER_LINK_SWEEP_EVERY_MS,
    MANAGER_LINK_SWEEP_TYPE,
    ManagerLinkSweepJob,
} from "./manager-link-sweep.job";
import { LINK_END_WORDS, MANAGER_LINK_SWEEP_ACTOR } from "./manager-links";

const HOUR_MS = 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => (seq += 1);

const job = new ManagerLinkSweepJob();

interface Manager {
    userId: string;
    platformAdminId: string;
    assignmentId: string;
}

async function manager(name: string): Promise<Manager> {
    const user = await prisma.user.create({
        data: { email: `am-${next()}-${tag}@example.com`, name },
    });
    const admin = await prisma.platformAdmin.create({
        data: {
            userId: user.id,
            roleAssignments: {
                create: {
                    role: AdminRole.AccountManager,
                    reason: "test grant",
                },
            },
        },
        select: { id: true, roleAssignments: { select: { id: true } } },
    });
    return {
        userId: user.id,
        platformAdminId: admin.id,
        assignmentId: admin.roleAssignments[0]?.id ?? "",
    };
}

/** A business brought in by `who` a week ago. */
async function businessOf(who: Manager): Promise<string> {
    const n = next();
    const org = await prisma.organization.create({
        data: { name: `Pulse Studio ${n}`, slug: `am-sweep-${n}-${tag}` },
    });
    await prisma.accountManagerLink.create({
        data: {
            organizationId: org.id,
            platformAdminId: who.platformAdminId,
            source: "CODE",
            kind: "BROUGHT_IN",
            evidence: { source: "CODE", code: "ABCD2345" },
            startedAt: new Date(Date.now() - 7 * 24 * HOUR_MS),
        },
    });
    return org.id;
}

const linkOf = (organizationId: string) =>
    prisma.accountManagerLink.findFirstOrThrow({
        where: { organizationId },
        orderBy: { startedAt: "desc" },
    });

const MIGRATION = join(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20261129200000_account_manager_links/migration.sql",
);

/** The U19 migration's trigger and CHECKs, where `db push` left them out. */
async function ensureMigrationRules(): Promise<void> {
    const sql = readFileSync(MIGRATION, "utf8");
    const trigger = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM pg_trigger
        WHERE tgname = 'AccountManagerLink_append_only'`;
    if (Number(trigger[0]?.n ?? 0) === 0) {
        const start = sql.indexOf("-- append-only:begin");
        const end = sql.indexOf("-- append-only:end");
        await prisma.$executeRawUnsafe(sql.slice(start, end));
    }
    const checks = sql
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) =>
            /ADD CONSTRAINT "AccountManagerLink_\w+_check"/.test(statement),
        );
    for (const statement of checks) {
        const name = /ADD CONSTRAINT "(\w+)"/.exec(statement)?.[1] ?? "";
        const found = await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*)::bigint AS n FROM pg_constraint WHERE conname = ${name}`;
        if (Number(found[0]?.n ?? 0) === 0) {
            await prisma.$executeRawUnsafe(statement);
        }
    }
}

beforeAll(async () => {
    await ensureMigrationRules();
});

describe("the manager link sweep (U25)", () => {
    it("ends a link when the role has run out, at the moment it ran out", async () => {
        const rohan = await manager("Rohan");
        const org = await businessOf(rohan);
        const ranOut = new Date(Date.now() - 3 * HOUR_MS);
        await prisma.platformAdminRoleAssignment.update({
            where: { id: rohan.assignmentId },
            data: { expiresAt: ranOut },
        });

        const swept = await job.sweep(new Date());
        expect(swept.ended).toBeGreaterThanOrEqual(1);

        const link = await linkOf(org);
        expect(link.endedAt?.getTime()).toBe(ranOut.getTime());
        expect(link).toMatchObject({
            endedByUserId: null,
            endedReason: LINK_END_WORDS.ROLE_EXPIRED,
        });
        expect(await managerOf(prisma, org)).toBeNull();
        const rows = await prisma.adminAuditEvent.findMany({
            where: { organizationId: org },
        });
        expect(rows).toEqual([
            expect.objectContaining({
                actorUserId: MANAGER_LINK_SWEEP_ACTOR,
                action: "account-manager.ended",
                permission: "accounts:assign",
                metadata: expect.objectContaining({
                    linkId: link.id,
                    cause: "ROLE_EXPIRED",
                }),
            }),
        ]);
    });

    it("ends links a revoke made outside the console left open", async () => {
        const kiran = await manager("Kiran");
        const a = await businessOf(kiran);
        const b = await businessOf(kiran);
        const revokedAt = new Date(Date.now() - HOUR_MS);
        await prisma.platformAdmin.update({
            where: { id: kiran.platformAdminId },
            data: { revokedAt },
        });
        await prisma.platformAdminRoleAssignment.updateMany({
            where: { platformAdminId: kiran.platformAdminId },
            data: { revokedAt },
        });

        await job.sweep(new Date());
        for (const org of [a, b]) {
            const link = await linkOf(org);
            expect(link.endedAt?.getTime()).toBe(revokedAt.getTime());
            expect(link.endedReason).toBe(LINK_END_WORDS.ACCESS_REVOKED);
            expect(await managerOf(prisma, org)).toBeNull();
        }
    });

    it("ends a link whose role was taken away", async () => {
        const leela = await manager("Leela");
        const org = await businessOf(leela);
        await prisma.platformAdminRoleAssignment.update({
            where: { id: leela.assignmentId },
            data: { revokedAt: new Date(Date.now() - HOUR_MS) },
        });
        await job.sweep(new Date());
        expect((await linkOf(org)).endedReason).toBe(
            LINK_END_WORDS.ROLE_REMOVED,
        );
    });

    it("leaves a manager who still holds the role alone, and an ended link as it was", async () => {
        const asha = await manager("Asha");
        const org = await businessOf(asha);
        const later = new Date(Date.now() + 24 * HOUR_MS);
        await prisma.platformAdminRoleAssignment.update({
            where: { id: asha.assignmentId },
            data: { expiresAt: later },
        });
        const swept = await job.sweep(new Date());
        expect(swept.ended).toBe(0);
        expect((await managerOf(prisma, org))?.platformAdminId).toBe(
            asha.platformAdminId,
        );

        // A second sweep after it runs out ends it once, then nothing.
        await job.sweep(new Date(later.getTime() + HOUR_MS));
        const ended = await linkOf(org);
        expect(ended.endedAt?.getTime()).toBe(later.getTime());
        const again = await job.sweep(new Date(later.getTime() + 2 * HOUR_MS));
        expect(again.ended).toBe(0);
        expect((await linkOf(org)).endedAt?.getTime()).toBe(later.getTime());
    });

    it("keeps one waiting run of its chain", async () => {
        await prisma.job.deleteMany({
            where: { type: MANAGER_LINK_SWEEP_TYPE },
        });
        const soon = new Date(Date.now() + MANAGER_LINK_SWEEP_EVERY_MS);
        expect(await job.schedule(soon)).toBe(true);
        expect(await job.schedule(soon)).toBe(true);
        await job.ensureScheduled();
        expect(
            await prisma.job.count({
                where: { type: MANAGER_LINK_SWEEP_TYPE, status: "PENDING" },
            }),
        ).toBe(1);

        // A run (claimed, so not PENDING) leaves the next one waiting.
        const waiting = await prisma.job.findFirstOrThrow({
            where: { type: MANAGER_LINK_SWEEP_TYPE, status: "PENDING" },
        });
        await prisma.job.update({
            where: { id: waiting.id },
            data: { status: "PROCESSING" },
        });
        await job.handle(waiting as Job);
        const pending = await prisma.job.findMany({
            where: { type: MANAGER_LINK_SWEEP_TYPE, status: "PENDING" },
        });
        expect(pending).toHaveLength(1);
        expect(pending[0]?.runAt.getTime()).toBeGreaterThan(Date.now());
    });
});

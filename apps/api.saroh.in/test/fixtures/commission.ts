import { randomInt } from "node:crypto";

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { MANAGER_CODE_ALPHABET } from "../../src/modules/admin/staff-profile";
import type { RateKind } from "../../src/modules/commission/commission-rules";

/**
 * Commission fixtures (DEC-169, admin console U21). A rate is drawn at
 * random for every run and every assertion is made relative to it: no
 * rate, real or made up, is written in this repository. Rows satisfy the
 * migrations' CHECKs, so the specs hold with `TEST_RLS=on`.
 */

/** A rate in basis points, different every run (never 0, never all of it). */
export function randomRate(): number {
    return randomInt(1, 5_000);
}

/** Two different random rates, for the two kinds of link. */
export function twoRates(): { broughtIn: number; assigned: number } {
    const broughtIn = randomRate();
    let assigned = randomRate();
    while (assigned === broughtIn) assigned = randomRate();
    return { broughtIn, assigned };
}

let seq = 0;
const tag = `${process.pid}-${Date.now()}`;

function managerCode(): string {
    return Array.from(
        { length: 8 },
        () => MANAGER_CODE_ALPHABET[randomInt(MANAGER_CODE_ALPHABET.length)],
    ).join("");
}

/** A teammate who holds the Account manager role, on commission unless told. */
export async function manager(
    over: { onCommission?: boolean; name?: string } = {},
): Promise<{ platformAdminId: string; userId: string; name: string }> {
    seq += 1;
    const name = over.name ?? `Manager ${seq}`;
    const user = await prisma.user.create({
        data: { email: `manager-${seq}-${tag}@example.test`, name },
    });
    const admin = await prisma.platformAdmin.create({
        data: { userId: user.id, note: "commission spec" },
    });
    await prisma.platformAdminRoleAssignment.create({
        data: {
            platformAdminId: admin.id,
            role: "ACCOUNT_MANAGER",
            reason: "commission spec",
        },
    });
    await prisma.staffProfile.create({
        data: {
            platformAdminId: admin.id,
            worksAs: "ACCOUNT_MANAGER_JOB",
            managerCode: managerCode(),
            onCommission: over.onCommission ?? true,
        },
    });
    return { platformAdminId: admin.id, userId: user.id, name };
}

/** The business's manager from `startedAt` (brought in through a link by default). */
export async function linkTo(
    organizationId: string,
    platformAdminId: string,
    kind: RateKind = "BROUGHT_IN",
    startedAt: Date = new Date(Date.now() - 60_000),
): Promise<string> {
    const link = await prisma.accountManagerLink.create({
        data: {
            organizationId,
            platformAdminId,
            source: kind === "ASSIGNED" ? "ASSIGNED" : "LINK",
            kind,
            evidence:
                kind === "ASSIGNED"
                    ? { source: "ASSIGNED" }
                    : {
                          source: "LINK",
                          code: "SPEC2345",
                          cookieSetAt: startedAt.toISOString(),
                      },
            startedAt,
        },
    });
    return link.id;
}

/** End the business's open link now. */
export async function endLink(organizationId: string, at = new Date()) {
    await prisma.accountManagerLink.updateMany({
        where: { organizationId, endedAt: null },
        data: { endedAt: at, endedReason: "commission spec" },
    });
}

/** A rate for `kind` from `effectiveFrom` (a minute ago by default). */
export async function setRate(
    kind: RateKind,
    basisPoints: number,
    effectiveFrom: Date = new Date(Date.now() - 60_000),
): Promise<string> {
    const rate = await prisma.commissionRate.create({
        data: {
            kind,
            basisPoints,
            effectiveFrom,
            setByUserId: "commission-spec",
            reason: "commission spec",
        },
    });
    return rate.id;
}

/** Wipe what the commission specs write, for a clean test. */
export async function wipeCommission(): Promise<void> {
    await prisma.commissionLine.deleteMany({});
    await prisma.commissionPayout.deleteMany({});
    await prisma.commissionRate.deleteMany({});
    await prisma.accountManagerLink.deleteMany({});
    await prisma.staffProfile.deleteMany({});
    await prisma.platformAdminRoleAssignment.deleteMany({});
    await prisma.platformAdmin.deleteMany({});
    await prisma.billingAction.deleteMany({});
    await prisma.billingRefund.deleteMany({});
}

/** The waiting jobs of `types`, oldest first. */
export function waitingJobs(types: readonly string[]): Promise<Job[]> {
    return prisma.job.findMany({
        where: { type: { in: [...types] }, status: "PENDING" },
        orderBy: { createdAt: "asc" },
    });
}

/**
 * Run each waiting job of `types` once through `handlers` (by type), as the
 * worker would on its first try, and mark it done. Answers how many ran.
 */
export async function runJobs(
    handlers: Record<string, (job: Job) => Promise<void>>,
): Promise<number> {
    const jobs = await waitingJobs(Object.keys(handlers));
    for (const job of jobs) {
        await handlers[job.type]!(job);
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE", attempts: job.attempts + 1 },
        });
    }
    return jobs.length;
}

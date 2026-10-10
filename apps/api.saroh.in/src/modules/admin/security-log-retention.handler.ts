import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { heldOrganizationIds } from "../organizations/legal-hold";
import {
    SECURITY_LOG_RETENTION_DAYS,
    securityLogCutoff,
} from "../organizations/retention";

/** The daily job that deletes security log rows past a year (DEC-122). */
export const SECURITY_LOG_RETENTION_TYPE = "security-logs.retention";

/** Once a day: the rule is counted in days. */
export const SECURITY_LOG_RETENTION_EVERY_MS = 24 * 60 * 60 * 1000;

/** With rows still due at a run's cap, the next comes this soon. */
export const SECURITY_LOG_RETENTION_BACKLOG_MS = 60 * 1000;

/** Rows deleted per statement. */
export const SECURITY_LOG_BATCH = 1000;

/** Batches per table per run, so a run stays well inside the job lease. */
export const SECURITY_LOG_MAX_BATCHES = 20;

/** The tables the sweep prunes, in the order it takes them. */
export const SECURITY_LOG_TABLES = [
    "Session",
    "CustomerSession",
    "CustomerSignInCode",
    "AuditLog",
    "SecretAccessLog",
] as const;

export type SecurityLogTable = (typeof SECURITY_LOG_TABLES)[number];

export interface SecurityLogSweep {
    deleted: Record<SecurityLogTable, number>;
    /** A table stopped at its cap with rows still due. */
    more: boolean;
}

/**
 * Deletes security log rows a year after they ended (DEC-122, owner
 * 10 Oct). The Privacy Policy: "Security logs: IP address, browser,
 * sign-in times, errors … 1 year". Nothing pruned these before: they were
 * kept for ever, while the policy said 90 days.
 *
 * In the database the security logs are:
 *
 * - `Session`: a person's sign-in to Saroh (address, browser, when). A row
 *   goes a year after the session ended (`expiresAt`); a live session is
 *   never touched.
 * - `CustomerSession`: a customer's sign-in on a business's site (a browser
 *   summary, when). A year after it ended.
 * - `CustomerSignInCode`: sign-in codes asked for on a business's site
 *   (hashed destination and address, attempts). A year after it was made.
 * - `AuditLog` and `SecretAccessLog`: the older store-scoped logs (address,
 *   action). Nothing writes them any more; a year after they were made.
 *
 * **Never the audit trails.** `AuditEvent` (a business's history) and
 * `AdminAuditEvent` (the admin ledger) are records of what was done, kept
 * with the business's record (DEC-021), and support-access sessions
 * (`AdminAccessSession`) are part of that record.
 *
 * **Errors** are not in the database: they are the API's own log on its
 * host and Cloudflare's logs, whose retention is set outside this
 * repository (`devops-observability.md`).
 *
 * **A business on legal hold keeps its rows** (`organizations/legal-hold.ts`):
 * its customers' sessions and codes, its store logs, and its members'
 * sign-in sessions are left out of every delete until the hold is lifted.
 *
 * Batches of {@link SECURITY_LOG_BATCH} ids, oldest first, at most
 * {@link SECURITY_LOG_MAX_BATCHES} a table a run; a run that stops at a cap
 * comes back in a minute. It logs counts only. It reschedules itself like
 * the analytics retention sweep (ADR-007): one PENDING run at a time
 * (`Job_one_pending_security_logs_retention`), a failed sweep is logged
 * and the chain goes on, and it throws only when the next run cannot be
 * enqueued.
 */
@Injectable()
export class SecurityLogRetentionHandler {
    private readonly logger = new Logger(SecurityLogRetentionHandler.name);

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        let more = false;
        try {
            const swept = await this.sweep(now);
            more = swept.more;
            const total = Object.values(swept.deleted).reduce(
                (sum, n) => sum + n,
                0,
            );
            if (total > 0) {
                const line = Object.entries(swept.deleted)
                    .map(([table, count]) => `${table}=${count}`)
                    .join(" ");
                this.logger.log(
                    `security_logs_retention deleted=${total} ${line} more=${more}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `security_logs_retention sweep failed before it finished: ${errorName(error)}`,
            );
        }
        const wait = more
            ? SECURITY_LOG_RETENTION_BACKLOG_MS
            : SECURITY_LOG_RETENTION_EVERY_MS;
        if (!(await this.schedule(new Date(now.getTime() + wait)))) {
            throw new Error(
                "Could not schedule the next security log retention sweep; retrying this one",
            );
        }
    };

    /** Delete rows that ended more than a year before `now`. */
    async sweep(
        now: Date,
        days: number = SECURITY_LOG_RETENTION_DAYS,
    ): Promise<SecurityLogSweep> {
        const cutoff = securityLogCutoff(now, days);
        // On legal hold: read once a run; there are few (DEC-122).
        const held = await heldOrganizationIds(prisma);
        const heldUsers =
            held.length > 0
                ? (
                      await prisma.membership.findMany({
                          where: { organizationId: { in: held } },
                          select: { userId: true },
                          distinct: ["userId"],
                      })
                  ).map((m) => m.userId)
                : [];
        const notHeld =
            held.length > 0 ? { organizationId: { notIn: held } } : {};
        const notHeldStore =
            held.length > 0
                ? { NOT: { store: { organizationId: { in: held } } } }
                : {};

        const deleted = Object.fromEntries(
            SECURITY_LOG_TABLES.map((table) => [table, 0]),
        ) as Record<SecurityLogTable, number>;
        let more = false;
        const run = async (
            table: SecurityLogTable,
            batch: () => Promise<{ found: number; deleted: number }>,
        ) => {
            for (let i = 0; i < SECURITY_LOG_MAX_BATCHES; i++) {
                const done = await batch();
                deleted[table] += done.deleted;
                // A short batch was the last; one that deleted nothing
                // (another run took them) would otherwise loop for ever.
                if (done.found < SECURITY_LOG_BATCH || done.deleted === 0) {
                    return;
                }
            }
            more = true;
        };

        await run("Session", async () => {
            const where = {
                expiresAt: { lt: cutoff },
                ...(heldUsers.length > 0
                    ? { userId: { notIn: heldUsers } }
                    : {}),
            };
            const due = await prisma.session.findMany({
                where,
                select: { id: true },
                orderBy: { expiresAt: "asc" },
                take: SECURITY_LOG_BATCH,
            });
            if (due.length === 0) return { found: 0, deleted: 0 };
            const { count } = await prisma.session.deleteMany({
                where: { ...where, id: { in: due.map((r) => r.id) } },
            });
            return { found: due.length, deleted: count };
        });

        await run("CustomerSession", async () => {
            const where = { expiresAt: { lt: cutoff }, ...notHeld };
            const due = await prisma.customerSession.findMany({
                where,
                select: { id: true },
                orderBy: { expiresAt: "asc" },
                take: SECURITY_LOG_BATCH,
            });
            if (due.length === 0) return { found: 0, deleted: 0 };
            const { count } = await prisma.customerSession.deleteMany({
                where: { ...where, id: { in: due.map((r) => r.id) } },
            });
            return { found: due.length, deleted: count };
        });

        await run("CustomerSignInCode", async () => {
            const where = { createdAt: { lt: cutoff }, ...notHeld };
            const due = await prisma.customerSignInCode.findMany({
                where,
                select: { id: true },
                orderBy: { createdAt: "asc" },
                take: SECURITY_LOG_BATCH,
            });
            if (due.length === 0) return { found: 0, deleted: 0 };
            const { count } = await prisma.customerSignInCode.deleteMany({
                where: { ...where, id: { in: due.map((r) => r.id) } },
            });
            return { found: due.length, deleted: count };
        });

        await run("AuditLog", async () => {
            const where = { createdAt: { lt: cutoff }, ...notHeldStore };
            const due = await prisma.auditLog.findMany({
                where,
                select: { id: true },
                orderBy: { createdAt: "asc" },
                take: SECURITY_LOG_BATCH,
            });
            if (due.length === 0) return { found: 0, deleted: 0 };
            const { count } = await prisma.auditLog.deleteMany({
                where: { ...where, id: { in: due.map((r) => r.id) } },
            });
            return { found: due.length, deleted: count };
        });

        await run("SecretAccessLog", async () => {
            const where = { createdAt: { lt: cutoff }, ...notHeldStore };
            const due = await prisma.secretAccessLog.findMany({
                where,
                select: { id: true },
                orderBy: { createdAt: "asc" },
                take: SECURITY_LOG_BATCH,
            });
            if (due.length === 0) return { found: 0, deleted: 0 };
            const { count } = await prisma.secretAccessLog.deleteMany({
                where: { ...where, id: { in: due.map((r) => r.id) } },
            });
            return { found: due.length, deleted: count };
        });

        return { deleted, more };
    }

    /**
     * Enqueue the next run unless one is already waiting (P2002 = already
     * scheduled). Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: { type: SECURITY_LOG_RETENTION_TYPE, payload: {}, runAt },
            });
            return true;
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return true;
            this.logger.error(
                `Could not schedule the next security log retention sweep: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Start the chain again when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: SECURITY_LOG_RETENTION_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the security log retention chain: ${errorName(error)}`,
            );
        }
    }
}

function errorName(error: unknown): string {
    if (error instanceof Error) {
        const code = prismaErrorCode(error);
        return code ? `${error.name}:${code}` : error.name;
    }
    return "unknown";
}

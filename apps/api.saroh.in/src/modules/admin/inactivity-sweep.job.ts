import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { ManagerSignalBusiness } from "../../common/email";
import { sendManagerSignalsEmail } from "../../common/email";
import {
    markEmailed,
    sweepInactivitySignals,
    unemailedSignals,
} from "./inactivity-signals";

/** The daily job that opens and clears inactivity signals and emails them. */
export const INACTIVITY_SWEEP_TYPE = "admin.inactivity-sweep";

/** Daily: the windows are days long, and a manager wants one email a day. */
export const INACTIVITY_SWEEP_EVERY_MS = 24 * 60 * 60 * 1000;

/** The key that lets one waiting run of the chain exist at a time. */
const CHAIN_LOCK = `job-chain:${INACTIVITY_SWEEP_TYPE}`;

/**
 * Inactivity signals (R13, #1199): each day, open and clear every
 * business's signals (`sweepInactivitySignals`), then send each account
 * manager one email listing their businesses' new signals. A signal is
 * marked emailed (`emailedAt`) only once its manager's email has left, so a
 * failed send is tried again the next day. A business with no manager is
 * not emailed: its signals show in the admin attention list, and stay
 * un-emailed until it has one.
 *
 * It reschedules itself (ADR-007), one waiting run at a time under the
 * advisory lock `job-chain:admin.inactivity-sweep`, as the manager link
 * sweep does. A failed step is logged and the chain goes on; it throws only
 * when the next run cannot be enqueued, so the worker retries it.
 */
@Injectable()
export class InactivitySweepJob {
    private readonly logger = new Logger(InactivitySweepJob.name);

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const swept = await sweepInactivitySignals({ now });
            this.logger.log(
                `inactivity_sweep opened=${swept.opened} cleared=${swept.cleared}`,
            );
        } catch (error) {
            this.logger.error(
                `inactivity_sweep failed before it finished: ${errorName(error)}`,
            );
        }
        try {
            const mailed = await this.emailManagers(now);
            if (mailed.emails > 0 || mailed.failed > 0) {
                this.logger.log(
                    `inactivity_sweep emails=${mailed.emails} signals=${mailed.signals} failed=${mailed.failed}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `inactivity_sweep could not email managers: ${errorName(error)}`,
            );
        }
        const next = new Date(now.getTime() + INACTIVITY_SWEEP_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next inactivity sweep; retrying this one",
            );
        }
    };

    /**
     * One email per manager with new signals on their businesses. A manager
     * whose email fails is logged and the rest go on.
     */
    async emailManagers(
        now: Date,
    ): Promise<{ emails: number; signals: number; failed: number }> {
        const signals = await unemailedSignals();
        const counts = { emails: 0, signals: 0, failed: 0 };
        if (signals.length === 0) return counts;

        const orgIds = [...new Set(signals.map((s) => s.organizationId))];
        const [links, orgs] = await Promise.all([
            prisma.accountManagerLink.findMany({
                where: { endedAt: null, organizationId: { in: orgIds } },
                select: { organizationId: true, platformAdminId: true },
            }),
            prisma.organization.findMany({
                where: { id: { in: orgIds } },
                select: { id: true, name: true },
            }),
        ]);
        const managerOf = new Map(
            links.map((l) => [l.organizationId, l.platformAdminId]),
        );
        const nameOf = new Map(orgs.map((o) => [o.id, o.name]));
        const admins = await prisma.platformAdmin.findMany({
            where: { id: { in: [...new Set(managerOf.values())] } },
            select: { id: true, user: { select: { email: true, name: true } } },
        });

        // Manager → business → that business's signals; unmanaged are left out.
        interface Entry {
            ids: string[];
            business: ManagerSignalBusiness;
        }
        const byManager = new Map<string, Map<string, Entry>>();
        for (const signal of signals) {
            const managerId = managerOf.get(signal.organizationId);
            if (!managerId) continue;
            const businesses =
                byManager.get(managerId) ?? new Map<string, Entry>();
            byManager.set(managerId, businesses);
            const entry = businesses.get(signal.organizationId) ?? {
                ids: [],
                business: {
                    organizationId: signal.organizationId,
                    name: nameOf.get(signal.organizationId) ?? "A business",
                    signals: [],
                },
            };
            entry.ids.push(signal.id);
            entry.business.signals.push({
                kind: signal.kind,
                since: signal.since,
            });
            businesses.set(signal.organizationId, entry);
        }

        for (const admin of admins) {
            const businesses = [...(byManager.get(admin.id)?.values() ?? [])];
            if (businesses.length === 0) continue;
            try {
                const outcome = await sendManagerSignalsEmail(
                    { email: admin.user.email, name: admin.user.name },
                    businesses.map((b) => b.business),
                );
                if (outcome !== "sent") {
                    counts.failed += 1;
                    this.logger.warn(
                        `inactivity_sweep email ${outcome} for platformAdmin=${admin.id}`,
                    );
                    continue;
                }
                counts.emails += 1;
                counts.signals += await markEmailed(
                    businesses.flatMap((b) => b.ids),
                    now,
                );
            } catch (error) {
                counts.failed += 1;
                this.logger.error(
                    `inactivity_sweep could not email platformAdmin=${admin.id}: ${errorName(error)}`,
                );
            }
        }
        return counts;
    }

    /**
     * Leave one run waiting at `runAt`, unless one is waiting already.
     * Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: { type: INACTIVITY_SWEEP_TYPE, status: "PENDING" },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: { type: INACTIVITY_SWEEP_TYPE, payload: {}, runAt },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next inactivity sweep: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: INACTIVITY_SWEEP_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the inactivity sweep chain: ${errorName(error)}`,
            );
        }
    }
}

function errorName(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}

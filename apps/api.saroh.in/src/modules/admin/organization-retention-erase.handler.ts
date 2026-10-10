import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { keepJobLease } from "../jobs/job-lease";
import { MediaService } from "../media/media.service";
import { NOT_ON_LEGAL_HOLD, onLegalHold } from "../organizations/legal-hold";
import { OrganizationLifecycleStatus } from "../organizations/organization-lifecycle.policy";
import {
    retentionAfterDeletionDays,
    retentionCutoff,
} from "../organizations/retention";
import { refundsOutstanding } from "../payments/refunds-outstanding";
import { AdminAuditOutcome, createAdminAuditData } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";
import type { EraseStep } from "./retention-erase-plan";
import { ERASE_STEPS } from "./retention-erase-plan";
import {
    contactsToErase,
    eraseAnalyticsEvents,
    eraseContact,
    eraseRecords,
    EraseStoppedError,
    eraseStoreCustomers,
    eraseWaitlist,
    RETENTION_ERASE_ACTOR,
} from "./retention-erase-writes";

/** The daily job that erases a deleted business once its retention ends. */
export const ORGANIZATION_RETENTION_ERASE_TYPE = "organization.retention.erase";

/** Once a day: retention is counted in days. */
export const RETENTION_ERASE_EVERY_MS = 24 * 60 * 60 * 1000;

/** With more left to erase, the next run comes this soon, not a day later. */
export const RETENTION_ERASE_BACKLOG_MS = 60 * 1000;

/**
 * The admin ledger's row for each run on a business: every step's result
 * and the counts, for the console's deletion trail.
 */
export const ORGANIZATION_RETENTION_ERASE_ACTION =
    "organization.retention.erase";

/** The business's own history, once, when the erase finished. */
export const ORGANIZATION_RETENTION_ERASED_ACTION =
    "organization.retention.erased";

/** Businesses listed per run. */
const BUSINESSES = 20;
/** Contacts erased per business per run; the rest wait for the next. */
export const ERASE_CONTACTS_PER_RUN = 1000;
const CONTACT_BATCH = 100;
const CUSTOMER_BATCH = 200;
/** Store customers and analytics batches per business per run. */
const BATCHES_PER_RUN = 25;
const ANALYTICS_BATCH = 1000;

export interface EraseResult {
    /**
     * `erased`: every step done and the business stamped.
     * `more`: a cap was reached; the next run goes on.
     * `failed`: a step failed; the next run tries again.
     * `held`: on legal hold; nothing (more) was erased.
     * `waiting`: customers are still owed refunds.
     * `passed`: not due, not deleted, or already erased.
     */
    outcome: "erased" | "more" | "failed" | "held" | "waiting" | "passed";
    counts: Record<string, number>;
    failed: EraseStep[];
}

export interface EraseSweep {
    erased: string[];
    more: string[];
    failed: string[];
    held: number;
    waiting: string[];
    passed: number;
    /** A cap was reached, or a full page listed: come back soon. */
    again: boolean;
}

/**
 * Erases a deleted business's files and personal data when its retention
 * ends (DEC-122, owner 10 Oct). The Privacy Policy: "Access ends at once.
 * We keep the account's data for 180 days, as Indian law requires, then
 * remove it from live systems."
 *
 * The deletion sweep stamps `deletedRetainedAt` when a business's window
 * ends, and its clean-up shuts access off that day (billing, site,
 * hostnames, members, jobs, keys). This runs
 * {@link retentionAfterDeletionDays} (180) days after that stamp and, per
 * business, takes the steps of `retention-erase-plan.ts` in order: files,
 * waitlist, every contact by the privacy removal's own rules, the store
 * customers no contact reached, the business-wide pass (orders' recipients
 * and walk-ins, bookers, messages, reviews, the CRM, the team's notices,
 * invitations and diary names) and the detailed analytics events. Then it
 * stamps `retentionErasedAt`, in one transaction with the admin ledger and
 * the business's history.
 *
 * **Never invoices, credit notes or orders' tax facts** (ADR-008, eight
 * years), payments, refunds, or either audit trail: `RETENTION_KEPT` lists
 * what stays and why.
 *
 * **Refused under legal hold** (`organizations/legal-hold.ts`): a held
 * business is never listed, is checked again before it starts, and every
 * write checks under the business's row lock (`inEraseTx`), so a hold
 * placed mid-run stops it within one small transaction. The files ask
 * before every batch.
 *
 * **Not while a customer is owed a refund**: the clean-up keeps the
 * payment keys until refunds settle, and the erase waits with it.
 *
 * Idempotent and resumable: a step that fails is logged by name, the
 * business is not stamped, and the next run starts again (what is already
 * gone is not found). A run does at most {@link ERASE_CONTACTS_PER_RUN}
 * contacts for one business and comes back in a minute for the rest. Every
 * run on a business is one `organization.retention.erase` ledger row with
 * each step's result; the log carries counts and ids only.
 *
 * A self-rescheduling daily chain like the deletion sweep (ADR-007): one
 * PENDING run at a time (`Job_one_pending_organization_retention_erase`),
 * and the run throws only when the next one cannot be enqueued.
 */
@Injectable()
export class OrganizationRetentionEraseHandler {
    private readonly logger = new Logger(
        OrganizationRetentionEraseHandler.name,
    );

    constructor(private readonly media: MediaService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const stopLease = keepJobLease(job);
        let more = false;
        try {
            const result = await this.sweep(new Date());
            more = result.again;
            if (
                result.erased.length > 0 ||
                result.more.length > 0 ||
                result.failed.length > 0 ||
                result.waiting.length > 0 ||
                result.held > 0
            ) {
                this.logger.log(
                    `organization_retention_erase erased=${result.erased.length} more=${result.more.length} failed=${result.failed.length} waiting=${result.waiting.length} held=${result.held} passed=${result.passed} ids=${result.erased.join(",")} failed_ids=${result.failed.join(",")}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `organization_retention_erase sweep failed before it finished: ${errorName(error)}`,
            );
        } finally {
            stopLease();
        }
        const wait = more
            ? RETENTION_ERASE_BACKLOG_MS
            : RETENTION_ERASE_EVERY_MS;
        if (!(await this.schedule(new Date(Date.now() + wait)))) {
            throw new Error(
                "Could not schedule the next retention erase; retrying this one",
            );
        }
    };

    /** Erase every deleted business whose retention ended by `now`. */
    async sweep(
        now: Date,
        days: number = retentionAfterDeletionDays(),
    ): Promise<EraseSweep> {
        const result: EraseSweep = {
            erased: [],
            more: [],
            failed: [],
            held: 0,
            waiting: [],
            passed: 0,
            again: false,
        };
        const cutoff = retentionCutoff(now, days);
        const due = {
            lifecycleStatus: OrganizationLifecycleStatus.DeletedRetained,
            deletedRetainedAt: { not: null, lte: cutoff },
            retentionErasedAt: null,
        };
        // Counted for the log only: a held business is never listed below.
        result.held = await prisma.organization.count({
            where: { ...due, legalHoldAt: { not: null } },
        });
        const organizations = await prisma.organization.findMany({
            where: { ...due, ...NOT_ON_LEGAL_HOLD },
            select: { id: true },
            orderBy: [{ deletedRetainedAt: "asc" }, { id: "asc" }],
            take: BUSINESSES,
        });
        for (const { id } of organizations) {
            try {
                const one = await this.eraseOne(id, now, days);
                if (one.outcome === "erased") result.erased.push(id);
                else if (one.outcome === "more") result.more.push(id);
                else if (one.outcome === "failed") result.failed.push(id);
                else if (one.outcome === "waiting") result.waiting.push(id);
                else if (one.outcome === "held") result.held += 1;
                else result.passed += 1;
            } catch (error) {
                result.failed.push(id);
                this.logger.error(
                    `organization_retention_erase_failed org=${id} error=${errorName(error)}`,
                );
            }
        }
        // A business with more to erase, or a full page with something
        // done (so the next read differs), brings the next run sooner.
        result.again =
            result.more.length > 0 ||
            (organizations.length === BUSINESSES && result.erased.length > 0);
        return result;
    }

    /** Every step for one business. Exposed for the specs. */
    async eraseOne(
        organizationId: string,
        now: Date,
        days: number = retentionAfterDeletionDays(),
    ): Promise<EraseResult> {
        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                lifecycleStatus: true,
                deletedRetainedAt: true,
                retentionErasedAt: true,
                legalHoldAt: true,
            },
        });
        if (
            organization?.lifecycleStatus !==
                OrganizationLifecycleStatus.DeletedRetained ||
            !organization.deletedRetainedAt ||
            organization.retentionErasedAt ||
            organization.deletedRetainedAt.getTime() >
                retentionCutoff(now, days).getTime()
        ) {
            return { outcome: "passed", counts: {}, failed: [] };
        }
        if (organization.legalHoldAt) {
            this.logger.warn(
                `organization_retention_erase_held org=${organizationId} reason=legal-hold`,
            );
            return { outcome: "held", counts: {}, failed: [] };
        }
        const owed = await refundsOutstanding(prisma, organizationId);
        if (owed.count > 0) {
            this.logger.warn(
                `organization_retention_erase_waiting org=${organizationId} refunds=${owed.count}`,
            );
            return { outcome: "waiting", counts: {}, failed: [] };
        }

        const counts: Record<string, number> = {};
        const failed: EraseStep[] = [];
        // Written inside `step`: an object, so the reads below see it.
        const state = { held: false, more: false };
        const step = async (
            name: EraseStep,
            work: () => Promise<{
                counts: Record<string, number>;
                more?: boolean;
            }>,
        ) => {
            if (state.held) return;
            try {
                const done = await work();
                Object.assign(counts, done.counts);
                if (done.more) state.more = true;
            } catch (error) {
                if (
                    error instanceof EraseStoppedError &&
                    error.why === "legal-hold"
                ) {
                    state.held = true;
                    this.logger.warn(
                        `organization_retention_erase_held org=${organizationId} step=${name} reason=legal-hold`,
                    );
                    return;
                }
                failed.push(name);
                this.logger.error(
                    `organization_retention_erase_step_failed org=${organizationId} step=${name} error=${errorName(error)}`,
                );
            }
        };

        await step("media", async () => {
            const removed = await this.media.removeAllForDeletedBusiness(
                organizationId,
                async () => !(await onLegalHold(prisma, organizationId)),
            );
            if (removed.stopped) throw new EraseStoppedError("legal-hold");
            return { counts: { mediaRemoved: removed.removed } };
        });
        await step("waitlist", async () => ({
            counts: { waitlistEntries: await eraseWaitlist(organizationId) },
        }));
        await step("contacts", () => this.eraseContacts(organizationId, now));
        await step("customers", async () => {
            let total = 0;
            for (let batch = 0; batch < BATCHES_PER_RUN; batch++) {
                const done = await eraseStoreCustomers(
                    organizationId,
                    CUSTOMER_BATCH,
                );
                total += done;
                if (done < CUSTOMER_BATCH) {
                    return { counts: { storeCustomers: total } };
                }
            }
            return { counts: { storeCustomers: total }, more: true };
        });
        await step("records", async () => ({
            counts: { ...(await eraseRecords(organizationId, now)) },
        }));
        await step("analytics", async () => {
            let total = 0;
            for (let batch = 0; batch < BATCHES_PER_RUN; batch++) {
                const done = await eraseAnalyticsEvents(
                    organizationId,
                    ANALYTICS_BATCH,
                );
                total += done;
                if (done < ANALYTICS_BATCH) {
                    return { counts: { analyticsEvents: total } };
                }
            }
            return { counts: { analyticsEvents: total }, more: true };
        });

        const line = Object.entries(counts)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ");
        this.logger.log(
            `organization_retention_erase_one org=${organizationId} ${line} failed=${failed.join(",") || "none"} held=${state.held} more=${state.more}`,
        );

        let outcome: EraseResult["outcome"] = state.held
            ? "held"
            : failed.length > 0
              ? "failed"
              : state.more
                ? "more"
                : "erased";
        if (outcome === "erased") {
            // Nothing stamped: a hold landed, or another run stamped it.
            outcome = (await this.stamp(organizationId, now, counts, days))
                ? "erased"
                : "passed";
        } else {
            await this.recordRun(organizationId, now, counts, failed, outcome);
        }
        return { outcome, counts, failed };
    }

    /**
     * Each contact in its own transaction, at most
     * {@link ERASE_CONTACTS_PER_RUN} a run. One that fails is logged, kept
     * out of the next read so it can't starve the rest, and fails the step.
     */
    private async eraseContacts(
        organizationId: string,
        now: Date,
    ): Promise<{ counts: Record<string, number>; more?: boolean }> {
        const failedIds: string[] = [];
        let erased = 0;
        while (erased + failedIds.length < ERASE_CONTACTS_PER_RUN) {
            const batch = await contactsToErase(
                organizationId,
                failedIds,
                CONTACT_BATCH,
            );
            if (batch.length === 0) break;
            for (const contactId of batch) {
                try {
                    if (await eraseContact(organizationId, contactId, now)) {
                        erased += 1;
                    }
                } catch (error) {
                    if (error instanceof EraseStoppedError) throw error;
                    failedIds.push(contactId);
                    this.logger.error(
                        `organization_retention_erase_contact_failed org=${organizationId} contact=${contactId} error=${errorName(error)}`,
                    );
                }
            }
            if (batch.length < CONTACT_BATCH) break;
        }
        if (failedIds.length > 0) {
            throw new Error(
                `contacts_erase_incomplete erased=${erased} failed=${failedIds.length}`,
            );
        }
        const left = await contactsToErase(organizationId, [], 1);
        return { counts: { contacts: erased }, more: left.length > 0 };
    }

    /**
     * Mark the business erased, with the admin ledger and its own history,
     * in one transaction — fenced on the hold and on the stamp, so a hold
     * placed at the last moment wins and a second run writes nothing. False
     * when the fenced write matched nothing.
     */
    private async stamp(
        organizationId: string,
        now: Date,
        counts: Record<string, number>,
        days: number,
    ): Promise<boolean> {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.organization.updateMany({
                where: {
                    id: organizationId,
                    lifecycleStatus:
                        OrganizationLifecycleStatus.DeletedRetained,
                    retentionErasedAt: null,
                    ...NOT_ON_LEGAL_HOLD,
                },
                data: { retentionErasedAt: now },
            });
            if (updated.count === 0) return false;
            await tx.adminAuditEvent.create({
                data: createAdminAuditData({
                    actorUserId: RETENTION_ERASE_ACTOR,
                    permission: AdminPermission.OrganizationLifecycleWrite,
                    action: ORGANIZATION_RETENTION_ERASE_ACTION,
                    targetType: "organization",
                    targetId: organizationId,
                    organizationId,
                    reason: `Its files and personal data were erased, ${days} days after it was deleted`,
                    outcome: AdminAuditOutcome.Success,
                    idempotencyKey: `organization-retention-erased:${organizationId}`,
                    metadata: {
                        steps: ERASE_STEPS.map((name) => ({
                            step: name,
                            result: "ok",
                        })),
                        counts,
                        retentionDays: days,
                    },
                }),
            });
            await tx.auditEvent.create({
                data: {
                    action: ORGANIZATION_RETENTION_ERASED_ACTION,
                    actorUserId: RETENTION_ERASE_ACTOR,
                    organizationId,
                    targetType: "organization",
                    targetId: organizationId,
                    outcome: "SUCCESS",
                    metadata: { byOperator: true, retentionDays: days },
                },
            });
            return true;
        });
    }

    /**
     * A run that didn't finish, on the admin ledger: once a day per
     * business and outcome (the key names both), so a backlog worked off
     * minute by minute doesn't fill the trail. Never fails the erase.
     */
    private async recordRun(
        organizationId: string,
        now: Date,
        counts: Record<string, number>,
        failed: EraseStep[],
        outcome: EraseResult["outcome"],
    ): Promise<void> {
        try {
            await prisma.adminAuditEvent.create({
                data: createAdminAuditData({
                    actorUserId: RETENTION_ERASE_ACTOR,
                    permission: AdminPermission.OrganizationLifecycleWrite,
                    action: ORGANIZATION_RETENTION_ERASE_ACTION,
                    targetType: "organization",
                    targetId: organizationId,
                    organizationId,
                    reason:
                        outcome === "held"
                            ? "On legal hold: the erase stopped"
                            : outcome === "more"
                              ? "The erase is under way; the next run goes on"
                              : "The erase didn't finish; it is tried again",
                    outcome: AdminAuditOutcome.Failure,
                    idempotencyKey: `organization-retention-erase:${organizationId}:${outcome}:${now.toISOString().slice(0, 10)}`,
                    metadata: {
                        steps: ERASE_STEPS.map((name) => ({
                            step: name,
                            result: failed.includes(name) ? "failed" : "ok",
                        })),
                        counts,
                        state: outcome,
                        ...(outcome === "held" ? { legalHold: true } : {}),
                    },
                }),
            });
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return;
            this.logger.error(
                `organization_retention_erase_not_recorded org=${organizationId} error=${errorName(error)}`,
            );
        }
    }

    /**
     * Enqueue the next run unless one is already waiting (P2002 = already
     * scheduled). Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: {
                    type: ORGANIZATION_RETENTION_ERASE_TYPE,
                    payload: {},
                    runAt,
                },
            });
            return true;
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return true;
            this.logger.error(
                `Could not schedule the next retention erase: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Start the chain again when nothing is waiting or running. */
    async ensureScheduled(): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: ORGANIZATION_RETENTION_ERASE_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(new Date());
        } catch (error) {
            this.logger.error(
                `Could not check the retention erase chain: ${errorName(error)}`,
            );
        }
    }
}

/** An error's class and code only: a message could carry a business's data. */
function errorName(error: unknown): string {
    if (error instanceof Error) {
        const code = prismaErrorCode(error);
        return code ? `${error.name}:${code}` : error.name;
    }
    return "unknown";
}

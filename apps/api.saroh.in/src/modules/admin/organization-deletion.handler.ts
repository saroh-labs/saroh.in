import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { OutstandingRefund } from "../payments/refunds-outstanding";
import { refundsOutstanding } from "../payments/refunds-outstanding";
import {
    assertOrganizationLifecycleTransition,
    OrganizationLifecycleStatus,
} from "./admin-access.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";
import {
    enqueueDeletionCleanup,
    ORGANIZATION_DELETION_CLEANUP_TYPE,
} from "./organization-deletion-cleanup.handler";

/** The daily sweep that deletes a business whose deletion window ended (#907). */
export const ORGANIZATION_DELETION_TYPE = "organization.deletion";

/** Once a day: a window is counted in days (7 to 90, `DELETION_WINDOW`). */
export const ORGANIZATION_DELETION_EVERY_MS = 24 * 60 * 60 * 1000;

/** Who the ledgers say did it: the runner, never a person. */
export const ORGANIZATION_DELETION_ACTOR = "system:organization-deletion";

/** What the admin ledger and the business's own history record. */
export const ORGANIZATION_DELETED_ACTION = "organization.deleted";

/**
 * The admin ledger's row for a run that found a business past its window
 * with refunds still owed to its customers (#921), one a day while it
 * waits. The console flags the business from it ("Deletion waiting on
 * refunds") and shows it on the deletion trail.
 */
export const ORGANIZATION_DELETION_WAITING_ACTION =
    "organization.deletion.waiting_on_refunds";

/** The most refunds one waiting row names; its count says the rest. */
const WAITING_REFS = 50;

const BATCH = 50;

export interface DeletionSweep {
    deleted: string[];
    /** Past their window and left PENDING_DELETION: refunds are owed (#921). */
    waiting: string[];
    /** Due when listed, but no longer due or no longer scheduled when re-read. */
    passed: number;
    failed: number;
}

/**
 * Deletes a business when its `PENDING_DELETION` window ends (#907; DEC-021
 * left it a manual step). An operator schedules deletion with a retention
 * window (`AdminLifecycleService.scheduleDeletion`, 7–90 days); until it
 * ends the business can be reinstated. When it ends, this takes the
 * lifecycle's own last step: `PENDING_DELETION` → `DELETED_RETAINED`,
 * stamping `deletedRetainedAt`, and queues the business's clean-up.
 *
 * Its rows are never deleted: `Store`, `Order`, `Customer`, `Cart` and
 * `Inventory` hold the business without a cascade, and orders, invoices,
 * credit notes, customers and the audit trails are records (ADR-008, GST).
 * What "deleted" means everywhere else is the lifecycle table
 * (`organization-lifecycle.policy.ts`, #921): billed for nothing, its site
 * offline, closed to its members. What it leaves behind — its Saroh
 * subscription at the provider, custom hostnames, media, payment keys and
 * pending jobs — is cleared by `organization.deletion.cleanup`, queued on
 * the same transaction (`organization-deletion-cleanup.handler.ts`).
 *
 * Conservative by construction: it lists only businesses still
 * `PENDING_DELETION` whose `deletionScheduledAt` has passed, then re-checks
 * both inside the transaction that writes, fenced on `lifecycleVersion` —
 * a reinstate (or a moved window) between the list and the write wins, and
 * the business is left alone. A business inside its window is never
 * touched. Every deletion is written to the admin ledger and to the
 * business's own history in that transaction; the log carries counts and
 * ids only.
 *
 * **Refunds owed hold it back** (owner, 9 Oct): a business that still owes
 * its customers a refund — owed, being sent, or sent and unconfirmed by its
 * provider (`payments/refunds-outstanding.ts`) — is not deleted. It stays
 * `PENDING_DELETION` past its window, its payment keys kept so the refunds
 * can settle, its members see the list in the workspace, and the admin
 * ledger notes it once a day (`organization.deletion.waiting_on_refunds`),
 * which flags it "Deletion waiting on refunds" on the console. Each daily
 * run asks again.
 *
 * A self-rescheduling daily chain like the waitlist's retention sweep
 * (ADR-007): one PENDING run at a time (`Job_one_pending_organization_deletion`),
 * a failing business is logged and skipped, and the run throws only when
 * the next one cannot be enqueued.
 */
@Injectable()
export class OrganizationDeletionHandler {
    private readonly logger = new Logger(OrganizationDeletionHandler.name);

    constructor(private readonly audit: AdminAuditService) {}

    readonly handle = async (_job: Job): Promise<void> => {
        try {
            const result = await this.sweep(new Date());
            if (
                result.deleted.length > 0 ||
                result.waiting.length > 0 ||
                result.failed > 0
            ) {
                this.logger.log(
                    `organization_deletion deleted=${result.deleted.length} waiting=${result.waiting.length} passed=${result.passed} failed=${result.failed} ids=${result.deleted.join(",")} waiting_ids=${result.waiting.join(",")}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `organization_deletion sweep failed before it finished: ${errorName(error)}`,
            );
        }
        try {
            const queued = await this.queueMissingCleanups();
            if (queued > 0) {
                this.logger.log(
                    `organization_deletion_cleanups_queued count=${queued}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `organization_deletion could not queue clean-ups: ${errorName(error)}`,
            );
        }
        const next = new Date(Date.now() + ORGANIZATION_DELETION_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next organization deletion sweep; retrying this one",
            );
        }
    };

    /** Delete every business whose window ended by `now`. */
    async sweep(now: Date): Promise<DeletionSweep> {
        const result: DeletionSweep = {
            deleted: [],
            waiting: [],
            passed: 0,
            failed: 0,
        };
        // Never fetch an id twice, so one that always fails can't starve the rest.
        const tried: string[] = [];
        for (;;) {
            const due = await prisma.organization.findMany({
                where: {
                    lifecycleStatus:
                        OrganizationLifecycleStatus.PendingDeletion,
                    deletionScheduledAt: { not: null, lte: now },
                    ...(tried.length > 0 ? { id: { notIn: tried } } : {}),
                },
                select: { id: true },
                orderBy: [{ deletionScheduledAt: "asc" }, { id: "asc" }],
                take: BATCH,
            });
            if (due.length === 0) return result;
            for (const { id } of due) {
                tried.push(id);
                try {
                    const outcome = await this.deleteOne(id, now);
                    if (outcome === true) {
                        result.deleted.push(id);
                    } else if (outcome === false) {
                        result.passed += 1;
                    } else {
                        result.waiting.push(id);
                        await this.recordWaiting(id, now, outcome.refunds);
                    }
                } catch (error) {
                    result.failed += 1;
                    this.logger.error(
                        `organization_deletion_failed org=${id} error=${errorName(error)}`,
                    );
                }
            }
            if (due.length < BATCH) return result;
        }
    }

    /**
     * Take one business to `DELETED_RETAINED` if, read again inside the
     * transaction, it is still `PENDING_DELETION`, its window has ended and
     * it owes its customers no refund (#921, owner 9 Oct). True when it was
     * deleted; false when it was left alone; `{ refunds }` when a refund is
     * still owed, being sent or unconfirmed by its provider
     * (`refundsOutstanding`) — it stays `PENDING_DELETION` past its window,
     * its clean-up unqueued and its payment keys kept, and the next daily
     * run asks again.
     */
    async deleteOne(
        organizationId: string,
        now: Date,
    ): Promise<boolean | { refunds: OutstandingRefund[] }> {
        return prisma.$transaction(async (tx) => {
            const organization = await tx.organization.findUnique({
                where: { id: organizationId },
                select: {
                    id: true,
                    lifecycleStatus: true,
                    lifecycleVersion: true,
                    deletionScheduledAt: true,
                    deletionScheduledBy: true,
                },
            });
            if (
                organization?.lifecycleStatus !==
                    OrganizationLifecycleStatus.PendingDeletion ||
                !organization.deletionScheduledAt ||
                organization.deletionScheduledAt.getTime() > now.getTime()
            ) {
                return false;
            }
            // Read in the transaction that would delete it. The business
            // takes no new activity, so only a provider's webhook adds one.
            const owed = await refundsOutstanding(tx, organization.id);
            if (owed.count > 0) return { refunds: owed.rows };

            assertOrganizationLifecycleTransition(
                OrganizationLifecycleStatus.PendingDeletion,
                OrganizationLifecycleStatus.DeletedRetained,
            );

            // Every condition again in the write, on the version just read:
            // a reinstate or a new window committed since matches nothing.
            const updated = await tx.organization.updateMany({
                where: {
                    id: organization.id,
                    lifecycleStatus:
                        OrganizationLifecycleStatus.PendingDeletion,
                    lifecycleVersion: organization.lifecycleVersion,
                    deletionScheduledAt: { not: null, lte: now },
                },
                data: {
                    lifecycleStatus:
                        OrganizationLifecycleStatus.DeletedRetained,
                    deletedRetainedAt: now,
                    lifecycleVersion: { increment: 1 },
                },
            });
            if (updated.count === 0) return false;

            const metadata = {
                from: OrganizationLifecycleStatus.PendingDeletion,
                to: OrganizationLifecycleStatus.DeletedRetained,
                deletionScheduledAt:
                    organization.deletionScheduledAt.toISOString(),
                scheduledBy: organization.deletionScheduledBy,
            };
            await this.audit.write(tx, {
                actorUserId: ORGANIZATION_DELETION_ACTOR,
                permission: AdminPermission.OrganizationLifecycleWrite,
                action: ORGANIZATION_DELETED_ACTION,
                targetType: "organization",
                targetId: organization.id,
                organizationId: organization.id,
                reason: "Its deletion window ended",
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: `organization-deletion:${organization.id}`,
                metadata,
            });
            // The business's own history, as the operator's lifecycle steps are.
            await tx.auditEvent.create({
                data: {
                    action: ORGANIZATION_DELETED_ACTION,
                    actorUserId: ORGANIZATION_DELETION_ACTOR,
                    organizationId: organization.id,
                    targetType: "organization",
                    targetId: organization.id,
                    outcome: "SUCCESS",
                    metadata: {
                        from: metadata.from,
                        to: metadata.to,
                        byOperator: true,
                    },
                },
            });
            // What it leaves behind is cleared next (#921), queued with the
            // change so a deleted business always has its clean-up.
            await enqueueDeletionCleanup(tx, organization.id);
            return true;
        });
    }

    /**
     * Note on the admin ledger that this business waits on refunds (#921):
     * once a day (the key names the day), with what is owed — the count,
     * the amounts by currency, and each refund's stage, order or invoice
     * number, provider and provider reference. No customer: the console
     * reads names live, for an operator allowed to see them. A failed write
     * is logged; the next run writes it.
     */
    async recordWaiting(
        organizationId: string,
        now: Date,
        refunds: OutstandingRefund[],
    ): Promise<void> {
        const owed: Record<string, number> = {};
        for (const r of refunds) {
            if (r.currency && r.amountCents !== null) {
                owed[r.currency] = (owed[r.currency] ?? 0) + r.amountCents;
            }
        }
        this.logger.warn(
            `organization_deletion_waiting_on_refunds org=${organizationId} count=${refunds.length}`,
        );
        try {
            await this.audit.write(prisma, {
                actorUserId: ORGANIZATION_DELETION_ACTOR,
                permission: AdminPermission.OrganizationLifecycleWrite,
                action: ORGANIZATION_DELETION_WAITING_ACTION,
                targetType: "organization",
                targetId: organizationId,
                organizationId,
                reason: "Refunds to its customers are still owed",
                outcome: AdminAuditOutcome.Failure,
                idempotencyKey: `organization-deletion-waiting:${organizationId}:${now.toISOString().slice(0, 10)}`,
                metadata: {
                    count: refunds.length,
                    owedMinorByCurrency: owed,
                    refunds: refunds.slice(0, WAITING_REFS).map((r) => ({
                        stage: r.stage,
                        paper: r.paper?.label ?? null,
                        amountMinor: r.amountCents,
                        currency: r.currency,
                        provider: r.provider,
                        providerRef: r.providerRef,
                    })),
                },
            });
        } catch (error) {
            // Already noted today: a second run the same day.
            if (prismaErrorCode(error) === "P2002") return;
            this.logger.error(
                `organization_deletion_waiting_not_recorded org=${organizationId} error=${errorName(error)}`,
            );
        }
    }

    /**
     * A deleted business without a clean-up job gets one (#921): one deleted
     * before the clean-up existed. Idempotent: any clean-up row, whatever
     * its state, counts. Returns how many were queued.
     */
    async queueMissingCleanups(): Promise<number> {
        const missing = await prisma.organization.findMany({
            where: {
                lifecycleStatus: OrganizationLifecycleStatus.DeletedRetained,
                jobs: { none: { type: ORGANIZATION_DELETION_CLEANUP_TYPE } },
            },
            select: { id: true },
            take: BATCH,
        });
        for (const { id } of missing) {
            await enqueueDeletionCleanup(prisma, id);
        }
        return missing.length;
    }

    /**
     * Enqueue the next run unless one is already waiting (P2002 = already
     * scheduled). Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: { type: ORGANIZATION_DELETION_TYPE, payload: {}, runAt },
            });
            return true;
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return true;
            this.logger.error(
                `Could not schedule the next organization deletion sweep: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Start the chain again when nothing is waiting or running. */
    async ensureScheduled(): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: ORGANIZATION_DELETION_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(new Date());
        } catch (error) {
            this.logger.error(
                `Could not check the organization deletion chain: ${errorName(error)}`,
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

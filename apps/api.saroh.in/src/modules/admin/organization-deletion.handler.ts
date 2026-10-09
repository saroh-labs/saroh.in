import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import {
    assertOrganizationLifecycleTransition,
    OrganizationLifecycleStatus,
} from "./admin-access.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

/** The daily sweep that deletes a business whose deletion window ended (#907). */
export const ORGANIZATION_DELETION_TYPE = "organization.deletion";

/** Once a day: a window is counted in days (7 to 90, `DELETION_WINDOW`). */
export const ORGANIZATION_DELETION_EVERY_MS = 24 * 60 * 60 * 1000;

/** Who the ledgers say did it: the runner, never a person. */
export const ORGANIZATION_DELETION_ACTOR = "system:organization-deletion";

/** What the admin ledger and the business's own history record. */
export const ORGANIZATION_DELETED_ACTION = "organization.deleted";

const BATCH = 50;

export interface DeletionSweep {
    deleted: string[];
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
 * stamping `deletedRetainedAt`.
 *
 * That is all it does, on purpose. There is no complete, safe way to remove
 * a business's rows today: `Store`, `Order`, `Customer`, `Cart` and
 * `Inventory` hold the business without a cascade (a delete is refused), an
 * issued invoice is never deleted (ADR-008), and media in storage, its
 * custom hostnames at Cloudflare and its billing-provider subscription have
 * no clean-up path. Those are listed as gaps in #907, not guessed at here.
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
            if (result.deleted.length > 0 || result.failed > 0) {
                this.logger.log(
                    `organization_deletion deleted=${result.deleted.length} passed=${result.passed} failed=${result.failed} ids=${result.deleted.join(",")}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `organization_deletion sweep failed before it finished: ${errorName(error)}`,
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
        const result: DeletionSweep = { deleted: [], passed: 0, failed: 0 };
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
                    if (await this.deleteOne(id, now)) {
                        result.deleted.push(id);
                    } else {
                        result.passed += 1;
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
     * transaction, it is still `PENDING_DELETION` and its window has ended.
     * True when it was deleted; false when it was left alone.
     */
    async deleteOne(organizationId: string, now: Date): Promise<boolean> {
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
            return true;
        });
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

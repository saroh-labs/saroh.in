import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { DeletedBusinessBilling } from "../billing/business-closing";
import { BILLING_PROVIDER_CANCEL_TYPE } from "../billing/provider-cancel.job";
import { DATA_EXPORT_EXPIRE_TYPE } from "../data-export/data-export-types";
import { DomainsService } from "../domains/domains.service";
import { logDeletionProviderCall } from "../organizations/deletion-provider-log";
import {
    NOT_ON_LEGAL_HOLD,
    onLegalHold,
    onLegalHoldLocked,
} from "../organizations/legal-hold";
import { OrganizationLifecycleStatus } from "../organizations/organization-lifecycle.policy";
import { activeMandatesByProvider } from "../payments/provider-memberships";
import { refundsOutstanding } from "../payments/refunds-outstanding";
import { SEND_REFUND_TYPE } from "../payments/send-refund-type";
import { SUBSCRIPTION_CHARGE_TYPE } from "../subscriptions/charge-job";
import { AdminAuditOutcome, createAdminAuditData } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";
import { JOB_CANCELLED } from "./job-cancel";

/** Who the ledger says ran the clean-up: the deletion runner. */
const CLEANUP_ACTOR = "system:organization-deletion";

/**
 * The admin ledger's row for each clean-up run (#921): which steps worked,
 * with their counts, so the console's deletion trail shows an operator how
 * far it got and when.
 */
export const ORGANIZATION_DELETION_CLEANUP_ACTION =
    "organization.deletion.cleanup";

/**
 * A deleted business's access is shut off (owner, 9 Oct, #921; 10 Oct,
 * DEC-119): the step after the deletion sweep marks it `DELETED_RETAINED`,
 * queued on the same transaction (the outbox), one job per business.
 */
export const ORGANIZATION_DELETION_CLEANUP_TYPE =
    "organization.deletion.cleanup";

/**
 * More tries than the default five, which back off over about half a
 * minute: a provider or storage outage lasts longer, and every step is safe
 * to run again. These span about an hour and a half (the backoff caps at
 * five minutes). The business is flagged on the admin console
 * (`DELETION_CLEANUP`) from its first failure until the clean-up is done;
 * once FAILED, an operator retries it from Jobs.
 */
export const ORGANIZATION_DELETION_CLEANUP_ATTEMPTS = 24;

/**
 * Job types the clean-up leaves to run: itself, Saroh's own provider
 * cancels (they end a subscription that must stop charging), and an
 * autopay step, which stands aside on its own for a business that may not
 * be charged (`SubscriptionChargeHandler.stillCharging`) and, cancelled
 * mid-chain, would leave its charge reading as in progress. And a refund
 * on its way to a customer (`payments.send-refund`, owner 9 Oct): it is
 * the customer's money, never called off.
 */
export const CLEANUP_KEEPS_JOB_TYPES: readonly string[] = [
    ORGANIZATION_DELETION_CLEANUP_TYPE,
    BILLING_PROVIDER_CANCEL_TYPE,
    SUBSCRIPTION_CHARGE_TYPE,
    SEND_REFUND_TYPE,
    // A data export's zip is deleted on its day whatever became of the
    // business (DEC-117): called off, the file would never go.
    DATA_EXPORT_EXPIRE_TYPE,
];

/**
 * A clean-up that has failed at least once and isn't done: retrying, or
 * FAILED for good. The admin directory flags its business
 * (`DELETION_CLEANUP`) so a half-cleared business is never silent; the
 * Jobs screen shows which steps (`lastError`) and retries it.
 */
export const UNFINISHED_CLEANUP_JOB = {
    type: ORGANIZATION_DELETION_CLEANUP_TYPE,
    OR: [
        { status: "FAILED" },
        { status: { in: ["PENDING", "PROCESSING"] }, attempts: { gt: 0 } },
    ],
} satisfies Prisma.JobWhereInput;

export type CleanupStep =
    "jobs" | "billing" | "domains" | "memberships" | "keys";

/**
 * Every step, in the order a run takes them. There is no `media` step
 * since DEC-119: a deleted business's files are kept with its data for 180
 * days and erased by `organization.retention.erase`.
 */
export const CLEANUP_STEPS: readonly CleanupStep[] = [
    "jobs",
    "billing",
    "domains",
    "memberships",
    "keys",
];

/**
 * The steps that remove something of the business's: none of them runs
 * while it is on legal hold (DEC-119).
 */
export const CLEANUP_DESTRUCTIVE_STEPS: readonly CleanupStep[] = [
    "jobs",
    "domains",
    "keys",
];

/** What the ledger says of a run that stood aside for a legal hold. */
export const CLEANUP_HELD_REASON =
    "On legal hold: nothing was removed. The clean-up runs again when the hold is lifted";

/**
 * Keys are kept while a customer is still owed a refund (owner, 9 Oct):
 * the refund settles through them. The sweep doesn't delete a business
 * that owes one, so this is the second lock, for one a webhook raised
 * after.
 */
export class RefundsStillOwedError extends Error {
    constructor(readonly count: number) {
        super(`${count} refunds are still owed to customers`);
        this.name = "RefundsStillOwedError";
    }
}

export interface CleanupResult {
    /**
     * False when the business wasn't `DELETED_RETAINED`, or was on legal
     * hold when the run started (nothing done).
     */
    ran: boolean;
    counts: Record<string, number>;
    failed: CleanupStep[];
    /** Steps not taken because the business is on legal hold (DEC-119). */
    held: CleanupStep[];
}

export async function enqueueDeletionCleanup(
    tx: Pick<Prisma.TransactionClient, "job">,
    organizationId: string,
): Promise<void> {
    await tx.job.create({
        data: {
            type: ORGANIZATION_DELETION_CLEANUP_TYPE,
            organizationId,
            payload: { organizationId },
            maxAttempts: ORGANIZATION_DELETION_CLEANUP_ATTEMPTS,
        },
    });
}

/**
 * Shuts off a deleted business's access (#921). **Its data and files stay**
 * (DEC-119, owner 10 Oct): the Privacy Policy keeps them 180 days after
 * deletion, and `organization.retention.erase` removes them then. Until
 * DEC-119 this run deleted the files on day one. Each step is idempotent,
 * re-reads what it acts on, and is tried whatever the others did:
 *
 * 1. **jobs** — its pending jobs are cancelled (`CANCELLED`, as an operator
 *    cancels one), but for {@link CLEANUP_KEEPS_JOB_TYPES}.
 * 2. **billing** — Saroh's own subscription cancelled at the provider now,
 *    then recorded CANCELLED (`DeletedBusinessBilling`).
 * 3. **domains** — custom hostnames deleted at Cloudflare and the claims
 *    released (`DomainsService.releaseForDeletedBusiness`).
 * 4. **memberships** — its customers' active autopay mandates read and
 *    logged per provider: deletion doesn't cancel them there (owner, 9 Oct;
 *    the workspace said so during the window).
 * 5. **keys** — its payment and messaging credentials deleted, at once:
 *    they are secrets, not records, and are never kept for the 180 days.
 *    Its own connections (`MerchantPaymentProvider`,
 *    `CommunicationProvider` for email and WhatsApp) and the storefronts'
 *    older ones (`StorePaymentConfig`, `IntegrationSecret`) — never while a
 *    customer is still owed a refund.
 *
 * **On legal hold it removes nothing** (DEC-119): a run that finds the
 * business held stands aside whole, notes it on the ledger and ends without
 * failing; lifting the hold queues the clean-up again
 * (`AdminLifecycleService.liftLegalHold`). A hold placed while a run is
 * under way stops every destructive step after it
 * ({@link CLEANUP_DESTRUCTIVE_STEPS}): each asks again before it starts,
 * and the keys' transaction asks under the business's row lock.
 *
 * Its pending jobs never include a refund on its way: `payments.send-refund`
 * is left to run. Every provider call logs one
 * `deletion_provider_call` line (`organizations/deletion-provider-log.ts`),
 * and each run is one `organization.deletion.cleanup` row on the admin
 * ledger with each step's result, for the console's deletion trail.
 *
 * Kept for the 180 days: everything else the business holds — customers,
 * bookings, messages, its files. Kept after them too, as records (ADR-008,
 * GST): orders, invoices, credit notes, payments and refunds, Saroh's
 * invoices to it, and both audit trails.
 *
 * The run first checks the business is `DELETED_RETAINED`, a state nothing
 * leaves; the steps that write in a transaction (billing, keys) check again
 * inside it. A step that fails is logged by name and the run throws at the
 * end, so the queue retries it — the steps already done find nothing to
 * do. The log carries ids and counts only.
 */
@Injectable()
export class OrganizationDeletionCleanupHandler {
    private readonly logger = new Logger(
        OrganizationDeletionCleanupHandler.name,
    );

    constructor(
        private readonly billing: DeletedBusinessBilling,
        private readonly domains: DomainsService,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const payload = job.payload as { organizationId?: unknown } | null;
        const organizationId =
            typeof payload?.organizationId === "string"
                ? payload.organizationId
                : job.organizationId;
        if (!organizationId) {
            this.logger.error(
                `organization_deletion_cleanup_bad_payload job=${job.id}`,
            );
            return;
        }
        const result = await this.run(organizationId, job.id);
        if (result.failed.length > 0) {
            throw new Error(
                `Deletion clean-up unfinished: ${result.failed.join(",")}`,
            );
        }
    };

    /** Every step for one business. Exposed for the specs. */
    async run(organizationId: string, jobId?: string): Promise<CleanupResult> {
        if (!(await this.deleted(organizationId))) {
            this.logger.warn(
                `organization_deletion_cleanup_skipped org=${organizationId} reason=not-deleted`,
            );
            return { ran: false, counts: {}, failed: [], held: [] };
        }
        // On legal hold nothing is removed (DEC-119): the run stands aside
        // whole, says so on the ledger, and ends without failing. Lifting
        // the hold queues the clean-up again.
        if (await onLegalHold(prisma, organizationId)) {
            this.logger.warn(
                `organization_deletion_cleanup_held org=${organizationId} reason=legal-hold`,
            );
            const held = [...CLEANUP_STEPS];
            await this.recordTrail(organizationId, jobId, {}, [], held);
            return { ran: false, counts: {}, failed: [], held };
        }
        const counts: Record<string, number> = {};
        const failed: CleanupStep[] = [];
        const held: CleanupStep[] = [];
        const step = async (
            name: CleanupStep,
            work: () => Promise<Record<string, number>>,
        ) => {
            try {
                // A hold placed since the run started stops every step that
                // removes something.
                if (
                    CLEANUP_DESTRUCTIVE_STEPS.includes(name) &&
                    (await onLegalHold(prisma, organizationId))
                ) {
                    held.push(name);
                    this.logger.warn(
                        `organization_deletion_cleanup_step_held org=${organizationId} step=${name} reason=legal-hold`,
                    );
                    return;
                }
                Object.assign(counts, await work());
            } catch (error) {
                if (error instanceof HeldMidStepError) {
                    held.push(name);
                    return;
                }
                failed.push(name);
                this.logger.error(
                    `organization_deletion_cleanup_step_failed org=${organizationId} step=${name} error=${errorName(error)}`,
                );
            }
        };

        await step("jobs", async () => ({
            jobsCancelled: await this.cancelJobs(organizationId, jobId),
        }));
        await step("billing", async () => {
            const ended = await this.billing.end(organizationId);
            return {
                billingCancelledAtProvider: ended.cancelledAtProvider ? 1 : 0,
                billingSubscriptionCancelled: ended.subscriptionCancelled
                    ? 1
                    : 0,
                billingCheckoutsDropped: ended.checkoutsDropped,
            };
        });
        await step("domains", async () => ({
            domainsReleased: (
                await this.domains.releaseForDeletedBusiness(organizationId)
            ).released,
        }));
        await step("memberships", async () => ({
            mandatesLeftAtProvider: await this.readMandates(organizationId),
        }));
        await step("keys", async () => ({
            keysDeleted: await this.deleteKeys(organizationId),
        }));

        const line = Object.entries(counts)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ");
        this.logger.log(
            `organization_deletion_cleanup org=${organizationId} ${line} failed=${failed.join(",") || "none"} held=${held.join(",") || "none"}`,
        );
        await this.recordTrail(organizationId, jobId, counts, failed, held);
        return { ran: true, counts, failed, held };
    }

    /**
     * The run on the admin ledger (#921): each step's result and the
     * counts, for the console's deletion trail. One row per attempt; a
     * failure to write is logged and never fails the clean-up.
     */
    private async recordTrail(
        organizationId: string,
        jobId: string | undefined,
        counts: Record<string, number>,
        failed: CleanupStep[],
        held: CleanupStep[],
    ): Promise<void> {
        const done = failed.length === 0 && held.length === 0;
        try {
            const attempt = jobId
                ? ((
                      await prisma.job.findUnique({
                          where: { id: jobId },
                          select: { attempts: true },
                      })
                  )?.attempts ?? 0)
                : null;
            await prisma.adminAuditEvent.create({
                data: createAdminAuditData({
                    actorUserId: CLEANUP_ACTOR,
                    permission: AdminPermission.OrganizationLifecycleWrite,
                    action: ORGANIZATION_DELETION_CLEANUP_ACTION,
                    targetType: "organization",
                    targetId: organizationId,
                    organizationId,
                    reason: done
                        ? "The deleted business's access was shut off; its data is kept for the retention period"
                        : held.length > 0
                          ? CLEANUP_HELD_REASON
                          : "The clean-up didn't finish; it is tried again",
                    outcome: done
                        ? AdminAuditOutcome.Success
                        : AdminAuditOutcome.Failure,
                    idempotencyKey: jobId
                        ? `organization-deletion-cleanup:${jobId}:${attempt}`
                        : undefined,
                    metadata: {
                        steps: CLEANUP_STEPS.map((name) => ({
                            step: name,
                            result: held.includes(name)
                                ? "held"
                                : failed.includes(name)
                                  ? "failed"
                                  : "ok",
                        })),
                        counts,
                        ...(held.length > 0 ? { legalHold: true } : {}),
                    },
                }),
            });
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return;
            this.logger.error(
                `organization_deletion_cleanup_trail_not_recorded org=${organizationId} error=${errorName(error)}`,
            );
        }
    }

    /**
     * The customers' autopay mandates still set up at each provider (owner,
     * 9 Oct): deletion doesn't cancel them there, so what is left is logged
     * per provider for the operator to follow. Saroh's own records; nothing
     * is changed.
     */
    private async readMandates(organizationId: string): Promise<number> {
        const counts = await activeMandatesByProvider(prisma, organizationId);
        let total = 0;
        for (const [provider, active] of counts) {
            total += active;
            logDeletionProviderCall(this.logger, {
                organizationId,
                provider,
                call: "mandates.read",
                result: "ok",
                ref: `active:${active}`,
            });
        }
        return total;
    }

    private async deleted(
        organizationId: string,
        db: Pick<Prisma.TransactionClient, "organization"> = prisma,
    ): Promise<boolean> {
        const organization = await db.organization.findUnique({
            where: { id: organizationId },
            select: { lifecycleStatus: true },
        });
        return (
            organization?.lifecycleStatus ===
            OrganizationLifecycleStatus.DeletedRetained
        );
    }

    /** Pending jobs called off, fenced on PENDING as an operator's cancel is. */
    private async cancelJobs(
        organizationId: string,
        jobId: string | undefined,
    ): Promise<number> {
        const cancelled = await prisma.job.updateMany({
            where: {
                organizationId,
                // Fenced on the hold in the write itself (DEC-119).
                organization: NOT_ON_LEGAL_HOLD,
                status: "PENDING",
                type: { notIn: [...CLEANUP_KEEPS_JOB_TYPES] },
                ...(jobId ? { id: { not: jobId } } : {}),
            },
            data: {
                status: JOB_CANCELLED,
                processedAt: new Date(),
                lockedAt: null,
                lockedBy: null,
            },
        });
        return cancelled.count;
    }

    /**
     * Payment and messaging credentials, deleted in one transaction: its
     * own payment connections (`MerchantPaymentProvider`), its email and
     * WhatsApp connections (`CommunicationProvider`, owner 9 Oct), and the
     * storefronts' older ones (`StorePaymentConfig`, `IntegrationSecret`).
     * Not while a customer is still owed a refund: it settles through them
     * ({@link RefundsStillOwedError}, retried).
     */
    private async deleteKeys(organizationId: string): Promise<number> {
        const owed = await refundsOutstanding(prisma, organizationId);
        if (owed.count > 0) {
            logDeletionProviderCall(this.logger, {
                organizationId,
                provider: "saroh",
                call: "keys.remove",
                result: "held:refunds-owed",
                ref: `refunds:${owed.count}`,
            });
            throw new RefundsStillOwedError(owed.count);
        }
        const removed = await prisma.$transaction(async (tx) => {
            // Under the business's row lock: a hold placed now waits for
            // this transaction, and one already placed stops it (DEC-119).
            if (await onLegalHoldLocked(tx, organizationId)) {
                throw new HeldMidStepError();
            }
            if (!(await this.deleted(organizationId, tx))) return [];
            const [payments, messaging, storefront, secrets] =
                await Promise.all([
                    tx.merchantPaymentProvider.findMany({
                        where: { organizationId },
                        select: { id: true, provider: true },
                    }),
                    tx.communicationProvider.findMany({
                        where: { organizationId },
                        select: { id: true, provider: true },
                    }),
                    tx.storePaymentConfig.findMany({
                        where: { store: { organizationId } },
                        select: { id: true, provider: true },
                    }),
                    tx.integrationSecret.findMany({
                        where: { store: { organizationId } },
                        select: { id: true },
                    }),
                ]);
            await tx.merchantPaymentProvider.deleteMany({
                where: { organizationId },
            });
            await tx.communicationProvider.deleteMany({
                where: { organizationId },
            });
            await tx.storePaymentConfig.deleteMany({
                where: { store: { organizationId } },
            });
            await tx.integrationSecret.deleteMany({
                where: { store: { organizationId } },
            });
            return [
                ...payments,
                ...messaging,
                ...storefront.map((s) => ({
                    id: s.id,
                    provider: String(s.provider),
                })),
                ...secrets.map((s) => ({ id: s.id, provider: "storefront" })),
            ];
        });
        // Logged once the delete committed: the keys are gone.
        for (const row of removed) {
            logDeletionProviderCall(this.logger, {
                organizationId,
                provider: row.provider,
                call: "keys.remove",
                result: "ok",
                ref: row.id,
            });
        }
        return removed.length;
    }
}

/** A legal hold found inside a step's own transaction: the step is held. */
class HeldMidStepError extends Error {
    constructor() {
        super("The business is on legal hold");
        this.name = "HeldMidStepError";
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

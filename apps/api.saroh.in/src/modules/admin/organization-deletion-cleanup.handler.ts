import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { DeletedBusinessBilling } from "../billing/business-closing";
import { BILLING_PROVIDER_CANCEL_TYPE } from "../billing/provider-cancel.job";
import { DomainsService } from "../domains/domains.service";
import { MediaService } from "../media/media.service";
import { logDeletionProviderCall } from "../organizations/deletion-provider-log";
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
 * What a deleted business leaves behind is cleared (owner, 9 Oct, #921):
 * the step after the deletion sweep marks it `DELETED_RETAINED`, queued on
 * the same transaction (the outbox), one job per business.
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
    "jobs" | "billing" | "domains" | "media" | "memberships" | "keys";

/** Every step, in the order a run takes them. */
export const CLEANUP_STEPS: readonly CleanupStep[] = [
    "jobs",
    "billing",
    "domains",
    "media",
    "memberships",
    "keys",
];

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
    /** False when the business wasn't `DELETED_RETAINED` (nothing done). */
    ran: boolean;
    counts: Record<string, number>;
    failed: CleanupStep[];
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
 * Clears a deleted business (#921). Each step is idempotent, re-reads what
 * it acts on, and is tried whatever the others did:
 *
 * 1. **jobs** — its pending jobs are cancelled (`CANCELLED`, as an operator
 *    cancels one), but for {@link CLEANUP_KEEPS_JOB_TYPES}.
 * 2. **billing** — Saroh's own subscription cancelled at the provider now,
 *    then recorded CANCELLED (`DeletedBusinessBilling`).
 * 3. **domains** — custom hostnames deleted at Cloudflare and the claims
 *    released (`DomainsService.releaseForDeletedBusiness`).
 * 4. **media** — every object out of storage, then its row
 *    (`MediaService.removeAllForDeletedBusiness`).
 * 5. **memberships** — its customers' active autopay mandates read and
 *    logged per provider: deletion doesn't cancel them there (owner, 9 Oct;
 *    the workspace said so during the window).
 * 6. **keys** — its payment and messaging credentials deleted: its own
 *    connections (`MerchantPaymentProvider`, `CommunicationProvider` for
 *    email and WhatsApp) and the storefronts' older ones
 *    (`StorePaymentConfig`, `IntegrationSecret`) — never while a customer
 *    is still owed a refund.
 *
 * Its pending jobs never include a refund on its way: `payments.send-refund`
 * is left to run. Every provider call logs one
 * `deletion_provider_call` line (`organizations/deletion-provider-log.ts`),
 * and each run is one `organization.deletion.cleanup` row on the admin
 * ledger with each step's result, for the console's deletion trail.
 *
 * Kept, as records (ADR-008, GST): orders, invoices, credit notes,
 * customers, payments and refunds, Saroh's invoices to it, and both audit
 * trails.
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
        private readonly media: MediaService,
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
            return { ran: false, counts: {}, failed: [] };
        }
        const counts: Record<string, number> = {};
        const failed: CleanupStep[] = [];
        const step = async (
            name: CleanupStep,
            work: () => Promise<Record<string, number>>,
        ) => {
            try {
                Object.assign(counts, await work());
            } catch (error) {
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
        await step("media", async () => ({
            mediaRemoved: (
                await this.media.removeAllForDeletedBusiness(organizationId)
            ).removed,
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
            `organization_deletion_cleanup org=${organizationId} ${line} failed=${failed.join(",") || "none"}`,
        );
        await this.recordTrail(organizationId, jobId, counts, failed);
        return { ran: true, counts, failed };
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
    ): Promise<void> {
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
                    reason:
                        failed.length === 0
                            ? "What the deleted business left behind was cleared"
                            : "The clean-up didn't finish; it is tried again",
                    outcome:
                        failed.length === 0
                            ? AdminAuditOutcome.Success
                            : AdminAuditOutcome.Failure,
                    idempotencyKey: jobId
                        ? `organization-deletion-cleanup:${jobId}:${attempt}`
                        : undefined,
                    metadata: {
                        steps: CLEANUP_STEPS.map((name) => ({
                            step: name,
                            result: failed.includes(name) ? "failed" : "ok",
                        })),
                        counts,
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

/** An error's class and code only: a message could carry a business's data. */
function errorName(error: unknown): string {
    if (error instanceof Error) {
        const code = prismaErrorCode(error);
        return code ? `${error.name}:${code}` : error.name;
    }
    return "unknown";
}

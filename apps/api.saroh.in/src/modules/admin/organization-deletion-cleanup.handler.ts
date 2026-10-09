import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { DeletedBusinessBilling } from "../billing/business-closing";
import { BILLING_PROVIDER_CANCEL_TYPE } from "../billing/provider-cancel.job";
import { DomainsService } from "../domains/domains.service";
import { MediaService } from "../media/media.service";
import { OrganizationLifecycleStatus } from "../organizations/organization-lifecycle.policy";
import { SUBSCRIPTION_CHARGE_TYPE } from "../subscriptions/charge-job";
import { JOB_CANCELLED } from "./job-cancel";

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
 * mid-chain, would leave its charge reading as in progress.
 */
export const CLEANUP_KEEPS_JOB_TYPES: readonly string[] = [
    ORGANIZATION_DELETION_CLEANUP_TYPE,
    BILLING_PROVIDER_CANCEL_TYPE,
    SUBSCRIPTION_CHARGE_TYPE,
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

export type CleanupStep = "jobs" | "billing" | "domains" | "media" | "keys";

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
 * 5. **keys** — its payment-provider credentials deleted: its own
 *    connections (`MerchantPaymentProvider`) and the storefronts' older
 *    ones (`StorePaymentConfig`, `IntegrationSecret`).
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
        await step("keys", async () => ({
            keysDeleted: await this.deleteKeys(organizationId),
        }));

        const line = Object.entries(counts)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ");
        this.logger.log(
            `organization_deletion_cleanup org=${organizationId} ${line} failed=${failed.join(",") || "none"}`,
        );
        return { ran: true, counts, failed };
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

    /** Payment-provider credentials, deleted in one transaction. */
    private async deleteKeys(organizationId: string): Promise<number> {
        return prisma.$transaction(async (tx) => {
            if (!(await this.deleted(organizationId, tx))) return 0;
            const merchant = await tx.merchantPaymentProvider.deleteMany({
                where: { organizationId },
            });
            const storefront = await tx.storePaymentConfig.deleteMany({
                where: { store: { organizationId } },
            });
            const secrets = await tx.integrationSecret.deleteMany({
                where: { store: { organizationId } },
            });
            return merchant.count + storefront.count + secrets.count;
        });
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

import { ForbiddenException, Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import {
    errorResult,
    logDeletionProviderCall,
} from "../organizations/deletion-provider-log";
import {
    billingMayCharge,
    OrganizationLifecycleStatus,
} from "../organizations/organization-lifecycle.policy";
import { clearAddonsInTx } from "./addon-charges";
import { isOneTime } from "./billing-term";
import { enqueueProviderCancel } from "./provider-cancel.job";
import type { BillingProviderFactory } from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";

type Tx = Prisma.TransactionClient;
type Db = Pick<Tx, "organization">;

/**
 * Billing for a business that is closing or deleted (owner, 9 Oct, #921).
 *
 * `organization-lifecycle.policy.ts` says which states may be charged:
 * `PENDING_DELETION` and `DELETED_RETAINED` may not. This file is how
 * billing obeys it:
 *
 * - **Nothing new starts**: a checkout, a subscription or an add-on asks
 *   {@link assertBillingMayStart} first (and again in the transaction that
 *   records it, where it has one).
 * - **Nothing is sent to be charged**: the add-ons sync, the merchant's
 *   renewals and autopay debits ask {@link billingMayChargeFor} (or filter
 *   with `BILLING_ORGANIZATION`) and stand aside.
 * - **When deletion is scheduled**, {@link stopRenewalsInTx} ends Saroh's
 *   provider subscription with the period already paid, as a business's own
 *   cancel does (`SubscriptionsService.cancel`), so no renewal is charged
 *   during the window. A reinstated business keeps its plan to the end of
 *   that period and chooses again.
 * - **When the window ends**, {@link DeletedBusinessBilling.end} cancels it
 *   at the provider now and records it CANCELLED (`organization.deletion.cleanup`).
 *
 * A charge the provider makes anyway (a cancel that hadn't reached it) is
 * still recorded and invoiced — the money moved, and GST needs the paper —
 * and the webhook ends the subscription at once
 * (`BillingWebhookService.renewed`).
 */

/** Refused: a closing or deleted business starts nothing that charges. */
export function billingRefused(lifecycleStatus: string): ForbiddenException {
    return new ForbiddenException({
        error: "ORGANIZATION_NOT_ACTIVE",
        status: lifecycleStatus,
        message:
            lifecycleStatus === OrganizationLifecycleStatus.DeletedRetained
                ? "This business was deleted, so nothing can be charged to it."
                : "This business is closing, so no plan or charge can start.",
    });
}

/** Whether this business may be charged now (a missing one may not). */
export async function billingMayChargeFor(
    db: Db,
    organizationId: string,
): Promise<boolean> {
    const organization = await db.organization.findUnique({
        where: { id: organizationId },
        select: { lifecycleStatus: true },
    });
    return organization
        ? billingMayCharge(organization.lifecycleStatus)
        : false;
}

/** Throw {@link billingRefused} unless this business may be charged now. */
export async function assertBillingMayStart(
    db: Db,
    organizationId: string,
): Promise<void> {
    const organization = await db.organization.findUnique({
        where: { id: organizationId },
        select: { lifecycleStatus: true },
    });
    // A missing business is the caller's own 404.
    if (!organization || billingMayCharge(organization.lifecycleStatus)) {
        return;
    }
    throw billingRefused(organization.lifecycleStatus);
}

/** Every OPEN or SCHEDULED checkout given up, its provider side too. */
export async function dropLiveCheckoutsInTx(
    tx: Tx,
    organizationId: string,
    reason: string,
): Promise<number> {
    const live = await tx.billingCheckout.findMany({
        where: { organizationId, status: { in: ["OPEN", "SCHEDULED"] } },
    });
    for (const c of live) {
        await tx.billingCheckout.update({
            where: { id: c.id },
            data: { status: "CANCELLED", endedReason: reason },
        });
        await enqueueProviderCancel(tx, {
            organizationId,
            provider: c.provider,
            providerSubscriptionId: c.providerSubscriptionId,
            atCycleEnd: false,
        });
    }
    // A scheduled checkout's move goes with it.
    const scheduled = live.filter((c) => c.status === "SCHEDULED");
    if (scheduled.length) {
        await tx.subscription.updateMany({
            where: {
                organizationId,
                pendingPlanId: { in: scheduled.map((c) => c.planId) },
            },
            data: { pendingPlanId: null, pendingFrom: null },
        });
    }
    return live.length;
}

/** The subscription's provider subscription renews by itself (not a paid year). */
async function renewsAtProvider(
    tx: Pick<Tx, "billingCheckout">,
    sub: {
        status: string;
        provider: string | null;
        providerSubscriptionId: string | null;
    },
): Promise<boolean> {
    if (sub.status === "CANCELLED" || !sub.provider) return false;
    if (!sub.providerSubscriptionId) return false;
    const checkout = await tx.billingCheckout.findUnique({
        where: {
            provider_providerSubscriptionId: {
                provider: sub.provider,
                providerSubscriptionId: sub.providerSubscriptionId,
            },
        },
        select: { providerPlanId: true },
    });
    return !checkout || !isOneTime(checkout);
}

export interface StoppedRenewals {
    /** The provider subscription was told to end (1) or there was none (0). */
    providerCancels: number;
    checkoutsDropped: number;
}

/**
 * Deletion scheduled (#921): no renewal is charged during the window. On
 * the transaction that moves the business to `PENDING_DELETION`, so the
 * two commit together and the provider request is retried by its job
 * (`billing.provider.cancel`) until the provider answers.
 *
 * The provider subscription ends with the period already paid — a trial,
 * which paid nothing ahead, at once — and checkouts waiting are given up.
 * Idempotent: a subscription already set to end, or cancelled, is left.
 */
export async function stopRenewalsInTx(
    tx: Tx,
    organizationId: string,
): Promise<StoppedRenewals> {
    await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
    const checkoutsDropped = await dropLiveCheckoutsInTx(
        tx,
        organizationId,
        "business-closing",
    );
    const sub = await tx.subscription.findUnique({
        where: { organizationId },
        select: {
            id: true,
            status: true,
            provider: true,
            providerSubscriptionId: true,
            cancelAtPeriodEnd: true,
        },
    });
    if (
        !sub?.provider ||
        !sub.providerSubscriptionId ||
        sub.cancelAtPeriodEnd ||
        !(await renewsAtProvider(tx, sub))
    ) {
        return { providerCancels: 0, checkoutsDropped };
    }
    await tx.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: true },
    });
    await enqueueProviderCancel(tx, {
        organizationId,
        provider: sub.provider,
        providerSubscriptionId: sub.providerSubscriptionId,
        atCycleEnd: sub.status !== "TRIALING",
    });
    return { providerCancels: 1, checkoutsDropped };
}

export interface EndedBilling {
    /** The provider was asked to cancel now (and answered). */
    cancelledAtProvider: boolean;
    /** The subscription row was moved to CANCELLED here. */
    subscriptionCancelled: boolean;
    checkoutsDropped: number;
}

/**
 * The window ended (#921): Saroh's billing for a deleted business ends now.
 * Run by `organization.deletion.cleanup`, which retries it until it is done.
 */
@Injectable()
export class DeletedBusinessBilling {
    private readonly logger = new Logger(DeletedBusinessBilling.name);

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
    ) {}

    /**
     * Cancel the provider subscription now, then record the subscription
     * CANCELLED with its add-ons dropped and its checkouts given up.
     *
     * The provider first, outside any transaction: a provider that doesn't
     * answer throws, nothing is written, and the clean-up job tries again —
     * never a row that says cancelled over a subscription still charging.
     * A refusal (already cancelled, never authorised) is the provider's
     * settled answer. Then, under the subscription's lock, the business is
     * read again and the row is changed only if it still names that
     * provider subscription. Idempotent: a second run finds it CANCELLED.
     */
    async end(organizationId: string): Promise<EndedBilling> {
        const sub = await prisma.subscription.findUnique({
            where: { organizationId },
            select: {
                id: true,
                status: true,
                provider: true,
                providerSubscriptionId: true,
            },
        });
        let cancelledAtProvider = false;
        if (
            sub?.provider &&
            sub.providerSubscriptionId &&
            (await renewsAtProvider(prisma, sub))
        ) {
            try {
                await this.providers
                    .get(sub.provider)
                    .cancelSubscription(sub.providerSubscriptionId, {
                        atCycleEnd: false,
                    });
                cancelledAtProvider = true;
                logDeletionProviderCall(this.logger, {
                    organizationId,
                    provider: sub.provider,
                    call: "billing.cancel",
                    result: "ok",
                    ref: sub.providerSubscriptionId,
                });
            } catch (error) {
                const refused =
                    error instanceof BillingProviderError &&
                    error.kind === "REFUSED";
                logDeletionProviderCall(this.logger, {
                    organizationId,
                    provider: sub.provider,
                    call: "billing.cancel",
                    result: refused ? "refused" : errorResult(error),
                    ref: sub.providerSubscriptionId,
                });
                if (!refused) {
                    throw error;
                }
                this.logger.warn(
                    `deleted_business_billing_cancel_refused org=${organizationId} subscription=${sub.id}`,
                );
            }
        }

        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
            const organization = await tx.organization.findUnique({
                where: { id: organizationId },
                select: { lifecycleStatus: true },
            });
            if (
                organization?.lifecycleStatus !==
                OrganizationLifecycleStatus.DeletedRetained
            ) {
                return {
                    cancelledAtProvider,
                    subscriptionCancelled: false,
                    checkoutsDropped: 0,
                };
            }
            const checkoutsDropped = await dropLiveCheckoutsInTx(
                tx,
                organizationId,
                "business-deleted",
            );
            const current = await tx.subscription.findUnique({
                where: { organizationId },
                select: {
                    id: true,
                    status: true,
                    providerSubscriptionId: true,
                },
            });
            let subscriptionCancelled = false;
            if (
                current &&
                current.status !== "CANCELLED" &&
                current.providerSubscriptionId !== null
            ) {
                // A provider subscription this run didn't ask about (one
                // changed since the read): nothing is recorded, and the
                // retry asks about it.
                if (
                    current.providerSubscriptionId !==
                    (sub?.providerSubscriptionId ?? null)
                ) {
                    throw new Error(
                        "The subscription changed while it was being ended; retrying",
                    );
                }
                await clearAddonsInTx(tx, current.id);
                await tx.subscription.update({
                    where: { id: current.id },
                    data: {
                        status: "CANCELLED",
                        cancelAtPeriodEnd: true,
                        pendingPlanId: null,
                        pendingFrom: null,
                    },
                });
                subscriptionCancelled = true;
            }
            return {
                cancelledAtProvider,
                subscriptionCancelled,
                checkoutsDropped,
            };
        });
    }
}

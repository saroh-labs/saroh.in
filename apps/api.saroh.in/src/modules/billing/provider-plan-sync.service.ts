import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { liveCatalogueVersion, prisma } from "@saroh/database";
import { withGstPaise } from "@saroh/pricing-catalog";

import { enqueueSiteRevalidation } from "../pricing/revalidate-site.job";
import { enqueueFreeRows } from "./free-rows.job";
import type { BillingProviderFactory } from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";

type Tx = Prisma.TransactionClient;

/**
 * Billing-provider plans for the catalogue (pricing catalogue U15, OQ-5,
 * RECOMMENDATIONS 5).
 *
 * Publishing a version writes a PENDING `PricingProviderPlan` for each paid
 * `Plan` row (U4), and this job makes the provider's plan for it: the row's
 * price with GST (KTD-18), per month or per year. PENDING becomes SYNCED with
 * the provider's plan id, or FAILED with the reason once it can't (a refusal
 * at once; an unanswered call after {@link MAX_SYNC_ATTEMPTS}). A version
 * with a row that isn't SYNCED never goes live (`liveCatalogueVersion`) and
 * no move to it is applied (`plan-moves.ts`). The admin console's Versions
 * shows each version's counts and can ask for the FAILED rows again.
 *
 * Safe to repeat: the provider is asked for a plan made under the row's id
 * before a new one is made, so a create whose answer was lost is found, not
 * made twice; a row already SYNCED is never asked about again.
 *
 * When the last row of a version whose go-live has passed is SYNCED, the
 * version goes live there and then, and saroh.in is told
 * (`enqueueSiteRevalidation`, cause `go-live`) on the same transaction.
 */
export const PROVIDER_PLAN_SYNC_TYPE = "billing.provider-plans.sync";

/** The platform account's provider a paid catalogue plan is billed through. */
export const CATALOGUE_BILLING_PROVIDER = "RAZORPAY";

/** Unanswered attempts before a row is FAILED (and needs asking again). */
export const MAX_SYNC_ATTEMPTS = 6;

/** The wait before the next run while rows are still PENDING. */
export function syncBackoffMs(attempts: number): number {
    return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 30 * 60_000);
}

export interface ProviderPlanSyncPayload {
    version: number;
}

/**
 * Queue a sync for `version` on the caller's transaction, unless one is
 * already waiting for it. Call it where the PENDING rows are written.
 */
export async function enqueueProviderPlanSync(
    tx: Pick<Tx, "job">,
    version: number,
    runAt: Date,
): Promise<boolean> {
    const waiting = await tx.job.findFirst({
        where: {
            type: PROVIDER_PLAN_SYNC_TYPE,
            status: "PENDING",
            payload: { path: ["version"], equals: version },
        },
        select: { id: true },
    });
    if (waiting) return false;
    await tx.job.create({
        data: { type: PROVIDER_PLAN_SYNC_TYPE, payload: { version }, runAt },
    });
    return true;
}

/**
 * Ask again for a version's FAILED rows: back to PENDING with a fresh count,
 * and a sync queued. Returns how many rows it reset.
 */
export async function retryProviderPlanSyncInTx(
    tx: Tx,
    version: number,
    now: Date,
): Promise<number> {
    const reset = await tx.pricingProviderPlan.updateMany({
        where: {
            status: "FAILED",
            plan: { version, key: { startsWith: "catalog." } },
        },
        data: { status: "PENDING", attempts: 0, lastError: null },
    });
    const pending = await tx.pricingProviderPlan.count({
        where: {
            status: "PENDING",
            plan: { version, key: { startsWith: "catalog." } },
        },
    });
    if (pending > 0) await enqueueProviderPlanSync(tx, version, now);
    return reset.count;
}

export interface SyncOutcome {
    synced: number;
    failed: number;
    pending: number;
    /** The version went live with this run. */
    wentLive: boolean;
}

/** A stored reason: short, and never a provider body or credential. */
function reasonOf(error: unknown): string {
    const text =
        error instanceof BillingProviderError
            ? error.message
            : error instanceof Error
              ? error.message
              : "unknown error";
    return text.slice(0, 300);
}

@Injectable()
export class ProviderPlanSyncService {
    private readonly logger = new Logger(ProviderPlanSyncService.name);

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
    ) {}

    /** The job handler: sync, then queue the next try while rows wait. */
    readonly handle = async (job: Job): Promise<void> => {
        const payload = job.payload as Partial<ProviderPlanSyncPayload> | null;
        const version = payload?.version;
        if (typeof version !== "number") {
            this.logger.error(`provider_plan_sync_bad_payload job=${job.id}`);
            return;
        }
        const out = await this.syncVersion(version, new Date());
        if (out.pending > 0) {
            const attempts = await prisma.pricingProviderPlan.aggregate({
                where: {
                    status: "PENDING",
                    plan: { version, key: { startsWith: "catalog." } },
                },
                _max: { attempts: true },
            });
            const wait = syncBackoffMs(attempts._max.attempts ?? 1);
            await prisma.$transaction((tx) =>
                enqueueProviderPlanSync(
                    tx,
                    version,
                    new Date(Date.now() + wait),
                ),
            );
        }
    };

    /** One pass over a version's PENDING rows. */
    async syncVersion(version: number, now: Date): Promise<SyncOutcome> {
        const rows = await prisma.pricingProviderPlan.findMany({
            where: {
                status: "PENDING",
                plan: { version, key: { startsWith: "catalog." } },
            },
            select: {
                id: true,
                provider: true,
                attempts: true,
                plan: {
                    select: {
                        name: true,
                        priceCents: true,
                        currency: true,
                        interval: true,
                    },
                },
            },
            orderBy: { createdAt: "asc" },
        });
        let synced = 0;
        let failed = 0;
        let wentLive = false;
        for (const row of rows) {
            const result = await this.syncRow(row);
            if (result.status === "SYNCED") {
                const done = await prisma.$transaction(async (tx) => {
                    const won = await tx.pricingProviderPlan.updateMany({
                        where: { id: row.id, status: { not: "SYNCED" } },
                        data: {
                            status: "SYNCED",
                            providerPlanId: result.providerPlanId,
                            syncedAt: now,
                            lastError: null,
                            attempts: { increment: 1 },
                        },
                    });
                    if (won.count === 0) return false;
                    return this.goLiveIfComplete(tx, version, now);
                });
                synced += 1;
                wentLive = wentLive || done;
            } else {
                const attempts = row.attempts + 1;
                const give =
                    result.kind === "REFUSED" || attempts >= MAX_SYNC_ATTEMPTS;
                await prisma.pricingProviderPlan.updateMany({
                    where: { id: row.id, status: "PENDING" },
                    data: {
                        status: give ? "FAILED" : "PENDING",
                        attempts,
                        lastError: result.reason,
                    },
                });
                if (give) {
                    failed += 1;
                    this.logger.error(
                        `provider_plan_sync_failed version=${version} row=${row.id} attempts=${attempts}: ${result.reason}`,
                    );
                } else {
                    this.logger.warn(
                        `provider_plan_sync_retry version=${version} row=${row.id} attempts=${attempts}: ${result.reason}`,
                    );
                }
            }
        }
        const pending = await prisma.pricingProviderPlan.count({
            where: {
                status: "PENDING",
                plan: { version, key: { startsWith: "catalog." } },
            },
        });
        return { synced, failed, pending, wentLive };
    }

    private async syncRow(row: {
        id: string;
        provider: string;
        plan: {
            name: string;
            priceCents: number;
            currency: string;
            interval: string;
        };
    }): Promise<
        | { status: "SYNCED"; providerPlanId: string }
        | { status: "ERROR"; kind: "REFUSED" | "UNKNOWN"; reason: string }
    > {
        let plans;
        try {
            plans = this.providers.get(row.provider).plans;
        } catch (error) {
            return {
                status: "ERROR",
                kind: "REFUSED",
                reason: reasonOf(error),
            };
        }
        if (!plans) {
            return {
                status: "ERROR",
                kind: "REFUSED",
                reason: `${row.provider} can't create plans`,
            };
        }
        try {
            const found = await plans.findPlan(row.id);
            if (found) return { status: "SYNCED", providerPlanId: found };
            const made = await plans.createPlan({
                reference: row.id,
                name: row.plan.name,
                amountPaise: withGstPaise(row.plan.priceCents),
                currency: row.plan.currency,
                period: row.plan.interval === "year" ? "year" : "month",
            });
            return { status: "SYNCED", providerPlanId: made.providerPlanId };
        } catch (error) {
            const kind =
                error instanceof BillingProviderError ? error.kind : "UNKNOWN";
            return { status: "ERROR", kind, reason: reasonOf(error) };
        }
    }

    /**
     * After a row is SYNCED: when that was the version's last one and its
     * go-live has passed, it is live now — tell saroh.in and give their Free
     * row to the businesses that signed up meanwhile (#839). A version still
     * scheduled was given its go-live refresh when it was published.
     */
    private async goLiveIfComplete(
        tx: Tx,
        version: number,
        now: Date,
    ): Promise<boolean> {
        const left = await tx.pricingProviderPlan.count({
            where: {
                status: { not: "SYNCED" },
                plan: { version, key: { startsWith: "catalog." } },
            },
        });
        if (left > 0) return false;
        const live = await liveCatalogueVersion(tx, now);
        if (live?.version !== version) return false;
        await enqueueSiteRevalidation(tx, { version, cause: "go-live" }, now);
        await enqueueFreeRows(tx, { version }, now, now);
        this.logger.log(`pricing_version_live version=${version} cause=sync`);
        return true;
    }
}

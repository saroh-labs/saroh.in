import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import {
    addonOfferedOn,
    catalogPlanIdForKey,
    withGstPaise,
} from "@saroh/pricing-catalog";

import type { AuditService } from "../audit/audit.service";
import { AuditAction, AuditOutcome } from "../audit/audit.service";
import { billingMayCharge } from "../organizations/organization-lifecycle.policy";
import type { HeldAddon } from "./addons-ending";
import { addonsNotOffered } from "./addons-ending";
import type { AddonChargeLine } from "./offers";
import { addonPeriodLine, catalogueOfVersion } from "./offers";
import type { BillingProviderFactory } from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";
import { samePeriodWindow } from "./saroh-invoice-terms";

type Tx = Prisma.TransactionClient;

/**
 * Add-ons on the bill (pricing catalogue U16). An add-on is charged after
 * the period it covers, on the provider subscription's next charge, as a
 * line of that charge's invoice:
 *
 * - **At the start of each period** (the renewal webhook, `rollInTx`) a
 *   row for every add-on held then, the whole period at its price for the
 *   cycle. Removing it later in the period doesn't undo that row.
 * - **Bought part-way through** (`AddonsService`) a row for what is left of
 *   the period, prorated once.
 * - **`billing.addons.sync`** puts each QUEUED row on the provider
 *   subscription's next charge (SENT); the renewal invoice takes the SENT
 *   rows for the charge just made as its lines (INVOICED). A row the
 *   provider never took moves to the next charge.
 * - A plan change that hands billing to a new provider subscription takes
 *   its rows along (`rehomeInTx`); leaving for Free drops them
 *   (`clearInTx`) with the add-ons.
 * - An add-on is held, counted and charged only on a plan it is offered on
 *   (DEC-157): a change of plan ends the ones the new plan isn't offered
 *   (`endAddonsNotOfferedInTx`), and the renewal charges none of them.
 *
 * Unverified provider behaviour is in `PRICING_ROLLOUT.md` (U16).
 */
export const BILLING_ADDONS_SYNC_TYPE = "billing.addons.sync";

export interface AddonsSyncPayload {
    subscriptionId: string;
}

export async function enqueueAddonsSync(
    tx: Pick<Tx, "job">,
    input: { organizationId: string; subscriptionId: string },
): Promise<void> {
    await tx.job.create({
        data: {
            type: BILLING_ADDONS_SYNC_TYPE,
            organizationId: input.organizationId,
            payload: { subscriptionId: input.subscriptionId },
        },
    });
}

/** Write rows for one provider subscription's next charge, and queue the send. */
export async function queueAddonChargesInTx(
    tx: Tx,
    input: {
        organizationId: string;
        subscriptionId: string;
        provider: string;
        providerSubscriptionId: string;
        chargeAt: Date;
        lines: AddonChargeLine[];
    },
): Promise<number> {
    if (input.lines.length === 0) return 0;
    await tx.subscriptionAddonCharge.createMany({
        data: input.lines.map((l) => ({
            organizationId: input.organizationId,
            subscriptionId: input.subscriptionId,
            addonId: l.addonId,
            description: l.description,
            quantity: l.quantity,
            unitPaise: l.unitPaise,
            periodStart: l.periodStart,
            periodEnd: l.periodEnd,
            chargeAt: input.chargeAt,
            provider: input.provider,
            providerSubscriptionId: input.providerSubscriptionId,
        })),
    });
    await enqueueAddonsSync(tx, input);
    return input.lines.length;
}

/**
 * A renewal charge was taken at `chargedAt` and the next period runs to
 * `nextEnd`: rows the provider never took move on to the next charge, and
 * every add-on held now gets its row for the period just begun. Reads the
 * subscription as it is now (after any move the renewal applied), so the
 * add-ons are priced on its plan's version. A second call for the same
 * period writes nothing.
 */
export async function rollAddonChargesInTx(
    tx: Tx,
    input: { subscriptionId: string; chargedAt: Date; nextEnd: Date },
): Promise<void> {
    const sub = await tx.subscription.findUnique({
        where: { id: input.subscriptionId },
        select: {
            id: true,
            organizationId: true,
            status: true,
            provider: true,
            providerSubscriptionId: true,
            billingCycle: true,
            plan: { select: { key: true, version: true, priceCents: true } },
            addons: { select: { addonId: true, quantity: true } },
        },
    });
    if (!sub?.provider || !sub.providerSubscriptionId) return;
    if (sub.status !== "ACTIVE" || sub.plan.priceCents <= 0) return;
    const cycle = sub.billingCycle === "year" ? "year" : "month";

    const carried = await tx.subscriptionAddonCharge.updateMany({
        where: {
            subscriptionId: sub.id,
            providerSubscriptionId: sub.providerSubscriptionId,
            status: "QUEUED",
            chargeAt: { lte: input.nextEnd },
        },
        data: { chargeAt: input.nextEnd },
    });

    const planId = catalogPlanIdForKey(sub.plan.key);
    const catalog = planId
        ? await catalogueOfVersion(tx, sub.plan.version)
        : null;
    const lines: AddonChargeLine[] = [];
    if (catalog && planId && sub.addons.length > 0) {
        const done = await tx.subscriptionAddonCharge.findMany({
            where: {
                subscriptionId: sub.id,
                periodEnd: samePeriodWindow(input.nextEnd, cycle),
                periodStart: input.chargedAt,
            },
            select: { addonId: true },
        });
        const already = new Set(done.map((d) => d.addonId));
        for (const held of sub.addons) {
            const addon = catalog.addons.find((a) => a.id === held.addonId);
            if (!addon || held.quantity <= 0 || already.has(addon.id)) {
                continue;
            }
            // Another plan's add-on adds nothing here, so it owes nothing.
            if (!addonOfferedOn(addon, planId)) continue;
            lines.push(
                addonPeriodLine(
                    addon,
                    held.quantity,
                    cycle,
                    input.chargedAt,
                    input.nextEnd,
                ),
            );
        }
    }
    const made = await queueAddonChargesInTx(tx, {
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        provider: sub.provider,
        providerSubscriptionId: sub.providerSubscriptionId,
        chargeAt: input.nextEnd,
        lines,
    });
    if (made === 0 && carried.count > 0) {
        await enqueueAddonsSync(tx, {
            organizationId: sub.organizationId,
            subscriptionId: sub.id,
        });
    }
}

/**
 * Billing moves from one provider subscription to another (an upgrade, a
 * scheduled change, another plan during a trial): what was owed on the old
 * one's next charge rides on the new one's first, sent again from scratch.
 * The old one never charges again, so what it held goes with it.
 */
export async function rehomeAddonChargesInTx(
    tx: Tx,
    input: {
        organizationId: string;
        subscriptionId: string;
        fromProviderSubscriptionId: string;
        provider: string;
        toProviderSubscriptionId: string;
    },
): Promise<void> {
    const moved = await tx.subscriptionAddonCharge.updateMany({
        where: {
            subscriptionId: input.subscriptionId,
            providerSubscriptionId: input.fromProviderSubscriptionId,
            status: { in: ["QUEUED", "SENT"] },
        },
        data: {
            provider: input.provider,
            providerSubscriptionId: input.toProviderSubscriptionId,
            providerChargeId: null,
            status: "QUEUED",
        },
    });
    if (moved.count > 0) await enqueueAddonsSync(tx, input);
}

/**
 * The add-ons go (a new plan from Free, or a move to Free): the held rows,
 * and whatever was owed and not yet charged — there is no further charge
 * for it to ride on.
 */
export async function clearAddonsInTx(
    tx: Tx,
    subscriptionId: string,
): Promise<void> {
    await tx.subscriptionAddon.deleteMany({ where: { subscriptionId } });
    await tx.subscriptionAddonCharge.updateMany({
        where: { subscriptionId, status: { in: ["QUEUED", "SENT"] } },
        data: { status: "DROPPED" },
    });
}

/**
 * The subscription is on another plan now (an upgrade, a move applied):
 * an add-on held that the new plan isn't offered ends with the old plan
 * (DEC-157). The new plan's own add-on of that kind is never bought for the
 * business; it chooses that in Settings › Plan. What a period already owes
 * stays owed, as when an add-on is removed by hand. An add-on the plan's
 * version doesn't have at all is left as it always was: held, and inert.
 */
export async function endAddonsNotOfferedInTx(
    tx: Tx,
    subscriptionId: string,
): Promise<HeldAddon[]> {
    const sub = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        select: {
            plan: { select: { key: true, version: true } },
            addons: { select: { addonId: true, quantity: true } },
        },
    });
    if (!sub || sub.addons.length === 0) return [];
    const planId = catalogPlanIdForKey(sub.plan.key);
    const catalog = planId
        ? await catalogueOfVersion(tx, sub.plan.version)
        : null;
    if (!catalog || !planId) return [];
    // The rule the change's quote names them by (`addons-ending.ts`).
    const ended = addonsNotOffered(catalog, planId, sub.addons);
    if (ended.length === 0) return [];
    await tx.subscriptionAddon.deleteMany({
        where: {
            subscriptionId,
            addonId: { in: ended.map((e) => e.addonId) },
        },
    });
    return ended;
}

/** The add-ons a plan change ended, for the audit log after commit. */
export interface EndedAddons {
    organizationId: string;
    subscriptionId: string;
    /** Who made the change; null: the provider's event, or the sweep. */
    actorUserId: string | null;
    addons: HeldAddon[];
}

/**
 * One row per add-on a plan change ended (DEC-157), written as an add-on
 * change is: what it held, now none, and why. Nothing is written when none
 * ended.
 */
export async function recordAddonsEnded(
    audit: AuditService | undefined,
    ended: EndedAddons | undefined,
): Promise<void> {
    if (!audit || !ended) return;
    for (const addon of ended.addons) {
        await audit.record({
            action: AuditAction.PlanAddonChange,
            actorUserId: ended.actorUserId ?? "billing-provider",
            organizationId: ended.organizationId,
            targetType: "subscription",
            targetId: ended.subscriptionId,
            outcome: AuditOutcome.Success,
            metadata: {
                addonId: addon.addonId,
                from: addon.quantity,
                to: 0,
                reason: "plan-change",
            },
        });
    }
}

/** The rows a charge at `chargedAt` took, for its invoice's lines. */
export async function chargedAddonRowsInTx(
    tx: Tx,
    input: {
        organizationId: string;
        provider: string;
        providerSubscriptionId: string;
        chargedAt: Date;
        cycle: "month" | "year";
    },
) {
    return tx.subscriptionAddonCharge.findMany({
        where: {
            organizationId: input.organizationId,
            provider: input.provider,
            providerSubscriptionId: input.providerSubscriptionId,
            status: "SENT",
            chargeAt: samePeriodWindow(input.chargedAt, input.cycle),
        },
        orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }],
    });
}

/**
 * `billing.addons.sync`: each QUEUED row of the subscription's current
 * provider subscription, put on its next charge, GST included. Idempotent:
 * a row is sent under its own id as the reference, and only a QUEUED row is
 * moved to SENT. A refusal is logged and the row waits (it moves to the next
 * charge at the renewal); anything unanswered is retried by the queue.
 */
@Injectable()
export class AddonsSyncHandler {
    private readonly logger = new Logger(AddonsSyncHandler.name);

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const p = job.payload as Partial<AddonsSyncPayload> | null;
        if (!p?.subscriptionId) {
            this.logger.error(`billing_addons_sync_bad_payload job=${job.id}`);
            return;
        }
        const sub = await prisma.subscription.findUnique({
            where: { id: p.subscriptionId },
            select: {
                provider: true,
                providerSubscriptionId: true,
                organization: { select: { lifecycleStatus: true } },
            },
        });
        if (!sub?.provider || !sub.providerSubscriptionId) return;
        // A closing or deleted business is sent nothing to be charged
        // (#921). Its rows wait QUEUED: a reinstated business's go with its
        // next charge; a deleted one's are dropped with its subscription.
        if (!billingMayCharge(sub.organization.lifecycleStatus)) {
            this.logger.warn(
                `billing_addons_sync_business_closed job=${job.id} subscription=${p.subscriptionId}`,
            );
            return;
        }
        const provider = this.providers.get(sub.provider);
        if (!provider.charges) {
            this.logger.warn(
                `billing_addons_sync_unsupported job=${job.id} provider=${sub.provider}`,
            );
            return;
        }
        const rows = await prisma.subscriptionAddonCharge.findMany({
            where: {
                subscriptionId: p.subscriptionId,
                providerSubscriptionId: sub.providerSubscriptionId,
                status: "QUEUED",
            },
            orderBy: { createdAt: "asc" },
        });
        for (const row of rows) {
            let providerChargeId: string;
            try {
                ({ providerChargeId } = await provider.charges.addToNextCharge({
                    providerSubscriptionId: row.providerSubscriptionId,
                    reference: row.id,
                    name: row.description,
                    amountPaise: withGstPaise(row.quantity * row.unitPaise),
                    currency: "INR",
                }));
            } catch (error) {
                if (
                    error instanceof BillingProviderError &&
                    error.kind === "REFUSED"
                ) {
                    this.logger.warn(
                        `billing_addons_sync_refused job=${job.id} row=${row.id}: ${error.message}`,
                    );
                    continue;
                }
                throw error;
            }
            await prisma.subscriptionAddonCharge.updateMany({
                where: { id: row.id, status: "QUEUED" },
                data: { status: "SENT", providerChargeId },
            });
        }
    };
}

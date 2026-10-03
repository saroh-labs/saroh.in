import { randomUUID } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { BillingCheckout, Plan, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { BillingCycle } from "@saroh/pricing-catalog";
import { catalogPlanIdForKey } from "@saroh/pricing-catalog";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { gstinProblem, stateCode } from "../invoices/gst-states";
import { authorize } from "../organizations/organization-policy";
import type { ChangeKind, ChangeQuote } from "./checkout-quote";
import { billedByProvider, quoteChange } from "./checkout-quote";
import { PlansService } from "./plans.service";
import { enqueueProviderCancel } from "./provider-cancel.job";
import { CATALOGUE_BILLING_PROVIDER } from "./provider-plan-sync.service";
import type { BillingProviderFactory } from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";

type Tx = Prisma.TransactionClient;

/** How long a checkout waits to be authorised before it lapses. */
export const CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;

/** `GET …/billing/change-plan`: what a change would be, and cost. */
export interface ChangePlanQuoteView {
    plan: { id: string; name: string; version: number };
    cycle: BillingCycle;
    kind: ChangeKind;
    /** The recurring charge per cycle, before GST, its GST and the total. */
    pricePaise: number;
    gstPaise: number;
    totalPaise: number;
    /** Taken when it's authorised: an upgrade's difference, else zero. */
    chargeNowPaise: number;
    chargeNowGstPaise: number;
    chargeNowTotalPaise: number;
    /** When the plan's own charges start; null: at authorisation. */
    startAt: string | null;
    /** When it is on the plan; null: once authorised. */
    effectiveAt: string | null;
}

/** A checkout as the business sees it; never the provider's link. */
export interface CheckoutView {
    id: string;
    kind: string;
    status: string;
    plan: { id: string; name: string; version: number };
    cycle: string;
    pricePaise: number;
    chargeNowPaise: number;
    chargeNowGstPaise: number;
    startAt: string | null;
    expiresAt: string;
    createdAt: string;
}

/** `POST …/billing/change-plan`. */
export type ChangePlanResult =
    | {
          kind: "TO_FREE";
          quote: ChangePlanQuoteView;
          /** When it is on the free plan. */
          effectiveAt: string;
      }
    | {
          kind: "NEW" | "UPGRADE" | "SCHEDULED";
          quote: ChangePlanQuoteView;
          checkout: CheckoutView;
          /**
           * The provider's page where the business authorises it. Given once,
           * here; Saroh doesn't keep it. Null when the provider makes none.
           */
          authorisationUrl: string | null;
      };

/** `GET …/billing/checkout`: the checkouts still in play. */
export interface CheckoutsView {
    open: CheckoutView | null;
    scheduled: CheckoutView | null;
}

const SUB_SELECT = {
    id: true,
    status: true,
    provider: true,
    providerSubscriptionId: true,
    currentPeriodEnd: true,
    cancelAtPeriodEnd: true,
    pendingPlanId: true,
    pendingFrom: true,
    plan: {
        select: {
            id: true,
            key: true,
            name: true,
            version: true,
            interval: true,
            priceCents: true,
        },
    },
} as const;

/**
 * Saroh's own checkout and plan changes (pricing catalogue U15, R9): a
 * business moves between the catalogue's plans from Settings › Plan, and
 * only through here — provider-managed subscriptions change only on this
 * path and on the provider's webhooks (`BillingWebhookService`).
 *
 * The client names a plan and a cycle and nothing else: the plan row comes
 * from the live version, and every amount from `quoteChange` on the server
 * (KTD-18). The site's `?plan=&cycle=` only preselects the same two.
 *
 * - **To a free plan**: no checkout. At the end of the period already paid
 *   (the provider subscription is told to end with it), or at once when
 *   nothing is paid at the provider.
 * - **To a paid plan**: a checkout — a new provider subscription on the
 *   plan's provider plan, authorised by the business on the provider's page
 *   — completed by the webhook. An upgrade is on the new plan as soon as
 *   it's authorised, paying the difference for the rest of the period; a
 *   cheaper plan or the other cycle starts at the period's end. A new
 *   checkout replaces an open one.
 *
 * Nothing here enforces limits (U13) or offers trials, yearly coupons or
 * add-ons (U16).
 */
@Injectable()
export class CheckoutService {
    private readonly logger = new Logger(CheckoutService.name);

    constructor(
        private readonly plans: PlansService,
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
        @Optional() private readonly audit?: AuditService,
    ) {}

    async quote(
        ctx: OrganizationContext,
        input: { plan: string; cycle: BillingCycle },
        now: Date = new Date(),
    ): Promise<ChangePlanQuoteView> {
        authorize(ctx, "billing:read");
        const { target, quote } = await this.resolve(
            ctx.organizationId,
            input,
            now,
        );
        return this.quoteView(target, quote);
    }

    async current(ctx: OrganizationContext): Promise<CheckoutsView> {
        authorize(ctx, "billing:read");
        const rows = await prisma.billingCheckout.findMany({
            where: {
                organizationId: ctx.organizationId,
                status: { in: ["OPEN", "SCHEDULED"] },
            },
            include: { plan: true },
        });
        const view = (status: string) => {
            const row = rows.find((r) => r.status === status);
            return row ? checkoutView(row, row.plan) : null;
        };
        return { open: view("OPEN"), scheduled: view("SCHEDULED") };
    }

    /** Change plan: to Free at once or at period end, else a checkout. */
    async changePlan(
        ctx: OrganizationContext,
        input: {
            plan: string;
            cycle: BillingCycle;
            billingState?: string | null;
            gstin?: string | null;
        },
        now: Date = new Date(),
    ): Promise<ChangePlanResult> {
        authorize(ctx, "billing:manage");
        const billTo = checkoutBillTo(input);
        const { target, quote, subscription } = await this.resolve(
            ctx.organizationId,
            input,
            now,
        );
        const view = this.quoteView(target, quote);
        if (quote.kind === "NONE") {
            throw new ConflictException(`You're already on ${target.name}.`);
        }
        if (quote.kind === "TO_FREE") {
            const at = await this.toFree(ctx, target, now);
            await this.audit?.record({
                action: AuditAction.PlanChange,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "subscription",
                targetId: subscription?.id ?? ctx.organizationId,
                outcome: AuditOutcome.Success,
                metadata: {
                    from: subscription?.plan.name ?? null,
                    to: target.name,
                    at: at.toISOString(),
                },
                actorRoleKey: ctx.roleKey,
            });
            return {
                kind: "TO_FREE",
                quote: view,
                effectiveAt: at.toISOString(),
            };
        }
        return this.checkout(ctx, target, quote, view, now, billTo);
    }

    // ── Steps ───────────────────────────────────────────────────────────

    private async resolve(
        organizationId: string,
        input: { plan: string; cycle: BillingCycle },
        now: Date,
    ) {
        let target = await this.plans.resolveCatalogue(
            input.plan,
            input.cycle,
            now,
        );
        // Free has no cycle to choose: its monthly row.
        if (target.priceCents === 0 && input.cycle !== "month") {
            target = await this.plans.resolveCatalogue(
                input.plan,
                "month",
                now,
            );
        }
        if (!target.active) {
            throw new ConflictException(
                `${target.name} isn't offered any more.`,
            );
        }
        const subscription = await prisma.subscription.findUnique({
            where: { organizationId },
            select: SUB_SELECT,
        });
        const quote = quoteChange({ subscription, target, now });
        return { target, quote, subscription };
    }

    private quoteView(target: Plan, quote: ChangeQuote): ChangePlanQuoteView {
        return {
            plan: {
                id: catalogPlanIdForKey(target.key) ?? target.key,
                name: target.name,
                version: target.version,
            },
            cycle: target.interval === "year" ? "year" : "month",
            kind: quote.kind,
            pricePaise: quote.pricePaise,
            gstPaise: quote.gstPaise,
            totalPaise: quote.totalPaise,
            chargeNowPaise: quote.chargeNowPaise,
            chargeNowGstPaise: quote.chargeNowGstPaise,
            chargeNowTotalPaise: quote.chargeNowTotalPaise,
            startAt: quote.startAt?.toISOString() ?? null,
            effectiveAt: quote.effectiveAt?.toISOString() ?? null,
        };
    }

    /**
     * To a free plan. Paid at the provider: a pending move at the period's
     * end, and the provider subscription told to end with it. Otherwise on
     * it now. Either way an open or scheduled checkout is given up.
     */
    private async toFree(
        ctx: OrganizationContext,
        target: Plan,
        now: Date,
    ): Promise<Date> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "organizationId" = ${ctx.organizationId} FOR UPDATE`;
            const sub = await tx.subscription.findUnique({
                where: { organizationId: ctx.organizationId },
                select: SUB_SELECT,
            });
            await this.dropLiveCheckouts(
                tx,
                ctx.organizationId,
                "changed-plan",
            );
            const live = sub && sub.status !== "CANCELLED" ? sub : null;
            const periodEnd =
                live?.currentPeriodEnd && live.currentPeriodEnd > now
                    ? live.currentPeriodEnd
                    : null;
            if (!sub) {
                await tx.subscription.create({
                    data: {
                        organizationId: ctx.organizationId,
                        planId: target.id,
                        status: "ACTIVE",
                        billingCycle: "month",
                    },
                });
                return now;
            }
            if (
                live?.provider &&
                live.providerSubscriptionId &&
                billedByProvider(live) &&
                periodEnd
            ) {
                await tx.subscription.update({
                    where: { id: sub.id },
                    data: {
                        pendingPlanId: target.id,
                        pendingFrom: periodEnd,
                        cancelAtPeriodEnd: true,
                    },
                });
                await enqueueProviderCancel(tx, {
                    organizationId: ctx.organizationId,
                    provider: live.provider,
                    providerSubscriptionId: live.providerSubscriptionId,
                    atCycleEnd: true,
                });
                return periodEnd;
            }
            // Nothing paid ahead: on Free now. A provider subscription still
            // running (a past-due one) is ended at once.
            if (sub.provider && sub.providerSubscriptionId && live) {
                await enqueueProviderCancel(tx, {
                    organizationId: ctx.organizationId,
                    provider: sub.provider,
                    providerSubscriptionId: sub.providerSubscriptionId,
                    atCycleEnd: false,
                });
            }
            await tx.subscription.update({
                where: { id: sub.id },
                data: {
                    planId: target.id,
                    billingCycle: "month",
                    status: "ACTIVE",
                    provider: null,
                    providerSubscriptionId: null,
                    providerCustomerId: null,
                    currentPeriodEnd: null,
                    cancelAtPeriodEnd: false,
                    pendingPlanId: null,
                    pendingFrom: null,
                    providerEventAt: null,
                },
            });
            return now;
        });
    }

    /**
     * A paid plan: a new provider subscription on the plan's provider plan,
     * then the OPEN checkout that waits for its authorisation. A provider
     * subscription made for a checkout that couldn't be recorded is
     * cancelled again.
     */
    private async checkout(
        ctx: OrganizationContext,
        target: Plan,
        quote: ChangeQuote,
        view: ChangePlanQuoteView,
        now: Date,
        billTo: CheckoutBillTo = { billToState: null, billToGstin: null },
    ): Promise<ChangePlanResult> {
        const kind = quote.kind as "NEW" | "UPGRADE" | "SCHEDULED";
        const providerPlan = await prisma.pricingProviderPlan.findUnique({
            where: {
                planId_provider: {
                    planId: target.id,
                    provider: CATALOGUE_BILLING_PROVIDER,
                },
            },
            select: { status: true, providerPlanId: true },
        });
        // Yearly rows get a provider plan only while yearly is offered.
        if (!providerPlan && view.cycle === "year") {
            throw new ConflictException(`${target.name} isn't offered yearly.`);
        }
        if (providerPlan?.status !== "SYNCED" || !providerPlan.providerPlanId) {
            throw new ConflictException(
                `${target.name} ${view.cycle === "year" ? "yearly" : "monthly"} can't be bought yet. Try again in a few minutes.`,
            );
        }

        const id = randomUUID();
        let made;
        try {
            made = await this.providers
                .get(CATALOGUE_BILLING_PROVIDER)
                .createSubscription({
                    planKey: target.key,
                    planId: target.id,
                    priceCents: target.priceCents,
                    currency: target.currency,
                    interval: target.interval,
                    organizationId: ctx.organizationId,
                    providerPlanId: providerPlan.providerPlanId,
                    startAt: quote.startAt,
                    upfront:
                        quote.chargeNowTotalPaise > 0
                            ? {
                                  name: `${target.name}: the rest of this period`,
                                  amountPaise: quote.chargeNowTotalPaise,
                              }
                            : null,
                    reference: id,
                });
        } catch (error) {
            this.logger.warn(
                `billing_checkout_provider_failed org=${ctx.organizationId}: ${error instanceof Error ? error.message : "unknown"}`,
            );
            if (error instanceof BillingProviderError) {
                throw new ServiceUnavailableException(
                    "We couldn't start the payment just now. Try again in a minute.",
                );
            }
            throw error;
        }

        const cycle: BillingCycle =
            target.interval === "year" ? "year" : "month";
        const data: Prisma.BillingCheckoutUncheckedCreateInput = {
            id,
            organizationId: ctx.organizationId,
            planId: target.id,
            cycle,
            kind,
            status: "OPEN",
            provider: CATALOGUE_BILLING_PROVIDER,
            providerSubscriptionId: made.providerSubscriptionId,
            providerPlanId: providerPlan.providerPlanId,
            providerCustomerId: made.providerCustomerId ?? null,
            pricePaise: target.priceCents,
            chargeNowPaise: quote.chargeNowPaise,
            chargeNowGstPaise: quote.chargeNowGstPaise,
            startAt: kind === "NEW" ? null : quote.startAt,
            expiresAt: new Date(now.getTime() + CHECKOUT_TTL_MS),
            createdByUserId: ctx.userId,
            ...billTo,
        };
        let row: BillingCheckout;
        try {
            row = await prisma.$transaction(async (tx) => {
                await this.dropOpenCheckout(tx, ctx.organizationId);
                return tx.billingCheckout.create({ data });
            });
        } catch (error) {
            // Not recorded: the provider subscription made for it must go.
            await prisma.$transaction((tx) =>
                enqueueProviderCancel(tx, {
                    organizationId: ctx.organizationId,
                    provider: CATALOGUE_BILLING_PROVIDER,
                    providerSubscriptionId: made.providerSubscriptionId,
                    atCycleEnd: false,
                }),
            );
            if (prismaErrorCode(error) === "P2002") {
                throw new ConflictException(
                    "Another plan change started at the same moment. Reload and try again.",
                );
            }
            throw error;
        }
        return {
            kind,
            quote: view,
            checkout: checkoutView(row, target),
            authorisationUrl: made.authorisationUrl ?? null,
        };
    }

    /** An OPEN checkout is replaced by a new one. */
    private async dropOpenCheckout(tx: Tx, organizationId: string) {
        const open = await tx.billingCheckout.findMany({
            where: { organizationId, status: "OPEN" },
        });
        for (const c of open) {
            await tx.billingCheckout.update({
                where: { id: c.id },
                data: { status: "CANCELLED", endedReason: "replaced" },
            });
            await enqueueProviderCancel(tx, {
                organizationId,
                provider: c.provider,
                providerSubscriptionId: c.providerSubscriptionId,
                atCycleEnd: false,
            });
        }
    }

    /** Every OPEN or SCHEDULED checkout given up, its provider side too. */
    private async dropLiveCheckouts(
        tx: Tx,
        organizationId: string,
        reason: string,
    ) {
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
    }
}

/** A typed value, trimmed; blank is none. */
function nonEmpty(value: string | null | undefined): string | null {
    const t = value?.trim();
    return t === undefined || t === "" ? null : t;
}

/** Who Saroh's invoice for a checkout is billed to (U17). */
export interface CheckoutBillTo {
    billToState: string | null;
    billToGstin: string | null;
}

/**
 * The state and GSTIN given at checkout, checked before anything is made at
 * the provider: a state must be a GST state, and a GSTIN must check out and,
 * with a state, be registered there. A GSTIN alone gives its own state.
 */
export function checkoutBillTo(input: {
    billingState?: string | null;
    gstin?: string | null;
}): CheckoutBillTo {
    const typedState = nonEmpty(input.billingState);
    const state = typedState ? stateCode(typedState) : null;
    if (typedState && !state) {
        throw new BadRequestException(
            "Choose the state your business is registered in.",
        );
    }
    const gstin = nonEmpty(input.gstin)?.toUpperCase() ?? null;
    if (gstin) {
        const problem = gstinProblem(gstin, state);
        if (problem) throw new BadRequestException(problem);
    }
    return {
        billToState: state ?? (gstin ? gstin.slice(0, 2) : null),
        billToGstin: gstin,
    };
}

export function checkoutView(row: BillingCheckout, plan: Plan): CheckoutView {
    return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        plan: {
            id: catalogPlanIdForKey(plan.key) ?? plan.key,
            name: plan.name,
            version: plan.version,
        },
        cycle: row.cycle,
        pricePaise: row.pricePaise,
        chargeNowPaise: row.chargeNowPaise,
        chargeNowGstPaise: row.chargeNowGstPaise,
        startAt: row.startAt?.toISOString() ?? null,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
    };
}

import { randomUUID } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
    Logger,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import type {
    BillingCheckout,
    Plan,
    PricingCoupon,
    Prisma,
} from "@saroh/database";
import { prisma } from "@saroh/database";
import type { BillingCycle } from "@saroh/pricing-catalog";
import { catalogPlanIdForKey, withGstPaise } from "@saroh/pricing-catalog";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { gstinProblem, stateCode } from "../invoices/gst-states";
import { authorize } from "../organizations/organization-policy";
import { findUsableCoupon } from "../pricing/coupons.service";
import { clearAddonsInTx } from "./addon-charges";
import type { Term } from "./billing-term";
import { isOneTime, ONE_TIME_PAYMENT, termOf } from "./billing-term";
import type {
    ChangeKind,
    ChangeQuote,
    MandateCheck,
    PaymentKind,
} from "./checkout-quote";
import {
    billedByProvider,
    COUPON_KINDS,
    quoteChange,
    TERM_CHARGES,
} from "./checkout-quote";
import {
    catalogueOfVersion,
    hadTrial,
    planFirstPaise,
    planTrialDays,
} from "./offers";
import { PlansService } from "./plans.service";
import { enqueueProviderCancel } from "./provider-cancel.job";
import { CATALOGUE_BILLING_PROVIDER } from "./provider-plan-sync.service";
import type {
    BillingProvider,
    BillingProviderFactory,
    CheckoutHandoff,
} from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";

type Tx = Prisma.TransactionClient;

/** How long a checkout waits to be authorised before it lapses. */
export const CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Coupon tries a minute (U16): per business, and per address across
 * businesses. In-process, like every limiter here (`FixedWindowRateLimiter`):
 * a speed bump against guessing codes, not a guarantee.
 */
export const COUPON_TRIES_PER_ORG = 10;
export const COUPON_TRIES_PER_ADDRESS = 30;

/** Who is asking, for the coupon limit: the caller's address, hashed. */
export interface CheckoutClient {
    addressKey?: string | null;
}

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
    /** A trial's end, when its first charge is taken (U16); else null. */
    trialEndsAt: string | null;
    /**
     * The coupon (U16): its code, what it takes off each of the first
     * `charges` charges before GST, and that first charge after it.
     */
    coupon: { code: string; discountPaise: number; charges: number } | null;
    firstChargePaise: number;
    firstChargeGstPaise: number;
    firstChargeTotalPaise: number;
    /**
     * How it's paid (DEC-093): monthly autopay for `termCharges` charges,
     * then a one-tap renewal; or yearly's one payment.
     */
    payment: PaymentKind;
    termCharges: number;
    /** Exactly what is taken as it's authorised, GST included. */
    payNowTotalPaise: number;
    /** What setting up autopay takes now, named honestly (DEC-093). */
    mandateCheck: MandateCheck;
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
    /** A coupon's discount off each of the first `discountCharges` charges. */
    discountPaise: number;
    discountCharges: number;
    startAt: string | null;
    expiresAt: string;
    createdAt: string;
    /** Monthly autopay, or yearly's one payment (DEC-093). */
    payment: PaymentKind;
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
          kind: CheckoutKind;
          quote: ChangePlanQuoteView;
          checkout: CheckoutView;
          /**
           * The provider's page where the business authorises it. Given once,
           * here; Saroh doesn't keep it. Null when the provider makes none
           * (a yearly order is paid in the provider's window).
           */
          authorisationUrl: string | null;
          /**
           * What opens the provider's own checkout window over Saroh, with
           * the owner's details pre-filled (DEC-093); null when the
           * provider has none. Paying there comes back to the page, which
           * confirms it with the provider (`POST …/billing/checkout/confirm`).
           */
          handoff: CheckoutHandoff | null;
      };

/** The kinds of change that make a checkout. */
export type CheckoutKind = "NEW" | "UPGRADE" | "SCHEDULED" | "TRIAL" | "RENEW";

/** `GET …/billing/checkout`: the checkouts still in play. */
export interface CheckoutsView {
    /**
     * Waiting for the business to pay; `handoff` reopens the same payment
     * (never a second mandate) when the provider has a window.
     */
    open: (CheckoutView & { handoff: CheckoutHandoff | null }) | null;
    scheduled: CheckoutView | null;
    /**
     * The 12-month term of the plan it's on (DEC-093, #803), when it has
     * one: its end, how it's paid, and whether the one-tap renewal is open.
     */
    term: { endsAt: string; payment: PaymentKind; renewOpen: boolean } | null;
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
 * - **Offers** (U16): a paid plan's free trial where it would be NEW and
 *   the business never had one (TRIAL: on the plan once authorised, the
 *   first charge at the trial's end); a coupon on a checkout that starts a
 *   plan, checked as usable (`findUsableCoupon`), rate-limited, and carried
 *   on the checkout for the provider and the webhook (which redeems it with
 *   the first discounted charge). Yearly is the plan's yearly row, sold
 *   only while the catalogue offers yearly.
 *
 * Nothing here enforces limits (U13); add-ons are `AddonsService`.
 */
@Injectable()
export class CheckoutService {
    private readonly logger = new Logger(CheckoutService.name);
    private readonly couponTriesByOrg = new FixedWindowRateLimiter(
        COUPON_TRIES_PER_ORG,
        60_000,
    );
    private readonly couponTriesByAddress = new FixedWindowRateLimiter(
        COUPON_TRIES_PER_ADDRESS,
        60_000,
    );

    constructor(
        private readonly plans: PlansService,
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
        @Optional() private readonly audit?: AuditService,
    ) {}

    async quote(
        ctx: OrganizationContext,
        input: { plan: string; cycle: BillingCycle; coupon?: string | null },
        now: Date = new Date(),
        client: CheckoutClient = {},
    ): Promise<ChangePlanQuoteView> {
        authorize(ctx, "billing:read");
        this.limitCouponTries(ctx.organizationId, input.coupon, client, now);
        const { target, quote, coupon } = await this.resolve(
            ctx.organizationId,
            input,
            now,
        );
        return this.quoteView(target, quote, coupon);
    }

    async current(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<CheckoutsView> {
        authorize(ctx, "billing:read");
        const [rows, subscription] = await Promise.all([
            prisma.billingCheckout.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    status: { in: ["OPEN", "SCHEDULED"] },
                },
                include: { plan: true },
            }),
            prisma.subscription.findUnique({
                where: { organizationId: ctx.organizationId },
                select: SUB_SELECT,
            }),
        ]);
        const view = (status: string) => {
            const row = rows.find((r) => r.status === status);
            return row ? checkoutView(row, row.plan) : null;
        };
        const openRow = rows.find((r) => r.status === "OPEN");
        const open = openRow
            ? {
                  ...checkoutView(openRow, openRow.plan),
                  handoff: await this.handoff(ctx, openRow, payNowOf(openRow)),
              }
            : null;
        const term = await this.termOfSubscription(subscription, now);
        return {
            open,
            scheduled: view("SCHEDULED"),
            term: term
                ? {
                      endsAt: term.endsAt.toISOString(),
                      payment: term.payment,
                      renewOpen: term.renewOpen,
                  }
                : null,
        };
    }

    /** The term of the plan the subscription is billed for (DEC-093). */
    private async termOfSubscription(
        sub: {
            status: string;
            provider: string | null;
            providerSubscriptionId: string | null;
            currentPeriodEnd: Date | null;
            plan: { priceCents: number };
        } | null,
        now: Date,
    ): Promise<Term | null> {
        if (
            !sub ||
            sub.status === "CANCELLED" ||
            !sub.provider ||
            !sub.providerSubscriptionId ||
            sub.plan.priceCents <= 0
        ) {
            return null;
        }
        const checkout = await prisma.billingCheckout.findUnique({
            where: {
                provider_providerSubscriptionId: {
                    provider: sub.provider,
                    providerSubscriptionId: sub.providerSubscriptionId,
                },
            },
            select: {
                providerPlanId: true,
                cycle: true,
                startAt: true,
                completedAt: true,
                createdAt: true,
            },
        });
        return termOf(sub, checkout, now);
    }

    /**
     * What the browser opens the provider's checkout window with: the
     * provider's public key, the subscription or order, and the owner's
     * email and the business's phone, pre-filled. Null when the provider
     * has no window (its page link is used instead).
     */
    private async handoff(
        ctx: OrganizationContext,
        row: Pick<
            BillingCheckout,
            "provider" | "providerSubscriptionId" | "providerPlanId"
        >,
        amountPaise: number,
    ): Promise<CheckoutHandoff | null> {
        let provider: BillingProvider;
        try {
            provider = this.providers.get(row.provider);
        } catch {
            // A provider no longer known: the page link, if any, is the way.
            return null;
        }
        const keyId = provider.publicKey?.() ?? null;
        if (!keyId) return null;
        const [user, profile, org] = await Promise.all([
            prisma.user.findUnique({
                where: { id: ctx.userId },
                select: { email: true, name: true },
            }),
            prisma.businessProfile.findUnique({
                where: { organizationId: ctx.organizationId },
                select: { phone: true },
            }),
            prisma.organization.findUnique({
                where: { id: ctx.organizationId },
                select: { name: true },
            }),
        ]);
        const oneTime = isOneTime(row);
        return {
            provider: row.provider,
            keyId,
            subscriptionId: oneTime ? null : row.providerSubscriptionId,
            orderId: oneTime ? row.providerSubscriptionId : null,
            amountPaise: oneTime ? amountPaise : null,
            currency: "INR",
            prefill: {
                name: org?.name ?? user?.name ?? null,
                email: user?.email ?? null,
                contact: profile?.phone ?? null,
            },
        };
    }

    /** Change plan: to Free at once or at period end, else a checkout. */
    async changePlan(
        ctx: OrganizationContext,
        input: {
            plan: string;
            cycle: BillingCycle;
            billingState?: string | null;
            gstin?: string | null;
            coupon?: string | null;
        },
        now: Date = new Date(),
        client: CheckoutClient = {},
    ): Promise<ChangePlanResult> {
        authorize(ctx, "billing:manage");
        const billTo = checkoutBillTo(input);
        this.limitCouponTries(ctx.organizationId, input.coupon, client, now);
        const { target, quote, subscription, coupon } = await this.resolve(
            ctx.organizationId,
            input,
            now,
        );
        const view = this.quoteView(target, quote, coupon);
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
        return this.checkout(ctx, target, quote, view, now, billTo, coupon);
    }

    // ── Steps ───────────────────────────────────────────────────────────

    /** A coupon in the request counts against both limits (U16). */
    private limitCouponTries(
        organizationId: string,
        code: string | null | undefined,
        client: CheckoutClient,
        now: Date,
    ): void {
        if (!code?.trim()) return;
        const at = now.getTime();
        const byOrg = this.couponTriesByOrg.take(`org:${organizationId}`, at);
        const byAddress = client.addressKey
            ? this.couponTriesByAddress.take(`ip:${client.addressKey}`, at)
            : true;
        if (!byOrg || !byAddress) {
            throw new HttpException(
                "Too many coupon tries. Wait a minute and try again.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
    }

    private async resolve(
        organizationId: string,
        input: { plan: string; cycle: BillingCycle; coupon?: string | null },
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
        const planId = catalogPlanIdForKey(target.key) ?? input.plan;
        // The live version's offers: the plan's trial, while the business
        // may still have one (U16).
        const catalog = await catalogueOfVersion(prisma, target.version);
        const trialDays =
            catalog && !(await hadTrial(prisma, organizationId))
                ? planTrialDays(catalog, planId)
                : null;
        // DEC-093's nominal first month, from the same version's offer.
        const trialFirstPaise = catalog ? planFirstPaise(catalog, planId) : 0;
        const term = await this.termOfSubscription(subscription, now);
        const termEndsAt = term?.endsAt ?? null;
        let coupon: PricingCoupon | null = null;
        const code = input.coupon?.trim();
        if (code) {
            const plain = quoteChange({
                subscription,
                target,
                now,
                trialDays,
                trialFirstPaise,
                termEndsAt,
            });
            if (!COUPON_KINDS.includes(plain.kind)) {
                throw new BadRequestException({
                    message:
                        "A coupon can be used when you start a paid plan, not on this change.",
                    details: { field: "coupon" },
                });
            }
            coupon = await findUsableCoupon({
                code,
                organizationId,
                planId,
                planName: target.name,
                now,
            });
        }
        const quote = quoteChange({
            subscription,
            target,
            now,
            trialDays,
            trialFirstPaise,
            termEndsAt,
            coupon,
        });
        return { target, quote, subscription, coupon };
    }

    private quoteView(
        target: Plan,
        quote: ChangeQuote,
        coupon: PricingCoupon | null = null,
    ): ChangePlanQuoteView {
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
            trialEndsAt: quote.trialEndsAt?.toISOString() ?? null,
            coupon:
                coupon && quote.discountCharges > 0
                    ? {
                          code: coupon.code,
                          discountPaise: quote.discountPaise,
                          charges: quote.discountCharges,
                      }
                    : null,
            firstChargePaise: quote.firstChargePaise,
            firstChargeGstPaise: quote.firstChargeGstPaise,
            firstChargeTotalPaise: quote.firstChargeTotalPaise,
            payment: quote.payment,
            termCharges: quote.termCharges,
            payNowTotalPaise: quote.payNowTotalPaise,
            mandateCheck: quote.mandateCheck,
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
            // A trial paid nothing ahead, so it ends now (U16).
            if (
                live?.provider &&
                live.providerSubscriptionId &&
                billedByProvider(live) &&
                live.status !== "TRIALING" &&
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
            await clearAddonsInTx(tx, sub.id);
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
        coupon: PricingCoupon | null = null,
    ): Promise<ChangePlanResult> {
        const kind = quote.kind as CheckoutKind;
        // A renewal is a scheduled change to the plan it's on (DEC-093).
        const stored = kind === "RENEW" ? "SCHEDULED" : kind;
        const oneTime = quote.payment === "ONE_TIME";
        const discounted = Boolean(coupon) && quote.discountCharges > 0;
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
        const provider = this.providers.get(CATALOGUE_BILLING_PROVIDER);
        let made: {
            providerSubscriptionId: string;
            providerCustomerId?: string;
            authorisationUrl?: string;
        };
        try {
            if (oneTime) {
                // Yearly is one payment for the year (DEC-093): an order for
                // exactly what the quote says is due now, coupon and all —
                // no mandate, no provider plan, no Offer.
                if (!provider.orders) {
                    throw new ConflictException(
                        `${target.name} yearly can't be bought yet.`,
                    );
                }
                const order = await provider.orders.createOrder({
                    amountPaise: quote.payNowTotalPaise,
                    currency: target.currency,
                    reference: id,
                    organizationId: ctx.organizationId,
                    planKey: target.key,
                });
                made = { providerSubscriptionId: order.providerOrderId };
            } else {
                made = await provider.createSubscription({
                    planKey: target.key,
                    planId: target.id,
                    priceCents: target.priceCents,
                    currency: target.currency,
                    interval: target.interval,
                    organizationId: ctx.organizationId,
                    providerPlanId: providerPlan.providerPlanId,
                    startAt: quote.startAt,
                    // A 12-month term, then a one-tap renewal (DEC-093).
                    totalCount: TERM_CHARGES,
                    upfront:
                        quote.chargeNowTotalPaise > 0
                            ? {
                                  name:
                                      kind === "TRIAL"
                                          ? `${target.name}: first month`
                                          : `${target.name}: the rest of this period`,
                                  amountPaise: quote.chargeNowTotalPaise,
                              }
                            : null,
                    discount:
                        discounted && coupon
                            ? {
                                  code: coupon.code,
                                  amountPaise: quote.discountTotalPaise,
                                  charges: quote.discountCharges,
                                  razorpayOfferId: coupon.razorpayOfferId,
                              }
                            : null,
                    reference: id,
                });
            }
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.warn(
                `billing_checkout_provider_failed org=${ctx.organizationId}: ${error instanceof Error ? error.message : "unknown"}`,
            );
            // A provider that can't take a coupon off refuses it (U16):
            // Razorpay, a coupon without its Razorpay Offer.
            if (
                discounted &&
                error instanceof BillingProviderError &&
                error.kind === "REFUSED"
            ) {
                throw new ConflictException({
                    message:
                        "That coupon can't be used with payments just now. Try without it.",
                    details: { field: "coupon" },
                });
            }
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
            kind: stored,
            status: "OPEN",
            provider: CATALOGUE_BILLING_PROVIDER,
            providerSubscriptionId: made.providerSubscriptionId,
            providerPlanId: oneTime
                ? ONE_TIME_PAYMENT
                : providerPlan.providerPlanId,
            providerCustomerId: made.providerCustomerId ?? null,
            pricePaise: target.priceCents,
            chargeNowPaise: quote.chargeNowPaise,
            chargeNowGstPaise: quote.chargeNowGstPaise,
            couponId: discounted ? (coupon?.id ?? null) : null,
            discountPaise: discounted ? quote.discountPaise : 0,
            discountCharges: discounted ? quote.discountCharges : 0,
            startAt: stored === "NEW" ? null : quote.startAt,
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
            // Not recorded: the provider subscription made for it must go
            // (an unpaid order simply lapses at the provider).
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
            handoff: await this.handoff(ctx, row, quote.payNowTotalPaise),
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
        discountPaise: row.discountPaise,
        discountCharges: row.discountCharges,
        startAt: row.startAt?.toISOString() ?? null,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        payment: isOneTime(row) ? "ONE_TIME" : "AUTOPAY",
    };
}

/**
 * What a checkout takes as it's paid, GST included, from what it kept: a
 * year paid once is its first charge (an upgrade, its difference); an
 * autopay checkout its first charge (NEW) or its upfront amount.
 */
export function payNowOf(row: BillingCheckout): number {
    const first = withGstPaise(
        row.pricePaise - (row.discountCharges > 0 ? row.discountPaise : 0),
    );
    const upfront = row.chargeNowPaise + row.chargeNowGstPaise;
    if (isOneTime(row)) return row.kind === "UPGRADE" ? upfront : first;
    return row.kind === "NEW" ? first : row.chargeNowPaise > 0 ? upfront : 0;
}

import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    Optional,
    UnauthorizedException,
} from "@nestjs/common";
import type { BillingCheckout, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { ActivationEvents } from "../analytics/activation-events";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import type { EndedAddons } from "./addon-charges";
import {
    clearAddonsInTx,
    endAddonsNotOfferedInTx,
    recordAddonsEnded,
    rehomeAddonChargesInTx,
    rollAddonChargesInTx,
} from "./addon-charges";
import type { HeldAddon } from "./addons-ending";
import { checkoutClearsAddons } from "./addons-ending";
import { enqueueBillingEmail } from "./billing-email.job";
import { isOneTime } from "./billing-term";
import { unmatchedEventInTx } from "./billing-unmatched";
import { billingMayChargeFor } from "./business-closing";
import { leavesWithCycle, runsToMoveDate } from "./change-timing";
import { chargesStartInTx } from "./charges-start";
import { periodEnd, periodStart } from "./checkout-quote";
import { recordDoubleChargeInTx } from "./double-charge";
import { redeemCouponInTx, trialNoticeAt } from "./offers";
import {
    chargeAfterEndConflictInTx,
    dropOpenCheckoutsInTx,
    droppedCheckoutConflictInTx,
} from "./paid-after-end";
import type { AppliedMove } from "./plan-moves";
import { applyDueMoveInTx } from "./plan-moves";
import {
    enqueueProviderCancel,
    withdrawProviderCancelsInTx,
} from "./provider-cancel.job";
import type {
    BillingEventPhase,
    BillingProviderFactory,
    ParsedBillingEvent,
    SubscriptionStatus,
    WebhookHeaders,
} from "./providers/billing-provider.port";
import { BILLING_PROVIDER_FACTORY } from "./providers/billing-provider.port";
import { SarohInvoicesService } from "./saroh-invoices.service";
import { isLegalSubscriptionTransition } from "./subscription-state";
import { endTermAtInTx, freePlanRowInTx } from "./term-end";

type Tx = Prisma.TransactionClient;

/** The outcome of handling one inbound billing webhook. */
export interface BillingWebhookResult {
    /**
     * - `processed` — verified, first delivery, something moved.
     * - `duplicate` — a re-delivery (same `(provider, providerEventId)`); no-op.
     * - `ignored`   — verified but nothing to change (no subscription, a
     *   non-state event, a same→same move, or older than the last applied).
     * - `failed`    — verified but the status move was illegal (rejected).
     */
    status: "processed" | "duplicate" | "ignored" | "failed";
    /** Whether this call changed any subscription state. */
    changed: boolean;
}

/** A plan change the webhook completed, for the audit log after commit. */
interface Completed {
    organizationId: string;
    subscriptionId: string;
    actorUserId: string | null;
    from: string | null;
    to: string;
    at: string;
    /** The paid plan's key, when the business moved onto it now (DEC-125). */
    upgradedTo?: string;
}

interface Outcome {
    result: BillingWebhookResult;
    completed?: Completed;
    /** Add-ons the change ended (DEC-157), for the audit log after commit. */
    ended?: EndedAddons;
    /** Left without `processedAt`: it matched nothing (DEC-166). */
    unapplied?: boolean;
}

/** What a move that applied ended, for the audit log; nothing when none. */
function endedByMove(
    sub: { id: string; organizationId: string },
    applied: AppliedMove,
): Pick<Outcome, "ended"> {
    if (!applied.applied || applied.endedAddons.length === 0) return {};
    return {
        ended: {
            organizationId: sub.organizationId,
            subscriptionId: sub.id,
            actorUserId: null,
            addons: applied.endedAddons,
        },
    };
}

const PAID_PHASES: readonly BillingEventPhase[] = ["activated", "charged"];
const ENDED_PHASES: readonly BillingEventPhase[] = ["cancelled", "completed"];

/**
 * Saroh billing webhook inbox + idempotent subscription reconciliation
 * (S7-005; checkout and renewals, pricing catalogue U15).
 *
 *  1. VERIFY FIRST — the platform provider HMAC-verifies the RAW request bytes
 *     against Saroh's OWN webhook secret BEFORE the body is parsed or
 *     trusted. A forged/absent signature is a 401 and records NOTHING.
 *  2. IDEMPOTENT INBOX — the verified event is written to
 *     `BillingWebhookEvent`, unique on `(provider, providerEventId)`, in the
 *     same transaction as its effect: a duplicate delivery finds the row and
 *     is a 200 no-op, and an effect that fails rolls the row back so the
 *     provider's retry is applied, not dropped.
 *  3. IN ORDER — an event older than the last one applied to the
 *     subscription (`providerEventAt`, the provider's own time) is
 *     acknowledged and changes nothing, so a late `activated` can't undo a
 *     newer `cancelled`. CANCELLED is terminal in the state machine too.
 *  4. RECONCILE —
 *     - **A checkout's provider subscription** (`BillingCheckout`, OPEN):
 *       authorised (and, for a new plan, paid) → the business is on the
 *       plan; a SCHEDULED one waits as the subscription's pending move. The
 *       subscription it replaces is cancelled at the provider (a job).
 *       Cancelled or halted before that → the checkout is CANCELLED.
 *     - **The subscription's own**: `charged` is a renewal — ACTIVE, the new
 *       period's end, and a due move applied (`plan-moves.ts`). `pending`
 *       (a failed charge Razorpay retries) → PAST_DUE. `halted` (it gave
 *       up) → CANCELLED, which the access read takes as Free. Cancelled or
 *       completed → its move to Free or to a plan it authorised applies;
 *       otherwise CANCELLED. Ended ahead of the date its move waits for
 *       (a first month's is ended at once): the plan runs on to that date,
 *       which it is paid to (DEC-159, `change-timing.ts`).
 *     An illegal move is rejected (200, the inbox row left unprocessed).
 *
 * CREDENTIAL BOUNDARY: reads/writes ONLY the billing models (`Subscription`,
 * `BillingCheckout`, `BillingWebhookEvent`) and Saroh's platform provider —
 * NEVER a merchant `PaymentIntent` / `WebhookEvent` / `MerchantPaymentProvider`.
 */
@Injectable()
export class BillingWebhookService {
    private readonly logger = new Logger(BillingWebhookService.name);

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly factory: BillingProviderFactory,
        @Optional() private readonly audit?: AuditService,
        /**
         * Saroh's own invoices and billing mail (U17), written on the
         * webhook's transaction. Always provided by `BillingModule`; a spec
         * that builds the service by hand without it writes none.
         */
        @Optional() private readonly invoices?: SarohInvoicesService,
        /** The activation ledger, for the first paid plan (DEC-125). */
        @Optional() private readonly activation?: ActivationEvents,
    ) {}

    async handle(
        providerName: string,
        rawBody: Buffer,
        headers: WebhookHeaders,
        now: Date = new Date(),
    ): Promise<BillingWebhookResult> {
        // Unknown provider → 404 (resolved before any verification/DB work).
        const provider = this.factory.get(providerName);
        const name = provider.name;

        // Constant-time HMAC over the RAW bytes against Saroh's PLATFORM secret.
        // A forged/altered body is rejected here and NEVER recorded or applied.
        if (!provider.verifyWebhook(rawBody, headers)) {
            throw new UnauthorizedException(
                "Webhook signature verification failed",
            );
        }

        // Only now is the body trusted enough to parse.
        let payload: unknown;
        try {
            payload = JSON.parse(rawBody.toString("utf8"));
        } catch {
            throw new BadRequestException("Malformed webhook body");
        }

        const event = provider.parseWebhook(payload, headers);

        const outcome = await prisma.$transaction(async (tx) => {
            const subId = event.providerSubscriptionId;
            const checkout = subId
                ? await tx.billingCheckout.findUnique({
                      where: {
                          provider_providerSubscriptionId: {
                              provider: name,
                              providerSubscriptionId: subId,
                          },
                      },
                  })
                : null;
            const subscription = subId
                ? await tx.subscription.findFirst({
                      where: { provider: name, providerSubscriptionId: subId },
                      select: { id: true, organizationId: true },
                  })
                : null;

            // Insert-or-nothing: a caught unique violation would abort the
            // transaction, so a duplicate is read from the count.
            const inbox = await tx.billingWebhookEvent.createMany({
                data: [
                    {
                        provider: name,
                        providerEventId: event.providerEventId,
                        type: event.type,
                        organizationId:
                            subscription?.organizationId ??
                            checkout?.organizationId ??
                            null,
                        payload: payload as Prisma.InputJsonValue,
                    },
                ],
                skipDuplicates: true,
            });
            if (inbox.count === 0) {
                return {
                    result: { status: "duplicate", changed: false },
                } satisfies Outcome;
            }

            let outcome: Outcome;
            if (subscription) {
                outcome = await this.onSubscription(
                    tx,
                    subscription.id,
                    event,
                    now,
                );
            } else if (checkout) {
                outcome = await this.onCheckout(tx, checkout, event, now);
            } else {
                // No business (DEC-166): a refund or dispute is kept; an
                // unmatched charge is raised and left not applied.
                const unmatched = await unmatchedEventInTx(
                    tx,
                    this.logger,
                    name,
                    event,
                );
                outcome = {
                    result: { status: "ignored", changed: false },
                    unapplied: !unmatched.applied,
                };
            }
            if (outcome.result.status !== "failed" && !outcome.unapplied) {
                await tx.billingWebhookEvent.update({
                    where: {
                        provider_providerEventId: {
                            provider: name,
                            providerEventId: event.providerEventId,
                        },
                    },
                    data: { processedAt: now },
                });
            } else if (!outcome.unapplied) {
                this.logger.warn(
                    `Billing webhook ${name}/${event.providerEventId} reconcile rejected (${event.type})`,
                );
            }
            return outcome;
        });

        await this.recordCompleted(outcome.completed);
        await recordAddonsEnded(this.audit, outcome.ended);
        return outcome.result;
    }

    /**
     * What the provider says, asked directly when the business comes back
     * from paying (DEC-093): reconciled by the same rule as the webhook,
     * without waiting for it. Idempotent with it either way round — the
     * checkout is re-read under its subscription's lock, so whichever comes
     * second finds it done and changes nothing; the charge's invoice is
     * keyed once per charge. Nothing goes in the webhook inbox: this is not
     * a delivery, and the real one is still applied (as a repeat) when it
     * lands.
     */
    async reconcileCheckout(
        checkoutId: string,
        event: ParsedBillingEvent,
        now: Date = new Date(),
    ): Promise<BillingWebhookResult> {
        const outcome = await prisma.$transaction(async (tx) => {
            const checkout = await tx.billingCheckout.findUnique({
                where: { id: checkoutId },
            });
            if (!checkout) {
                return {
                    result: { status: "ignored", changed: false },
                } satisfies Outcome;
            }
            return this.onCheckout(tx, checkout, event, now);
        });
        await this.recordCompleted(outcome.completed);
        await recordAddonsEnded(this.audit, outcome.ended);
        return outcome.result;
    }

    private async recordCompleted(c: Completed | undefined): Promise<void> {
        if (!c) return;
        await this.audit?.record({
            action: AuditAction.PlanChange,
            actorUserId: c.actorUserId ?? "billing-provider",
            organizationId: c.organizationId,
            targetType: "subscription",
            targetId: c.subscriptionId,
            outcome: AuditOutcome.Success,
            metadata: { from: c.from, to: c.to, at: c.at },
        });
        // The business's first move onto a paid plan (DEC-125): the plan's
        // key, never a price. After the commit, and it swallows its errors.
        if (c.upgradedTo) {
            await this.activation?.firstPlanUpgraded(
                c.organizationId,
                c.upgradedTo,
            );
        }
    }

    // ── A checkout's provider subscription ──────────────────────────────

    private async onCheckout(
        tx: Tx,
        seen: BillingCheckout,
        event: ParsedBillingEvent,
        now: Date,
    ): Promise<Outcome> {
        const phase = event.phase ?? "other";
        const ignored: Outcome = {
            result: { status: "ignored", changed: false },
        };
        // The webhook and the business's return (DEC-093) may both reach
        // one checkout: the subscription's lock first (the order every
        // billing write takes), then the checkout as it is now.
        await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "organizationId" = ${seen.organizationId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "BillingCheckout" WHERE "id" = ${seen.id} FOR UPDATE`;
        const checkout = await tx.billingCheckout.findUnique({
            where: { id: seen.id },
        });
        if (!checkout) return ignored;
        // Paid after Saroh let it go (owner, 17 Oct 2026): never money
        // taken with no plan, no invoice and no word.
        if (checkout.status === "CANCELLED") {
            return this.onDroppedCheckout(tx, checkout, event, now);
        }
        if (checkout.status === "COMPLETED") {
            return this.onLeftCheckout(tx, checkout, event, now);
        }
        if (checkout.status !== "OPEN" && checkout.status !== "SCHEDULED") {
            return ignored;
        }

        // Authorisation failed or was abandoned at the provider.
        if (
            checkout.status === "OPEN" &&
            (phase === "halted" || ENDED_PHASES.includes(phase))
        ) {
            await tx.billingCheckout.update({
                where: { id: checkout.id },
                data: { status: "CANCELLED", endedReason: `provider:${phase}` },
            });
            return { result: { status: "processed", changed: true } };
        }

        // A SCHEDULED checkout's subscription ending before it started: the
        // move it was waiting as goes with it.
        if (
            checkout.status === "SCHEDULED" &&
            (phase === "halted" || ENDED_PHASES.includes(phase))
        ) {
            await tx.billingCheckout.update({
                where: { id: checkout.id },
                data: { status: "CANCELLED", endedReason: `provider:${phase}` },
            });
            const waiting = await tx.subscription.findFirst({
                where: {
                    organizationId: checkout.organizationId,
                    pendingPlanId: checkout.planId,
                },
                select: {
                    id: true,
                    cancelAtPeriodEnd: true,
                    billingCycle: true,
                    plan: { select: { version: true, key: true } },
                },
            });
            if (waiting) {
                // The plan it is on was already told to end with what was
                // paid, and nothing bills it after that: Free from the
                // same date, never a plan nobody pays for (DEC-159). A
                // one-tap renewal (RENEW: the same plan and cycle) is the
                // same: the term it renews ends on that date with nothing
                // after it, so it never runs on unbilled.
                const plan = await tx.plan.findUnique({
                    where: { id: checkout.planId },
                    select: { key: true },
                });
                const renewal =
                    plan?.key === waiting.plan.key &&
                    checkout.cycle === waiting.billingCycle;
                const free =
                    waiting.cancelAtPeriodEnd || renewal
                        ? await freePlanRowInTx(tx, waiting.plan.version)
                        : null;
                await tx.subscription.update({
                    where: { id: waiting.id },
                    data: free
                        ? { pendingPlanId: free.id, cancelAtPeriodEnd: true }
                        : { pendingPlanId: null, pendingFrom: null },
                });
            }
            return { result: { status: "processed", changed: true } };
        }

        // A SCHEDULED change's first charge failed (Razorpay retries it)
        // before the sweep applied the move: the move is due all the same —
        // the business authorised it — so it applies now, and the failure
        // is the subscription's own (PAST_DUE, the payment-failed email),
        // whichever ran first.
        if (checkout.status === "SCHEDULED" && phase === "pending") {
            const sub = await tx.subscription.findUnique({
                where: { organizationId: checkout.organizationId },
                select: { id: true, organizationId: true },
            });
            if (!sub) return ignored;
            const applied = await applyDueMoveInTx(tx, sub.id, now);
            if (!applied.applied) return ignored;
            const failed = await this.onSubscription(tx, sub.id, event, now);
            return { ...failed, ...endedByMove(sub, applied) };
        }

        // When it counts as done: a new plan once paid; one that starts
        // later (an upgrade's difference, a scheduled change) once
        // authorised — the upfront charge is taken with the authorisation.
        const done =
            checkout.kind === "NEW"
                ? PAID_PHASES.includes(phase)
                : phase === "authenticated" || PAID_PHASES.includes(phase);
        if (!done) return ignored;

        if (checkout.status === "SCHEDULED") {
            // Its first charge: the date has come; apply the move now.
            const sub = await tx.subscription.findUnique({
                where: { organizationId: checkout.organizationId },
                select: { id: true, organizationId: true },
            });
            if (!sub || !PAID_PHASES.includes(phase)) return ignored;
            const applied = await applyDueMoveInTx(tx, sub.id, now, {
                currentPeriodEnd: event.currentPeriodEnd ?? undefined,
            });
            if (applied.applied) {
                await this.invoiceScheduledStart(
                    tx,
                    checkout,
                    sub.id,
                    event,
                    now,
                );
            }
            return {
                result: {
                    status: applied.applied ? "processed" : "ignored",
                    changed: applied.applied,
                },
                ...endedByMove(sub, applied),
            };
        }

        // Approved after the date it starts (it lapses then, but the sweep
        // runs hourly): its quote is stale — the plan it replaces has
        // renewed — so it is dropped, and the payment settled as one on a
        // dropped checkout (refunded automatically).
        if (
            checkout.kind !== "NEW" &&
            checkout.startAt &&
            checkout.startAt.getTime() <= now.getTime()
        ) {
            const lapsed = await tx.billingCheckout.update({
                where: { id: checkout.id },
                data: { status: "CANCELLED", endedReason: "expired" },
            });
            return this.onDroppedCheckout(tx, lapsed, event, now);
        }

        return this.completeCheckout(tx, checkout, event, now);
    }

    /**
     * A checkout Saroh gave up on (replaced, lapsed, the business moved to
     * Free) authorised or paid anyway: a UPI approval that came late, a
     * second tab, a yearly order (Razorpay orders can't be cancelled or
     * given an expiry). Honoured as if never dropped when nothing conflicts
     * (`paid-after-end.ts`) — the business paid for it; otherwise its
     * provider subscription is ended now and, if money was taken, it is
     * refunded automatically, with no invoice (DEC-164).
     */
    private async onDroppedCheckout(
        tx: Tx,
        checkout: BillingCheckout,
        event: ParsedBillingEvent,
        now: Date,
    ): Promise<Outcome> {
        const ignored: Outcome = {
            result: { status: "ignored", changed: false },
        };
        const phase = event.phase ?? "other";
        const done =
            checkout.kind === "NEW"
                ? PAID_PHASES.includes(phase)
                : phase === "authenticated" || PAID_PHASES.includes(phase);
        if (!done && phase !== "authenticated") return ignored;

        const conflict = await droppedCheckoutConflictInTx(tx, checkout, now);
        if (!conflict) {
            // A new plan's mandate authorised: honoured once it is paid.
            if (!done) return ignored;
            await withdrawProviderCancelsInTx(
                tx,
                checkout.providerSubscriptionId,
            );
            await dropOpenCheckoutsInTx(
                tx,
                checkout.organizationId,
                checkout.id,
                "replaced",
            );
            const reopened = await tx.billingCheckout.update({
                where: { id: checkout.id },
                data: { status: "OPEN", endedReason: null },
            });
            this.logger.warn(
                `billing_paid_on_dropped_checkout_honoured org=${checkout.organizationId} checkout=${checkout.id} was=${checkout.endedReason ?? "cancelled"}`,
            );
            return this.completeCheckout(tx, reopened, event, now);
        }

        await enqueueProviderCancel(tx, {
            organizationId: checkout.organizationId,
            provider: checkout.provider,
            providerSubscriptionId: checkout.providerSubscriptionId,
            atCycleEnd: false,
        });
        const moneyTaken =
            PAID_PHASES.includes(phase) ||
            (checkout.kind !== "NEW" && checkout.chargeNowPaise > 0);
        if (moneyTaken) {
            // A second payment for one period: given back in full, no
            // invoice (DEC-164).
            this.logger.error(
                `billing_paid_on_dropped_checkout org=${checkout.organizationId} checkout=${checkout.id} payment=${event.providerPaymentId ?? "none"}: ${conflict}`,
            );
            await recordDoubleChargeInTx(tx, this.logger, {
                organizationId: checkout.organizationId,
                provider: checkout.provider,
                providerSubscriptionId: checkout.providerSubscriptionId,
                providerPaymentId: event.providerPaymentId,
                amountPaise: event.paymentAmountPaise,
                phase: event.phase,
                reason: `paid for a dropped plan change (${checkout.endedReason ?? "cancelled"}): ${conflict}`,
            });
        } else {
            this.logger.warn(
                `billing_authorised_dropped_checkout org=${checkout.organizationId} checkout=${checkout.id}: ${conflict}; cancelled at the provider`,
            );
        }
        return { result: { status: "processed", changed: true } };
    }

    /**
     * A charge on a COMPLETED checkout's provider subscription the business
     * is no longer billed through (a move to Free while a charge was
     * failing: its cancel was refused and Razorpay's retry went through).
     * With no other paid plan the business keeps the plan for the period it
     * paid, then Free, as it chose; otherwise the subscription is ended now
     * and the charge refunded automatically (DEC-164).
     */
    private async onLeftCheckout(
        tx: Tx,
        checkout: BillingCheckout,
        event: ParsedBillingEvent,
        now: Date,
    ): Promise<Outcome> {
        if (event.phase !== "charged") {
            return { result: { status: "ignored", changed: false } };
        }
        const org = checkout.organizationId;
        const ref = checkout.providerSubscriptionId;
        // Still the subscription the business is billed through: not one it
        // left. The business's return (`reconcileCheckout`) reaches here when
        // the webhook completed the checkout first; its charge is that same
        // one, already applied, and must never end the plan just bought.
        const current = await tx.subscription.findFirst({
            where: {
                organizationId: org,
                provider: checkout.provider,
                providerSubscriptionId: ref,
            },
            select: { id: true },
        });
        if (current) {
            return { result: { status: "ignored", changed: false } };
        }
        const conflict = await chargeAfterEndConflictInTx(tx, org, ref);
        const sub = await tx.subscription.findUnique({
            where: { organizationId: org },
            select: { id: true, plan: { select: { version: true } } },
        });
        const plan = await tx.plan.findUniqueOrThrow({
            where: { id: checkout.planId },
            select: {
                id: true,
                name: true,
                version: true,
                interval: true,
                priceCents: true,
            },
        });
        const free = await freePlanRowInTx(tx, plan.version);
        if (conflict || !sub || !free) {
            await enqueueProviderCancel(tx, {
                organizationId: org,
                provider: checkout.provider,
                providerSubscriptionId: ref,
                atCycleEnd: false,
            });
            this.logger.error(
                `billing_paid_on_left_subscription org=${org} sub=${ref} payment=${event.providerPaymentId ?? "none"}: ${conflict ?? "no plan to put it on"}`,
            );
            await recordDoubleChargeInTx(tx, this.logger, {
                organizationId: org,
                provider: checkout.provider,
                providerSubscriptionId: ref,
                providerPaymentId: event.providerPaymentId,
                amountPaise: event.paymentAmountPaise,
                phase: event.phase,
                reason: `charged by a subscription it had left: ${conflict ?? "no plan to put it on"}`,
            });
            return { result: { status: "processed", changed: true } };
        }
        const cycle = checkout.cycle === "year" ? "year" : "month";
        const end = event.currentPeriodEnd ?? periodEnd(now, cycle);
        await dropOpenCheckoutsInTx(tx, org, null, "plan-reinstated");
        await tx.subscription.update({
            where: { id: sub.id },
            data: {
                planId: checkout.planId,
                billingCycle: cycle,
                status: "ACTIVE",
                provider: checkout.provider,
                providerSubscriptionId: ref,
                ...(checkout.providerCustomerId
                    ? { providerCustomerId: checkout.providerCustomerId }
                    : {}),
                currentPeriodEnd: end,
                // The plan for the period paid, then Free, as it chose; the
                // provider ends it now (Saroh's date keeps the plan).
                pendingPlanId: free.id,
                pendingFrom: end,
                cancelAtPeriodEnd: true,
                ...(event.eventAt ? { providerEventAt: event.eventAt } : {}),
            },
        });
        await enqueueProviderCancel(tx, {
            organizationId: org,
            provider: checkout.provider,
            providerSubscriptionId: ref,
            atCycleEnd: false,
        });
        await this.invoices?.invoiceRenewalInTx(tx, {
            organizationId: org,
            subscription: {
                provider: checkout.provider,
                providerSubscriptionId: ref,
                plan,
            },
            event,
            now,
        });
        this.logger.warn(
            `billing_paid_on_left_subscription_honoured org=${org} sub=${ref} until=${end.toISOString()}`,
        );
        return { result: { status: "processed", changed: true } };
    }

    /**
     * A charge on the subscription's own provider subscription after Saroh
     * ended it (halted, then the business paid Razorpay's retry link): it
     * paid, so the plan is back — ACTIVE, the period it paid, invoiced, and
     * the cancel still waiting withdrawn. With another paid plan (or a
     * closing business) the subscription is ended now and the charge
     * refunded automatically (DEC-164).
     */
    private async chargedAfterCancel(
        tx: Tx,
        sub: {
            id: string;
            organizationId: string;
            provider: string | null;
            providerSubscriptionId: string | null;
        },
        event: ParsedBillingEvent,
        now: Date,
    ): Promise<Outcome> {
        if (!sub.provider || !sub.providerSubscriptionId) {
            return { result: { status: "ignored", changed: false } };
        }
        const ref = sub.providerSubscriptionId;
        const conflict = await chargeAfterEndConflictInTx(
            tx,
            sub.organizationId,
            ref,
        );
        if (conflict) {
            await enqueueProviderCancel(tx, {
                organizationId: sub.organizationId,
                provider: sub.provider,
                providerSubscriptionId: ref,
                atCycleEnd: false,
            });
            this.logger.error(
                `billing_paid_on_cancelled_subscription org=${sub.organizationId} sub=${ref} payment=${event.providerPaymentId ?? "none"}: ${conflict}`,
            );
            await recordDoubleChargeInTx(tx, this.logger, {
                organizationId: sub.organizationId,
                provider: sub.provider,
                providerSubscriptionId: ref,
                providerPaymentId: event.providerPaymentId,
                amountPaise: event.paymentAmountPaise,
                phase: event.phase,
                reason: `charged by a subscription Saroh had ended: ${conflict}`,
            });
            return { result: { status: "processed", changed: true } };
        }
        await withdrawProviderCancelsInTx(tx, ref);
        await dropOpenCheckoutsInTx(
            tx,
            sub.organizationId,
            null,
            "plan-reinstated",
        );
        // The one way back from CANCELLED (`subscription-state.ts`): the
        // provider took the money.
        await tx.subscription.update({
            where: { id: sub.id },
            data: { status: "ACTIVE" },
        });
        this.logger.warn(
            `billing_paid_on_cancelled_subscription_honoured org=${sub.organizationId} sub=${ref}`,
        );
        return this.renewed(tx, sub.id, event, now);
    }

    /** An OPEN checkout authorised (and paid where it must be). */
    private async completeCheckout(
        tx: Tx,
        checkout: BillingCheckout,
        event: ParsedBillingEvent,
        now: Date,
    ): Promise<Outcome> {
        const org = checkout.organizationId;
        await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "organizationId" = ${org} FOR UPDATE`;
        const sub = await tx.subscription.findUnique({
            where: { organizationId: org },
            select: {
                id: true,
                status: true,
                provider: true,
                providerSubscriptionId: true,
                currentPeriodEnd: true,
                billingCycle: true,
                plan: { select: { name: true, key: true } },
            },
        });
        const plan = await tx.plan.findUniqueOrThrow({
            where: { id: checkout.planId },
            select: { name: true, key: true },
        });
        const cycle = checkout.cycle === "year" ? "year" : "month";

        // Another scheduled change is superseded by this one.
        const others = await tx.billingCheckout.findMany({
            where: {
                organizationId: org,
                status: "SCHEDULED",
                id: { not: checkout.id },
            },
        });
        for (const o of others) {
            await tx.billingCheckout.update({
                where: { id: o.id },
                data: { status: "CANCELLED", endedReason: "replaced" },
            });
            await enqueueProviderCancel(tx, {
                organizationId: org,
                provider: o.provider,
                providerSubscriptionId: o.providerSubscriptionId,
                atCycleEnd: false,
            });
        }

        const oldProvider =
            sub?.provider &&
            sub.providerSubscriptionId &&
            sub.providerSubscriptionId !== checkout.providerSubscriptionId &&
            sub.status !== "CANCELLED"
                ? {
                      provider: sub.provider,
                      providerSubscriptionId: sub.providerSubscriptionId,
                  }
                : null;

        if (checkout.kind === "SCHEDULED") {
            const from = checkout.startAt ?? now;
            if (!sub) return { result: { status: "ignored", changed: false } };
            // The same plan again at its term's end (DEC-093's one-tap
            // renewal): the term running now finishes on its own — its last
            // charges are still owed — so nothing is told to stop.
            const renewal =
                sub.plan.key === plan.key && sub.billingCycle === cycle;
            await tx.billingCheckout.update({
                where: { id: checkout.id },
                data: { status: "SCHEDULED" },
            });
            await tx.subscription.update({
                where: { id: sub.id },
                data: {
                    pendingPlanId: checkout.planId,
                    pendingFrom: from,
                    cancelAtPeriodEnd: !renewal && Boolean(oldProvider),
                    // A paid plan chosen since: Free is no longer the choice.
                    freeChosenAt: null,
                },
            });
            // A year paid once is paid now (DEC-093): invoiced with the
            // payment, for the year it starts on the date.
            if (isOneTime(checkout)) {
                await this.invoices?.invoiceCheckoutChargeInTx(tx, {
                    checkout,
                    event,
                    now,
                    source: "SCHEDULED",
                    periodEnd: periodEnd(from, cycle),
                });
            }
            // The one it replaces runs to the end of the period paid; the
            // add-ons owed then ride on this one's first charge (U16). In
            // a first month it is ended at once, so its full charge is
            // never taken; the plan still runs to the month's end.
            if (oldProvider && !renewal) {
                await enqueueProviderCancel(tx, {
                    organizationId: org,
                    ...oldProvider,
                    atCycleEnd: leavesWithCycle(
                        sub,
                        await chargesStartInTx(tx, sub),
                        now,
                    ),
                });
                await rehomeAddonChargesInTx(tx, {
                    organizationId: org,
                    subscriptionId: sub.id,
                    fromProviderSubscriptionId:
                        oldProvider.providerSubscriptionId,
                    provider: checkout.provider,
                    toProviderSubscriptionId: checkout.providerSubscriptionId,
                });
            }
            return {
                result: { status: "processed", changed: true },
                completed: {
                    organizationId: org,
                    subscriptionId: sub.id,
                    actorUserId: checkout.createdByUserId,
                    from: sub.plan.name,
                    to: plan.name,
                    at: from.toISOString(),
                },
            };
        }

        // NEW, UPGRADE or TRIAL: on the plan now. An upgrade keeps the
        // period already paid (its own charges start when it ends); a new
        // plan's period starts with this first charge, and so does a dearer
        // plan's chosen during the first month (DEC-159), which ends the
        // month; a trial runs to its end, when the first charge is taken
        // (U16).
        const trial = checkout.kind === "TRIAL";
        // Another plan while a trial runs keeps the trial's add-ons: only
        // a checkout made before DEC-159, which no longer quotes one.
        const continuing =
            trial && sub?.status === "TRIALING" && Boolean(oldProvider);
        const currentPeriodEnd =
            checkout.kind === "UPGRADE"
                ? (checkout.startAt ?? sub?.currentPeriodEnd ?? null)
                : trial
                  ? checkout.startAt
                  : (event.currentPeriodEnd ?? periodEnd(now, cycle));
        // The business as the provider's customer: Saroh's record of the
        // checkout, else what the provider said (17 Oct 2026). Never
        // cleared by a checkout that names none.
        const customerId =
            checkout.providerCustomerId ?? event.providerCustomerId ?? null;
        const fields = {
            planId: checkout.planId,
            billingCycle: cycle,
            status: trial ? "TRIALING" : "ACTIVE",
            provider: checkout.provider,
            providerSubscriptionId: checkout.providerSubscriptionId,
            ...(customerId ? { providerCustomerId: customerId } : {}),
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
            freeChosenAt: null,
            pendingPlanId: null,
            pendingFrom: null,
            providerEventAt: event.eventAt ?? null,
        };
        const saved = sub
            ? await tx.subscription.update({
                  where: { id: sub.id },
                  data: fields,
                  select: { id: true },
              })
            : await tx.subscription.create({
                  data: { organizationId: org, ...fields },
                  select: { id: true },
              });
        await tx.billingCheckout.update({
            where: { id: checkout.id },
            data: {
                status: "COMPLETED",
                completedAt: now,
                ...(customerId && !checkout.providerCustomerId
                    ? { providerCustomerId: customerId }
                    : {}),
            },
        });
        // A new plan starts with no add-ons; a plan taking over billing
        // takes what was owed on the old one's next charge (U16).
        let endedAddons: HeldAddon[] = [];
        if (checkoutClearsAddons(checkout.kind, continuing)) {
            await clearAddonsInTx(tx, saved.id);
        } else {
            if (oldProvider) {
                await rehomeAddonChargesInTx(tx, {
                    organizationId: org,
                    subscriptionId: saved.id,
                    fromProviderSubscriptionId:
                        oldProvider.providerSubscriptionId,
                    provider: checkout.provider,
                    toProviderSubscriptionId: checkout.providerSubscriptionId,
                });
            }
            // The add-ons kept are the ones this plan is offered (DEC-157).
            endedAddons = await endAddonsNotOfferedInTx(tx, saved.id);
        }
        if (trial) {
            // No plan charge yet: no plan invoice and no redemption until
            // the trial's end. A nominal first month (DEC-093) was taken
            // with the authorisation, and has its own invoice. The business
            // hears before the trial ends (U17's mail).
            await this.invoices?.invoiceFirstMonthInTx(tx, {
                checkout,
                event,
                now,
            });
            if (currentPeriodEnd) {
                await enqueueBillingEmail(
                    tx,
                    {
                        kind: "TRIAL_ENDING",
                        organizationId: org,
                        subscriptionId: saved.id,
                        endsAt: currentPeriodEnd.toISOString(),
                    },
                    trialNoticeAt(currentPeriodEnd, now),
                );
            }
        } else {
            // Saroh's invoice for what was just charged (U17): the first
            // period of a new plan, or an upgrade's difference.
            await this.invoices?.invoiceCheckoutChargeInTx(tx, {
                checkout,
                event,
                now,
                source: checkout.kind === "UPGRADE" ? "UPGRADE" : "NEW",
                periodEnd: currentPeriodEnd,
                fromPlanName: sub?.plan.name ?? null,
            });
        }
        // The coupon is redeemed with the first discounted charge (U16).
        if (checkout.kind === "NEW") {
            await redeemCouponInTx(tx, checkout, saved.id);
        }
        // The subscription it replaces stops now: the period it paid for is
        // covered by the new one (an upgrade's difference) or by nothing
        // further being owed.
        if (oldProvider) {
            await enqueueProviderCancel(tx, {
                organizationId: org,
                ...oldProvider,
                atCycleEnd: false,
            });
        }
        return {
            result: { status: "processed", changed: true },
            completed: {
                organizationId: org,
                subscriptionId: saved.id,
                actorUserId: checkout.createdByUserId,
                from: sub?.plan.name ?? null,
                to: plan.name,
                at: now.toISOString(),
                // A paid plan the business is on from now (NEW or
                // UPGRADE), as against a trial or a change that waits.
                ...(trial ? {} : { upgradedTo: plan.key }),
            },
            ...(endedAddons.length > 0
                ? {
                      ended: {
                          organizationId: org,
                          subscriptionId: saved.id,
                          actorUserId: checkout.createdByUserId,
                          addons: endedAddons,
                      },
                  }
                : {}),
        };
    }

    // ── The subscription's own provider subscription ────────────────────

    private async onSubscription(
        tx: Tx,
        subscriptionId: string,
        event: ParsedBillingEvent,
        now: Date,
    ): Promise<Outcome> {
        const ignored: Outcome = {
            result: { status: "ignored", changed: false },
        };
        await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${subscriptionId} FOR UPDATE`;
        const sub = await tx.subscription.findUniqueOrThrow({
            where: { id: subscriptionId },
            select: {
                id: true,
                organizationId: true,
                status: true,
                provider: true,
                providerSubscriptionId: true,
                providerEventAt: true,
                currentPeriodEnd: true,
                cancelAtPeriodEnd: true,
                pendingFrom: true,
                plan: { select: { version: true } },
                pendingPlan: { select: { priceCents: true } },
            },
        });

        // Older than what was last applied: acknowledged, nothing moves.
        if (
            event.eventAt &&
            sub.providerEventAt &&
            event.eventAt.getTime() < sub.providerEventAt.getTime()
        ) {
            return ignored;
        }
        if (event.status === "IGNORED") return ignored;

        const phase = event.phase ?? "other";
        const current = sub.status as SubscriptionStatus;
        const stamp = event.eventAt ? { providerEventAt: event.eventAt } : {};

        // Charged after Saroh ended it: never paid and left on Free.
        if (current === "CANCELLED" && phase === "charged") {
            return this.chargedAfterCancel(tx, sub, event, now);
        }

        // Completed (DEC-093, DEC-161): the charges its autopay covered are
        // done, and the last one paid for a period still running. The plan
        // stays until that period ends: a renewal or a move already waiting
        // takes over on its date; with neither, it moves to Free then.
        if (phase === "completed" && current !== "CANCELLED") {
            const endsAt = event.currentPeriodEnd ?? sub.currentPeriodEnd;
            // A "move them" to a newer version (a paid move with no checkout
            // of the business's own) rode on this autopay, which has run out:
            // nothing will bill it. Unless the business approved the next
            // autopay or a new amount (a SCHEDULED checkout), the plan runs
            // to the end of what was paid, then Free — never cut short at
            // once because a new price was still waiting for approval.
            if (
                sub.pendingFrom &&
                (sub.pendingPlan?.priceCents ?? 0) > 0 &&
                endsAt &&
                endsAt > now
            ) {
                const approved = await tx.billingCheckout.findFirst({
                    where: {
                        organizationId: sub.organizationId,
                        status: "SCHEDULED",
                    },
                    select: { id: true },
                });
                const free = await freePlanRowInTx(tx, sub.plan.version);
                if (!approved && free) {
                    await tx.subscription.update({
                        where: { id: sub.id },
                        data: { pendingPlanId: null, pendingFrom: null },
                    });
                    const set = await endTermAtInTx(
                        tx,
                        { ...sub, pendingFrom: null },
                        endsAt,
                    );
                    await tx.subscription.update({
                        where: { id: sub.id },
                        data: { ...stamp },
                    });
                    return { result: { status: "processed", changed: set } };
                }
            }
            if (sub.pendingFrom && sub.pendingFrom > now) {
                await tx.subscription.update({
                    where: { id: sub.id },
                    data: { ...stamp },
                });
                return { result: { status: "processed", changed: false } };
            }
            if (!sub.pendingFrom && endsAt && endsAt > now) {
                const set = await endTermAtInTx(tx, sub, endsAt);
                if (set) {
                    await tx.subscription.update({
                        where: { id: sub.id },
                        data: { ...stamp },
                    });
                    return { result: { status: "processed", changed: true } };
                }
            }
        }

        // Ending: a move to Free, or to a plan it authorised, takes over
        // from the subscription that ended with its period.
        if (ENDED_PHASES.includes(phase) && current !== "CANCELLED") {
            // Ended ahead of the date the business's move waits for (a
            // first month's is ended at once): the plan is paid to that
            // date and stays until then. The sweep, or the first charge of
            // the plan it authorised, applies the move on the date.
            if (runsToMoveDate(sub, now)) {
                await tx.subscription.update({
                    where: { id: sub.id },
                    data: { ...stamp },
                });
                return { result: { status: "processed", changed: false } };
            }
            // Cancelled at the provider with no move of Saroh's own (the
            // autopay stopped in a UPI or bank app, or from Razorpay's
            // page): what was paid still runs to its end, then Free. Never
            // cut short at once, a first month included.
            if (
                phase === "cancelled" &&
                !sub.pendingFrom &&
                sub.currentPeriodEnd &&
                sub.currentPeriodEnd > now &&
                (current === "ACTIVE" || current === "TRIALING")
            ) {
                const set = await endTermAtInTx(tx, sub, sub.currentPeriodEnd);
                if (set) {
                    await tx.subscription.update({
                        where: { id: sub.id },
                        data: { ...stamp },
                    });
                    return { result: { status: "processed", changed: true } };
                }
            }
            if (sub.pendingFrom) {
                const applied = await applyDueMoveInTx(
                    tx,
                    sub.id,
                    // It ended with the period, so the move is due now.
                    new Date(
                        Math.max(now.getTime(), sub.pendingFrom.getTime()),
                    ),
                );
                if (applied.applied) {
                    return {
                        result: { status: "processed", changed: true },
                        ...endedByMove(sub, applied),
                    };
                }
            }
        }

        // Halted: the provider gave up retrying the charge. Down to Free —
        // a cancelled catalogue subscription reads as Free (U12).
        const target: SubscriptionStatus =
            phase === "halted" ? "CANCELLED" : event.status;

        if (current === target) {
            if (target === "ACTIVE" && phase === "charged") {
                return this.renewed(tx, sub.id, event, now);
            }
            return ignored;
        }
        if (!isLegalSubscriptionTransition(current, target)) {
            return { result: { status: "failed", changed: false } };
        }
        await tx.subscription.update({
            where: { id: sub.id },
            data: { status: target, ...stamp },
        });
        // A charge that failed (U17): the business is told, retrying or not.
        if (phase === "pending" || phase === "halted") {
            await this.invoices?.paymentFailedInTx(tx, {
                organizationId: sub.organizationId,
                subscriptionId: sub.id,
                providerEventId: event.providerEventId,
                final: phase === "halted",
            });
        }
        // A halted subscription is ended at the provider too, so it can never
        // charge for a plan the business no longer has.
        if (phase === "halted" && sub.provider && sub.providerSubscriptionId) {
            await enqueueProviderCancel(tx, {
                organizationId: sub.organizationId,
                provider: sub.provider,
                providerSubscriptionId: sub.providerSubscriptionId,
                atCycleEnd: false,
            });
        }
        const renewal =
            target === "ACTIVE" && phase === "charged"
                ? await this.renewed(tx, sub.id, event, now)
                : null;
        return {
            result: { status: "processed", changed: true },
            ...(renewal?.ended ? { ended: renewal.ended } : {}),
        };
    }

    /** A renewal charge: the new period's end, and a move now due. */
    private async renewed(
        tx: Tx,
        subscriptionId: string,
        event: ParsedBillingEvent,
        now: Date,
    ): Promise<Outcome> {
        // What was billed, before this event moves anything (U17).
        const before = await tx.subscription.findUnique({
            where: { id: subscriptionId },
            select: {
                organizationId: true,
                provider: true,
                providerSubscriptionId: true,
                currentPeriodEnd: true,
                plan: {
                    select: {
                        id: true,
                        name: true,
                        interval: true,
                        priceCents: true,
                    },
                },
            },
        });
        await tx.subscription.update({
            where: { id: subscriptionId },
            data: {
                ...(event.currentPeriodEnd
                    ? { currentPeriodEnd: event.currentPeriodEnd }
                    : {}),
                ...(event.eventAt ? { providerEventAt: event.eventAt } : {}),
            },
        });
        const applied = await applyDueMoveInTx(tx, subscriptionId, now, {
            currentPeriodEnd: event.currentPeriodEnd ?? undefined,
        });
        const ended = before
            ? endedByMove(
                  { id: subscriptionId, organizationId: before.organizationId },
                  applied,
              )
            : {};
        // Saroh's invoice for the renewal charge (U17).
        if (before) {
            await this.invoices?.invoiceRenewalInTx(tx, {
                organizationId: before.organizationId,
                subscription: before,
                event,
                now,
            });
            // A closing or deleted business is never charged (#921): one the
            // provider charged anyway (its cancel hadn't reached it) is
            // recorded and invoiced above — the money moved — and ended now,
            // with no add-ons owed for a period it won't be billed for.
            if (!(await billingMayChargeFor(tx, before.organizationId))) {
                if (before.provider && before.providerSubscriptionId) {
                    await enqueueProviderCancel(tx, {
                        organizationId: before.organizationId,
                        provider: before.provider,
                        providerSubscriptionId: before.providerSubscriptionId,
                        atCycleEnd: false,
                    });
                }
                this.logger.warn(
                    `billing_renewal_business_closed org=${before.organizationId} subscription=${subscriptionId}`,
                );
                return {
                    result: { status: "processed", changed: true },
                    ...ended,
                };
            }
            await this.afterCharge(tx, subscriptionId, before, event);
        }
        return { result: { status: "processed", changed: true }, ...ended };
    }

    /**
     * After a charge on the subscription's own provider subscription (U16):
     * a trial's coupon is redeemed with its first charge, and the add-ons
     * held for the period just begun are owed on the next one.
     */
    private async afterCharge(
        tx: Tx,
        subscriptionId: string,
        before: {
            provider: string | null;
            providerSubscriptionId: string | null;
            currentPeriodEnd: Date | null;
            plan: { interval: string };
        },
        event: ParsedBillingEvent,
    ): Promise<void> {
        if (before.provider && before.providerSubscriptionId) {
            const checkout = await tx.billingCheckout.findUnique({
                where: {
                    provider_providerSubscriptionId: {
                        provider: before.provider,
                        providerSubscriptionId: before.providerSubscriptionId,
                    },
                },
            });
            if (checkout?.kind === "TRIAL") {
                await redeemCouponInTx(tx, checkout, subscriptionId);
            }
        }
        const nextEnd = event.currentPeriodEnd;
        if (!nextEnd) return;
        const cycle = before.plan.interval === "year" ? "year" : "month";
        const chargedAt =
            before.currentPeriodEnd ?? periodStart(nextEnd, cycle);
        if (nextEnd.getTime() <= chargedAt.getTime()) return;
        await rollAddonChargesInTx(tx, { subscriptionId, chargedAt, nextEnd });
    }

    /** A scheduled change's first charge, once its move applied (U17). */
    private async invoiceScheduledStart(
        tx: Tx,
        checkout: BillingCheckout,
        subscriptionId: string,
        event: ParsedBillingEvent,
        now: Date,
    ): Promise<void> {
        if (!this.invoices) return;
        const sub = await tx.subscription.findUnique({
            where: { id: subscriptionId },
            select: { currentPeriodEnd: true },
        });
        await this.invoices.invoiceCheckoutChargeInTx(tx, {
            checkout,
            event,
            now,
            source: "SCHEDULED",
            periodEnd: sub?.currentPeriodEnd ?? null,
        });
    }
}

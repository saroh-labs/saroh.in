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

import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import {
    clearAddonsInTx,
    rehomeAddonChargesInTx,
    rollAddonChargesInTx,
} from "./addon-charges";
import { enqueueBillingEmail } from "./billing-email.job";
import { periodEnd, periodStart } from "./checkout-quote";
import { redeemCouponInTx, trialNoticeAt } from "./offers";
import { applyDueMoveInTx } from "./plan-moves";
import { enqueueProviderCancel } from "./provider-cancel.job";
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
}

interface Outcome {
    result: BillingWebhookResult;
    completed?: Completed;
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
 *       otherwise CANCELLED.
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
                outcome = { result: { status: "ignored", changed: false } };
            }
            if (outcome.result.status !== "failed") {
                await tx.billingWebhookEvent.update({
                    where: {
                        provider_providerEventId: {
                            provider: name,
                            providerEventId: event.providerEventId,
                        },
                    },
                    data: { processedAt: now },
                });
            } else {
                this.logger.warn(
                    `Billing webhook ${name}/${event.providerEventId} reconcile rejected (${event.type})`,
                );
            }
            return outcome;
        });

        if (outcome.completed) {
            const c = outcome.completed;
            await this.audit?.record({
                action: AuditAction.PlanChange,
                actorUserId: c.actorUserId ?? "billing-provider",
                organizationId: c.organizationId,
                targetType: "subscription",
                targetId: c.subscriptionId,
                outcome: AuditOutcome.Success,
                metadata: { from: c.from, to: c.to, at: c.at },
            });
        }
        return outcome.result;
    }

    // ── A checkout's provider subscription ──────────────────────────────

    private async onCheckout(
        tx: Tx,
        checkout: BillingCheckout,
        event: ParsedBillingEvent,
        now: Date,
    ): Promise<Outcome> {
        const phase = event.phase ?? "other";
        const ignored: Outcome = {
            result: { status: "ignored", changed: false },
        };
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
            await tx.subscription.updateMany({
                where: {
                    organizationId: checkout.organizationId,
                    pendingPlanId: checkout.planId,
                },
                data: { pendingPlanId: null, pendingFrom: null },
            });
            return { result: { status: "processed", changed: true } };
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
                select: { id: true },
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
            };
        }

        return this.completeCheckout(tx, checkout, event, now);
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
                plan: { select: { name: true } },
            },
        });
        const plan = await tx.plan.findUniqueOrThrow({
            where: { id: checkout.planId },
            select: { name: true },
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
            await tx.billingCheckout.update({
                where: { id: checkout.id },
                data: { status: "SCHEDULED" },
            });
            await tx.subscription.update({
                where: { id: sub.id },
                data: {
                    pendingPlanId: checkout.planId,
                    pendingFrom: from,
                    cancelAtPeriodEnd: Boolean(oldProvider),
                },
            });
            // The one it replaces runs to the end of the period paid; the
            // add-ons owed then ride on this one's first charge (U16).
            if (oldProvider) {
                await enqueueProviderCancel(tx, {
                    organizationId: org,
                    ...oldProvider,
                    atCycleEnd: true,
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
        // plan's period starts with this first charge; a trial runs to its
        // end, when the first charge is taken (U16).
        const trial = checkout.kind === "TRIAL";
        // Another plan while a trial runs keeps the trial's add-ons.
        const continuing =
            trial && sub?.status === "TRIALING" && Boolean(oldProvider);
        const currentPeriodEnd =
            checkout.kind === "UPGRADE"
                ? (checkout.startAt ?? sub?.currentPeriodEnd ?? null)
                : trial
                  ? checkout.startAt
                  : (event.currentPeriodEnd ?? periodEnd(now, cycle));
        const fields = {
            planId: checkout.planId,
            billingCycle: cycle,
            status: trial ? "TRIALING" : "ACTIVE",
            provider: checkout.provider,
            providerSubscriptionId: checkout.providerSubscriptionId,
            providerCustomerId: checkout.providerCustomerId,
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
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
            data: { status: "COMPLETED", completedAt: now },
        });
        // A new plan starts with no add-ons; a plan taking over billing
        // takes what was owed on the old one's next charge (U16).
        if (checkout.kind === "NEW" || (trial && !continuing)) {
            await clearAddonsInTx(tx, saved.id);
        } else if (oldProvider) {
            await rehomeAddonChargesInTx(tx, {
                organizationId: org,
                subscriptionId: saved.id,
                fromProviderSubscriptionId: oldProvider.providerSubscriptionId,
                provider: checkout.provider,
                toProviderSubscriptionId: checkout.providerSubscriptionId,
            });
        }
        if (trial) {
            // Nothing charged yet: no invoice and no redemption until the
            // trial's end. The business hears before then (U17's mail).
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
            },
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
                pendingFrom: true,
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

        // Ending: a move to Free, or to a plan it authorised, takes over
        // from the subscription that ended with its period.
        if (ENDED_PHASES.includes(phase) && current !== "CANCELLED") {
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
                    return { result: { status: "processed", changed: true } };
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
        if (target === "ACTIVE" && phase === "charged") {
            await this.renewed(tx, sub.id, event, now);
        }
        return { result: { status: "processed", changed: true } };
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
        await applyDueMoveInTx(tx, subscriptionId, now, {
            currentPeriodEnd: event.currentPeriodEnd ?? undefined,
        });
        // Saroh's invoice for the renewal charge (U17).
        if (before) {
            await this.invoices?.invoiceRenewalInTx(tx, {
                organizationId: before.organizationId,
                subscription: before,
                event,
                now,
            });
            await this.afterCharge(tx, subscriptionId, before, event);
        }
        return { result: { status: "processed", changed: true } };
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

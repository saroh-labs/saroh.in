import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    UnauthorizedException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type {
    BillingProviderFactory,
    ParsedBillingEvent,
    SubscriptionStatus,
    WebhookHeaders,
} from "./providers/billing-provider.port";
import { BILLING_PROVIDER_FACTORY } from "./providers/billing-provider.port";
import { assertSubscriptionTransition } from "./subscription-state";

/** The outcome of handling one inbound billing webhook. */
export interface BillingWebhookResult {
    /**
     * - `processed` — verified, first delivery, subscription status moved.
     * - `duplicate` — a re-delivery (same `(provider, providerEventId)`); no-op.
     * - `ignored`   — verified but no state change (no sub / non-state event).
     * - `failed`    — verified but the status move was illegal (rejected).
     */
    status: "processed" | "duplicate" | "ignored" | "failed";
    /** Whether this call changed any subscription state. */
    changed: boolean;
}

/**
 * Saroh billing webhook inbox + idempotent subscription reconciliation (S7-005).
 *
 * The SaaS analogue of the merchant webhook inbox, on the BILLING models only:
 *
 *  1. VERIFY FIRST — the platform provider HMAC-verifies the RAW request bytes
 *     against Saroh's OWN webhook secret (from `process.env`) BEFORE the body is
 *     parsed or trusted. A forged/absent signature is a 401 and records/changes
 *     NOTHING.
 *  2. IDEMPOTENT INBOX — the verified event is written to `BillingWebhookEvent`
 *     whose `(provider, providerEventId)` is UNIQUE. A duplicate delivery hits
 *     P2002 and returns a 200 no-op — the exactly-once guarantee.
 *  3. RECONCILE — the event's target status is applied to the org's
 *     `Subscription` through the {@link assertSubscriptionTransition} state
 *     machine (ACTIVE ↔ PAST_DUE, → CANCELLED). A same→same move is a no-op; an
 *     illegal move is rejected (the event is left unprocessed, 200 so the
 *     provider stops hammering a poison event).
 *
 * CREDENTIAL BOUNDARY: reads/writes ONLY `Subscription` + `BillingWebhookEvent`
 * and Saroh's platform provider — NEVER a merchant `PaymentIntent` / merchant
 * `WebhookEvent` / `MerchantPaymentProvider`.
 */
@Injectable()
export class BillingWebhookService {
    private readonly logger = new Logger(BillingWebhookService.name);

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly factory: BillingProviderFactory,
    ) {}

    async handle(
        providerName: string,
        rawBody: Buffer,
        headers: WebhookHeaders,
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

        const event = provider.parseWebhook(payload);

        // Resolve the org (denormalized id on the inbox) from the subscription
        // this event concerns — before the idempotency guard. Read-only.
        const subscription = event.providerSubscriptionId
            ? await prisma.subscription.findFirst({
                  where: {
                      provider: name,
                      providerSubscriptionId: event.providerSubscriptionId,
                  },
              })
            : null;

        // Idempotent inbox. A duplicate `(provider, providerEventId)` → P2002 →
        // 200 no-op. Any OTHER error propagates (a delivery we never accepted).
        let inboxId: string;
        try {
            const row = await prisma.billingWebhookEvent.create({
                data: {
                    provider: name,
                    providerEventId: event.providerEventId,
                    type: event.type,
                    organizationId: subscription?.organizationId ?? null,
                    payload: payload as Prisma.InputJsonValue,
                },
            });
            inboxId = row.id;
        } catch (err) {
            if (isUniqueViolation(err)) {
                return { status: "duplicate", changed: false };
            }
            throw err;
        }

        // Reconcile. An illegal transition is rejected (event left unprocessed);
        // 200 so the provider stops retrying a poison event.
        try {
            const { applied } = await this.reconcile(event, subscription);
            await prisma.billingWebhookEvent.update({
                where: { id: inboxId },
                data: { processedAt: new Date() },
            });
            return {
                status: applied ? "processed" : "ignored",
                changed: applied,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(
                `Billing webhook ${name}/${event.providerEventId} reconcile rejected: ${message}`,
            );
            return { status: "failed", changed: false };
        }
    }

    /**
     * Apply the event's target status to the resolved subscription through the
     * state machine. Returns `{ applied }` — whether the status actually moved.
     * A non-state event, an unresolved subscription, or a same→same target is a
     * no-op; an illegal move throws (caught by the caller → `failed`).
     */
    private async reconcile(
        event: ParsedBillingEvent,
        subscription: { id: string; status: string } | null,
    ): Promise<{ applied: boolean }> {
        if (event.status === "IGNORED" || !subscription) {
            return { applied: false };
        }

        const current = subscription.status as SubscriptionStatus;
        const target: SubscriptionStatus = event.status;
        if (current === target) return { applied: false }; // idempotent no-op

        assertSubscriptionTransition(current, target); // throws on illegal move

        await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: target },
        });
        return { applied: true };
    }
}

/** True for a Prisma unique-constraint violation (P2002). */
function isUniqueViolation(err: unknown): boolean {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
    );
}

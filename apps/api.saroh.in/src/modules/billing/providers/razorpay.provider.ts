import { createHmac, timingSafeEqual } from "node:crypto";

import { Logger } from "@nestjs/common";

import type {
    BillingProvider,
    CreateSubscriptionInput,
    CreateSubscriptionResult,
    ParsedBillingEvent,
    SubscriptionStatus,
    WebhookHeaders,
} from "./billing-provider.port";
import { headerValue } from "./billing-provider.port";
import {
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET,
    requirePlatformSecret,
} from "./platform-secrets";

/**
 * Razorpay PLATFORM billing adapter (S7-005).
 *
 * Charges an Organization for its Saroh subscription via the Razorpay
 * Subscriptions API, authenticated with Saroh's OWN platform key
 * (`SAROH_RAZORPAY_KEY_ID` / `SAROH_RAZORPAY_KEY_SECRET`). Webhooks are verified
 * with `SAROH_RAZORPAY_WEBHOOK_SECRET`.
 *
 * CREDENTIAL BOUNDARY: this adapter reads ONLY those `SAROH_*` platform vars —
 * never a per-org merchant credential. Errors are SANITIZED to the HTTP status
 * only; the auth header, key secret, and raw body are never logged or surfaced.
 */
export class RazorpayBillingProvider implements BillingProvider {
    readonly name = "RAZORPAY";
    private readonly logger = new Logger(RazorpayBillingProvider.name);
    private readonly baseUrl = "https://api.razorpay.com/v1";
    private readonly signatureHeaderName = "x-razorpay-signature";

    async createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult> {
        const basic = this.basicAuth();

        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/subscriptions`, {
                method: "POST",
                headers: {
                    Authorization: `Basic ${basic}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    // The platform maps a Saroh plan key → a Razorpay plan id
                    // out of band; the key is passed through as a notes tag.
                    total_count: 12,
                    notes: {
                        sarohPlanKey: input.planKey,
                        organizationId: input.organizationId,
                    },
                }),
            });
        } catch {
            // Never echo the request — it carries the platform secret.
            throw new Error(
                "Razorpay subscription creation failed: network error",
            );
        }

        if (!res.ok) {
            this.logger.warn(
                `Razorpay subscription creation failed with HTTP ${res.status}`,
            );
            throw new Error(
                `Razorpay subscription creation failed (HTTP ${res.status})`,
            );
        }

        const body = (await res.json()) as {
            id?: string;
            customer_id?: string;
            status?: string;
        };
        if (!body.id) {
            throw new Error(
                "Razorpay subscription creation failed: missing subscription id",
            );
        }

        return {
            providerSubscriptionId: body.id,
            providerCustomerId: body.customer_id,
            status: statusFor(body.status) ?? "ACTIVE",
        };
    }

    async cancelSubscription(providerSubscriptionId: string): Promise<void> {
        const basic = this.basicAuth();

        let res: Response;
        try {
            res = await fetch(
                `${this.baseUrl}/subscriptions/${providerSubscriptionId}/cancel`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Basic ${basic}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ cancel_at_cycle_end: 1 }),
                },
            );
        } catch {
            throw new Error(
                "Razorpay subscription cancel failed: network error",
            );
        }

        if (!res.ok) {
            this.logger.warn(
                `Razorpay subscription cancel failed with HTTP ${res.status}`,
            );
            throw new Error(
                `Razorpay subscription cancel failed (HTTP ${res.status})`,
            );
        }
    }

    verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): boolean {
        const provided = headerValue(headers, this.signatureHeaderName);
        if (!provided) return false;

        // Platform webhook secret, resolved at use time. A secret-free throw if
        // it is unset would surface as a 500; a missing secret means we cannot
        // verify, so treat it as a verification failure instead.
        const secret = this.webhookSecretOrNull();
        if (!secret) return false;

        const expected = createHmac("sha256", secret)
            .update(rawBody)
            .digest("hex");

        return safeEqualHex(provided, expected);
    }

    parseWebhook(payload: unknown): ParsedBillingEvent {
        const body = (payload ?? {}) as {
            event?: string;
            payload?: {
                subscription?: { entity?: { id?: string; status?: string } };
            };
        };

        const type = body.event ?? "unknown";
        const entity = body.payload?.subscription?.entity;
        const providerSubscriptionId = entity?.id;

        return {
            type,
            providerEventId: `${type}:${providerSubscriptionId ?? "unknown"}`,
            providerSubscriptionId,
            status: outcomeFor(type),
        };
    }

    private basicAuth(): string {
        const keyId = requirePlatformSecret(RAZORPAY_KEY_ID);
        const keySecret = requirePlatformSecret(RAZORPAY_KEY_SECRET);
        return Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    }

    private webhookSecretOrNull(): string | null {
        const secret = globalThis.process.env[RAZORPAY_WEBHOOK_SECRET];
        return secret ?? null;
    }
}

/** Map a Razorpay subscription event type → the target subscription status. */
function outcomeFor(type: string): SubscriptionStatus | "IGNORED" {
    switch (type) {
        case "subscription.activated":
        case "subscription.charged":
        case "subscription.resumed":
            return "ACTIVE";
        case "subscription.pending":
        case "subscription.halted":
            return "PAST_DUE";
        case "subscription.cancelled":
        case "subscription.completed":
        case "subscription.expired":
            return "CANCELLED";
        default:
            return "IGNORED";
    }
}

/** Map a Razorpay subscription entity status → the canonical status. */
function statusFor(status: string | undefined): SubscriptionStatus | null {
    switch (status) {
        case "active":
        case "authenticated":
            return "ACTIVE";
        case "created":
            return "TRIALING";
        case "halted":
        case "pending":
            return "PAST_DUE";
        case "cancelled":
        case "completed":
        case "expired":
            return "CANCELLED";
        default:
            return null;
    }
}

/** Constant-time compare of two hex strings of equal length. */
function safeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
    } catch {
        return false;
    }
}

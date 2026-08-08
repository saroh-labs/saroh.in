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
    CASHFREE_CLIENT_ID,
    CASHFREE_CLIENT_SECRET,
    CASHFREE_WEBHOOK_SECRET,
    requirePlatformSecret,
} from "./platform-secrets";

/**
 * Cashfree PLATFORM billing adapter (S7-005).
 *
 * Charges an Organization for its Saroh subscription via the Cashfree
 * Subscriptions API, authenticated with Saroh's OWN platform client id/secret
 * (`SAROH_CASHFREE_CLIENT_ID` / `SAROH_CASHFREE_CLIENT_SECRET`). Webhooks are
 * verified with `SAROH_CASHFREE_WEBHOOK_SECRET`, whose signature is the BASE64
 * HMAC-SHA256 of `timestamp + rawBody` (constant-time compared).
 *
 * CREDENTIAL BOUNDARY: this adapter reads ONLY those `SAROH_*` platform vars —
 * never a per-org merchant credential. Errors are SANITIZED to the HTTP status.
 */
export class CashfreeBillingProvider implements BillingProvider {
    readonly name = "CASHFREE";
    private readonly logger = new Logger(CashfreeBillingProvider.name);
    private readonly baseUrl = "https://api.cashfree.com/pg";
    private readonly signatureHeaderName = "x-webhook-signature";
    private readonly timestampHeaderName = "x-webhook-timestamp";

    async createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult> {
        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/subscriptions`, {
                method: "POST",
                headers: this.authHeaders(),
                body: JSON.stringify({
                    subscription_id: `${input.organizationId}_${input.planKey}`,
                    plan_details: {
                        plan_name: input.planKey,
                        plan_type: "PERIODIC",
                        plan_amount: input.priceCents / 100,
                        plan_currency: input.currency,
                    },
                }),
            });
        } catch {
            // Never echo the request — it carries the platform secret.
            throw new Error(
                "Cashfree subscription creation failed: network error",
            );
        }

        if (!res.ok) {
            this.logger.warn(
                `Cashfree subscription creation failed with HTTP ${res.status}`,
            );
            throw new Error(
                `Cashfree subscription creation failed (HTTP ${res.status})`,
            );
        }

        const body = (await res.json()) as {
            subscription_id?: string;
            cf_subscription_id?: string | number;
            customer_details?: { customer_id?: string };
            subscription_status?: string;
        };
        const providerSubscriptionId =
            body.cf_subscription_id != null
                ? String(body.cf_subscription_id)
                : body.subscription_id;
        if (!providerSubscriptionId) {
            throw new Error(
                "Cashfree subscription creation failed: missing subscription id",
            );
        }

        return {
            providerSubscriptionId,
            providerCustomerId: body.customer_details?.customer_id,
            status: statusFor(body.subscription_status) ?? "ACTIVE",
        };
    }

    async cancelSubscription(providerSubscriptionId: string): Promise<void> {
        let res: Response;
        try {
            res = await fetch(
                `${this.baseUrl}/subscriptions/${providerSubscriptionId}/cancel`,
                { method: "POST", headers: this.authHeaders() },
            );
        } catch {
            throw new Error(
                "Cashfree subscription cancel failed: network error",
            );
        }

        if (!res.ok) {
            this.logger.warn(
                `Cashfree subscription cancel failed with HTTP ${res.status}`,
            );
            throw new Error(
                `Cashfree subscription cancel failed (HTTP ${res.status})`,
            );
        }
    }

    verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): boolean {
        const provided = headerValue(headers, this.signatureHeaderName);
        const timestamp = headerValue(headers, this.timestampHeaderName);
        if (!provided || !timestamp) return false;

        const secret = this.webhookSecretOrNull();
        if (!secret) return false;

        const signed = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
        const expected = createHmac("sha256", secret)
            .update(signed)
            .digest("base64");

        return safeEqualBase64(provided, expected);
    }

    parseWebhook(payload: unknown): ParsedBillingEvent {
        const body = (payload ?? {}) as {
            type?: string;
            data?: {
                subscription_id?: string;
                cf_subscription_id?: string | number;
                subscription_status?: string;
            };
        };

        const type = body.type ?? "unknown";
        const providerSubscriptionId =
            body.data?.cf_subscription_id != null
                ? String(body.data.cf_subscription_id)
                : body.data?.subscription_id;

        return {
            type,
            providerEventId: `${type}:${providerSubscriptionId ?? "unknown"}`,
            providerSubscriptionId,
            status: outcomeFor(type, body.data?.subscription_status),
        };
    }

    private authHeaders(): Record<string, string> {
        return {
            "x-client-id": requirePlatformSecret(CASHFREE_CLIENT_ID),
            "x-client-secret": requirePlatformSecret(CASHFREE_CLIENT_SECRET),
            "x-api-version": "2023-08-01",
            "Content-Type": "application/json",
        };
    }

    private webhookSecretOrNull(): string | null {
        const secret = globalThis.process.env[CASHFREE_WEBHOOK_SECRET];
        return secret ?? null;
    }
}

/** Map a Cashfree subscription event type → the target subscription status. */
function outcomeFor(
    type: string,
    subscriptionStatus: string | undefined,
): SubscriptionStatus | "IGNORED" {
    if (type === "SUBSCRIPTION_STATUS_WEBHOOK") {
        return statusFor(subscriptionStatus) ?? "IGNORED";
    }
    if (type === "SUBSCRIPTION_PAYMENT_SUCCESS_WEBHOOK") return "ACTIVE";
    if (type === "SUBSCRIPTION_PAYMENT_FAILED_WEBHOOK") return "PAST_DUE";
    return "IGNORED";
}

/** Map a Cashfree subscription status → the canonical status. */
function statusFor(status: string | undefined): SubscriptionStatus | null {
    switch (status) {
        case "ACTIVE":
            return "ACTIVE";
        case "INITIALIZED":
        case "BANK_APPROVAL_PENDING":
            return "TRIALING";
        case "ON_HOLD":
        case "PAYMENT_DECLINED":
            return "PAST_DUE";
        case "CANCELLED":
        case "COMPLETED":
            return "CANCELLED";
        default:
            return null;
    }
}

/** Constant-time compare of two base64 strings. */
function safeEqualBase64(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "base64");
    const bufB = Buffer.from(b, "base64");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

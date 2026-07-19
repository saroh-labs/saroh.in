import { Logger } from "@nestjs/common";

import type {
    CreateOrderIntentInput,
    CreateOrderIntentResult,
    MerchantProvider,
} from "./provider.port";

/**
 * Razorpay adapter (S5-002).
 *
 * Creates an order via the Razorpay Orders API
 * (`POST https://api.razorpay.com/v1/orders`) authenticated with HTTP Basic
 * `key_id:key_secret`. Razorpay amounts are in the minor unit (paise), which is
 * exactly what `amountCents` already is, so no conversion. On any non-2xx the
 * error is SANITIZED: only the HTTP status is surfaced, never the auth header,
 * the key secret, or the raw provider body.
 */
export class RazorpayProvider implements MerchantProvider {
    readonly name = "RAZORPAY";
    private readonly logger = new Logger(RazorpayProvider.name);
    private readonly baseUrl = "https://api.razorpay.com/v1";

    async createOrderIntent(
        input: CreateOrderIntentInput,
    ): Promise<CreateOrderIntentResult> {
        const { amountCents, currency, orderId, credentials } = input;

        const basic = Buffer.from(
            `${credentials.keyId}:${credentials.keySecret}`,
        ).toString("base64");

        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/orders`, {
                method: "POST",
                headers: {
                    Authorization: `Basic ${basic}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    amount: amountCents,
                    currency,
                    receipt: orderId,
                }),
            });
        } catch {
            // Network failure — never echo the request (it carries the secret).
            throw new Error("Razorpay order creation failed: network error");
        }

        if (!res.ok) {
            // Log only the status; the body/headers can leak secret material.
            this.logger.warn(
                `Razorpay order creation failed with HTTP ${res.status}`,
            );
            throw new Error(
                `Razorpay order creation failed (HTTP ${res.status})`,
            );
        }

        const body = (await res.json()) as { id?: string; status?: string };
        if (!body.id) {
            throw new Error(
                "Razorpay order creation failed: missing order id in response",
            );
        }

        return {
            providerIntentId: body.id,
            clientParams: {
                razorpayOrderId: body.id,
                amount: amountCents,
                currency,
            },
        };
    }
}

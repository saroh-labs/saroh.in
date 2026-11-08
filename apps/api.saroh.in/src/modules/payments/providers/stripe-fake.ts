import { createHash, randomUUID } from "node:crypto";

import type { CredentialCheck } from "../../../common/providers/provider-attention";
import type { RunMarks } from "../../../common/test-run";
import { isTestRun } from "../../../common/test-run";
import { declaredNodeEnv, env } from "../../../env";
import type {
    CreateOrderIntentInput,
    CreateOrderIntentResult,
    FindOrCreateCustomerInput,
    FindOrCreateCustomerResult,
    OrderPayment,
    ProviderCredentials,
} from "./provider.port";
import { isStripeSecretKey, stripeTakesCurrency } from "./stripe-payments";
import { StripeProvider } from "./stripe.provider";

/**
 * The test-only switch that runs Stripe on a fake (U8's browser spec):
 * `STRIPE_FAKE=1` registers {@link FakeStripeProvider} in place of the
 * real adapter, so the browser-test stack connects Stripe with made-up
 * keys and makes Checkout Sessions without calling Stripe. Webhooks are not
 * faked: they are verified with the connection's own signing secret, as
 * in production.
 *
 * Two locks, as `DOMAIN_HOSTING_FAKE` has: the API refuses to boot with it
 * under NODE_ENV=production (`env.ts`), and it is honoured only in a test
 * run (`common/test-run.ts`).
 */
export function stripeFakeAllowed(
    value: string | undefined,
    run: RunMarks,
): boolean {
    return value === "1" && isTestRun(run);
}

/** Whether this process runs Stripe on the fake. */
export function stripeFakeOn(): boolean {
    return stripeFakeAllowed(env.STRIPE_FAKE, {
        nodeEnvs: [declaredNodeEnv, env.NODE_ENV],
        ci: env.CI,
    });
}

/**
 * Stripe with no network for the calls a payment makes: any restricted key
 * is accepted (a full `sk_` key is still refused), a payment is a made-up
 * Checkout Session `cs_fake_…` whose URL is on checkout.stripe.com and
 * carries the success and cancel URLs as query parameters (for the browser
 * spec's stub page only; Stripe's own URL carries nothing of the kind), a
 * look-up finds no payment (so only the signed webhook settles one), and a
 * close succeeds. A payer with an email is `cus_fake_…`; the country is
 * "US", or "IN" when the publishable key has `_in_`. Refunds stay the real
 * adapter's.
 */
export class FakeStripeProvider extends StripeProvider {
    override verifyCredentials(
        credentials: ProviderCredentials,
    ): Promise<CredentialCheck> {
        return Promise.resolve(
            isStripeSecretKey(credentials.keySecret) ? "REJECTED" : "ACCEPTED",
        );
    }

    override createOrderIntent(
        input: CreateOrderIntentInput,
    ): Promise<CreateOrderIntentResult> {
        if (!stripeTakesCurrency(input.currency)) {
            return Promise.reject(
                new Error(
                    `Stripe order creation refused: ${input.currency} is not a currency Saroh charges through Stripe`,
                ),
            );
        }
        if (!input.hosted) {
            return Promise.reject(
                new Error(
                    "Stripe order creation refused: no hosted checkout details",
                ),
            );
        }
        const id = `cs_fake_${randomUUID().replace(/-/g, "")}`;
        const url = new URL(`https://checkout.stripe.com/c/pay/${id}`);
        url.searchParams.set("success_url", input.hosted.successUrl);
        url.searchParams.set("cancel_url", input.hosted.cancelUrl);
        return Promise.resolve({
            providerIntentId: id,
            providerCheckoutId: id,
            clientParams: {
                checkoutUrl: url.toString(),
                checkoutSessionId: id,
            },
        });
    }

    override findOrCreateCustomer(
        input: FindOrCreateCustomerInput,
    ): Promise<FindOrCreateCustomerResult> {
        const email = input.email?.trim().toLowerCase();
        if (!email) return Promise.resolve({ customerId: null });
        const digest = createHash("sha256")
            .update(`${input.organizationId}:${email}`)
            .digest("hex")
            .slice(0, 24);
        return Promise.resolve({ customerId: `cus_fake_${digest}` });
    }

    override accountCountry(
        credentials: ProviderCredentials,
    ): Promise<string | null> {
        return Promise.resolve(
            credentials.keyId.includes("_in_") ? "IN" : "US",
        );
    }

    override findOrderPayments(): Promise<OrderPayment[]> {
        return Promise.resolve([]);
    }

    override cancelIntent(): Promise<boolean> {
        return Promise.resolve(true);
    }
}

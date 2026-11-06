import { randomUUID } from "node:crypto";

import type { CredentialCheck } from "../../../common/providers/provider-attention";
import type { RunMarks } from "../../../common/test-run";
import { isTestRun } from "../../../common/test-run";
import { declaredNodeEnv, env } from "../../../env";
import type {
    CreateOrderIntentInput,
    CreateOrderIntentResult,
    OrderPayment,
    ProviderCredentials,
} from "./provider.port";
import { isStripeSecretKey, stripeTakesCurrency } from "./stripe-payments";
import { StripeProvider } from "./stripe.provider";

/**
 * The test-only switch that runs Stripe on a fake (U8's browser spec):
 * `STRIPE_FAKE=1` registers {@link FakeStripeProvider} in place of the
 * real adapter, so the browser-test stack connects Stripe with made-up
 * keys and makes PaymentIntents without calling Stripe. Webhooks are not
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
 * is accepted (a full `sk_` key is still refused), an intent is a made-up
 * `pi_fake_…` whose client secret is `<id>_secret_fake`, a look-up finds
 * no payment (so only the signed webhook settles one), and a cancel
 * succeeds. Refunds stay the real adapter's.
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
        const id = `pi_fake_${randomUUID().replace(/-/g, "")}`;
        return Promise.resolve({
            providerIntentId: id,
            clientParams: {
                stripePaymentIntentId: id,
                clientSecret: `${id}_secret_fake`,
            },
        });
    }

    override findOrderPayments(): Promise<OrderPayment[]> {
        return Promise.resolve([]);
    }

    override cancelIntent(): Promise<boolean> {
        return Promise.resolve(true);
    }
}

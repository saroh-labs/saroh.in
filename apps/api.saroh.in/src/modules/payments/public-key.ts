import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { EDITION_PROFILES, EDITIONS } from "@saroh/edition";

import {
    isStripeSecretKey,
    STRIPE_SECRET_KEY_REFUSED,
} from "./providers/stripe-payments";

/**
 * The public key a provider's checkout window opens with (DEC-054).
 *
 * Razorpay's Checkout opens with the business's key id — the `rzp_live_…` or
 * `rzp_test_…` code Razorpay shows beside the secret, and one it treats as
 * public (every checkout page carries it). So for Razorpay the public key is
 * the key id: setup asks for it once, checks it and the secret, and stores it
 * as the connection's `publicKey` next to the sealed pair. A Razorpay
 * connection without it can't open the window ("couldn't open the payment
 * window"), and Settings › Providers says it needs attention.
 *
 * Cashfree's drop-in opens on the order's payment session, so its public key
 * stays optional.
 *
 * Stripe's Payment Element opens with the publishable key (`pk_…`), so for
 * Stripe the key id is that key and becomes the public key; the secret is a
 * restricted key (`rk_…`) in the same mode, never a full `sk_` key, and the
 * webhook secret is the endpoint's `whsec_…` (DEC-208).
 */

/** A Razorpay key id, test or live. */
export const RAZORPAY_KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]+$/;

/** A Stripe publishable key, test or live. */
const STRIPE_PUBLISHABLE_KEY = /^pk_(test|live)_[A-Za-z0-9]+$/;
/** A Stripe restricted key, test or live. */
const STRIPE_RESTRICTED_KEY = /^rk_(test|live)_[A-Za-z0-9]+$/;
/** A Stripe endpoint's signing secret. */
const STRIPE_WEBHOOK_SECRET = /^whsec_[A-Za-z0-9+/=]+$/;

function refuse(message: string, field: string): never {
    throw new BadRequestException({ message, field });
}

/**
 * Stripe's three values, checked before any call (DEC-208): the
 * publishable key, a restricted key in the same mode, and the endpoint's
 * signing secret. A test key works only with a test key: Stripe keeps the
 * two modes apart, and a mix could never take a payment. Returns the
 * publishable key, the connection's public key.
 */
function stripePublicKey(input: {
    keyId: string;
    keySecret: string;
    webhookSecret?: string;
}): string {
    const keyId = input.keyId.trim();
    const secret = input.keySecret.trim();
    if (isStripeSecretKey(secret))
        refuse(STRIPE_SECRET_KEY_REFUSED, "keySecret");
    const publishable = STRIPE_PUBLISHABLE_KEY.exec(keyId);
    if (!publishable) {
        refuse(
            "That isn't a Stripe publishable key. It starts pk_live_ or pk_test_. Copy it from Stripe › Developers › API keys.",
            "keyId",
        );
    }
    const restricted = STRIPE_RESTRICTED_KEY.exec(secret);
    if (!restricted) {
        refuse(
            "That isn't a Stripe restricted key. It starts rk_live_ or rk_test_. Make one in Stripe › Developers › API keys with Payment Intents: Write and Refunds: Write.",
            "keySecret",
        );
    }
    if (publishable[1] !== restricted[1]) {
        refuse(
            "One key is a test key and the other a live key. Use both from test mode, or both from live mode.",
            "keySecret",
        );
    }
    if (!STRIPE_WEBHOOK_SECRET.test(input.webhookSecret?.trim() ?? "")) {
        refuse(
            "That isn't a Stripe signing secret. It starts whsec_. Find it on your endpoint in Stripe › Developers › Webhooks.",
            "webhookSecret",
        );
    }
    return keyId;
}

/** Whether a provider's checkout can't open without a public key. */
export function needsPublicKey(provider: string): boolean {
    return provider.toUpperCase() === "RAZORPAY";
}

/**
 * What a connection stores as its public key. For Razorpay the key id and
 * the secret are both checked first: the key id must look like one, the
 * secret must not be the key id pasted twice, and a public key sent beside
 * them must name the same key. Then the key id is the public key. Otherwise:
 * the public key sent, or none.
 */
export function publicKeyFor(input: {
    provider: string;
    keyId: string;
    keySecret: string;
    publicKey?: string;
    webhookSecret?: string;
}): string | null {
    // An empty one is none.
    const trimmed = input.publicKey?.trim() ?? "";
    const sent = trimmed.length > 0 ? trimmed : null;
    if (input.provider.toUpperCase() === "STRIPE")
        return stripePublicKey(input);
    if (!needsPublicKey(input.provider)) return sent;

    const keyId = input.keyId.trim();
    if (!RAZORPAY_KEY_ID.test(keyId)) {
        throw new BadRequestException(
            "That isn't a Razorpay key id. It starts rzp_live_ or rzp_test_. Copy it from API Keys in Razorpay's dashboard.",
        );
    }
    if (input.keySecret.trim() === keyId) {
        throw new BadRequestException(
            "The key secret is the key id again. Razorpay shows the secret once, when the key is made. Regenerate the key if you no longer have it.",
        );
    }
    if (sent && sent !== keyId) {
        throw new BadRequestException(
            "The public key id and the key id are different. For Razorpay they are the same code, the one shown beside the key secret.",
        );
    }
    return keyId;
}

/**
 * The connections a business's edition takes payment through, as a filter
 * (DEC-208): a Global business's Razorpay row, or an India business's
 * Stripe row, is left out wherever a provider is chosen for a payment. The
 * profile says which; no edition is named here.
 */
export const IN_EDITION = {
    OR: EDITIONS.map((edition) => ({
        organization: { edition },
        provider: { in: [...EDITION_PROFILES[edition].paymentProviders] },
    })),
} satisfies Prisma.MerchantPaymentProviderWhereInput;

/**
 * The connections a checkout window can open with, as a filter: one of the
 * business's edition's providers, and not a Razorpay one still missing its
 * public key id. Used where the booking page decides whether to offer
 * paying online, so it never offers what the intent would refuse.
 */
export const OPENS_CHECKOUT = {
    AND: [
        {
            OR: [
                { provider: { not: "RAZORPAY" } },
                {
                    AND: [
                        { publicKey: { not: null } },
                        { publicKey: { not: "" } },
                    ],
                },
            ],
        },
        IN_EDITION,
    ],
} satisfies Prisma.MerchantPaymentProviderWhereInput;

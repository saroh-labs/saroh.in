import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

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
 */

/** A Razorpay key id, test or live. */
export const RAZORPAY_KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]+$/;

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
}): string | null {
    // An empty one is none.
    const trimmed = input.publicKey?.trim() ?? "";
    const sent = trimmed.length > 0 ? trimmed : null;
    if (!needsPublicKey(input.provider)) return sent;

    const keyId = input.keyId.trim();
    if (!RAZORPAY_KEY_ID.test(keyId)) {
        throw new BadRequestException(
            "That isn't a Razorpay key id. It starts rzp_live_ or rzp_test_ — copy it from API Keys in Razorpay's dashboard.",
        );
    }
    if (input.keySecret.trim() === keyId) {
        throw new BadRequestException(
            "The key secret is the key id again. Razorpay shows the secret once, when the key is made — regenerate the key if you no longer have it.",
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
 * The connections a checkout window can open with, as a filter: any but a
 * Razorpay one still missing its public key id. Used where the booking page
 * decides whether to offer paying online, so it never offers what the
 * intent would refuse.
 */
export const OPENS_CHECKOUT = {
    OR: [
        { provider: { not: "RAZORPAY" } },
        { AND: [{ publicKey: { not: null } }, { publicKey: { not: "" } }] },
    ],
} satisfies Prisma.MerchantPaymentProviderWhereInput;

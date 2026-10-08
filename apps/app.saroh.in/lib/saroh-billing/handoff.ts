import type { CheckoutHandoff } from "./plan-view";

/**
 * The API's checkout handoff (DEC-093), checked field by field before the
 * browser opens Razorpay's window with it: a public key, one subscription
 * or order id, and the owner's details. Anything else reads as none, and
 * the payment page's link is used instead.
 */
const ID = /^[A-Za-z0-9_]{1,64}$/;

const text = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export function cleanHandoff(value: unknown): CheckoutHandoff | null {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    const keyId = text(v.keyId, 64);
    const subscriptionId = text(v.subscriptionId, 64);
    const orderId = text(v.orderId, 64);
    if (!keyId || !ID.test(keyId)) return null;
    if (subscriptionId ? !ID.test(subscriptionId) : !orderId) return null;
    if (orderId && !ID.test(orderId)) return null;
    if (v.provider !== "RAZORPAY") return null;
    const amount =
        typeof v.amountPaise === "number" &&
        Number.isSafeInteger(v.amountPaise) &&
        v.amountPaise > 0
            ? v.amountPaise
            : null;
    const prefill = (v.prefill ?? {}) as Record<string, unknown>;
    return {
        provider: "RAZORPAY",
        keyId,
        subscriptionId,
        orderId: subscriptionId ? null : orderId,
        amountPaise: subscriptionId ? null : amount,
        currency: text(v.currency, 3) ?? "INR",
        prefill: {
            name: text(prefill.name, 120),
            email: text(prefill.email, 254),
            contact: text(prefill.contact, 20),
        },
    };
}

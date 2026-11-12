import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signing outbound webhooks (plan 2026-11-10-001, U13).
 *
 * `X-Saroh-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]`, each `v1` an
 * HMAC-SHA256 under one of the endpoint's secrets over `"<t>.<body>"`.
 * Every attempt and resend signs with the time it is sent. For 24 hours
 * after a roll both secrets sign, so a receiver can switch over. A receiver
 * (and {@link verifySignature}, the helper the docs describe) refuses a
 * signature older than {@link SIGNATURE_TOLERANCE_S}, so a captured request
 * can't be replayed later.
 */

export const SIGNATURE_HEADER = "X-Saroh-Signature";
export const DELIVERY_ID_HEADER = "X-Saroh-Delivery-Id";

/** How old a signature may be before it is refused: 5 minutes. */
export const SIGNATURE_TOLERANCE_S = 5 * 60;

/** A new signing secret, shown once: `whsec_` and 32 random bytes. */
export function mintSecret(): string {
    return `whsec_${randomBytes(32).toString("base64url")}`;
}

function hmac(secret: string, timestamp: number, body: string): string {
    return createHmac("sha256", secret)
        .update(`${timestamp}.${body}`)
        .digest("hex");
}

/** The header's value: one `v1` per secret, the current one first. */
export function signatureHeader(
    secrets: readonly string[],
    body: string,
    at: Date = new Date(),
): string {
    const t = Math.floor(at.getTime() / 1000);
    return [`t=${t}`, ...secrets.map((s) => `v1=${hmac(s, t, body)}`)].join(
        ",",
    );
}

/**
 * Whether `header` signs `body` under `secret`, made within the tolerance
 * of `now`. Any one `v1` matching is enough (during a roll there are two).
 */
export function verifySignature(
    header: string,
    body: string,
    secret: string,
    now: Date = new Date(),
    toleranceS: number = SIGNATURE_TOLERANCE_S,
): boolean {
    let t: number | null = null;
    const sigs: string[] = [];
    for (const part of header.split(",")) {
        const [key, value = ""] = part.trim().split("=", 2);
        if (key === "t" && /^\d+$/.test(value)) t = Number(value);
        if (key === "v1" && /^[0-9a-f]{64}$/.test(value)) sigs.push(value);
    }
    if (t === null || sigs.length === 0) return false;
    if (Math.abs(now.getTime() / 1000 - t) > toleranceS) return false;
    const expected = Buffer.from(hmac(secret, t, body), "hex");
    return sigs.some((s) => timingSafeEqual(Buffer.from(s, "hex"), expected));
}

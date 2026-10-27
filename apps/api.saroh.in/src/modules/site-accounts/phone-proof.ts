import { createHmac, timingSafeEqual } from "node:crypto";

import { siteCodeSecret } from "./site-secrets";

/**
 * A short-lived proof that a visitor just verified a phone by WhatsApp code
 * on this business's site (DEC-196), for a phone no account holds yet. The
 * site hands it back with the email code that follows, and the phone joins
 * that email's account. Bound to the business, so it means nothing on
 * another business's site. Form: `<phoneE164>.<until ms>.<hmac>`.
 */
export const PHONE_PROOF_TTL_MS = 30 * 60_000;

function sign(organizationId: string, phoneE164: string, until: string) {
    return createHmac("sha256", siteCodeSecret())
        .update(["phone-proof", organizationId, phoneE164, until].join("\n"))
        .digest("hex");
}

export function phoneProofFor(
    organizationId: string,
    phoneE164: string,
    now: Date,
): string {
    const until = String(now.getTime() + PHONE_PROOF_TTL_MS);
    return `${phoneE164}.${until}.${sign(organizationId, phoneE164, until)}`;
}

/** The phone a proof names, or null when it is forged, foreign or stale. */
export function readPhoneProof(
    organizationId: string,
    proof: string,
    now: Date,
): string | null {
    const [phone, until, sig] = proof.split(".");
    if (!phone || !until || !sig || !/^\+\d{8,15}$/.test(phone)) return null;
    if (!(Number(until) > now.getTime())) return null;
    const want = Buffer.from(sign(organizationId, phone, until), "hex");
    const got = Buffer.from(sig, "hex");
    return want.length === got.length && timingSafeEqual(want, got)
        ? phone
        : null;
}

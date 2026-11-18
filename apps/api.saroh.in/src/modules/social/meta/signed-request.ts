import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../../env";
import type { ChannelKind } from "./social-meta.port";

/**
 * Meta's `signed_request` (U8, KTD11): `<signature>.<payload>`, both
 * base64url, the signature an HMAC-SHA256 of the payload's text with the
 * login's app secret. Facebook and Instagram sign in with Facebook Login,
 * so the Meta app's secret signs theirs; Threads may sign with its own
 * app's secret or the Meta app's (unconfirmed until tested), so both are
 * tried.
 */

/** How old a request Saroh still takes. */
export const SIGNED_REQUEST_MAX_AGE_S = 24 * 3600;

export interface SignedRequest {
    userId: string;
    issuedAt: number;
}

export type SignedRequestRefusal = "invalid" | "expired";

/** The secrets one login's callbacks may be signed with. */
export function callbackSecrets(kind: ChannelKind): string[] {
    const own = kind === "THREADS" ? env.THREADS_APP_SECRET : undefined;
    return [own, env.META_APP_SECRET].filter(
        (s): s is string => typeof s === "string" && s !== "",
    );
}

export function parseSignedRequest(
    value: unknown,
    secrets: readonly string[],
    now: Date = new Date(),
): SignedRequest | SignedRequestRefusal {
    if (typeof value !== "string" || value.length > 4096) return "invalid";
    const parts = value.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return "invalid";
    const [sig, body] = parts;
    const given = Buffer.from(sig, "base64url");
    const signed = secrets.some((secret) => {
        const expected = createHmac("sha256", secret).update(body).digest();
        return (
            expected.length === given.length && timingSafeEqual(expected, given)
        );
    });
    if (!signed) return "invalid";
    let p: Record<string, unknown>;
    try {
        p = JSON.parse(
            Buffer.from(body, "base64url").toString("utf8"),
        ) as Record<string, unknown>;
    } catch {
        return "invalid";
    }
    const userId =
        typeof p.user_id === "string"
            ? p.user_id
            : typeof p.user_id === "number"
              ? String(p.user_id)
              : null;
    if (
        !userId ||
        typeof p.issued_at !== "number" ||
        (typeof p.algorithm === "string" &&
            p.algorithm.toUpperCase() !== "HMAC-SHA256")
    ) {
        return "invalid";
    }
    const age = now.getTime() / 1000 - p.issued_at;
    if (age > SIGNED_REQUEST_MAX_AGE_S || age < -300) return "expired";
    return { userId, issuedAt: p.issued_at };
}

/** A signed request as Meta makes one: for tests and the fake. */
export function signRequest(
    payload: Record<string, unknown>,
    secret: string,
): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    return `${sig}.${body}`;
}

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The pricing draft-preview token (plans catalogue KTD-10).
 *
 * Staff with `pricing:read` mint one in the admin console; saroh.in swaps it
 * for a cookie and asks `GET /public/pricing?preview=<token>` for the draft.
 * saroh.in never holds a staff session and never checks the token itself:
 * only the API knows the secret.
 *
 *     v1.<expires, unix seconds>.<revision>.<draft epoch, ms>.<base64url(sig)>
 *
 * `sig` is HMAC-SHA256 over `pricing-preview\nv1\n<expires>\n<revision>\n<epoch>`.
 * The token names one draft revision AND the draft's creation time (its
 * epoch): the draft row is deleted on publish and a new one starts its
 * revisions again, so a revision number alone could match a later draft.
 * A token is good for at most {@link PREVIEW_TOKEN_TTL_MS}; one claiming a
 * longer life is refused even when its signature checks.
 */
export const PREVIEW_TOKEN_TTL_MS = 15 * 60 * 1000;
const VERSION = "v1";
const PURPOSE = "pricing-preview";
/** Clock difference tolerated between minting and checking hosts. */
const SKEW_MS = 5_000;
const MAX_TOKEN_LENGTH = 256;
const TOKEN = /^v1\.(\d{1,12})\.(\d{1,9})\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/;

export interface PreviewClaim {
    /** The draft revision the token shows. */
    revision: number;
    /** The draft's `createdAt`, in milliseconds. */
    draftEpoch: number;
    expiresAt: Date;
}

function signature(
    secret: string,
    expires: number,
    revision: number,
    epoch: number,
): Buffer {
    return createHmac("sha256", secret)
        .update(`${PURPOSE}\n${VERSION}\n${expires}\n${revision}\n${epoch}`)
        .digest();
}

/** A token for one draft revision, good until `now` + the TTL. */
export function signPreviewToken(
    secret: string,
    draft: { revision: number; draftEpoch: number },
    now: Date,
): { token: string; expiresAt: Date } {
    // Whole seconds, rounded down, so the life is never longer than the TTL.
    const expires = Math.floor((now.getTime() + PREVIEW_TOKEN_TTL_MS) / 1000);
    const sig = signature(secret, expires, draft.revision, draft.draftEpoch);
    return {
        token: [
            VERSION,
            expires,
            draft.revision,
            draft.draftEpoch,
            sig.toString("base64url"),
        ].join("."),
        expiresAt: new Date(expires * 1000),
    };
}

/**
 * The claim a token makes, or null when it is malformed, forged, expired, or
 * claims a life longer than the TTL. Never throws on input.
 */
export function verifyPreviewToken(
    secret: string,
    token: unknown,
    now: Date,
): PreviewClaim | null {
    // A query parameter given twice (`?preview=a&preview=b`) arrives as an
    // array, not a string: refused like any other malformed token.
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
        return null;
    }
    const m = TOKEN.exec(token);
    if (!m) return null;
    const expires = Number(m[1]);
    const revision = Number(m[2]);
    const epoch = Number(m[3]);
    const given = Buffer.from(m[4], "base64url");
    const expected = signature(secret, expires, revision, epoch);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return null;
    }
    const expiresMs = expires * 1000;
    const t = now.getTime();
    if (expiresMs <= t) return null;
    if (expiresMs > t + PREVIEW_TOKEN_TTL_MS + SKEW_MS) return null;
    return { revision, draftEpoch: epoch, expiresAt: new Date(expiresMs) };
}

import { createHash, randomBytes } from "node:crypto";

/**
 * A review link's token: 32 random bytes, sent once and stored only as its
 * SHA-256 hash — the preview-link shape (`site-preview-links.service.ts`).
 * Unsalted on purpose: the input is already 256 bits of randomness, and the
 * lookup is by the unique hash, so no separate constant-time compare is
 * needed.
 */
export function mintReviewToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: hashReviewToken(token) };
}

export function hashReviewToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** How long a link works after each send. */
export const REVIEW_LINK_DAYS = 30;
/** Sends per order, the first included. */
export const MAX_REVIEW_SENDS = 3;

import { createHash, randomBytes } from "node:crypto";

/**
 * An invoice pay link's token (ADR-007, U13): 32 random bytes, base64url,
 * handed to the merchant once and stored only as its SHA-256 — the review
 * link's shape (`product-reviews/token.ts`). Unsalted on purpose: the input
 * is already 256 bits of randomness and the lookup is by the unique hash.
 *
 * The token is the whole credential for the public pay page, so it is never
 * logged: the request log replaces it (`common/logging/redact.ts`) and no
 * code here writes it anywhere but the response that hands it over.
 */
export function mintPayToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: hashPayToken(token) };
}

export function hashPayToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

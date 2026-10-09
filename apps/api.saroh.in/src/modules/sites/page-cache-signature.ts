import { createHmac } from "node:crypto";

/**
 * The signature on a page-cache revalidation this API sends the merchant
 * sites' Worker (#863):
 *
 *     x-saroh-page-cache: v1.<unix seconds>.<base64url(sig)>
 *
 * where `sig` is HMAC-SHA256 over `v1\n<seconds>\n<body>` with
 * `SITE_RELAY_SECRET`, the secret the API and the renderer already share
 * (ADR-011). Exactly the renderer's `verifyPageRevalidation`
 * (`apps/saroh.app/lib/page-cache/signature.ts`); both test files pin the
 * same vector, so a change to one side fails there. The Worker refuses
 * anything unsigned, forged or older than five minutes.
 */
export const PAGE_CACHE_SIGNATURE_HEADER = "x-saroh-page-cache";
const VERSION = "v1";

export function signPageRevalidation(
    body: string,
    secret: string,
    now: number = Date.now(),
): string {
    const seconds = String(Math.floor(now / 1000));
    const sig = createHmac("sha256", secret)
        .update(`${VERSION}\n${seconds}\n${body}`)
        .digest("base64url");
    return `${VERSION}.${seconds}.${sig}`;
}

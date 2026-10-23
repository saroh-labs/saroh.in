import { createHash, randomBytes } from "node:crypto";

import type { Prisma } from "@saroh/database";

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

/**
 * Give an invoice a fresh link token, retiring the one before it (DEC-110:
 * a link is minted when it is sent, and the old one stops). Only an
 * invoice of its own (no order, not a credit note) in `status`; null when
 * it isn't one any more, so the caller says so. The callers check the rest
 * first: Payments, a provider, no autopay charge under way
 * (`InvoicesService`, and the failed-autopay notice).
 */
export async function replacePayTokenInTx(
    db: Pick<Prisma.TransactionClient, "invoice">,
    organizationId: string,
    invoiceId: string,
    status: "ISSUED" | "PAID",
): Promise<{ token: string; payLinkCreatedAt: Date } | null> {
    const { token, tokenHash } = mintPayToken();
    const payLinkCreatedAt = new Date();
    const { count } = await db.invoice.updateMany({
        where: {
            id: invoiceId,
            organizationId,
            status,
            orderId: null,
            kind: { not: "CREDIT_NOTE" },
        },
        data: { payTokenHash: tokenHash, payLinkCreatedAt },
    });
    return count === 0 ? null : { token, payLinkCreatedAt };
}

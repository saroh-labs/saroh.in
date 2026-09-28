/**
 * D22 backfill — every Razorpay connection gets its public key id (DEC-054).
 *
 * Razorpay's checkout window opens with the business's key id, which is
 * public. Setup used to store it only inside the sealed credentials, with an
 * optional "Public key" beside it that most merchants left empty; since D22
 * setup stores the key id as the connection's `publicKey`, and a Razorpay
 * connection without one takes no online payment and reads as needing
 * attention in Settings › Providers. This fills `publicKey` from the sealed
 * key id for every connection made before, so no business loses online pay.
 *
 * For each Razorpay connection, in any status: open the sealed blob, read
 * its `keyId`, and set `publicKey` to it when it differs — empty, or a
 * different code someone typed into the old optional field (which would not
 * open the window either). The write is conditional on the row still
 * holding what was read, so a reconnect that lands meanwhile is kept.
 * Idempotent: a second run finds every row already equal and writes nothing.
 * A blob that can't be opened or holds no key id is left as it is and
 * counted; that connection keeps reading as needing attention until the
 * merchant enters the keys again.
 *
 * Nothing secret is logged or returned: only counts, and the ids of the
 * connections that could not be read.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/razorpay-public-keys.cli.ts`
 */
import type { PrismaClient } from "@prisma/client";

/** A sealed credentials blob, as the API stores it (AES-256-GCM, base64). */
export interface SealedCredentials {
    ciphertext: string;
    iv: string;
    authTag: string;
}

/** Opens a sealed blob to its JSON text. Throws when it can't. */
export type OpenSealed = (sealed: SealedCredentials) => string;

export interface RazorpayConnection {
    id: string;
    publicKey: string | null;
    sealed: SealedCredentials;
}

export type PublicKeyPlan =
    | { kind: "set"; publicKey: string }
    | { kind: "same" }
    | { kind: "unreadable" };

/**
 * What to do with one connection: set its public key to the sealed key id,
 * leave it (already the same), or count it as unreadable. Pure, so the rule
 * is tested without a database; the key id never leaves this function but
 * as the public key it is.
 */
export function planRazorpayPublicKey(
    row: RazorpayConnection,
    open: OpenSealed,
): PublicKeyPlan {
    let keyId: unknown;
    try {
        keyId = (JSON.parse(open(row.sealed)) as { keyId?: unknown }).keyId;
    } catch {
        return { kind: "unreadable" };
    }
    if (typeof keyId !== "string" || !keyId.trim()) {
        return { kind: "unreadable" };
    }
    const publicKey = keyId.trim();
    return row.publicKey === publicKey
        ? { kind: "same" }
        : { kind: "set", publicKey };
}

export interface RazorpayPublicKeysReport {
    /** Razorpay connections looked at, in any status. */
    connections: number;
    /** Public keys written: empty before, or a different code. */
    filled: number;
    /** Already holding their key id. */
    unchanged: number;
    /** Ids of connections whose credentials could not be read. */
    unreadable: string[];
}

export async function backfillRazorpayPublicKeys(
    prisma: PrismaClient,
    open: OpenSealed,
): Promise<RazorpayPublicKeysReport> {
    const rows = await prisma.merchantPaymentProvider.findMany({
        where: { provider: "RAZORPAY" },
        select: {
            id: true,
            publicKey: true,
            encryptedCredentials: true,
            credentialsIv: true,
            credentialsAuthTag: true,
        },
        orderBy: { id: "asc" },
    });
    const report: RazorpayPublicKeysReport = {
        connections: rows.length,
        filled: 0,
        unchanged: 0,
        unreadable: [],
    };
    for (const row of rows) {
        const plan = planRazorpayPublicKey(
            {
                id: row.id,
                publicKey: row.publicKey,
                sealed: {
                    ciphertext: row.encryptedCredentials,
                    iv: row.credentialsIv,
                    authTag: row.credentialsAuthTag,
                },
            },
            open,
        );
        if (plan.kind === "unreadable") {
            report.unreadable.push(row.id);
            continue;
        }
        if (plan.kind === "same") {
            report.unchanged += 1;
            continue;
        }
        // Only while the row still holds the blob and key that were read: a
        // reconnect in between re-sealed it, and its own key stands.
        const { count } = await prisma.merchantPaymentProvider.updateMany({
            where: {
                id: row.id,
                encryptedCredentials: row.encryptedCredentials,
                publicKey: row.publicKey,
            },
            data: { publicKey: plan.publicKey },
        });
        if (count === 1) report.filled += 1;
        else report.unchanged += 1;
    }
    return report;
}

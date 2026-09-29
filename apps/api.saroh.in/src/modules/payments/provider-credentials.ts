import type { MerchantPaymentProvider } from "@saroh/database";

import { decryptSecret } from "./crypto";
import type { ProviderCredentials } from "./providers/provider.port";

/**
 * Open a connection's sealed `{ keyId, keySecret }`, in memory only, for one
 * provider call. Never log or return what it gives back.
 *
 * `PaymentsService.openCredentials` applies the same rule inside that
 * service; the mandate calls (D20) use this one so they needn't reach into
 * it. Fold the two together when `payments.service.ts` is next split.
 */
export function openProviderCredentials(
    row: Pick<
        MerchantPaymentProvider,
        "encryptedCredentials" | "credentialsIv" | "credentialsAuthTag"
    >,
): ProviderCredentials {
    const json = decryptSecret({
        ciphertext: row.encryptedCredentials,
        iv: row.credentialsIv,
        authTag: row.credentialsAuthTag,
    });
    const parsed = JSON.parse(json) as Partial<ProviderCredentials>;
    if (!parsed.keyId || !parsed.keySecret) {
        throw new Error("Stored provider credentials are malformed");
    }
    return { keyId: parsed.keyId, keySecret: parsed.keySecret };
}

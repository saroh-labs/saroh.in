import { apiFetch, orgBase } from "@/lib/api/http";
import type { ProviderConnection } from "@/lib/payments/providers";

/** A payment provider is connected, so its keys can send a refund. */
export function refundsOnline(rows: ProviderConnection[]): boolean {
    return rows.some((row) => row.status === "CONNECTED");
}

/**
 * Whether Saroh can still send a refund online (DEC-120): true while a
 * payment provider is connected, false once its keys are gone — then
 * Order Detail doesn't offer Refund and says to refund in the provider's
 * dashboard. Server-only. `undefined` when it couldn't be found out:
 * Refund stays offered, and the API refuses one it can't send.
 */
export async function refundsOnlineOrUnknown(): Promise<boolean | undefined> {
    try {
        const base = await orgBase();
        if (!base) return undefined;
        const res = await apiFetch(`${base}/payment-providers`);
        if (!res.ok) return undefined;
        return refundsOnline((await res.json()) as ProviderConnection[]);
    } catch {
        // Degraded, not failed: the order still renders.
        return undefined;
    }
}
